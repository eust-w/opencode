import { BrowserHost } from "@opencode-ai/core/browser-host"
import { BrowserControlProtocol } from "@opencode-ai/protocol/browser-control"
import { BrowserTunnelProtocol } from "@opencode-ai/protocol/browser-tunnel"
import { Browser } from "@opencode-ai/schema/browser"
import { BrowserTunnel } from "@opencode-ai/schema/browser-tunnel"
import { Session } from "@opencode-ai/schema/session"
import { Effect, Option, Result, Schema } from "effect"
import { HttpServerRequest, HttpServerResponse } from "effect/unstable/http"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { Api } from "../api"
import { BrowserControlConnection } from "../browser-control-connection"
import { BrowserTunnelServer } from "../browser-tunnel"
import { CorsConfig, isAllowedRequestOrigin, type CorsOptions } from "../cors"

const decodeTunnel = Schema.decodeUnknownOption(
  Schema.Struct({ sessionID: Session.ID, leaseID: Browser.LeaseID, target: BrowserTunnel.Target }),
)

export const BrowserHandler = HttpApiBuilder.group(Api, "server.browser", (handlers) =>
  Effect.gen(function* () {
    const browser = yield* BrowserHost.Service
    const tunnels = yield* BrowserTunnelServer.Service
    const cors = yield* CorsConfig

    return handlers
      .handleRaw(
        "browser.control.connect",
        Effect.fn("BrowserHandler.control")(function* (ctx) {
          const rejected = rejectUpgrade(ctx.request, BrowserControlProtocol.Subprotocol, cors)
          if (rejected) return rejected
          const socket = yield* Effect.orDie(ctx.request.upgrade)
          yield* BrowserControlConnection.run(
            browser,
            socket,
            Effect.sync(() => markUpgraded(ctx.request)),
          )
          return HttpServerResponse.empty()
        }),
      )
      .handleRaw(
        "browser.tunnel.connect",
        Effect.fn("BrowserHandler.tunnel")(function* (ctx) {
          const rejected = rejectUpgrade(ctx.request, BrowserTunnelProtocol.Subprotocol, cors)
          if (rejected) return rejected
          const port = ctx.request.headers[BrowserTunnelProtocol.Header.port]
          const input =
            port && /^[0-9]+$/.test(port)
              ? Option.getOrUndefined(
                  decodeTunnel({
                    sessionID: ctx.request.headers[BrowserTunnelProtocol.Header.session],
                    leaseID: ctx.request.headers[BrowserTunnelProtocol.Header.lease],
                    target: { host: ctx.request.headers[BrowserTunnelProtocol.Header.host], port: Number(port) },
                  }),
                )
              : undefined
          if (!input) return HttpServerResponse.empty({ status: 400 })
          const connection = yield* tunnels.open(input).pipe(Effect.result)
          if (Result.isFailure(connection)) return HttpServerResponse.empty({ status: connection.failure.status })
          const socket = yield* Effect.orDie(ctx.request.upgrade)
          yield* connection.success.relay(
            socket,
            Effect.sync(() => markUpgraded(ctx.request)),
          )
          return HttpServerResponse.empty()
        }),
      )
  }),
)

function markUpgraded(request: HttpServerRequest.HttpServerRequest) {
  const socket = Reflect.get(request.source, "socket")
  const current = socket && (Reflect.get(socket, "_httpMessage") ?? Reflect.get(request, "response"))
  const response = typeof current === "function" ? Reflect.apply(current, request, []) : current
  const detach = response && Reflect.get(response, "detachSocket")
  // Bun keeps its HTTP handshake response attached after the WebSocket takes ownership.
  if (typeof detach === "function") Reflect.apply(detach, response, [socket])
}

function rejectUpgrade(request: HttpServerRequest.HttpServerRequest, protocol: string, cors: CorsOptions | undefined) {
  if (new URL(request.url, "http://localhost").searchParams.has("auth_token")) {
    return HttpServerResponse.empty({ status: 401 })
  }
  if (!isAllowedRequestOrigin(request.headers.origin, request.headers.host, cors)) {
    return HttpServerResponse.empty({ status: 403 })
  }
  if (request.headers["sec-websocket-protocol"]?.split(",", 1)[0]?.trim() !== protocol) {
    return HttpServerResponse.empty({ status: 426, headers: { "sec-websocket-protocol": protocol } })
  }
}
