import { BrowserControlProtocol } from "@opencode-ai/protocol/browser-control"
import { Browser } from "@opencode-ai/schema/browser"
import type { BrowserControl } from "@opencode-ai/schema/browser-control"
import { Session } from "@opencode-ai/schema/session"
import { Effect, Schema } from "effect"
import WebSocket from "ws"
import type { ClientOptions } from "../../promise/generated/client.js"
import type { BrowserDriver, BrowserDriverInstance } from "./driver.js"
import { createBrowserProxy } from "./proxy.js"
import { openBrowserTunnel, type BrowserTunnelEndpoint } from "./tunnel.js"

export type BrowserRegisterOptions = { readonly sessionID: string; readonly open: () => Promise<void> | void }
export type BrowserAttachOptions<Resource> = { readonly driver: BrowserDriver<Resource>; readonly signal?: AbortSignal }
export type BrowserAttachment<Resource> = AsyncDisposable & {
  readonly resource: Resource
  readonly close: () => Promise<void>
}
export type BrowserRegistration = AsyncDisposable & {
  readonly attach: <Resource>(options: BrowserAttachOptions<Resource>) => Promise<BrowserAttachment<Resource>>
  readonly close: () => Promise<void>
}
export type BrowserClient = { readonly register: (options: BrowserRegisterOptions) => Promise<BrowserRegistration> }

type Attachment = {
  lease: Browser.LeaseID
  abort: AbortController
  ready: PromiseWithResolvers<void>
  stage: "creating" | "pending" | "attached"
  instance?: BrowserDriverInstance<unknown>
  proxy?: Awaited<ReturnType<typeof createBrowserProxy>>
  unsubscribe?: () => void
  closing?: Promise<void>
}

export function createBrowserClient(options: ClientOptions): BrowserClient {
  const url = new URL(options.baseUrl)
  if (!/^https?:$/.test(url.protocol) || url.username || url.password) throw new TypeError("Invalid browser server URL")
  const authorization = new Headers(options.headers).get("authorization") ?? undefined
  const endpoint = { url: url.href, ...(authorization ? { authorization } : {}) }
  return {
    register: async (input) => {
      if (!Schema.is(Session.ID)(input.sessionID)) throw new TypeError("Browser requires a valid Session ID")
      if (typeof input.open !== "function") throw new TypeError("Browser registration requires an open callback")
      const control = new Control(endpoint, Session.ID.make(input.sessionID), input.open)
      await abortable(control.registered.promise, AbortSignal.timeout(10_000)).catch(async (error: unknown) => {
        await control.close()
        throw error
      })
      return control
    },
  }
}

class Control implements BrowserRegistration {
  readonly registered = Promise.withResolvers<void>()
  private readonly requests = new Map<BrowserControl.RequestID, AbortController>()
  private readonly cancelled = new Set<Browser.LeaseID>()
  private readonly socket: WebSocket
  private attachment?: Attachment
  private closing?: Promise<void>

  constructor(
    private readonly endpoint: BrowserTunnelEndpoint,
    private readonly sessionID: Session.ID,
    private readonly open: BrowserRegisterOptions["open"],
  ) {
    const url = new URL(BrowserControlProtocol.Path, endpoint.url)
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:"
    this.socket = new WebSocket(url, BrowserControlProtocol.Subprotocol, {
      headers: endpoint.authorization ? { Authorization: endpoint.authorization } : {},
      handshakeTimeout: 10_000,
      maxPayload: BrowserControlProtocol.MaxMessageBytes,
      perMessageDeflate: false,
    })
    this.socket.once("open", () => this.send({ type: "browser.control.register", sessionID }))
    this.socket.on("message", (data, binary) => void this.receive(data, binary))
    this.socket.on("error", (error) => this.fail(error))
    this.socket.on("close", () => this.fail(new Error("Browser control connection closed")))
  }

  async attach<Resource>(input: BrowserAttachOptions<Resource>): Promise<BrowserAttachment<Resource>> {
    if (this.closing || this.attachment) throw new Error("Browser registration is closed or already attached")
    if (input.signal?.aborted) throw input.signal.reason
    const attachment: Attachment = {
      lease: Browser.LeaseID.create(),
      abort: new AbortController(),
      ready: Promise.withResolvers(),
      stage: "creating",
    }
    this.attachment = attachment
    void attachment.ready.promise.catch(() => undefined)
    input.signal?.addEventListener(
      "abort",
      () => void this.detach(attachment, input.signal?.reason instanceof Error ? input.signal.reason : undefined),
      { once: true, signal: attachment.abort.signal },
    )
    return Promise.resolve()
      .then(async () => {
        const proxy = await createBrowserProxy({
          connect: async (target, signal) => {
            await abortable(attachment.ready.promise, signal)
            signal = AbortSignal.any([signal, attachment.abort.signal])
            return openBrowserTunnel({
              endpoint: this.endpoint,
              sessionID: this.sessionID,
              leaseID: attachment.lease,
              target,
              signal,
            })
          },
        })
        if (attachment.closing) {
          await proxy.close()
          throw new Error("Browser attachment was closed")
        }
        attachment.proxy = proxy
        const scope = { url: proxy.url, host: proxy.host, port: proxy.port, credentials: proxy.credentials }
        const instance = await input.driver({ proxy: scope, signal: attachment.abort.signal })
        if (attachment.closing) {
          await instance.dispose()
          throw new Error("Browser attachment was closed")
        }
        attachment.instance = instance
        const state = instance.state()
        if (!Schema.is(Browser.State)(state)) throw new TypeError("Invalid browser driver state")
        attachment.unsubscribe = instance.subscribe((state) => {
          if (attachment.closing) return
          if (!Schema.is(Browser.State)(state)) return this.fail(new TypeError("Invalid browser driver state"))
          if (attachment.stage === "attached")
            this.send({ type: "browser.control.state", leaseID: attachment.lease, state })
        })
        this.send({ type: "browser.control.attach", leaseID: attachment.lease, state })
        attachment.stage = "pending"
        const deadline = AbortSignal.any([attachment.abort.signal, AbortSignal.timeout(10_000)])
        await abortable(attachment.ready.promise, deadline)
        attachment.stage = "attached"
        this.send({ type: "browser.control.state", leaseID: attachment.lease, state: instance.state() })
        const close = () => this.detach(attachment)
        return { resource: instance.resource, close, [Symbol.asyncDispose]: close }
      })
      .catch(async (error: unknown) => {
        await this.detach(attachment).catch(() => undefined)
        throw error
      })
  }

  close() {
    if (this.closing) return this.closing
    this.closing = (this.attachment ? this.detach(this.attachment) : Promise.resolve()).finally(() => {
      if (this.socket.readyState === WebSocket.OPEN) this.socket.close(1000)
      if (this.socket.readyState === WebSocket.CONNECTING) this.socket.terminate()
    })
    return this.closing
  }

  [Symbol.asyncDispose]() {
    return this.close()
  }

  private detach(attachment: Attachment, reason = new Error("Browser attachment was closed")) {
    if (attachment.closing) return attachment.closing
    attachment.abort.abort(reason)
    attachment.ready.reject(reason)
    this.requests.forEach((request) => request.abort(reason))
    this.requests.clear()
    if (this.attachment === attachment) this.attachment = undefined
    if (attachment.stage !== "creating") {
      if (attachment.stage === "pending") this.cancelled.add(attachment.lease)
      this.send({ type: "browser.control.detach", leaseID: attachment.lease })
    }
    attachment.unsubscribe?.()
    attachment.closing = Promise.resolve(attachment.instance?.dispose()).finally(() => attachment.proxy?.close())
    return attachment.closing
  }

  private async receive(data: WebSocket.RawData, binary: boolean) {
    if (binary) return this.fail(new Error("Invalid browser control message"))
    const payload =
      data instanceof ArrayBuffer ? new Uint8Array(data) : Array.isArray(data) ? Buffer.concat(data) : data
    const message = await Effect.runPromise(BrowserControlProtocol.decodeFromServer(payload)).catch(() => undefined)
    if (!message) return this.fail(new Error("Invalid browser control message"))
    if (message.type === "browser.control.registered") return this.registered.resolve()
    if (message.type === "browser.control.open") {
      void Promise.resolve()
        .then(this.open)
        .catch((error: Error) => this.fail(error))
      return
    }
    if (message.type === "browser.control.attached") {
      if (this.cancelled.delete(message.leaseID)) return
      if (this.attachment?.lease !== message.leaseID) return this.fail(new Error("Invalid browser lease"))
      return this.attachment.ready.resolve()
    }
    if (message.type === "browser.control.cancel") {
      if (this.attachment?.lease !== message.leaseID) return
      this.requests.get(message.requestID)?.abort(new Error("Browser command was cancelled"))
      this.requests.delete(message.requestID)
      return
    }
    const reply = (outcome: Browser.Outcome) =>
      this.send({ type: "browser.control.response", requestID: message.requestID, leaseID: message.leaseID, outcome })
    const attachment = this.attachment
    if (attachment?.stage !== "attached" || attachment.lease !== message.leaseID || !attachment.instance) {
      return reply({ type: "failure", code: "not_attached", message: "Browser is not attached." })
    }
    const abort = new AbortController()
    this.requests.set(message.requestID, abort)
    const signal = AbortSignal.any([abort.signal, attachment.abort.signal])
    const outcome = await attachment.instance.execute(message.command, { signal }).then(
      (result): Browser.Outcome =>
        Schema.is(Browser.Result)(result) && result.type === message.command.type
          ? { type: "success", result }
          : { type: "failure", code: "protocol", message: "Invalid browser driver result." },
      (error): Browser.Outcome => {
        const code = error instanceof Error && "code" in error ? error.code : undefined
        return {
          type: "failure",
          code: Schema.is(Browser.ErrorCode)(code) ? code : "internal",
          message: (error instanceof Error ? error.message : String(error)).slice(0, 1_024),
        }
      },
    )
    if (this.requests.get(message.requestID) !== abort) return
    this.requests.delete(message.requestID)
    reply(outcome)
  }

  private send(message: BrowserControl.FromClient) {
    if (this.socket.readyState !== WebSocket.OPEN) return
    this.socket.send(BrowserControlProtocol.encodeFromClient(message), (error) => error && this.fail(error))
  }

  private fail(error: Error) {
    if (this.closing) return
    this.registered.reject(error)
    this.attachment?.ready.reject(error)
    void this.close()
  }
}

function abortable<Result>(promise: Promise<Result>, signal: AbortSignal) {
  if (signal.aborted) return Promise.reject(signal.reason ?? new Error("Browser operation was aborted"))
  return new Promise<Result>((resolve, reject) => {
    const abort = () => reject(signal.reason ?? new Error("Browser operation was aborted"))
    signal.addEventListener("abort", abort, { once: true })
    void promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort))
  })
}
