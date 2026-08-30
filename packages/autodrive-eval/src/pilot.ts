import { createHash } from "node:crypto"
import path from "node:path"
import { z } from "zod"
import { ArtifactReference, assertSecretFree } from "./artifact"
import { parseTaskInput, type TaskInput } from "./host-executor"
import { protocol, Run } from "./protocol"

export const PilotManifest = z.object({
  schemaVersion: z.literal(1),
  frozenAt: z.iso.datetime({ offset: true }),
  source: z.object({
    dataset: z.literal("princeton-nlp/SWE-bench_Verified"),
    revision: z.string().regex(/^[a-f0-9]{40}$/),
    parquetSHA256: z.string().regex(/^[a-f0-9]{64}$/),
    harnessRepository: z.literal("https://github.com/SWE-bench/SWE-bench"),
    harnessCommit: z.string().regex(/^[a-f0-9]{40}$/),
  }),
  task: z.object({
    instanceID: z.string().min(1),
    image: z.string().min(1),
    imageDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  }),
  taskInput: ArtifactReference,
  strategy: z.literal("supervisor"),
})
export type PilotManifest = z.infer<typeof PilotManifest>

export interface LoadedPilotManifest {
  readonly manifest: PilotManifest
  readonly task: TaskInput
}

export async function loadPilotManifest(manifestPath: string, input: unknown, formalTaskIDs: ReadonlySet<string>) {
  const manifest = PilotManifest.parse(input)
  if (formalTaskIDs.has(manifest.task.instanceID)) throw new Error("Pilot task overlaps the formal SWE-EVO manifest")
  const root = path.dirname(path.resolve(manifestPath))
  const taskPath = path.resolve(root, manifest.taskInput.path)
  if (!taskPath.startsWith(`${root}${path.sep}`)) throw new Error("Pilot task input escapes the manifest directory")
  const content = await Bun.file(taskPath).text()
  assertSecretFree(content)
  if (createHash("sha256").update(content).digest("hex") !== manifest.taskInput.sha256)
    throw new Error("Pilot task-input hash mismatch")
  const task = parseTaskInput(JSON.parse(content))
  if (task.instanceID !== manifest.task.instanceID || task.image !== manifest.task.image)
    throw new Error("Pilot task input does not match the frozen manifest")
  if (task.source.commit !== manifest.source.harnessCommit)
    throw new Error("Pilot task input does not match the frozen harness commit")
  return { manifest, task }
}

export function createPilotRun(input: LoadedPilotManifest) {
  const key = [
    protocol.version,
    "pilot",
    input.manifest.source.revision,
    input.task.instanceID,
    protocol.models.primary,
    input.manifest.strategy,
  ].join("\0")
  return Run.parse({
    id: `adr_${createHash("sha256").update(key).digest("hex").slice(0, 20)}`,
    taskID: input.task.instanceID,
    model: protocol.models.primary,
    controllerModel: protocol.models.controller,
    strategy: input.manifest.strategy,
    repeat: 0,
    temperature: protocol.temperature,
    segmentSteps: protocol.segmentSteps,
    maxContinuations: protocol.maxContinuations,
    timeoutMinutes: protocol.timeoutMinutes,
  })
}
