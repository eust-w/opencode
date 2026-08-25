import type { BrowserPaneState } from "@opencode-ai/app/desktop"
import type { BrowserDriverContext, BrowserProxy, ChromiumController, ChromiumPort } from "@opencode-ai/client/node"
import electron, { type BrowserWindow, type WebContentsView } from "electron"

export type BrowserPage = {
  readonly view: WebContentsView
  readonly abort: AbortController
  readonly listeners: Set<(event: { readonly state: BrowserPaneState; readonly mainDocumentChanged: boolean }) => void>
  readonly port: (context: BrowserDriverContext) => Promise<ChromiumPort<BrowserPage>>
  readonly publish: (state: BrowserPaneState, changed?: boolean) => void
  readonly dispose: () => void
  approvedOrigin: string
  state: BrowserPaneState
  closed: boolean
  attachment?: { close(): Promise<void> }
  ready?: Promise<{ resource: ChromiumController<BrowserPage>; close(): Promise<void> }>
}

export const initialBrowserState: BrowserPaneState = {
  url: "",
  title: "",
  loading: false,
  canGoBack: false,
  canGoForward: false,
  ready: false,
}

export function createBrowserPage(
  win: BrowserWindow,
  publish: (state: BrowserPaneState) => void,
  fail: (error: unknown) => void,
) {
  const view = new electron.WebContentsView({
    webPreferences: {
      partition: `opencode-browser-${crypto.randomUUID()}`,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      webviewTag: false,
      devTools: false,
      disableDialogs: true,
    },
  })
  const contents = view.webContents
  const page: BrowserPage = {
    view,
    abort: new AbortController(),
    listeners: new Set(),
    approvedOrigin: "about:blank",
    state: { ...initialBrowserState },
    closed: false,
    publish(state, changed = false) {
      if (page.closed) return
      page.state = state
      page.listeners.forEach((listener) => listener({ state, mainDocumentChanged: changed }))
      publish(state)
    },
    async port(context) {
      const dispose = await installBrowserNetwork(contents, context.proxy)
      await contents
        .loadURL("about:blank")
        .then(() => context.signal.throwIfAborted())
        .catch((error: unknown) => {
          dispose()
          throw error
        })
      return {
        resource: page,
        state: () => readBrowserState(page),
        subscribe(listener) {
          page.listeners.add(listener)
          return () => page.listeners.delete(listener)
        },
        navigate(url) {
          const origin = url === "about:blank" ? url : destinationOrigin(url)
          if (!origin) throw new Error("browser.pane.destination.invalid")
          page.approvedOrigin = origin
          return contents.loadURL(url)
        },
        back: () => navigateHistory(page, -1),
        forward: () => navigateHistory(page, 1),
        reload: () => contents.reload(),
        stop: () => (contents.isDestroyed() ? undefined : contents.stop()),
        send(command) {
          if (page.closed || contents.isDestroyed()) throw new Error("browser.pane.attachment.closed")
          if (!contents.debugger.isAttached()) contents.debugger.attach("1.3")
          return contents.debugger.sendCommand(command.method, command.params)
        },
        viewport: () => view.getBounds(),
        async screenshot(maximum) {
          const source = await contents.capturePage()
          const size = source.getSize()
          const scale = Math.min(1, Math.floor(maximum) / Math.max(size.width, size.height))
          const image = source.resize({
            width: Math.max(1, Math.round(size.width * scale)),
            height: Math.max(1, Math.round(size.height * scale)),
          })
          return { data: new Uint8Array(image.toPNG()), ...image.getSize() }
        },
        dispose,
      }
    },
    dispose() {
      if (page.closed) return
      page.closed = true
      page.abort.abort()
      if (!win.isDestroyed()) win.contentView.removeChildView(view)
      if (!contents.isDestroyed()) contents.close({ waitForBeforeUnload: false })
      void page.attachment?.close().catch(() => undefined)
    },
  }
  view.setVisible(false)
  view.setBorderRadius(8)
  const blocked = () => page.publish({ ...readBrowserState(page), loading: false, error: "ERR_BLOCKED_BY_CLIENT" })
  secureBrowserPage(contents, () => page.approvedOrigin, blocked)
  const update = () => page.publish(readBrowserState(page))
  contents.on("did-stop-loading", update)
  contents.on("did-navigate-in-page", update)
  contents.on("page-title-updated", update)
  contents.on("did-fail-load", (_event, code, error, url, mainFrame) => {
    if (mainFrame && code !== -3) page.publish({ ...readBrowserState(page), url, loading: false, error })
  })
  contents.on("did-start-navigation", (event) => {
    if (!event.isMainFrame) return
    page.publish({ ...readBrowserState(page), url: event.url, loading: true, error: undefined }, !event.isSameDocument)
  })
  contents.on("render-process-gone", (_event, details) => fail(details.reason))
  contents.debugger.on("detach", (_event, reason) => fail(reason))
  win.contentView.addChildView(view)
  return page
}

function readBrowserState(page: BrowserPage): BrowserPaneState {
  const contents = page.view.webContents
  if (contents.isDestroyed()) return { ...page.state, loading: false }
  return {
    ...page.state,
    url: contents.getURL(),
    title: contents.getTitle(),
    loading: contents.isLoading(),
    canGoBack: contents.navigationHistory.canGoBack(),
    canGoForward: contents.navigationHistory.canGoForward(),
  }
}

export function destinationOrigin(input: string) {
  if (!URL.canParse(input)) return
  const url = new URL(input)
  return /^https?:$/.test(url.protocol) && !url.username && !url.password ? url.origin : undefined
}

export function secureBrowserPage(contents: Electron.WebContents, approvedOrigin: () => string, blocked: () => void) {
  const session = contents.session
  session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
  session.setPermissionCheckHandler(() => false)
  session.setDevicePermissionHandler(() => false)
  session.setDisplayMediaRequestHandler((_request, callback) => callback({}))
  session.on("will-download", (event) => event.preventDefault())
  contents.setWindowOpenHandler(() => ({ action: "deny" }))
  contents.on("content-bounds-updated", (event) => event.preventDefault())
  const guard = (event: Electron.Event<{ url: string; isMainFrame: boolean }>) => {
    if (!event.isMainFrame || event.url === "about:blank" || destinationOrigin(event.url) === approvedOrigin()) return
    event.preventDefault()
    blocked()
  }
  contents.on("will-navigate", guard)
  contents.on("will-redirect", guard)
}

export async function installBrowserNetwork(contents: Electron.WebContents, proxy: BrowserProxy) {
  const session = contents.session
  let disposed = false
  const dispose = () => {
    if (disposed) return
    disposed = true
    if (!contents.isDestroyed()) contents.removeAllListeners("login")
    void session.closeAllConnections().catch(() => undefined)
  }
  contents.on("login", (event, _details, auth, callback) => {
    if (!auth.isProxy || auth.scheme !== "basic") return
    if (auth.host !== proxy.host || auth.port !== proxy.port || auth.realm !== "OpenCode Browser Proxy") return
    event.preventDefault()
    callback(proxy.credentials.username, proxy.credentials.password)
  })
  contents.setWebRTCIPHandlingPolicy("disable_non_proxied_udp")
  await session
    .setProxy({ mode: "fixed_servers", proxyRules: proxy.url, proxyBypassRules: "<-loopback>" })
    .then(() => session.closeAllConnections())
    .catch((error: unknown) => {
      dispose()
      throw error
    })
  return dispose
}

function navigateHistory(page: BrowserPage, offset: -1 | 1) {
  const history = page.view.webContents.navigationHistory
  if (!history.canGoToOffset(offset)) return
  const url = history.getAllEntries()[history.getActiveIndex() + offset]?.url
  const origin = url === "about:blank" ? url : url && destinationOrigin(url)
  if (!origin) throw new Error("browser.pane.destination.invalid")
  page.approvedOrigin = origin
  history.goToOffset(offset)
}
