import { expect, test } from "bun:test"
import { EventEmitter } from "node:events"
import { destinationOrigin, installBrowserNetwork, secureBrowserPage } from "./browser-chromium"

test("isolates Electron permissions, navigation, proxy credentials, and network cleanup", async () => {
  const calls: unknown[] = []
  const handlers: {
    permission?: (_contents: unknown, _permission: unknown, callback: (allowed: boolean) => void) => void
    check?: () => boolean
    device?: () => boolean
    display?: (_request: unknown, callback: (streams: object) => void) => void
    popup?: () => { action: string }
  } = {}
  const session = Object.assign(new EventEmitter(), {
    setPermissionRequestHandler: (handler: typeof handlers.permission) => (handlers.permission = handler),
    setPermissionCheckHandler: (handler: typeof handlers.check) => (handlers.check = handler),
    setDevicePermissionHandler: (handler: typeof handlers.device) => (handlers.device = handler),
    setDisplayMediaRequestHandler: (handler: typeof handlers.display) => (handlers.display = handler),
    setProxy: async (value: unknown) => void calls.push(value),
    closeAllConnections: async () => void calls.push("closed"),
  })
  const contents = Object.assign(new EventEmitter(), {
    session,
    isDestroyed: () => false,
    setWindowOpenHandler: (handler: typeof handlers.popup) => (handlers.popup = handler),
    setWebRTCIPHandlingPolicy: (policy: string) => calls.push(policy),
  }) as Electron.WebContents
  const blocked: string[] = []
  const block = () => blocked.push("blocked")
  secureBrowserPage(contents, () => "https://allowed.example", block)
  const permission: boolean[] = []
  handlers.permission?.({}, "media", (allowed) => permission.push(allowed))
  const display: object[] = []
  handlers.display?.({}, (value) => display.push(value))
  expect(permission).toEqual([false])
  expect([handlers.check?.(), handlers.device?.()]).toEqual([false, false])
  expect(display).toEqual([{}])
  expect(handlers.popup?.()).toEqual({ action: "deny" })
  const prevented: string[] = []
  session.emit("will-download", { preventDefault: () => prevented.push("download") })
  contents.emit("content-bounds-updated", { preventDefault: () => prevented.push("movement") })
  const navigation = { url: "https://other.example", isMainFrame: true }
  for (const event of ["will-navigate", "will-redirect"]) {
    contents.emit(event, { ...navigation, preventDefault: () => prevented.push(event) })
  }
  expect(prevented).toEqual(["download", "movement", "will-navigate", "will-redirect"])
  expect(blocked).toHaveLength(2)
  expect(destinationOrigin("https://allowed.example/path")).toBe("https://allowed.example")
  expect(destinationOrigin("file:///etc/passwd")).toBeUndefined()
  expect(destinationOrigin("https://username:password@allowed.example")).toBeUndefined()
  const proxy = {
    url: "http://127.0.0.1:4080",
    host: "127.0.0.1",
    port: 4080,
    credentials: { username: "browser", password: "secret" },
  }
  const dispose = await installBrowserNetwork(contents, proxy)
  expect(calls).toEqual([
    "disable_non_proxied_udp",
    { mode: "fixed_servers", proxyRules: proxy.url, proxyBypassRules: "<-loopback>" },
    "closed",
  ])
  const credentials: unknown[] = []
  const authentication = { ...proxy, isProxy: true, scheme: "basic", realm: "OpenCode Browser Proxy" }
  const event = { preventDefault: () => calls.push("prevented") }
  const capture = (...value: string[]) => credentials.push(value)
  contents.emit("login", event, {}, authentication, capture)
  contents.emit("login", event, {}, { ...authentication, host: "other.example" }, capture)
  expect(credentials).toEqual([["browser", "secret"]])
  dispose()
  dispose()
  expect(contents.listenerCount("login")).toBe(0)
  expect(calls.filter((value) => value === "closed")).toHaveLength(2)
})
