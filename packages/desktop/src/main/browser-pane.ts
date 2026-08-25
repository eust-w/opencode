import type { BrowserPaneCommand, BrowserPaneLayout, BrowserPaneTarget } from "@opencode-ai/app/desktop"
import type { BrowserDriver, BrowserRegistration } from "@opencode-ai/client/node"
import type { BrowserWindow } from "electron"
import { BrowserPaneEvent } from "../shared/ipc-rpc/events"
import { createBrowserPage, destinationOrigin, initialBrowserState, type BrowserPage } from "./browser-chromium"
import { emitIpcEvent } from "./ipc-events"

type Entry = {
  readonly bindingID: string
  readonly win: BrowserWindow
  readonly chromium: typeof BrowserDriver.chromium
  cleanup?: () => void
  registration?: BrowserRegistration
  ready?: Promise<BrowserRegistration>
  page?: BrowserPage
  layout?: BrowserPaneLayout
}

export function createBrowserPane() {
  const entries = new Map<string, Entry>()
  let disposed = false

  return {
    async register(win: BrowserWindow, bindingID: string, target: BrowserPaneTarget) {
      if (disposed || !destinationOrigin(target.endpoint.url)) throw new Error("browser.pane.registration.invalid")
      if (target.endpoint.username && !target.endpoint.password) throw new Error("browser.pane.endpoint.invalid")
      const { BrowserDriver, OpenCode } = await import("@opencode-ai/client/node")
      if (entries.has(bindingID)) throw new Error("browser.pane.owner.invalid")
      if (win.isDestroyed() || win.webContents.isDestroyed()) throw new Error("browser.pane.owner.unavailable")
      const credentials = `${target.endpoint.username ?? "opencode"}:${target.endpoint.password}`
      const client = OpenCode.make({
        baseUrl: target.endpoint.url,
        headers: target.endpoint.password
          ? { Authorization: `Basic ${Buffer.from(credentials).toString("base64")}` }
          : undefined,
      })
      const entry: Entry = { bindingID, win, chromium: BrowserDriver.chromium }
      const stop = () => void close(entry).catch(() => undefined)
      const navigate = (event: Electron.Event<{ isMainFrame: boolean; isSameDocument: boolean }>) => {
        if (event.isMainFrame && !event.isSameDocument) stop()
      }
      const contents = win.webContents
      contents.once("destroyed", stop)
      contents.on("did-start-navigation", navigate)
      entry.cleanup = () => {
        contents.off("destroyed", stop)
        contents.off("did-start-navigation", navigate)
      }
      entries.set(bindingID, entry)
      entry.ready = client.browser.register({
        sessionID: target.sessionID,
        open: () => publish(entry, { type: "open" }),
      })
      entry.registration = await entry.ready.catch(async (error: unknown) => {
        await close(entry)
        throw error
      })
      if (entries.get(bindingID) !== entry || disposed) {
        await close(entry)
        throw new Error("browser.pane.registration.closed")
      }
      publish(entry, { type: "state", state: { ...initialBrowserState } })
    },
    layout(win: BrowserWindow, bindingID: string, value?: BrowserPaneLayout) {
      const entry = owned(win, bindingID)
      entry.layout = value
      update(entry)
    },
    async command(win: BrowserWindow, bindingID: string, command: BrowserPaneCommand) {
      const entry = owned(win, bindingID)
      const page = entry.page
      if (!page?.ready) throw new Error("browser.pane.attachment.unavailable")
      const controller = (await page.ready).resource
      if (entry.page !== page || page.closed) throw new Error("browser.pane.attachment.closed")
      if (command.type === "navigate") return controller.navigate(command.url)
      if (command.type === "stop") return controller.stop()
      return controller[command.type]()
    },
    close: (win: BrowserWindow, bindingID: string) => close(owned(win, bindingID)),
    async dispose() {
      disposed = true
      await Promise.all([...entries.values()].map(close))
    },
  }

  function owned(win: BrowserWindow, bindingID: string) {
    const entry = entries.get(bindingID)
    if (!entry || entry.win !== win) throw new Error("browser.pane.unavailable")
    return entry
  }

  function publish(entry: Entry, event: BrowserPaneEvent["event"]) {
    if (!entries.has(entry.bindingID) || entry.win.isDestroyed() || entry.win.webContents.isDestroyed()) return
    emitIpcEvent(entry.win.webContents, new BrowserPaneEvent({ bindingID: entry.bindingID, event }))
  }

  async function close(entry: Entry) {
    if (entries.get(entry.bindingID) !== entry) return
    entries.delete(entry.bindingID)
    entry.page?.dispose()
    entry.cleanup?.()
    await entry.ready?.then((registration) => registration.close()).catch(() => undefined)
  }

  function update(entry: Entry) {
    if (!entry.layout) {
      entry.page?.dispose()
      entry.page = undefined
      return
    }
    const bounds = entry.layout.visible ? entry.layout.bounds : undefined
    if (!bounds || bounds.width <= 0 || bounds.height <= 0 || entry.win.isDestroyed()) {
      return entry.page?.view.setVisible(false)
    }
    if (!entry.page && entry.registration) {
      const fail = (error: unknown) => {
        if (entry.page !== page || page.closed) return
        const failure = error instanceof Error ? error.message : String(error)
        page.dispose()
        publish(entry, { type: "state", state: { ...initialBrowserState, error: failure } })
      }
      const page = createBrowserPage(entry.win, (state) => publish(entry, { type: "state", state }), fail)
      entry.page = page
      page.ready = entry.registration
        .attach({ driver: entry.chromium(page.port), signal: page.abort.signal })
        .then(async (attachment) => {
          if (page.closed || entry.page !== page) {
            await attachment.close()
            throw new Error("browser.pane.attachment.closed")
          }
          page.attachment = attachment
          page.publish({ ...page.state, ready: true })
          return attachment
        })
      void page.ready.catch(fail)
    }
    if (!entry.page || entry.page.closed) return
    entry.page.view.setBounds(bounds)
    entry.page.view.setVisible(true)
  }
}
