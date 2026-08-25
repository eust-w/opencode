import type { Browser } from "@opencode-ai/schema/browser"
import { BrowserDriverError, type BrowserDriver, type BrowserDriverContext } from "./driver.js"

type ViewState = Omit<Browser.State, "generation">
type Node = {
  nodeId: string
  backendDOMNodeId?: number
  childIds?: string[]
  frameId?: string
  ignored?: boolean
  role?: { value?: string }
  name?: { value?: unknown }
  value?: { value?: unknown }
  properties?: Array<{ name: string; value?: { value?: unknown } }>
}

export interface ChromiumPort<Resource> {
  readonly resource: Resource
  readonly state: () => ViewState
  readonly subscribe: (listener: (event: { state: ViewState; mainDocumentChanged: boolean }) => void) => () => void
  readonly navigate: (url: string) => PromiseLike<void>
  readonly back: () => PromiseLike<void> | void
  readonly forward: () => PromiseLike<void> | void
  readonly reload: () => PromiseLike<void> | void
  readonly stop: () => void
  readonly send: (command: { method: string; params?: Record<string, unknown> }) => PromiseLike<unknown>
  readonly viewport: () => { width: number; height: number }
  readonly screenshot: (maximum: number) => PromiseLike<{ data: Uint8Array; width: number; height: number }>
  readonly dispose: () => PromiseLike<void> | void
}

export interface ChromiumController<Resource> extends AsyncDisposable {
  readonly resource: Resource
  readonly state: () => Browser.State
  readonly subscribe: (listener: (state: Browser.State) => void) => () => void
  readonly navigate: (url: string) => Promise<void>
  readonly back: () => Promise<void>
  readonly forward: () => Promise<void>
  readonly reload: () => Promise<void>
  readonly stop: () => void
  readonly dispose: () => Promise<void>
}

export type ChromiumDriver<Resource> = BrowserDriver<ChromiumController<Resource>>

type Page<Resource> = {
  port: ChromiumPort<Resource>
  signal: AbortSignal
  refs: Map<string, { id: number; editable: boolean }>
  listeners: Set<(state: Browser.State) => void>
  generation: number
  nextRef: number
  queue: Promise<void>
  active?: AbortController
  disposed: boolean
  disposal?: Promise<void>
}

export function chromiumDriver<Resource>(
  create: (context: BrowserDriverContext) => PromiseLike<ChromiumPort<Resource>> | ChromiumPort<Resource>,
): ChromiumDriver<Resource> {
  return async (context) => {
    const port = await create(context)
    if (context.signal.aborted) {
      await port.dispose()
      throw context.signal.reason ?? new Error("Browser creation was aborted")
    }
    const page: Page<Resource> = {
      port,
      signal: context.signal,
      refs: new Map(),
      listeners: new Set(),
      generation: 0,
      nextRef: 0,
      queue: Promise.resolve(),
      disposed: false,
    }
    const unsubscribe = port.subscribe((event) => {
      if (page.disposed) return
      if (event.mainDocumentChanged) {
        page.generation++
        page.refs.clear()
      }
      page.listeners.forEach((listener) => listener(state(page)))
    })
    const dispose = () => {
      if (page.disposal) return page.disposal
      page.disposed = true
      page.active?.abort()
      page.listeners.clear()
      page.refs.clear()
      unsubscribe()
      port.stop()
      page.disposal = Promise.resolve(port.dispose())
      return page.disposal
    }
    const controller: ChromiumController<Resource> = {
      resource: port.resource,
      state: () => state(page),
      subscribe: (listener) => {
        if (page.disposed) throw failure("not_attached", "Browser is no longer attached.")
        page.listeners.add(listener)
        listener(state(page))
        return () => page.listeners.delete(listener)
      },
      navigate: (url) => schedule(page, undefined, (signal) => navigate(page, url, signal)),
      back: () => schedule(page, undefined, async () => port.back()),
      forward: () => schedule(page, undefined, async () => port.forward()),
      reload: () => schedule(page, undefined, async () => port.reload()),
      stop: () => {
        if (page.disposed) throw failure("not_attached", "Browser is no longer attached.")
        page.active?.abort()
        port.stop()
      },
      dispose,
      [Symbol.asyncDispose]: dispose,
    }
    return {
      resource: controller,
      state: controller.state,
      subscribe: controller.subscribe,
      execute: (command, options) => schedule(page, options.signal, (signal) => execute(page, command, signal)),
      dispose,
    }
  }
}

async function execute<Resource>(page: Page<Resource>, command: Browser.Command, signal: AbortSignal) {
  if (page.generation !== command.generation) throw failure("stale_ref", "Browser page changed.")
  if (command.type === "navigate") {
    await navigate(page, command.url, signal)
    return { type: "navigate", state: state(page) } as const
  }
  if (command.type === "snapshot") return snapshot(page, command.generation, signal)
  if (command.type === "screenshot") {
    const image = await bounded(() => page.port.screenshot(2_000), signal)
    if (image.data.byteLength > 5 * 1_024 * 1_024) throw failure("result_too_large", "Screenshot exceeds 5 MiB.")
    if (![image.width, image.height].every((size) => Number.isSafeInteger(size) && size > 0 && size <= 2_000)) {
      throw failure("internal", "Browser pane has no drawable area.")
    }
    if (page.generation !== command.generation) throw failure("stale_ref", "Browser page changed.")
    return { type: "screenshot", state: state(page), mediaType: "image/png", ...image } as const
  }
  if (command.type === "click" || command.type === "fill") {
    const target = page.refs.get(command.ref)
    if (!target || (command.type === "fill" && !target.editable))
      throw failure("stale_ref", "Browser element is stale.")
    if (command.type === "fill") {
      await send(page, "DOM.focus", { backendNodeId: target.id }, signal)
      await key(page, { key: "a", code: "KeyA", modifiers: process.platform === "darwin" ? 4 : 2 }, signal)
      await key(page, { key: "Backspace", code: "Backspace", windowsVirtualKeyCode: 8 }, signal)
      await send(page, "Input.insertText", { text: command.text }, signal)
    }
    if (command.type === "click") {
      await send(page, "DOM.scrollIntoViewIfNeeded", { backendNodeId: target.id }, signal)
      const result = (await send(page, "DOM.getBoxModel", { backendNodeId: target.id }, signal)) as {
        model?: { content?: number[] }
      }
      const box = result.model?.content
      if (!box || box.length !== 8 || !box.every(Number.isFinite)) throw failure("stale_ref", "Element has no bounds.")
      const point = { x: (box[0] + box[4]) / 2, y: (box[1] + box[5]) / 2 }
      for (const type of ["mouseMoved", "mousePressed", "mouseReleased"]) {
        await send(page, "Input.dispatchMouseEvent", { type, ...point, button: "left", clickCount: 1 }, signal)
      }
    }
  }
  if (command.type === "press") {
    const codes: Partial<Record<Browser.Key, number>> = { Enter: 13, Tab: 9, Escape: 27, Backspace: 8, Delete: 46 }
    const value = { key: command.key === "Space" ? " " : command.key, code: command.key }
    await key(page, { ...value, ...(codes[command.key] ? { windowsVirtualKeyCode: codes[command.key] } : {}) }, signal)
  }
  if (command.type === "scroll") {
    const viewport = page.port.viewport()
    const distance = Math.min(2_000, Math.max(1, command.pixels))
    const horizontal = command.direction === "left" ? -distance : command.direction === "right" ? distance : 0
    const vertical = command.direction === "up" ? -distance : command.direction === "down" ? distance : 0
    const point = { x: viewport.width / 2, y: viewport.height / 2 }
    await send(
      page,
      "Input.dispatchMouseEvent",
      { type: "mouseWheel", ...point, deltaX: horizontal, deltaY: vertical },
      signal,
    )
  }
  if (page.generation !== command.generation) throw failure("stale_ref", "Browser page changed.")
  return { type: command.type, state: state(page) }
}

async function snapshot<Resource>(page: Page<Resource>, generation: number, signal: AbortSignal) {
  const result = (await send(page, "Accessibility.getFullAXTree", { depth: 6 }, signal)) as { nodes?: Node[] }
  if (!Array.isArray(result.nodes) || result.nodes.length > 10_000)
    throw failure("internal", "Invalid accessibility tree.")
  if (page.generation !== generation) throw failure("stale_ref", "Browser page changed.")
  page.refs.clear()
  const current = state(page)
  const lines = [`Page: ${current.title.replaceAll(/\s+/g, " ")}`, `URL: ${current.url}`, ""]
  const nodes = new Map(result.nodes.map((node) => [node.nodeId, node]))
  const root = result.nodes[0]
  const queue = root ? [{ node: root, depth: 0 }] : []
  while (queue.length && lines.length < 503) {
    const item = queue.shift()
    if (!item) break
    if (item.depth > 6 || (root?.frameId && item.node.frameId && item.node.frameId !== root.frameId)) continue
    if (item.depth < 6) {
      for (const id of (item.node.childIds ?? []).toReversed()) {
        const child = nodes.get(id)
        if (child) queue.unshift({ node: child, depth: item.depth + 1 })
      }
    }
    if (item.node.ignored) continue
    const role = (item.node.role?.value ?? "node").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40) || "node"
    const properties = new Map((item.node.properties ?? []).map((item) => [item.name, item.value?.value]))
    const editable = ["textbox", "searchbox", "combobox", "spinbutton"].includes(role) || !!properties.get("editable")
    const interactive =
      "button checkbox combobox link menuitem option radio searchbox slider spinbutton switch tab textbox"
    const actionable = !!properties.get("focusable") || interactive.split(" ").includes(role)
    const id = item.node.backendDOMNodeId
    const ref = actionable && id ? `e${++page.nextRef}` : undefined
    if (ref && id) {
      page.refs.set(ref, { id, editable: editable && !properties.get("disabled") && !properties.get("readonly") })
    }
    const clean = (value: unknown) =>
      typeof value === "string" ? value.replaceAll(/\s+/g, " ").trim().slice(0, 300) : ""
    const name = clean(item.node.name?.value)
    const value = editable ? "" : clean(item.node.value?.value)
    const flags = ["checked", "disabled", "expanded", "selected"].flatMap((flag) =>
      properties.has(flag) ? [`${flag}=${properties.get(flag)}`] : [],
    )
    const suffix = [name && JSON.stringify(name), value && value !== name && `value=${JSON.stringify(value)}`, ...flags]
      .filter(Boolean)
      .join(" ")
    lines.push(`${"  ".repeat(item.depth)}${ref ? `${ref} ` : ""}[${role}]${suffix ? ` ${suffix}` : ""}`)
  }
  const content = lines.join("\n").slice(0, 40_960)
  return { type: "snapshot", state: current, format: "opencode.semantic.v1", content } as const
}

async function navigate<Resource>(page: Page<Resource>, input: string, signal: AbortSignal) {
  const value = input.trim() || "about:blank"
  const local = /^(?:localhost|127(?:\.\d{1,3}){3}|\[::1\])(?::\d+)?(?:[/?#]|$)/i.test(value)
  const candidate =
    value === "about:blank" || /^[a-z][a-z\d+.-]*:\/\//i.test(value) ? value : `${local ? "http" : "https"}://${value}`
  if (candidate.length > 16_384 || !URL.canParse(candidate)) throw failure("invalid_url", "Invalid browser URL.")
  const url = new URL(candidate)
  if ((!/^https?:$/.test(url.protocol) && url.href !== "about:blank") || url.username || url.password) {
    throw failure("invalid_url", "Only HTTP, HTTPS, and about:blank URLs are supported.")
  }
  const cancel = () => page.port.stop()
  signal.addEventListener("abort", cancel, { once: true })
  await bounded(() => page.port.navigate(url.href), signal, 30_000)
    .catch((error: unknown) => {
      if (error instanceof BrowserDriverError) throw error
      throw failure("navigation_failed", error instanceof Error ? error.message : String(error))
    })
    .finally(() => signal.removeEventListener("abort", cancel))
}

function schedule<Resource, Result>(
  page: Page<Resource>,
  signal: AbortSignal | undefined,
  run: (signal: AbortSignal) => Promise<Result>,
) {
  const result = page.queue.then(() => {
    if (page.disposed) throw failure("not_attached", "Browser is no longer attached.")
    const active = new AbortController()
    page.active = active
    return run(AbortSignal.any([page.signal, active.signal, ...(signal ? [signal] : [])])).finally(() => {
      if (page.active === active) page.active = undefined
    })
  })
  page.queue = result.then(() => undefined).catch(() => undefined)
  return result.catch((error: unknown) => {
    if (error instanceof BrowserDriverError) throw error
    throw failure("internal", error instanceof Error ? error.message : String(error))
  })
}

function state<Resource>(page: Page<Resource>): Browser.State {
  if (page.disposed) throw failure("not_attached", "Browser is no longer attached.")
  const current = page.port.state()
  const url = current.url.slice(0, 16_384)
  const title = current.title.slice(0, 1_024)
  return { ...current, url, title, generation: page.generation }
}

function key<Resource>(page: Page<Resource>, params: Record<string, unknown>, signal: AbortSignal) {
  return send(page, "Input.dispatchKeyEvent", { type: "keyDown", ...params }, signal).finally(() =>
    send(page, "Input.dispatchKeyEvent", { type: "keyUp", ...params }),
  )
}

function send<Resource>(page: Page<Resource>, method: string, params: Record<string, unknown>, signal?: AbortSignal) {
  return bounded(() => page.port.send({ method, params }), signal).catch((error: unknown) => {
    if (/Could not find|No node with given id|Could not compute box model|stale element/i.test(String(error))) {
      throw failure("stale_ref", "Browser element is stale.")
    }
    throw error
  })
}

function bounded<Result>(run: () => PromiseLike<Result>, signal: AbortSignal | undefined, timeout = 10_000) {
  const deadline = AbortSignal.timeout(timeout)
  const abort = signal ? AbortSignal.any([signal, deadline]) : deadline
  if (abort.aborted) return Promise.reject(failure("aborted", "Browser action was aborted."))
  const result = Promise.withResolvers<never>()
  const cancel = () =>
    result.reject(failure(deadline.aborted ? "timeout" : "aborted", "Browser operation was interrupted."))
  abort.addEventListener("abort", cancel, { once: true })
  return Promise.race([Promise.resolve().then(run), result.promise]).finally(() =>
    abort.removeEventListener("abort", cancel),
  )
}

function failure(code: Browser.ErrorCode, message: string) {
  return new BrowserDriverError(code, message.slice(0, 1_024))
}
