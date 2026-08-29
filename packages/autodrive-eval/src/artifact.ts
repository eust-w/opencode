import { z } from "zod"
import { Strategy } from "./protocol"

const sha256 = z.string().regex(/^[a-f0-9]{64}$/)

export const ModelRequest = z.object({
  provider: z.string().min(1),
  modelID: z.string().min(1),
  modelVersion: z.string().min(1),
  requestSHA256: sha256,
  temperature: z.literal(0),
  maxOutputTokens: z.number().int().positive(),
})

export const Trajectory = z.object({
  schemaVersion: z.literal(1),
  runID: z.string().regex(/^adr_[a-f0-9]{20}$/),
  taskID: z.string().min(1),
  model: z.string().min(1),
  controllerModel: z.string().min(1),
  strategy: Strategy,
  repeat: z.number().int().min(0).max(2),
  attempt: z.number().int().min(1).max(2),
  startedAt: z.iso.datetime(),
  endedAt: z.iso.datetime(),
  status: z.enum(["succeeded", "failed"]),
  failure: z
    .enum([
      "infrastructure",
      "model-timeout",
      "loop",
      "budget-exhausted",
      "retryable-provider",
      "non-retryable-provider",
      "grader",
    ])
    .optional(),
  resolved: z.boolean(),
  fixRate: z.number().min(0).max(1),
  firstBoundaryResolved: z.boolean(),
  firstBoundaryFixRate: z.number().min(0).max(1),
  continuationCount: z.number().int().min(0).max(5),
  manualContinuationCount: z.number().int().nonnegative(),
  redundantTurns: z.number().int().nonnegative(),
  promptTokens: z.number().int().nonnegative(),
  completionTokens: z.number().int().nonnegative(),
  costUSD: z.number().nonnegative(),
  latencyMS: z.number().int().nonnegative(),
  recoverySucceeded: z.boolean(),
  unsafeContinuationCount: z.number().int().nonnegative(),
  modelRequest: ModelRequest,
  environment: z.object({
    image: z.string().min(1),
    imageDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    baseCommit: z.string().regex(/^[a-f0-9]{40}$/),
    opencodeCommit: z.string().regex(/^[a-f0-9]{40}$/),
  }),
  trace: z.object({
    path: z.string().min(1),
    sha256,
  }),
})
export type Trajectory = z.infer<typeof Trajectory>

export function parseTrajectory(input: unknown) {
  const trajectory = Trajectory.parse(input)
  if (trajectory.status === "failed" && !trajectory.failure)
    throw new Error("Failed trajectories require a failure classification")
  if (trajectory.status === "succeeded" && trajectory.failure)
    throw new Error("Succeeded trajectories cannot carry a failure classification")
  return trajectory
}

export function assertSecretFree(content: string) {
  const patterns = [
    /\bsk-(?:proj-|ant-)?[A-Za-z0-9_-]{20,}\b/,
    /\bAIza[0-9A-Za-z_-]{30,}\b/,
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  ]
  if (patterns.some((pattern) => pattern.test(content))) throw new Error("Artifact contains a possible secret")
}

export function analyzeTrajectories(records: readonly Trajectory[]) {
  if (!records.length) throw new Error("Analysis requires at least one real trajectory")
  return {
    trajectories: records.length,
    strategies: Object.fromEntries(
      Strategy.options.map((strategy) => {
        const selected = records.filter((record) => record.strategy === strategy)
        return [strategy, summarize(selected)]
      }),
    ) as Record<(typeof Strategy.options)[number], ReturnType<typeof summarize>>,
    off: {
      prefixes: records.length,
      resolvedRate: mean(records.map((record) => Number(record.firstBoundaryResolved))),
      meanFixRate: mean(records.map((record) => record.firstBoundaryFixRate)),
    },
  }
}

function summarize(records: readonly Trajectory[]) {
  if (!records.length)
    return {
      trajectories: 0,
      resolvedRate: null,
      meanFixRate: null,
      meanManualContinuations: null,
      meanRedundantTurns: null,
      unsafeContinuationRate: null,
      meanTokens: null,
      totalCostUSD: 0,
      meanLatencyMS: null,
      recoveryRate: null,
    }
  return {
    trajectories: records.length,
    resolvedRate: mean(records.map((record) => Number(record.resolved))),
    meanFixRate: mean(records.map((record) => record.fixRate)),
    meanManualContinuations: mean(records.map((record) => record.manualContinuationCount)),
    meanRedundantTurns: mean(records.map((record) => record.redundantTurns)),
    unsafeContinuationRate: mean(records.map((record) => Number(record.unsafeContinuationCount > 0))),
    meanTokens: mean(records.map((record) => record.promptTokens + record.completionTokens)),
    totalCostUSD: currency(records.reduce((sum, record) => sum + record.costUSD, 0)),
    meanLatencyMS: mean(records.map((record) => record.latencyMS)),
    recoveryRate: mean(records.map((record) => Number(record.recoverySucceeded))),
  }
}

function mean(values: readonly number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function currency(value: number) {
  return Math.round(value * 100_000) / 100_000
}
