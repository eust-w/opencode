#!/usr/bin/env bun

import { createHash } from "node:crypto"
import { mkdir } from "node:fs/promises"
import path from "node:path"
import { z } from "zod"
import manifestInput from "../../../research/auto-drive/protocol/swe-evo-48.json"
import { parseTrajectory, serializeNormalizedRequest } from "../src/artifact"
import { parseManifest, Run } from "../src/protocol"

const Input = z.object({
  run: Run,
  attempt: z.literal(1),
  budget: z.object({
    category: z.literal("pilot"),
    maxCostUSD: z.literal(0),
    remainingUSD: z.number().nonnegative(),
  }),
})

if (Bun.env.AUTODRIVE_EVAL_MODE !== "dry-run") fail("dry-run executor refuses real experiment execution")
if (
  ["GOOGLE_GENERATIVE_AI_API_KEY", "ANTHROPIC_API_KEY", "OPENAI_API_KEY", "OPENCODE_API_KEY"].some(
    (name) => Bun.env[name],
  )
)
  fail("dry-run executor received a provider credential")
const artifactRoot = Bun.env.AUTODRIVE_EVAL_ARTIFACT_ROOT
if (!artifactRoot || !path.isAbsolute(artifactRoot)) fail("AUTODRIVE_EVAL_ARTIFACT_ROOT must be absolute")

const input = Input.parse(await Bun.stdin.json())
const task = parseManifest(manifestInput).tasks.find((item) => item.instanceID === input.run.taskID)
if (!task) fail(`Frozen task is missing: ${input.run.taskID}`)
if (input.budget.category !== "pilot" || input.budget.maxCostUSD !== 0)
  fail("dry-run executor requires a zero-cost pilot context")

const request = serializeNormalizedRequest({
  dryRun: true,
  messages: [
    {
      content: "Validate the host executor artifact contract without contacting a provider.",
      role: "user",
    },
  ],
  model: input.run.model,
  temperature: 0,
})
const metadata = JSON.stringify({ mode: "dry-run-contract", model: input.run.model }) + "\n"
const preflight =
  JSON.stringify({
    mode: "dry-run-contract",
    protocol: Bun.env.AUTODRIVE_EVAL_PROTOCOL,
  }) + "\n"
const trace = JSON.stringify({ mode: "dry-run-contract", type: "executor-verified" }) + "\n"
const requestPath = `dry-run/requests/${input.run.id}-000.json`
const metadataPath = "dry-run/metadata/models.json"
const preflightPath = "dry-run/preflight/contract.json"
const tracePath = `dry-run/raw/${input.run.id}.jsonl`

await Promise.all(
  [requestPath, metadataPath, preflightPath, tracePath].map((relative) =>
    mkdir(path.dirname(path.join(artifactRoot, relative)), { recursive: true }),
  ),
)
await Promise.all([
  Bun.write(path.join(artifactRoot, requestPath), request),
  Bun.write(path.join(artifactRoot, metadataPath), metadata),
  Bun.write(path.join(artifactRoot, preflightPath), preflight),
  Bun.write(path.join(artifactRoot, tracePath), trace),
])

const startedAt = new Date().toISOString()
const modelSeparator = input.run.model.indexOf("/")
const record = parseTrajectory({
  schemaVersion: 2,
  runID: input.run.id,
  taskID: input.run.taskID,
  model: input.run.model,
  controllerModel: input.run.controllerModel,
  strategy: input.run.strategy,
  repeat: input.run.repeat,
  attempt: input.attempt,
  startedAt,
  endedAt: startedAt,
  status: "failed",
  failure: "infrastructure",
  resolved: false,
  fixRate: 0,
  firstBoundaryResolved: false,
  firstBoundaryFixRate: 0,
  continuationCount: 0,
  manualContinuationCount: 0,
  redundantTurns: 0,
  promptTokens: 0,
  completionTokens: 0,
  costUSD: 0,
  latencyMS: 0,
  recoverySucceeded: false,
  unsafeContinuationCount: 0,
  modelRequests: [
    {
      sequence: 0,
      kind: "worker",
      provider: input.run.model.slice(0, modelSeparator),
      modelID: input.run.model.slice(modelSeparator + 1),
      modelVersion: "dry-run-contract-v1",
      requestSHA256: digest(request),
      normalizedRequest: { path: requestPath, sha256: digest(request) },
      temperature: 0,
      maxOutputTokens: 16_384,
    },
  ],
  environment: {
    image: task.image,
    imageDigest: `sha256:${digest(task.image)}`,
    baseCommit: task.baseCommit,
    opencodeCommit: "0".repeat(40),
    modelMetadata: { path: metadataPath, sha256: digest(metadata) },
  },
  preflight: { path: preflightPath, sha256: digest(preflight) },
  trace: { path: tracePath, sha256: digest(trace) },
})

process.stdout.write(JSON.stringify(record))

function digest(content: string) {
  return createHash("sha256").update(content).digest("hex")
}

function fail(message: string): never {
  console.error(message)
  process.exit(1)
}
