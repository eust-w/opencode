export * as BrowserTunnelServer from "./browser-tunnel"

import { BrowserHost } from "@opencode-ai/core/browser-host"
import { BrowserTunnelProtocol } from "@opencode-ai/protocol/browser-tunnel"
import type { Browser } from "@opencode-ai/schema/browser"
import type { BrowserTunnel } from "@opencode-ai/schema/browser-tunnel"
import type { Session } from "@opencode-ai/schema/session"
import { Cause, Context, Effect, Layer, Queue, Schema, Scope, SynchronizedRef } from "effect"
import { Socket } from "effect/unstable/socket"
import type Net from "node:net"

type TargetSocket = Net.Socket

export class OpenError extends Schema.TaggedError<OpenError>()("BrowserTunnel.OpenError", {
  status: Schema.Literals([404, 409, 502, 503, 504]),
  message: Schema.String,
}) {}

export interface Connection {
  readonly relay: (socket: Socket.Socket, opened: Effect.Effect<void>) => Effect.Effect<void, never, Scope.Scope>
}

export interface Interface {
  readonly open: (input: {
    readonly sessionID: Session.ID
    readonly leaseID: Browser.LeaseID
    readonly target: BrowserTunnel.Target
  }) => Effect.Effect<Connection, OpenError, Scope.Scope>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/server/BrowserTunnel") {}

export function make(): Effect.Effect<Interface, never, BrowserHost.Service> {
  return Effect.gen(function* () {
    const browser = yield* BrowserHost.Service
    const active = yield* SynchronizedRef.make(0)
    const open: Interface["open"] = Effect.fn("BrowserTunnel.open")(function* (input) {
      const capability = yield* browser.get(input.sessionID)
      if (!capability || capability.type !== "attached") {
        return yield* new OpenError({ status: 404, message: "No browser is attached to this Session." })
      }
      if (capability.leaseID !== input.leaseID) {
        return yield* new OpenError({ status: 409, message: "The browser attachment lease is stale." })
      }
      yield* Effect.acquireRelease(
        SynchronizedRef.modifyEffect(active, (count) =>
          count >= 64
            ? Effect.fail(new OpenError({ status: 503, message: "Browser tunnel capacity is unavailable." }))
            : Effect.succeed([undefined, count + 1] as const),
        ),
        () => SynchronizedRef.update(active, (count) => count - 1),
      )
      const target = yield* Effect.raceFirst(
        connect(input.target),
        capability.revoked.pipe(
          Effect.andThen(new OpenError({ status: 409, message: "The browser attachment lease was revoked." })),
        ),
      )
      return {
        relay: (socket, opened) =>
          relay(socket, target, capability.revoked, opened).pipe(Effect.catch(() => Effect.void)),
      }
    })
    return Service.of({ open })
  })
}

export const layer = Layer.effect(Service, make())

const relay = Effect.fn("BrowserTunnel.relay")(function* (
  socket: Socket.Socket,
  target: TargetSocket,
  revoked: Effect.Effect<void>,
  opened: Effect.Effect<void>,
) {
  const write = yield* socket.writer
  const incoming = yield* Queue.bounded<Uint8Array, Error>(1)
  const onData = (data: Buffer) => {
    target.pause()
    if (!Queue.offerUnsafe(incoming, data)) target.destroy(new Error("Browser tunnel target overflowed."))
  }
  const onClose = () => Queue.failCauseUnsafe(incoming, Cause.fail(new Error("Browser tunnel target closed.")))
  const onError = (error: Error) => Queue.failCauseUnsafe(incoming, Cause.fail(error))
  target.on("data", onData)
  target.once("close", onClose)
  target.once("error", onError)
  yield* Effect.addFinalizer(() =>
    Effect.sync(() => {
      target.off("data", onData)
      target.off("close", onClose)
      target.off("error", onError)
    }).pipe(Effect.andThen(Queue.shutdown(incoming))),
  )
  const fromTarget = Effect.forever(
    Queue.take(incoming).pipe(
      Effect.flatMap((data) =>
        Effect.forEach(
          Array.from({ length: Math.ceil(data.byteLength / BrowserTunnelProtocol.MaxFrameBytes) }, (_, index) =>
            data.subarray(
              index * BrowserTunnelProtocol.MaxFrameBytes,
              (index + 1) * BrowserTunnelProtocol.MaxFrameBytes,
            ),
          ),
          write,
          { discard: true },
        ),
      ),
      Effect.ensuring(Effect.sync(() => target.resume())),
    ),
  )
  const fromClient = socket.runRaw(
    (data) => {
      if (typeof data === "string" || data.byteLength > BrowserTunnelProtocol.MaxFrameBytes) {
        return Effect.fail(new Error("Browser tunnel frames must contain bounded binary payloads."))
      }
      return Effect.callback<void, Error>((resume) => {
        target.write(data, (error) => resume(error ? Effect.fail(error) : Effect.void))
      })
    },
    { onOpen: opened },
  )
  yield* Effect.raceFirst(Effect.raceFirst(fromClient, fromTarget), revoked)
})

function connect(input: BrowserTunnel.Target): Effect.Effect<TargetSocket, OpenError, Scope.Scope> {
  return Effect.gen(function* () {
    const { Socket } = yield* Effect.promise(() => import("node:net"))
    return yield* Effect.acquireRelease(
      Effect.callback<TargetSocket, OpenError>((resume) => {
        const socket = new Socket()
        socket.once("error", () =>
          resume(Effect.fail(new OpenError({ status: 502, message: "Failed to connect browser tunnel target." }))),
        )
        socket.connect(input.port, input.host, () => {
          socket.setNoDelay(true)
          resume(Effect.succeed(socket))
        })
        return Effect.sync(() => socket.destroy())
      }).pipe(
        Effect.timeoutOrElse({
          duration: "10 seconds",
          orElse: () => new OpenError({ status: 504, message: "Browser tunnel target connection timed out." }),
        }),
      ),
      (socket) => Effect.sync(() => socket.destroy()),
    )
  })
}
