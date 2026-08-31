import { createHash } from "node:crypto"
import path from "node:path"
import { z } from "zod"
import { ArtifactReference, assertSecretFree } from "./artifact"
import { protocol } from "./protocol"

export const PreflightScope = z.enum(["canary", "boundary", "annotation", "ablation", "full"])
export type PreflightScope = z.infer<typeof PreflightScope>

export const Preflight = z.object({
  schemaVersion: z.literal(1),
  protocol: z.literal(protocol.version),
  scope: PreflightScope,
  capturedAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  models: z.array(
    z.object({
      model: z.string().min(1),
      catalogModelID: z.string().min(1),
      modelVersion: z.string().min(1),
      credentialPresent: z.literal(true),
      billing: z.enum(["paid", "sponsored", "free", "unknown"]),
      trajectoryCapacity: z.number().int().nonnegative(),
      probe: ArtifactReference,
    }),
  ),
  modelMetadata: ArtifactReference,
  runtime: z.object({
    disableExternalSkills: z.literal(true),
    disableClaudeCodeSkills: z.literal(true),
    disableModelsFetch: z.literal(true),
  }),
})
export type Preflight = z.infer<typeof Preflight>

const ProviderProbe = z.object({
  billing: z.enum(["paid", "sponsored", "free", "unknown"]),
  modelVersion: z.string().min(1),
  trajectoryCapacity: z.number().int().nonnegative(),
})

const RunnableModelMetadata = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  release_date: z.string().min(1),
  attachment: z.boolean(),
  reasoning: z.boolean(),
  temperature: z.boolean(),
  tool_call: z.boolean(),
  limit: z.object({
    context: z.number().positive(),
    output: z.number().positive(),
  }),
  modalities: z
    .object({
      input: z.array(z.enum(["text", "audio", "image", "video", "pdf"])),
      output: z.array(z.enum(["text", "audio", "image", "video", "pdf"])),
    })
    .optional(),
})

export function parsePreflight(input: unknown, options: { scope: PreflightScope; now?: Date }) {
  const receipt = Preflight.parse(input)
  if (receipt.scope !== options.scope) throw new Error(`Preflight scope must be ${options.scope}`)
  const now = options.now ?? new Date()
  if (new Date(receipt.capturedAt).getTime() > now.getTime())
    throw new Error("Preflight cannot be captured in the future")
  if (new Date(receipt.expiresAt).getTime() <= now.getTime()) throw new Error("Preflight receipt has expired")

  const requiredModels: [string, number][] =
    options.scope === "canary"
      ? [
          [protocol.models.primary, 1],
          [protocol.models.controller, 1],
        ]
      : options.scope === "boundary"
        ? [
            [protocol.models.primary, 96],
            [protocol.models.controller, 96],
          ]
        : options.scope === "annotation"
          ? [
              [protocol.models.primary, 480],
              [protocol.models.replication[0], 480],
              [protocol.models.replication[1], 480],
            ]
          : options.scope === "ablation"
            ? [[protocol.models.controller, 504]]
          : [
            [protocol.models.primary, 384],
            [protocol.models.replication[0], 48],
            [protocol.models.replication[1], 48],
            [protocol.models.controller, 384],
            ]
  const requirements = requiredModels.reduce(
    (result, [model, capacity]) => result.set(model, Math.max(result.get(model) ?? 0, capacity)),
    new Map<string, number>(),
  )
  if (new Set(receipt.models.map((model) => model.model)).size !== receipt.models.length)
    throw new Error("Preflight contains duplicate models")
  if (receipt.models.length !== requirements.size || receipt.models.some((model) => !requirements.has(model.model)))
    throw new Error(`Preflight must resolve exactly: ${Array.from(requirements.keys()).join(", ")}`)

  receipt.models.forEach((model) => {
    if (model.billing !== "paid" && model.billing !== "sponsored")
      throw new Error(`${model.model} does not have verified metered billing`)
    if (model.trajectoryCapacity < requirements.get(model.model)!)
      throw new Error(`${model.model} does not have enough verified trajectory capacity`)
  })
  return receipt
}

export function createModelMetadataSnapshot(input: unknown) {
  const source = z.record(z.string(), z.object({ models: z.record(z.string(), z.unknown()) }).loose()).parse(input)
  const resolutions = Array.from(
    new Set([protocol.models.primary, ...protocol.models.replication, protocol.models.controller]),
  ).map((model) => {
    const separator = model.indexOf("/")
    const providerID = model.slice(0, separator)
    const modelID = model.slice(separator + 1)
    const provider = source[providerID]
    if (!provider) throw new Error(`Model metadata is missing provider: ${providerID}`)
    const catalogModelID = [modelID, ...(providerID === "anthropic" ? [modelID.replaceAll(".", "-")] : [])].find(
      (candidate) => candidate in provider.models,
    )
    if (!catalogModelID) throw new Error(`Model metadata cannot resolve: ${model}`)
    return { model, providerID, catalogModelID }
  })
  return {
    providers: Object.fromEntries(
      Array.from(new Set(resolutions.map((item) => item.providerID))).map((providerID) => [
        providerID,
        {
          ...source[providerID],
          models: Object.fromEntries(
            resolutions
              .filter((item) => item.providerID === providerID)
              .map((item) => [item.catalogModelID, source[providerID].models[item.catalogModelID]]),
          ),
        },
      ]),
    ),
    resolutions: resolutions.map((item) => ({ model: item.model, catalogModelID: item.catalogModelID })),
  }
}

export async function loadPreflight(filePath: string, options: { scope: PreflightScope; now?: Date }) {
  const file = Bun.file(filePath)
  if (!(await file.exists())) throw new Error(`Preflight receipt is missing: ${filePath}`)
  const content = await file.text()
  assertSecretFree(content)
  const receipt = parsePreflight(JSON.parse(content), options)
  const [metadata, ...probes] = await Promise.all([
    verifyArtifact("Model metadata", receipt.modelMetadata, path.dirname(filePath)),
    ...receipt.models.map((model) => verifyArtifact("Provider probe", model.probe, path.dirname(filePath))),
  ])
  verifyModelMetadata(receipt, JSON.parse(metadata))
  receipt.models.forEach((model, index) => verifyProviderProbe(model, probes[index]))
  return {
    receipt,
    sha256: createHash("sha256").update(content).digest("hex"),
  }
}

async function verifyArtifact(label: string, reference: z.infer<typeof ArtifactReference>, root: string) {
  const resolvedRoot = path.resolve(root)
  const resolved = path.resolve(resolvedRoot, reference.path)
  if (!resolved.startsWith(`${resolvedRoot}${path.sep}`)) throw new Error("Preflight artifact path escapes root")
  const file = Bun.file(resolved)
  if (!(await file.exists())) throw new Error(`${label} artifact is missing: ${reference.path}`)
  const content = await file.text()
  assertSecretFree(content)
  if (createHash("sha256").update(content).digest("hex") !== reference.sha256)
    throw new Error(`${label} artifact hash mismatch`)
  return content
}

function verifyProviderProbe(model: Preflight["models"][number], input: string) {
  const probe = ProviderProbe.parse(JSON.parse(input))
  if ((probe.billing !== "paid" && probe.billing !== "sponsored") || probe.billing !== model.billing)
    throw new Error(`${model.model} provider probe does not verify metered billing`)
  if (probe.modelVersion !== model.modelVersion)
    throw new Error(`${model.model} provider probe model version does not match the receipt`)
  if (probe.trajectoryCapacity !== model.trajectoryCapacity)
    throw new Error(`${model.model} provider probe capacity does not match the receipt`)
}

function verifyModelMetadata(receipt: Preflight, input: unknown) {
  const metadata = z.record(z.string(), z.object({ models: z.record(z.string(), z.unknown()) }).loose()).parse(input)
  receipt.models.forEach((model) => {
    const separator = model.model.indexOf("/")
    const value = metadata[model.model.slice(0, separator)]?.models?.[model.catalogModelID]
    if (!value)
      throw new Error(`Model metadata does not contain catalog model: ${model.catalogModelID}`)
    if (!RunnableModelMetadata.safeParse(value).success)
      throw new Error(`${model.model} does not contain runnable model metadata`)
  })
}
