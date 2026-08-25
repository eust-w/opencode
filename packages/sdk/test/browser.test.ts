import { Browser, BrowserDriver, OpenCode, type BrowserProxy } from "@opencode-ai/client/node"
import { ServerProcess } from "@opencode-ai/server/process"
import { expect } from "bun:test"
import { Effect } from "effect"
import { HttpServer } from "effect/unstable/http"
import { once } from "node:events"
import { createServer } from "node:http"
import { connect } from "node:net"
import { tmpdir } from "../../core/test/fixture/tmpdir"
import { it } from "../../core/test/lib/effect"

const state: Browser.State = {
  url: "http://127.0.0.1/",
  title: "Integration",
  loading: false,
  canGoBack: false,
  canGoForward: false,
  generation: 1,
}

it.live("proxies HTTP and CONNECT through authenticated, Session-isolated browser tunnels", () =>
  Effect.gen(function* () {
    const directory = yield* Effect.acquireRelease(
      Effect.promise(() => tmpdir("opencode-browser-integration-")),
      (temporary) => Effect.promise(() => temporary[Symbol.asyncDispose]()),
    )
    const server = yield* ServerProcess.start<never, never>({
      hostname: "127.0.0.1",
      port: 0,
      password: "browser-secret",
      database: { path: ":memory:" },
      config: { directory: directory.path, project: false, content: "{}" },
      fs: { filewatcher: false },
    })
    const headers = { Authorization: `Basic ${btoa("opencode:browser-secret")}` }
    const baseUrl = HttpServer.formatAddress(server.address)
    const client = OpenCode.make({ baseUrl, headers })
    const location = { directory: directory.path }
    const sessions = yield* Effect.promise(() =>
      Promise.all([client.session.create({ location }), client.session.create({ location })]),
    )
    const upstream: Array<{ path: string | undefined; authorization: string | undefined }> = []
    const target = createServer((incoming, response) => {
      upstream.push({ path: incoming.url, authorization: incoming.headers["proxy-authorization"] })
      const body = `${incoming.method} ${incoming.url}`
      response.writeHead(200, { "content-length": Buffer.byteLength(body) }).end(body)
    })
    yield* Effect.acquireRelease(
      Effect.promise(() => once(target.listen(0, "127.0.0.1"), "listening")),
      () =>
        Effect.promise(async () => {
          target.closeAllConnections()
          await new Promise<void>((resolve) => target.close(() => resolve()))
        }),
    )
    const address = target.address()
    if (!address || typeof address === "string") throw new Error("Browser target did not bind a TCP address")
    const destination = `127.0.0.1:${address.port}`
    const driver = BrowserDriver.define(({ proxy }) => ({
      resource: proxy,
      state: () => state,
      subscribe: () => () => undefined,
      execute: async () => ({ type: "snapshot", state, format: "opencode.semantic.v1", content: "integration" }),
      dispose: () => undefined,
    }))
    const registrations = yield* Effect.acquireRelease(
      Effect.promise(() =>
        Promise.all(
          sessions.map((session) => client.browser.register({ sessionID: session.id, open: () => undefined })),
        ),
      ),
      (active) => Effect.promise(() => Promise.all(active.map((registration) => registration.close()))),
    )
    const attachments = yield* Effect.acquireRelease(
      Effect.promise(() => Promise.all(registrations.map((registration) => registration.attach({ driver })))),
      (active) => Effect.promise(() => Promise.all(active.map((attachment) => attachment.close()))),
    )
    const first = attachments[0].resource
    const second = attachments[1].resource
    const firstAuthorization = proxyAuthorization(first)

    expect(first.host).toBe("127.0.0.1")
    expect(first.port).not.toBe(second.port)
    expect(yield* Effect.promise(() => proxyRequest(first, `http://${destination}/unauthorized`))).toMatchObject({
      status: 407,
    })
    expect(yield* Effect.promise(() => proxyRequest(first, destination, undefined, true))).toMatchObject({
      status: 407,
    })
    expect(
      yield* Effect.promise(() => proxyRequest(first, `http://${destination}/http?ready=true`, firstAuthorization)),
    ).toEqual({
      status: 200,
      body: "GET /http?ready=true",
    })
    expect(yield* Effect.promise(() => proxyRequest(first, destination, firstAuthorization, true))).toMatchObject({
      status: 200,
      body: expect.stringContaining("GET /through-connect"),
    })
    expect(upstream.every((entry) => entry.authorization === undefined)).toBe(true)
    expect(
      yield* Effect.promise(() => proxyRequest(second, `http://${destination}/cross-session`, firstAuthorization)),
    ).toMatchObject({
      status: 407,
    })
    expect(upstream.map((entry) => entry.path)).toEqual(["/http?ready=true", "/through-connect"])

    yield* Effect.promise(() => attachments[0].close())
    expect(
      yield* Effect.promise(() => proxyRequest(second, `http://${destination}/second`, proxyAuthorization(second))),
    ).toEqual({
      status: 200,
      body: "GET /second",
    })
    const reattached = yield* Effect.acquireRelease(
      Effect.promise(() => registrations[0].attach({ driver })),
      (attachment) => Effect.promise(() => attachment.close()),
    )
    expect(proxyAuthorization(reattached.resource)).not.toBe(firstAuthorization)
    expect(
      yield* Effect.promise(() =>
        proxyRequest(reattached.resource, `http://${destination}/reattached`, proxyAuthorization(reattached.resource)),
      ),
    ).toEqual({ status: 200, body: "GET /reattached" })

    const paths = [
      "/api/experimental/browser/control",
      "/api/experimental/browser/tunnel",
      "/api/browser/control",
      "/api/browser/tunnel",
    ]
    expect(
      yield* Effect.promise(() =>
        Promise.all(
          paths.map((path) => fetch(new URL(path, baseUrl), { headers }).then((response) => response.status)),
        ),
      ),
    ).toEqual([426, 426, 404, 404])
  }),
)

function proxyAuthorization(proxy: BrowserProxy) {
  return `Basic ${Buffer.from(`${proxy.credentials.username}:${proxy.credentials.password}`).toString("base64")}`
}

async function proxyRequest(proxy: BrowserProxy, path: string, authorization?: string, tunnel = false) {
  const socket = connect({ host: proxy.host, port: proxy.port })
  await once(socket, "connect")
  socket.write(
    `${tunnel ? "CONNECT" : "GET"} ${path} HTTP/1.1\r\nHost: ${tunnel ? path : `${proxy.host}:${proxy.port}`}\r\n${authorization ? `Proxy-Authorization: ${authorization}\r\n` : ""}Connection: close\r\n\r\n`,
  )
  const header = await new Promise<Buffer>((resolve, reject) => {
    socket.once("data", resolve)
    socket.once("error", reject)
    socket.once("close", () => reject(new Error("Browser proxy closed before responding")))
  })
  const status = Number(header.toString().split(" ", 3)[1])
  if (tunnel && status !== 200) {
    socket.destroy()
    return { status, body: "" }
  }
  if (tunnel) socket.write(`GET /through-connect HTTP/1.1\r\nHost: ${path}\r\nConnection: close\r\n\r\n`)
  const chunks = [Buffer.from(header)]
  for await (const chunk of socket) chunks.push(Buffer.from(chunk))
  const response = Buffer.concat(chunks).toString()
  return { status, body: response.slice(response.indexOf("\r\n\r\n") + 4) }
}
