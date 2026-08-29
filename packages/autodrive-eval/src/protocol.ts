import { createHash } from "node:crypto"
import { z } from "zod"

export const Strategy = z.enum(["oracle", "blind", "regex", "supervisor"])
export type Strategy = z.infer<typeof Strategy>

export const Task = z.object({
  instanceID: z.string().min(1),
  repo: z.string().regex(/^[^/]+\/[^/]+$/),
  baseCommit: z.string().regex(/^[a-f0-9]{40}$/),
  environmentSetupCommit: z.string().regex(/^[a-f0-9]{40}$/),
  startVersion: z.string().min(1),
  endVersion: z.string().min(1),
  image: z.string().min(1),
  failToPassCount: z.number().int().nonnegative(),
  passToPassCount: z.number().int().nonnegative(),
  pullRequestCount: z.number().int().nonnegative(),
})
export type Task = z.infer<typeof Task>

export const Manifest = z.object({
  schemaVersion: z.literal(1),
  frozenAt: z.iso.datetime({ offset: true }),
  source: z.object({
    paper: z.url(),
    repository: z.url(),
    commit: z.string().regex(/^[a-f0-9]{40}$/),
    path: z.string().min(1),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
  }),
  tasks: z.array(Task).length(48),
})
export type Manifest = z.infer<typeof Manifest>

export const Run = z.object({
  id: z.string().regex(/^adr_[a-f0-9]{20}$/),
  taskID: z.string().min(1),
  model: z.string().min(1),
  controllerModel: z.string().min(1),
  strategy: Strategy,
  repeat: z.number().int().min(0).max(2),
  temperature: z.literal(0),
  segmentSteps: z.literal(6),
  maxContinuations: z.literal(5),
  timeoutMinutes: z.literal(45),
})
export type Run = z.infer<typeof Run>

export const protocol = {
  version: "auto-drive-swe-evo-v1",
  strategies: Strategy.options,
  models: {
    primary: "opencode/gemini-3.7-flash",
    replication: ["anthropic/claude-sonnet-4.6", "openai/gpt-5.4"],
    controller: "opencode/gemini-3.7-flash",
  },
  replicationTaskIDs: [
    "conan-io__conan_2.0.2_2.0.3",
    "conan-io__conan_2.0.14_2.0.15",
    "dask__dask_2023.9.2_2023.9.3",
    "dask__dask_2024.1.0_2024.1.1",
    "iterative__dvc_0.30.0_0.30.1",
    "iterative__dvc_3.13.3_3.14.0",
    "iterative__dvc_2.8.1_2.8.2",
    "modin-project__modin_0.24.0_0.24.1",
    "modin-project__modin_0.25.0_0.25.1",
    "psf__requests_v2.4.0_v2.4.1",
    "pydantic__pydantic_v2.7.0_v2.7.1",
    "scikit-learn__scikit-learn_0.21.1_0.21.2",
  ],
  offPolicy: "first-boundary-prefix",
  temperature: 0,
  segmentSteps: 6,
  maxContinuations: 5,
  timeoutMinutes: 45,
  concurrency: 2,
} as const

export function parseManifest(input: unknown) {
  const manifest = Manifest.parse(input)
  const taskIDs = manifest.tasks.map((task) => task.instanceID)
  if (new Set(taskIDs).size !== taskIDs.length) throw new Error("SWE-EVO manifest contains duplicate task IDs")
  const missing = protocol.replicationTaskIDs.filter((taskID) => !taskIDs.includes(taskID))
  if (missing.length) throw new Error(`Replication tasks missing from manifest: ${missing.join(", ")}`)
  return manifest
}

export function createRunPlan(manifest: Manifest) {
  const primary = manifest.tasks.flatMap((task) =>
    protocol.strategies.map((strategy) => makeRun(task.instanceID, protocol.models.primary, strategy, 0)),
  )
  const repeats = protocol.replicationTaskIDs.flatMap((taskID) =>
    [1, 2].flatMap((repeat) =>
      protocol.strategies.map((strategy) => makeRun(taskID, protocol.models.primary, strategy, repeat)),
    ),
  )
  const replication = protocol.replicationTaskIDs.flatMap((taskID) =>
    protocol.models.replication.flatMap((model) =>
      protocol.strategies.map((strategy) => makeRun(taskID, model, strategy, 0)),
    ),
  )
  return z
    .array(Run)
    .length(384)
    .parse([...primary, ...repeats, ...replication])
}

function makeRun(taskID: string, model: string, strategy: Strategy, repeat: number) {
  const key = [protocol.version, taskID, model, strategy, repeat].join("\0")
  return Run.parse({
    id: `adr_${createHash("sha256").update(key).digest("hex").slice(0, 20)}`,
    taskID,
    model,
    controllerModel: protocol.models.controller,
    strategy,
    repeat,
    temperature: protocol.temperature,
    segmentSteps: protocol.segmentSteps,
    maxContinuations: protocol.maxContinuations,
    timeoutMinutes: protocol.timeoutMinutes,
  })
}
