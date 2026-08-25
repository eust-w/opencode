export * as BrowserControl from "./browser-control.js"

import { Schema } from "effect"
import { Browser } from "./browser.js"
import { ascending } from "./identifier.js"
import { SessionID } from "./session-id.js"
import { statics } from "./schema.js"

const RequestIDSchema = Schema.String.check(Schema.isPattern(/^brr_[0-9A-Za-z]+$/))
  .pipe(Schema.brand("BrowserControl.RequestID"))
  .annotate({ identifier: "BrowserControl.RequestID" })

export const RequestID = RequestIDSchema.pipe(
  statics((schema: typeof RequestIDSchema) => ({
    create: () => schema.make("brr_" + ascending()),
  })),
)
export type RequestID = typeof RequestID.Type

export const FromClient = Schema.Union([
  Schema.Struct({
    type: Schema.Literal("browser.control.register"),
    sessionID: SessionID,
  }),
  Schema.Struct({
    type: Schema.Literal("browser.control.attach"),
    leaseID: Browser.LeaseID,
    state: Browser.State,
  }),
  Schema.Struct({
    type: Schema.Literal("browser.control.state"),
    leaseID: Browser.LeaseID,
    state: Browser.State,
  }),
  Schema.Struct({
    type: Schema.Literal("browser.control.detach"),
    leaseID: Browser.LeaseID,
  }),
  Schema.Struct({
    type: Schema.Literal("browser.control.response"),
    requestID: RequestID,
    leaseID: Browser.LeaseID,
    outcome: Browser.Outcome,
  }),
])
  .pipe(Schema.toTaggedUnion("type"))
  .annotate({ identifier: "BrowserControl.FromClient" })
export type FromClient = typeof FromClient.Type

export const FromServer = Schema.Union([
  Schema.Struct({ type: Schema.Literal("browser.control.registered") }),
  Schema.Struct({ type: Schema.Literal("browser.control.open") }),
  Schema.Struct({
    type: Schema.Literal("browser.control.attached"),
    leaseID: Browser.LeaseID,
  }),
  Schema.Struct({
    type: Schema.Literal("browser.control.request"),
    requestID: RequestID,
    leaseID: Browser.LeaseID,
    command: Browser.Command,
  }),
  Schema.Struct({
    type: Schema.Literal("browser.control.cancel"),
    requestID: RequestID,
    leaseID: Browser.LeaseID,
  }),
])
  .pipe(Schema.toTaggedUnion("type"))
  .annotate({ identifier: "BrowserControl.FromServer" })
export type FromServer = typeof FromServer.Type
