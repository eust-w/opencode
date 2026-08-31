import { createHash } from "node:crypto"
import path from "node:path"
import { z } from "zod"
import { Strategy } from "./protocol"

const sha256 = z.string().regex(/^[a-f0-9]{64}$/)

export const ArtifactReference = z.object({
  path: z
    .string()
    .min(1)
    .refine(
      (value) => !path.isAbsolute(value) && !value.split(/[\\/]/).includes(".."),
      "Artifact path must be relative",
    ),
  sha256,
})

export const ModelRequest = z.object({
  sequence: z.number().int().nonnegative(),
  kind: z.enum(["worker", "controller"]),
  provider: z.string().min(1),
  modelID: z.string().min(1),
  modelVersion: z.string().min(1),
  requestSHA256: sha256,
  normalizedRequest: ArtifactReference,
  temperature: z.literal(0),
  maxOutputTokens: z.number().int().positive(),
})

const TrajectoryBase = z.object({
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
  usageComplete: z.boolean(),
  costUSD: z.number().nonnegative(),
  latencyMS: z.number().int().nonnegative(),
  recoverySucceeded: z.boolean(),
  unsafeContinuationCount: z.number().int().nonnegative(),
  modelRequests: z.array(ModelRequest).min(1),
  preflight: ArtifactReference,
  trace: ArtifactReference,
})

const Environment = z.object({
  image: z.string().min(1),
  imageDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  baseCommit: z.string().regex(/^[a-f0-9]{40}$/),
  opencodeCommit: z.string().regex(/^[a-f0-9]{40}$/),
  modelMetadata: ArtifactReference,
})

const StartupBaseline = z.object({
  head: z.string().regex(/^[a-f0-9]{40}$/),
  tree: z.string().regex(/^[a-f0-9]{40,64}$/),
  trackedClean: z.literal(true),
  untrackedPathCount: z.number().int().nonnegative(),
  manifest: ArtifactReference,
  patch: ArtifactReference,
})

const StartupBaselineManifest = z
  .object({
    schemaVersion: z.literal(1),
    head: z.string().regex(/^[a-f0-9]{40}$/),
    tree: z.string().regex(/^[a-f0-9]{40,64}$/),
    trackedClean: z.literal(true),
    untrackedPaths: z.array(
      z
        .string()
        .min(1)
        .refine((value) => !path.isAbsolute(value) && !value.split(/[\\/]/).includes(".."), "Invalid baseline path"),
    ),
    untrackedRoots: z.array(
      z
        .string()
        .min(1)
        .refine((value) => !path.isAbsolute(value) && !value.split(/[\\/]/).includes(".."), "Invalid baseline root"),
    ),
  })
  .strict()

export const Trajectory = z.discriminatedUnion("schemaVersion", [
  TrajectoryBase.extend({ schemaVersion: z.literal(3), environment: Environment }),
  TrajectoryBase.extend({
    schemaVersion: z.literal(4),
    environment: Environment.extend({ startupBaseline: StartupBaseline }),
  }),
])
export type Trajectory = z.infer<typeof Trajectory>

export function parseTrajectory(input: unknown) {
  const trajectory = Trajectory.parse(input)
  if (trajectory.modelRequests.some((request) => request.requestSHA256 !== request.normalizedRequest.sha256))
    throw new Error("Normalized request hash must match requestSHA256")
  if (trajectory.modelRequests.some((request, index) => request.sequence !== index))
    throw new Error("Model request sequences must be contiguous and start at zero")
  if (trajectory.status === "failed" && !trajectory.failure)
    throw new Error("Failed trajectories require a failure classification")
  if (trajectory.status === "succeeded" && trajectory.failure)
    throw new Error("Succeeded trajectories cannot carry a failure classification")
  return trajectory
}

export function hashNormalizedRequest(input: unknown) {
  return createHash("sha256").update(normalizeRequest(input)).digest("hex")
}

export function serializeNormalizedRequest(input: unknown) {
  return normalizeRequest(input)
}

export async function verifyTrajectoryArtifacts(trajectory: Trajectory, root: string) {
  await Promise.all([
    ...trajectory.modelRequests.map((request) => verifyNormalizedRequest(request, root)),
    verifyArtifact("Model metadata", trajectory.environment.modelMetadata, root),
    ...(trajectory.schemaVersion === 4 ? [verifyStartupBaseline(trajectory, root)] : []),
    verifyArtifact("Preflight", trajectory.preflight, root),
    verifyArtifact("Trace", trajectory.trace, root),
  ])
}

async function verifyStartupBaseline(trajectory: Extract<Trajectory, { schemaVersion: 4 }>, root: string) {
  const content = await verifyArtifact(
    "Startup baseline manifest",
    trajectory.environment.startupBaseline.manifest,
    root,
  )
  const manifest = StartupBaselineManifest.parse(JSON.parse(content))
  if (manifest.head !== trajectory.environment.startupBaseline.head) throw new Error("Startup baseline HEAD mismatch")
  if (manifest.tree !== trajectory.environment.startupBaseline.tree) throw new Error("Startup baseline tree mismatch")
  if (manifest.untrackedPaths.length !== trajectory.environment.startupBaseline.untrackedPathCount)
    throw new Error("Startup baseline untracked path count mismatch")
  if (new Set(manifest.untrackedPaths).size !== manifest.untrackedPaths.length)
    throw new Error("Startup baseline contains duplicate paths")
  await verifyArtifact("Startup baseline patch", trajectory.environment.startupBaseline.patch, root)
}

async function verifyNormalizedRequest(request: z.infer<typeof ModelRequest>, root: string) {
  const content = await readArtifact(root, request.normalizedRequest.path)
  assertSecretFree(content)
  const input = JSON.parse(content)
  if (content !== normalizeRequest(input)) throw new Error("Normalized request artifact is not canonical JSON")
  if (hashNormalizedRequest(input) !== request.requestSHA256)
    throw new Error("Normalized request artifact hash mismatch")
}

export function assertSecretFree(content: string) {
  const patterns = [
    /\bsk-(?!(?:ssh-ed25519|ecdsa-sha2-nistp256)(?:-cert-v01)?@openssh\.com\b)(?:proj-|ant-)?[A-Za-z0-9_-]{20,}\b/,
    /\bAIza[0-9A-Za-z_-]{30,}\b/,
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  ]
  if (patterns.some((pattern) => pattern.test(content))) throw new Error("Artifact contains a possible secret")
}

function normalizeRequest(input: unknown): string {
  return JSON.stringify(canonicalize(input))
}

function canonicalize(input: unknown): null | boolean | number | string | unknown[] | Record<string, unknown> {
  if (input === null || typeof input === "boolean" || typeof input === "string") return input
  if (typeof input === "number" && Number.isFinite(input)) return input
  if (Array.isArray(input)) return input.map(canonicalize)
  if (typeof input !== "object" || Object.getPrototypeOf(input) !== Object.prototype)
    throw new Error("Request body must contain only JSON-compatible values")
  return Object.fromEntries(
    Object.entries(input)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => [key, canonicalize(value)]),
  )
}

async function verifyArtifact(label: string, reference: z.infer<typeof ArtifactReference>, root: string) {
  const content = await readArtifact(root, reference.path)
  assertSecretFree(content)
  if (createHash("sha256").update(content).digest("hex") !== reference.sha256)
    throw new Error(`${label} artifact hash mismatch`)
  return content
}

async function readArtifact(root: string, relative: string) {
  const resolvedRoot = path.resolve(root)
  const resolved = path.resolve(resolvedRoot, relative)
  if (!resolved.startsWith(`${resolvedRoot}${path.sep}`)) throw new Error("Artifact path escapes root")
  const file = Bun.file(resolved)
  if (!(await file.exists())) throw new Error(`Artifact is missing: ${relative}`)
  return file.text()
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
