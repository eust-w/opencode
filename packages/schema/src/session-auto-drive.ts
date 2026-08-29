export * as SessionAutoDrive from "./session-auto-drive"

import { Schema } from "effect"
import { Model } from "./model"
import { NonNegativeInt, optional } from "./schema"
import { SessionMessage } from "./session-message"

export const Action = Schema.Literals(["continue", "stop", "defer"])
export type Action = typeof Action.Type

export const Policy = Schema.Literals(["heuristic", "supervisor"])
export type Policy = typeof Policy.Type

export interface Settings extends Schema.Schema.Type<typeof Settings> {}
export const Settings = Schema.Struct({
  enabled: Schema.Boolean,
  policy: Policy,
  maxRuns: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 20 })),
  supervisorModel: Model.Ref.pipe(optional),
  contextual: Schema.Boolean,
  memory: Schema.Boolean,
  prompt: Schema.String.pipe(optional),
  projectPlaybook: Schema.String.pipe(optional),
}).annotate({ identifier: "SessionAutoDrive.Settings" })

export interface Source extends Schema.Schema.Type<typeof Source> {}
export const Source = Schema.Struct({
  type: Schema.Literal("auto-drive"),
  chainID: Schema.String,
  decision: Action,
  continuation: NonNegativeInt,
}).annotate({ identifier: "SessionAutoDrive.Source" })

export interface Status extends Schema.Schema.Type<typeof Status> {}
export const Status = Schema.Struct({
  action: Action.pipe(optional),
  reason: Schema.String.pipe(optional),
  chainID: Schema.String.pipe(optional),
  continuationCount: NonNegativeInt,
  inputID: SessionMessage.ID.pipe(optional),
  nextPrompt: Schema.String.pipe(optional),
}).annotate({ identifier: "SessionAutoDrive.Status" })

export interface State extends Schema.Schema.Type<typeof State> {}
export const State = Schema.Struct({
  settings: Settings,
  status: Status,
  memory: Schema.String.pipe(optional),
}).annotate({ identifier: "SessionAutoDrive.State" })

export interface Update extends Schema.Schema.Type<typeof Update> {}
export const Update = Schema.Struct({
  enabled: Schema.Boolean.pipe(optional),
  policy: Policy.pipe(optional),
  maxRuns: Settings.fields.maxRuns.pipe(optional),
  supervisorModel: Model.Ref.pipe(optional),
  contextual: Schema.Boolean.pipe(optional),
  memory: Schema.Boolean.pipe(optional),
  prompt: Schema.String.pipe(optional),
  projectPlaybook: Schema.String.pipe(optional),
}).annotate({ identifier: "SessionAutoDrive.Update" })
