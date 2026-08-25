export * as BrowserControlConnection from "./browser-control-connection"

import { BrowserHost } from "@opencode-ai/core/browser-host"
import { BrowserControlProtocol } from "@opencode-ai/protocol/browser-control"
import { Browser } from "@opencode-ai/schema/browser"
import { BrowserControl } from "@opencode-ai/schema/browser-control"
import { Deferred, Effect } from "effect"
import { Socket } from "effect/unstable/socket"

export const run = Effect.fn("BrowserControlConnection.run")(function* (
  browser: BrowserHost.Interface,
  socket: Socket.Socket,
  opened: Effect.Effect<void>,
) {
  const write = yield* socket.writer
  const pending = new Map<
    BrowserControl.RequestID,
    { readonly leaseID: Browser.LeaseID; readonly done: Deferred.Deferred<Browser.Outcome> }
  >()
  let controller: BrowserHost.Controller | undefined

  const send = (message: BrowserControl.FromServer) =>
    Effect.try({
      try: () => BrowserControlProtocol.encodeFromServer(message),
      catch: () =>
        new BrowserHost.RequestError({ code: "protocol", message: "Failed to encode browser control message." }),
    }).pipe(
      Effect.flatMap(write),
      Effect.mapError(
        () => new BrowserHost.RequestError({ code: "internal", message: "Browser control connection failed." }),
      ),
    )

  const peer: BrowserHost.Peer = {
    open: send({ type: "browser.control.open" }),
    request: (command, leaseID) =>
      Effect.gen(function* () {
        const requestID = BrowserControl.RequestID.create()
        const done = yield* Deferred.make<Browser.Outcome>()
        pending.set(requestID, { leaseID, done })
        yield* send({ type: "browser.control.request", requestID, leaseID, command })
        const outcome = yield* Deferred.await(done).pipe(
          Effect.onInterrupt(() => send({ type: "browser.control.cancel", requestID, leaseID }).pipe(Effect.ignore)),
          Effect.ensuring(Effect.sync(() => pending.delete(requestID))),
        )
        if (outcome.type === "failure") return yield* new BrowserHost.RequestError(outcome)
        return outcome.result
      }),
  }

  yield* Effect.addFinalizer(() =>
    Effect.sync(() => {
      pending.forEach((request) =>
        Deferred.doneUnsafe(
          request.done,
          Effect.succeed({
            type: "failure",
            code: "not_attached",
            message: "Browser control connection closed.",
          } as const),
        ),
      )
      pending.clear()
    }),
  )

  const receive = Effect.fnUntraced(function* (raw: string | Uint8Array) {
    const message = yield* BrowserControlProtocol.decodeFromClient(raw)
    if (!controller) {
      if (message.type !== "browser.control.register") {
        return yield* Effect.fail(new Error("Expected browser registration."))
      }
      controller = yield* browser.register(message.sessionID, peer)
      return yield* send({ type: "browser.control.registered" })
    }
    if (message.type === "browser.control.register") {
      return yield* Effect.fail(new Error("Browser control connection is already registered."))
    }
    if (message.type === "browser.control.attach") {
      yield* controller.attach(message.leaseID, message.state)
      return yield* send({ type: "browser.control.attached", leaseID: message.leaseID })
    }
    if (message.type === "browser.control.state") return yield* controller.state(message.leaseID, message.state)
    if (message.type === "browser.control.detach") return yield* controller.detach(message.leaseID)
    const request = pending.get(message.requestID)
    if (!request || request.leaseID !== message.leaseID) {
      return yield* Effect.fail(new Error("Browser response does not match a pending request."))
    }
    Deferred.doneUnsafe(request.done, Effect.succeed(message.outcome))
  })

  yield* socket.runRaw(receive, { onOpen: opened }).pipe(
    Effect.catchCause((cause) =>
      write(new Socket.CloseEvent(1002, "Invalid browser control message")).pipe(
        Effect.timeoutOrElse({ duration: "1 second", orElse: () => Effect.void }),
        Effect.catch(() => Effect.void),
        Effect.andThen(Effect.logDebug("Browser control connection closed", { cause })),
      ),
    ),
  )
})
