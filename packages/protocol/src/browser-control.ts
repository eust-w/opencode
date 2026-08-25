export * as BrowserControlProtocol from "./browser-control.js"

import { BrowserControl } from "@opencode-ai/schema/browser-control"
import { Effect, Schema } from "effect"

export const Path = "/api/experimental/browser/control"
export const Subprotocol = "opencode.browser.control.v1"
export const MaxMessageBytes = 8 * 1_024 * 1_024

export class MessageError extends Schema.TaggedError<MessageError>()("BrowserControlProtocol.MessageError", {
  kind: Schema.Literals(["invalid", "too_large"]),
  message: Schema.String,
}) {}

const encoder = new TextEncoder()
const decoder = new TextDecoder("utf-8", { fatal: true })

export function encodeFromClient(input: BrowserControl.FromClient): string {
  return encode(Schema.encodeSync(Schema.fromJsonString(BrowserControl.FromClient))(input))
}

export function encodeFromServer(input: BrowserControl.FromServer): string {
  return encode(Schema.encodeSync(Schema.fromJsonString(BrowserControl.FromServer))(input))
}

export function decodeFromClient(input: string | Uint8Array): Effect.Effect<BrowserControl.FromClient, MessageError> {
  return decode(input, BrowserControl.FromClient)
}

export function decodeFromServer(input: string | Uint8Array): Effect.Effect<BrowserControl.FromServer, MessageError> {
  return decode(input, BrowserControl.FromServer)
}

function encode(input: string) {
  if (encoder.encode(input).byteLength > MaxMessageBytes) throw new RangeError("Browser control message is too large.")
  return input
}

function decode<Message>(
  input: string | Uint8Array,
  schema: Schema.ConstraintCodec<Message, unknown, never, never>,
): Effect.Effect<Message, MessageError> {
  if ((typeof input === "string" ? encoder.encode(input).byteLength : input.byteLength) > MaxMessageBytes) {
    return Effect.fail(new MessageError({ kind: "too_large", message: "Browser control message is too large." }))
  }
  return Effect.try(() => (typeof input === "string" ? input : decoder.decode(input))).pipe(
    Effect.flatMap(Schema.decodeUnknownEffect(Schema.fromJsonString(schema), { onExcessProperty: "error" })),
    Effect.mapError(() => new MessageError({ kind: "invalid", message: "Browser control message is invalid." })),
  )
}
