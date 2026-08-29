export * as ConfigAutoDrive from "./auto-drive"

import { Model } from "@opencode-ai/schema/model"
import { Schema } from "effect"

export const Policy = Schema.Literals(["heuristic", "supervisor"])

export const MaxRuns = Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 20 }))

export class Info extends Schema.Class<Info>("ConfigAutoDrive.Info")({
  enabled: Schema.Boolean.pipe(Schema.optional),
  policy: Policy.pipe(Schema.optional),
  prompt: Schema.String.pipe(Schema.optional),
  max_runs: MaxRuns.pipe(Schema.optional),
  supervisor_model: Model.Ref.pipe(Schema.optional),
  supervisor: Schema.Boolean.pipe(Schema.optional),
  memory: Schema.Boolean.pipe(Schema.optional),
  contextual: Schema.Boolean.pipe(Schema.optional),
  project_playbook: Schema.String.pipe(Schema.optional),
}) {}

export const Value = Schema.Union([Schema.Boolean, Info])
