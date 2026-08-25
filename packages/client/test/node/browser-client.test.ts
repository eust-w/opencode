import { BrowserControlProtocol } from "@opencode-ai/protocol/browser-control"
import { BrowserControl } from "@opencode-ai/schema/browser-control"
import { Browser, BrowserDriver, OpenCode } from "@opencode-ai/client/node"
import { expect, test } from "bun:test"
import { Effect } from "effect"
import { createServer } from "node:http"
import WebSocket, { WebSocketServer } from "ws"

const state: Browser.State = {
  url: "https://example.com/",
  title: "Example",
  loading: false,
  canGoBack: false,
  canGoForward: false,
  generation: 1,
}

test("registers authenticated browser controls and survives cancellation before acknowledgement", async () => {
  const authorization = "Bearer browser-secret"
  const http = createServer()
  const server = new WebSocketServer({ noServer: true })
  const connected = Promise.withResolvers<WebSocket>()
  server.once("connection", connected.resolve)
  http.on("upgrade", (request, socket, head) => {
    expect(request.url).toBe(BrowserControlProtocol.Path)
    expect(request.headers.authorization).toBe(authorization)
    expect(request.headers["sec-websocket-protocol"]).toBe(BrowserControlProtocol.Subprotocol)
    server.handleUpgrade(request, socket, head, (connection) => server.emit("connection", connection, request))
  })
  await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", resolve))
  const address = http.address()
  if (!address || typeof address === "string") throw new Error("control server did not bind")
  let opened = 0
  let disposed = 0
  try {
    const registering = OpenCode.make({
      baseUrl: `http://127.0.0.1:${address.port}/ignored?query=true`,
      headers: { Authorization: authorization },
    }).browser.register({
      sessionID: "ses_node_browser",
      open: () => {
        opened++
      },
    })
    const socket = await connected.promise
    const queued: WebSocket.RawData[] = []
    const waiting: Array<(value: WebSocket.RawData) => void> = []
    socket.on("message", (data) => {
      const next = waiting.shift()
      if (next) return next(data)
      queued.push(data)
    })
    const next = async () => {
      const data = queued.shift() ?? (await new Promise<WebSocket.RawData>((resolve) => waiting.push(resolve)))
      const payload =
        data instanceof ArrayBuffer ? new Uint8Array(data) : Array.isArray(data) ? Buffer.concat(data) : data
      return Effect.runPromise(BrowserControlProtocol.decodeFromClient(payload))
    }
    const send = (message: Parameters<typeof BrowserControlProtocol.encodeFromServer>[0]) =>
      socket.send(BrowserControlProtocol.encodeFromServer(message))
    expect(await next()).toEqual({ type: "browser.control.register", sessionID: "ses_node_browser" })
    send({ type: "browser.control.registered" })
    const registration = await registering
    send({ type: "browser.control.open" })
    await Bun.sleep(5)
    expect(opened).toBe(1)

    const driver = BrowserDriver.define(({ proxy }) => ({
      resource: proxy,
      state: () => state,
      subscribe: () => () => undefined,
      execute: async () => ({
        type: "snapshot" as const,
        state,
        format: "opencode.semantic.v1" as const,
        content: "snapshot",
      }),
      dispose: () => {
        disposed++
      },
    }))
    const abort = new AbortController()
    const cancelled = registration.attach({ driver, signal: abort.signal })
    const first = await next()
    if (first.type !== "browser.control.attach") throw new Error("expected browser attach")
    abort.abort(new Error("Browser attachment was aborted"))
    await expect(cancelled).rejects.toThrow("aborted")
    expect(await next()).toEqual({ type: "browser.control.detach", leaseID: first.leaseID })
    expect(disposed).toBe(1)

    const attaching = registration.attach({ driver })
    const attach = await next()
    if (attach.type !== "browser.control.attach") throw new Error("expected browser attach")
    send({ type: "browser.control.attached", leaseID: first.leaseID })
    send({ type: "browser.control.attached", leaseID: attach.leaseID })
    const attachment = await attaching
    expect(attachment.resource.url).toStartWith("http://127.0.0.1:")
    expect(attachment.resource.credentials.username).not.toBe(attachment.resource.credentials.password)
    expect((await next()).type).toBe("browser.control.state")

    const requestID = BrowserControl.RequestID.create()
    send({
      type: "browser.control.request",
      requestID,
      leaseID: attach.leaseID,
      command: { type: "snapshot", generation: 1 },
    })
    expect(await next()).toMatchObject({
      type: "browser.control.response",
      requestID,
      outcome: { type: "success", result: { type: "snapshot", content: "snapshot" } },
    })
    await attachment.close()
    expect(await next()).toEqual({ type: "browser.control.detach", leaseID: attach.leaseID })
    expect(socket.readyState).toBe(WebSocket.OPEN)
    expect(disposed).toBe(2)
    await registration.close()
  } finally {
    server.clients.forEach((socket) => socket.terminate())
    server.close()
    http.closeAllConnections()
    await new Promise<void>((resolve) => http.close(() => resolve()))
  }
})

test("rejects invalid Session IDs without opening a connection", async () => {
  await expect(
    OpenCode.make({ baseUrl: "http://127.0.0.1:1" }).browser.register({ sessionID: "wrong", open: () => undefined }),
  ).rejects.toThrow("valid Session ID")
})
