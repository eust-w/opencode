import { describe, expect, test } from "bun:test"
import manifestInput from "../../../research/auto-drive/protocol/swe-evo-48.json"
import { assertTrajectoryProvenance } from "../src/acceptance"
import { parseTrajectory } from "../src/artifact"
import { parsePreflight } from "../src/preflight"
import { createRunPlan, parseManifest } from "../src/protocol"

const manifest = parseManifest(manifestInput)
const run = createRunPlan(manifest)[0]
const task = manifest.tasks.find((item) => item.instanceID === run.taskID)!
const metadata = { path: "metadata/models.json", sha256: "b".repeat(64) }
const startupBaseline = {
  head: task.baseCommit,
  tree: "1".repeat(40),
  trackedClean: true,
  untrackedPathCount: 0,
  manifest: { path: "patches/startup-baseline.json", sha256: "2".repeat(64) },
  patch: { path: "patches/startup-baseline.diff", sha256: "3".repeat(64) },
} as const
const preflight = {
  receipt: parsePreflight(
    {
      schemaVersion: 1,
      protocol: "auto-drive-swe-evo-v1.14",
      scope: "canary",
      capturedAt: "2026-08-30T02:00:00.000Z",
      expiresAt: "2026-08-30T14:00:00.000Z",
      models: [
        {
          model: "d-robotics/deepseek-v4-pro",
          catalogModelID: "deepseek-v4-pro",
          modelVersion: "deepseek-v4-pro",
          credentialPresent: true,
          billing: "paid",
          trajectoryCapacity: 1,
          probe: { path: "probes/google.json", sha256: "a".repeat(64) },
        },
        {
          model: "d-robotics/qwen3.8-max",
          catalogModelID: "qwen3.8-max",
          modelVersion: "qwen3.8-max",
          credentialPresent: true,
          billing: "paid",
          trajectoryCapacity: 1,
          probe: { path: "probes/controller.json", sha256: "c".repeat(64) },
        },
      ],
      modelMetadata: metadata,
      runtime: {
        disableExternalSkills: true,
        disableClaudeCodeSkills: true,
        disableModelsFetch: true,
      },
    },
    { scope: "canary", now: new Date("2026-08-30T03:00:00.000Z") },
  ),
  sha256: "0".repeat(64),
}
const trajectory = currentTrajectory({
  schemaVersion: 4,
  runID: run.id,
  taskID: run.taskID,
  model: run.model,
  controllerModel: run.controllerModel,
  strategy: run.strategy,
  repeat: run.repeat,
  attempt: 1,
  startedAt: "2026-08-30T03:00:00.000Z",
  endedAt: "2026-08-30T03:01:00.000Z",
  status: "succeeded",
  resolved: false,
  fixRate: 0,
  firstBoundaryResolved: false,
  firstBoundaryFixRate: 0,
  continuationCount: 0,
  manualContinuationCount: 0,
  redundantTurns: 0,
  promptTokens: 100,
  completionTokens: 25,
  usageComplete: true,
  costUSD: 0.1,
  latencyMS: 60_000,
  recoverySucceeded: true,
  unsafeContinuationCount: 0,
  modelRequests: [
    {
      sequence: 0,
      kind: "worker",
      provider: "d-robotics-gateway",
      modelID: "deepseek-v4-pro",
      modelVersion: "deepseek-v4-pro",
      requestSHA256: "c".repeat(64),
      normalizedRequest: { path: `requests/${run.id}-000.json`, sha256: "c".repeat(64) },
      temperature: 0,
      maxOutputTokens: 4_096,
    },
  ],
  environment: {
    image: task.image,
    imageDigest: `sha256:${"d".repeat(64)}`,
    baseCommit: task.baseCommit,
    opencodeCommit: "e".repeat(40),
    modelMetadata: metadata,
    startupBaseline,
  },
  preflight: { path: "preflight/receipt.json", sha256: preflight.sha256 },
  trace: { path: `raw/${run.id}.jsonl`, sha256: "f".repeat(64) },
})

function currentTrajectory(input: unknown) {
  const parsed = parseTrajectory(input)
  if (parsed.schemaVersion !== 4) throw new Error("Expected current trajectory")
  return parsed
}

describe("frozen trajectory acceptance", () => {
  test("matches the run, task and sealed preflight provenance", async () => {
    expect(() => assertTrajectoryProvenance(trajectory, { run, task, preflight })).not.toThrow()
  })

  test("requires a clean startup baseline for formal acceptance", () => {
    const legacy = parseTrajectory({
      ...trajectory,
      schemaVersion: 3,
      environment: {
        image: trajectory.environment.image,
        imageDigest: trajectory.environment.imageDigest,
        baseCommit: trajectory.environment.baseCommit,
        opencodeCommit: trajectory.environment.opencodeCommit,
        modelMetadata: trajectory.environment.modelMetadata,
      },
    })
    expect(() => assertTrajectoryProvenance(legacy, { run, task, preflight })).toThrow("schema version 4")
    expect(() =>
      assertTrajectoryProvenance(
        {
          ...trajectory,
          environment: {
            ...trajectory.environment,
            startupBaseline: { ...trajectory.environment.startupBaseline, head: "f".repeat(40) },
          },
        },
        { run, task, preflight },
      ),
    ).toThrow("startup baseline HEAD")
  })

  test("rejects mismatched model versions, task images and preflight hashes", async () => {
    expect(() =>
      assertTrajectoryProvenance(
        { ...trajectory, modelRequests: [{ ...trajectory.modelRequests[0], modelVersion: "unsealed" }] },
        { run, task, preflight },
      ),
    ).toThrow("model version")
    expect(() =>
      assertTrajectoryProvenance(
        { ...trajectory, environment: { ...trajectory.environment, image: "wrong/image" } },
        { run, task, preflight },
      ),
    ).toThrow("task image")
    expect(() =>
      assertTrajectoryProvenance(
        { ...trajectory, preflight: { ...trajectory.preflight, sha256: "1".repeat(64) } },
        { run, task, preflight },
      ),
    ).toThrow("preflight receipt")
  })
})
