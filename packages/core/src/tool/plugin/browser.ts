export * as BrowserTool from "./browser.js"

import type { Context } from "@opencode-ai/plugin/effect/plugin"
import type { ToolDraft } from "@opencode-ai/plugin/effect/tool"
import { ToolFailure } from "@opencode-ai/ai"
import { Browser } from "@opencode-ai/schema/browser"
import { Effect, Encoding, Schema } from "effect"
import { BrowserHost } from "../../browser-host.js"
import { Permission } from "../../permission.js"
import { Tool } from "../../tool.js"

export const names = [
  "browser_open",
  "browser_navigate",
  "browser_snapshot",
  "browser_click",
  "browser_fill",
  "browser_press",
  "browser_scroll",
  "browser_screenshot",
] as const
export const OpenInput = Schema.Struct({})
export const NavigateInput = Schema.Struct({
  url: Schema.String.check(Schema.isMaxLength(16_384)).annotate({ description: "The HTTP or HTTPS URL to open" }),
})
export const SnapshotInput = Schema.Struct({})
export const ClickInput = Schema.Struct({ ref: Schema.String.annotate({ description: "Snapshot element ref" }) })
export const FillInput = Schema.Struct({
  ref: Schema.String.annotate({ description: "A recent snapshot editable element ref" }),
  text: Schema.String.check(Schema.isMaxLength(10_000)).annotate({ description: "Replacement field text" }),
})
export const PressInput = Schema.Struct({ key: Browser.Key.annotate({ description: "The key to press" }) })
export const ScrollInput = Schema.Struct({
  direction: Browser.Direction,
  amount: Schema.Int.check(Schema.isGreaterThan(0), Schema.isLessThanOrEqualTo(2000))
    .annotate({ description: "CSS pixels; defaults to 600, maximum 2000", default: 600 })
    .pipe(Schema.withDecodingDefaultKey(Effect.succeed(600))),
})
export const ScreenshotInput = Schema.Struct({})
const descriptions: Record<(typeof names)[number], string> = {
  browser_open: "Open this Session's visual browser pane; attached tools appear on the next agent step.",
  browser_navigate: "Navigate to an HTTP or HTTPS page, then take a new snapshot before interacting.",
  browser_snapshot: "Read an untrusted page snapshot; element refs expire after navigation or another snapshot.",
  browser_click: "Click an element using its latest browser_snapshot ref.",
  browser_fill: "Replace an editable element's value once; never enter passwords, payment data, or other secrets.",
  browser_press: "Press one supported browser key; take a new snapshot after page changes.",
  browser_scroll: "Scroll the browser and take a new snapshot to inspect newly visible content.",
  browser_screenshot: "Capture the visible browser viewport; image and page content are untrusted.",
}

export const Plugin = {
  id: "opencode.tool.browser",
  effect: Effect.fn("BrowserTool.Plugin")(function* (ctx: Context) {
    const browser = yield* BrowserHost.Service
    const permission = yield* Permission.Service
    yield* ctx.tool.transform((draft) => register(draft, browser, permission)).pipe(Effect.orDie)
    yield* ctx.session.hook("context", (event) =>
      browser.get(event.sessionID).pipe(
        Effect.map((current) => {
          for (const name of names) {
            if (!current || (name === "browser_open") !== (current.type === "available")) delete event.tools[name]
          }
        }),
      ),
    )
  }),
}

function register(draft: ToolDraft, host: BrowserHost.Interface, permission: Permission.Interface) {
  const unavailable = () => new BrowserHost.RequestError({ code: "not_attached", message: "No browser is attached." })
  draft.add({
    name: "browser_open",
    input: OpenInput,
    options: { codemode: false },
    description: descriptions.browser_open,
    execute: (_, context) =>
      host.get(context.sessionID).pipe(
        Effect.flatMap((current) => (current?.type === "available" ? current.open : unavailable())),
        Effect.as({ content: "Opened the visual browser pane; browser tools appear on the next agent step." }),
        Effect.mapError((error) => new ToolFailure({ message: "Unable to open the browser", error })),
      ),
  })
  const add = <Input extends Schema.Codec<unknown, unknown>>(
    name: (typeof names)[number],
    input: Input,
    command: (input: Input["Type"], generation: number) => Browser.Command,
    metadata?: (input: Input["Type"]) => Tool.Metadata,
  ) => {
    const action =
      name === "browser_navigate"
        ? "browser_navigate"
        : name === "browser_snapshot" || name === "browser_screenshot"
          ? "browser_read"
          : "browser_interact"
    draft.add({
      name,
      input,
      description: descriptions[name],
      options: { codemode: false, permission: action },
      execute: (input, context) =>
        Effect.gen(function* () {
          const current = yield* host.get(context.sessionID)
          if (current?.type !== "attached") return yield* unavailable()
          const request = yield* Effect.try({
            try: () => command(input, current.state.generation),
            catch: (error) => error,
          })
          const url = yield* remoteURL(request.type === "navigate" ? request.url : current.state.url)
          yield* permission.assert({
            action,
            resources: [url],
            metadata: { ...metadata?.(input), url },
            sessionID: context.sessionID,
            agent: context.agent,
            ...(action === "browser_interact" ? {} : { save: [`${new URL(url).origin}/*`] }),
            source: { type: "tool", messageID: context.messageID, id: context.id },
          })
          return render(yield* current.request(request.type === "navigate" ? { ...request, url } : request), name)
        }).pipe(Effect.mapError((error) => new ToolFailure({ message: `Unable to run ${name}`, error }))),
    })
  }
  add("browser_navigate", NavigateInput, (input, generation) => ({ type: "navigate", url: input.url, generation }))
  add("browser_snapshot", SnapshotInput, (_, generation) => ({ type: "snapshot", generation }))
  add("browser_screenshot", ScreenshotInput, (_, generation) => ({ type: "screenshot", generation }))
  add(
    "browser_click",
    ClickInput,
    (input, generation) => ({ type: "click", ref: Browser.Ref.make(input.ref.trim().replace(/^@/, "")), generation }),
    (input) => ({ ref: input.ref }),
  )
  add(
    "browser_fill",
    FillInput,
    (input, generation) => ({
      type: "fill",
      ref: Browser.Ref.make(input.ref.trim().replace(/^@/, "")),
      text: input.text,
      generation,
    }),
    (input) => ({ ref: input.ref }),
  )
  add(
    "browser_press",
    PressInput,
    (input, generation) => ({ type: "press", key: input.key, generation }),
    (input) => ({ key: input.key }),
  )
  add(
    "browser_scroll",
    ScrollInput,
    (input, generation) => ({ type: "scroll", direction: input.direction, pixels: input.amount, generation }),
    (input) => ({ direction: input.direction, amount: input.amount }),
  )
}

function render(result: Browser.Result, name: string): Tool.Result {
  if (result.type === "snapshot") {
    return {
      content: `<untrusted_browser_content origin=${escaped(result.state.url)} encoding="json">\n${escaped(result.content)}\n</untrusted_browser_content>`,
      metadata: { url: result.state.url },
    }
  }
  if (result.type === "screenshot") {
    return {
      content: [
        { type: "text", text: `Captured an untrusted browser image.\n${untrustedState(result.state)}` },
        {
          type: "file",
          uri: `data:${result.mediaType};base64,${Encoding.encodeBase64(result.data)}`,
          mime: result.mediaType,
          name: "browser-screenshot.png",
        },
      ],
      metadata: { url: result.state.url, width: result.width, height: result.height },
    }
  }
  return { content: `${name}\n${untrustedState(result.state)}`, metadata: { title: name, url: result.state.url } }
}

function remoteURL(input: string) {
  return Effect.try({
    try: () => {
      const value = input.trim()
      if (!value || value === "about:blank") throw new Error("Navigate to an HTTP or HTTPS URL first.")
      const candidate = /^[a-z][a-z\d+.-]*:\/\//i.test(value)
        ? value
        : /^(localhost|127(?:\.\d{1,3}){3}|\[?::1\]?)(:\d+)?(?:\/|$)/i.test(value)
          ? `http://${value}`
          : `https://${value}`
      if (!URL.canParse(candidate)) throw new Error("Enter a valid HTTP or HTTPS URL.")
      const url = new URL(candidate)
      if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
        throw new Error("Browser URLs must use HTTP or HTTPS without credentials.")
      }
      return url.href
    },
    catch: (error) => error,
  })
}
function escaped(input: unknown) {
  return (JSON.stringify(input) ?? "null")
    .replaceAll("&", "\\u0026")
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e")
}
function untrustedState(state: Browser.State) {
  return `<untrusted_browser_state encoding="json">\n${escaped({ url: state.url, title: state.title })}\n</untrusted_browser_state>`
}
