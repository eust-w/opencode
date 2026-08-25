import { BrowserTunnel } from "@opencode-ai/schema/browser-tunnel"
import { randomBytes, timingSafeEqual } from "node:crypto"
import { Agent, createServer, request, type IncomingHttpHeaders } from "node:http"
import type { Duplex } from "node:stream"

export async function createBrowserProxy(input: {
  readonly connect: (target: BrowserTunnel.Target, signal: AbortSignal) => Promise<Duplex>
}) {
  const credentials = { username: randomBytes(16).toString("hex"), password: randomBytes(32).toString("hex") }
  const token = Buffer.from(`${credentials.username}:${credentials.password}`).toString("base64")
  const expected = Buffer.from(`Basic ${token}`)
  const sockets = new Set<Duplex>()
  const lifetime = new AbortController()
  let closing: Promise<void> | undefined
  const authorized = (header: string | string[] | undefined) => {
    if (typeof header !== "string") return false
    const actual = Buffer.from(header)
    return actual.length === expected.length && timingSafeEqual(actual, expected)
  }
  const track = (socket: Duplex) => {
    sockets.add(socket)
    socket.once("close", () => sockets.delete(socket))
  }
  const connect = async (host: string, port: number, signal: AbortSignal) => {
    const abort = AbortSignal.any([signal, lifetime.signal])
    const target = { host: BrowserTunnel.Host.make(host), port: BrowserTunnel.Port.make(port) }
    const socket = await input.connect(target, abort)
    if (abort.aborted) {
      socket.destroy()
      throw abort.reason
    }
    track(socket)
    socket.on("error", () => socket.destroy())
    return socket
  }
  const server = createServer((incoming, response) => {
    if (!authorized(incoming.headers["proxy-authorization"])) {
      response.writeHead(407, { "Proxy-Authenticate": 'Basic realm="OpenCode Browser Proxy"' }).end()
      return
    }
    if (!incoming.url || !URL.canParse(incoming.url)) return void response.writeHead(400).end()
    const url = new URL(incoming.url)
    if (url.protocol !== "http:" || url.username || url.password) return void response.writeHead(400).end()
    const abort = new AbortController()
    response.once("close", () => abort.abort(new Error("Browser proxy client closed")))
    void connect(url.hostname.replace(/^\[|\]$/g, ""), Number(url.port || 80), abort.signal)
      .then((socket) => {
        const agent = new Agent({ keepAlive: false })
        agent.createConnection = () => socket
        const options = {
          agent,
          hostname: url.hostname,
          port: Number(url.port || 80),
          path: `${url.pathname}${url.search}`,
          method: incoming.method,
          headers: { ...forwarded(incoming.headers), host: url.host, connection: "close" },
          signal: abort.signal,
        }
        const upstream = request(options, (result) => {
          response.writeHead(result.statusCode ?? 502, { ...forwarded(result.headers), connection: "close" })
          result.pipe(response)
        })
        upstream.once("error", () => response.destroy())
        response.once("close", () => agent.destroy())
        incoming.pipe(upstream)
      })
      .catch(() => response.destroy())
  })
  server.on("connection", track)
  server.on("connect", (incoming, socket, head) => {
    if (!authorized(incoming.headers["proxy-authorization"])) {
      socket.end(
        'HTTP/1.1 407 Proxy Authentication Required\r\nProxy-Authenticate: Basic realm="OpenCode Browser Proxy"\r\n\r\n',
      )
      return
    }
    const match = /^(?:\[([^\]]+)\]|([^:]+))(?::([0-9]+))?$/.exec(incoming.url ?? "")
    const host = match?.[1] ?? match?.[2]
    const port = Number(match?.[3] ?? 443)
    if (!host || host.length > 253 || /[\s/?#]/.test(host) || port < 1 || port > 65_535) {
      socket.end("HTTP/1.1 400 Bad Request\r\n\r\n")
      return
    }
    const abort = new AbortController()
    socket.once("close", () => abort.abort(new Error("Browser proxy client closed")))
    socket.pause()
    void connect(host, port, abort.signal)
      .then((tunnel) => {
        if (socket.destroyed) return void tunnel.destroy()
        socket.write("HTTP/1.1 200 Connection Established\r\n\r\n")
        if (head.byteLength) tunnel.write(head)
        socket.on("error", () => tunnel.destroy())
        socket.once("close", () => tunnel.destroy())
        tunnel.once("close", () => socket.destroy())
        socket.pipe(tunnel).pipe(socket)
        socket.resume()
      })
      .catch(() => {
        if (!socket.destroyed) socket.end("HTTP/1.1 502 Bad Gateway\r\n\r\n")
      })
  })
  server.requestTimeout = 30_000
  server.headersTimeout = 10_000
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject)
    server.listen(0, "127.0.0.1", resolve)
  })
  const address = server.address()
  if (!address || typeof address === "string") throw new Error("Browser proxy did not bind a TCP address")
  return {
    url: `http://127.0.0.1:${address.port}`,
    host: "127.0.0.1",
    port: address.port,
    credentials,
    close() {
      if (closing) return closing
      lifetime.abort(new Error("Browser proxy is closed"))
      sockets.forEach((socket) => socket.destroy())
      return (closing = new Promise<void>((resolve) => server.close(() => resolve())))
    },
  }
}

function forwarded(input: IncomingHttpHeaders) {
  const headers = { ...input }
  if (typeof headers.connection === "string")
    headers.connection.split(",").forEach((name) => delete headers[name.trim().toLowerCase()])
  const blocked =
    "connection,keep-alive,proxy-authenticate,proxy-authorization,proxy-connection,te,trailer,transfer-encoding,upgrade"
  blocked.split(",").forEach((name) => delete headers[name])
  return headers
}
