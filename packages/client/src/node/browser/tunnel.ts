import { BrowserTunnelProtocol } from "@opencode-ai/protocol/browser-tunnel"
import type { Browser } from "@opencode-ai/schema/browser"
import type { BrowserTunnel } from "@opencode-ai/schema/browser-tunnel"
import type { Session } from "@opencode-ai/schema/session"
import { once } from "node:events"
import { createRequire } from "node:module"
import type { Duplex } from "node:stream"
import WebSocket, { createWebSocketStream } from "ws"

const require = createRequire(import.meta.url)
const createStream: typeof createWebSocketStream = process.versions.bun
  ? require(require.resolve("ws/package.json").replace(/package\.json$/, "index.js")).createWebSocketStream
  : createWebSocketStream

export type BrowserTunnelEndpoint = { readonly url: string; readonly authorization?: string }

export async function openBrowserTunnel(input: {
  readonly endpoint: BrowserTunnelEndpoint
  readonly sessionID: Session.ID
  readonly leaseID: Browser.LeaseID
  readonly target: BrowserTunnel.Target
  readonly signal?: AbortSignal
}): Promise<Duplex> {
  const url = new URL(BrowserTunnelProtocol.Path, input.endpoint.url)
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:"
  const socket = new WebSocket(url, BrowserTunnelProtocol.Subprotocol, {
    headers: {
      ...(input.endpoint.authorization ? { Authorization: input.endpoint.authorization } : {}),
      [BrowserTunnelProtocol.Header.session]: input.sessionID,
      [BrowserTunnelProtocol.Header.lease]: input.leaseID,
      [BrowserTunnelProtocol.Header.host]: input.target.host,
      [BrowserTunnelProtocol.Header.port]: String(input.target.port),
    },
    handshakeTimeout: 10_000,
    maxPayload: BrowserTunnelProtocol.MaxFrameBytes,
    perMessageDeflate: false,
  })
  const stream = Object.assign(createStream(socket, { highWaterMark: BrowserTunnelProtocol.MaxFrameBytes }), {
    connecting: false,
    setKeepAlive: () => stream,
    setNoDelay: () => stream,
    setTimeout(_timeout: number, callback?: () => void) {
      if (callback) stream.once("timeout", callback)
      return stream
    },
    ref: () => stream,
    unref: () => stream,
  })
  socket.on("message", (_data, binary) => {
    if (!binary) stream.destroy(new Error("Browser tunnel accepts binary frames only"))
  })
  const cancel = () =>
    stream.destroy(
      input.signal?.reason instanceof Error ? input.signal.reason : new Error("Browser tunnel was cancelled"),
    )
  input.signal?.addEventListener("abort", cancel, { once: true })
  stream.once("close", () => input.signal?.removeEventListener("abort", cancel))
  const signal = AbortSignal.any([AbortSignal.timeout(10_000), ...(input.signal ? [input.signal] : [])])
  await once(socket, "open", { signal }).catch((error: unknown) => {
    stream.destroy()
    throw error
  })
  return stream
}
