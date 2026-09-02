#!/usr/bin/env bun

import { appendFile, chmod, mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { z } from "zod"
import { BoundaryCandidate } from "../src/annotation"
import { assertSecretFree } from "../src/artifact"
import { annotationPanelCap, annotationPanelOriginalCap, caps, totalCap } from "../src/budget"
import { frozenAnnotationModelID } from "../src/host-executor"
import {
  buildModelAnnotationPrompt,
  buildModelAnnotationRequest,
  canRetryModelAnnotation,
  modelAnnotationArtifactName,
  parseModelAnnotation,
  parseModelAnnotationResponse,
  renderModelAnnotationCSV,
} from "../src/model-annotation"
import { loadPreflight } from "../src/preflight"
import { protocol } from "../src/protocol"
import { admitBoundaryResearchCost, assertBoundaryResearchReservation } from "../src/research-budget"

class ModelAnnotationOutputError extends Error {
  constructor(error: unknown) {
    super(error instanceof Error ? error.message : String(error))
    this.name = "ModelAnnotationOutputError"
  }
}

const ArtifactReference = z.object({
  path: z.string().min(1),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
})

const AnnotationRecord = z.object({
  schemaVersion: z.literal(1),
  protocol: z.literal(protocol.version),
  candidateID: z.string().min(1),
  annotator: z.string().min(1),
  model: z.string().min(1),
  modelVersion: z.string().min(1),
  recordedAt: z.iso.datetime(),
  latencyMS: z.number().int().nonnegative(),
  promptTokens: z.number().int().nonnegative(),
  completionTokens: z.number().int().nonnegative(),
  request: ArtifactReference,
  response: ArtifactReference,
  annotation: z.object({
    label: z.enum(["continue", "stop", "defer"]),
    confidence: z.enum(["high", "medium", "low"]),
    reason: z.string().min(1),
    nextAction: z.string(),
  }),
})

const AnnotationFailure = z.object({
  schemaVersion: z.literal(1),
  protocol: z.literal(protocol.version),
  method: z.literal("bounded-model-annotation-recovery"),
  candidateID: z.string().min(1),
  annotator: z.string().min(1),
  model: z.string().min(1),
  attempt: z.union([z.literal(1), z.literal(2)]),
  failedAt: z.iso.datetime(),
  settledSpendUSD: z.number().nonnegative(),
  request: ArtifactReference,
  error: z.object({ name: z.string().min(1), message: z.string().min(1) }),
})

const PreproviderRecovery = z.object({
  schemaVersion: z.literal(1),
  protocol: z.literal(protocol.version),
  method: z.literal("annotation-surrogate-preprovider-reconciliation"),
  candidateID: z.string().min(1),
  attempt: z.literal(1),
  classification: z.literal("zero-cost-pre-provider-transport"),
  request: ArtifactReference,
  failure: ArtifactReference,
  provider: z.object({
    startTime: z.iso.datetime(),
    endTime: z.iso.datetime(),
    status: z.literal("failure"),
    spendUSD: z.literal(0),
    promptTokens: z.literal(0),
    completionTokens: z.literal(0),
    errorCode: z.literal("500"),
    errorClass: z.literal("InternalServerError"),
    attemptedRetries: z.literal(2),
    maxRetries: z.literal(2),
    requestIDHash: z.string().regex(/^[a-f0-9]{64}$/),
    errorMessageHash: z.string().regex(/^[a-f0-9]{64}$/),
  }),
  normalization: z.literal("replace-unpaired-utf16-surrogates-with-u+fffd"),
})

const TerminalOutputExclusion = z.object({
  schemaVersion: z.literal(1),
  protocol: z.literal(protocol.version),
  method: z.enum(["terminal-model-annotation-output", "annotation-terminal-output-reconciliation"]),
  candidateID: z.string().min(1),
  annotator: z.string().min(1),
  model: z.string().min(1),
  attempt: z.union([z.literal(1), z.literal(2)]),
  classification: z.literal("provider-success-invalid-final-annotation"),
  request: ArtifactReference,
  failure: ArtifactReference,
  rawResponse: ArtifactReference.optional(),
  provider: z.object({
    modelVersion: z.string().min(1),
    promptTokens: z.number().int().nonnegative(),
    completionTokens: z.number().int().nonnegative(),
    spendUSD: z.number().nonnegative().optional(),
    requestIDHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  }),
})

const CampaignReceipt = z.object({
  schemaVersion: z.literal(1),
  protocol: z.literal(protocol.version),
  method: z.literal("independent-model-annotation"),
  annotator: z.string().min(1),
  model: z.string().min(1),
  candidatesSHA256: z.string().regex(/^[a-f0-9]{64}$/),
  preflightSHA256: z.string().regex(/^[a-f0-9]{64}$/),
  startedAt: z.iso.datetime(),
  baselineSpendUSD: z.number().nonnegative(),
  maxCostUSD: z.number().positive(),
  perCallCeilingUSD: z.number().positive(),
})

const CampaignManifest = CampaignReceipt.extend({
  budgetAmendment: ArtifactReference.optional(),
  authorizedMaxCostUSD: z.number().positive().optional(),
  completedAt: z.iso.datetime(),
  examples: z.number().int().positive(),
  screened: z.number().int().positive().optional(),
  terminalExclusions: z.array(ArtifactReference.extend({ candidateID: z.string().min(1) })).optional(),
  modelVersion: z.array(z.string().min(1)).min(1),
  promptTokens: z.number().int().nonnegative(),
  completionTokens: z.number().int().nonnegative(),
  settledSpendUSD: z.number().nonnegative(),
  costUSD: z.number().nonnegative(),
  labelsSHA256: z.string().regex(/^[a-f0-9]{64}$/),
})

const AnnotationBudgetAmendment = z.object({
  schemaVersion: z.literal(1),
  protocol: z.literal(protocol.version),
  method: z.literal("annotation-budget-amendment"),
  authorization: z.literal("user-approved-budget-reallocation"),
  authorizedAt: z.iso.datetime(),
  annotator: z.string().min(1),
  model: z.string().min(1),
  candidatesSHA256: z.string().regex(/^[a-f0-9]{64}$/),
  preflightSHA256: z.string().regex(/^[a-f0-9]{64}$/),
  receiptSHA256: z.string().regex(/^[a-f0-9]{64}$/),
  previousMaxCostUSD: z.literal(annotationPanelOriginalCap),
  maxCostUSD: z.literal(annotationPanelCap),
  boundaryCapUSD: z.literal(caps.boundary),
  totalCapUSD: z.literal(totalCap),
})

const concurrency = 2
const requestTimeoutMS = 180_000
const candidatesPath = requireOption("candidates")
const output = path.resolve(requireOption("output"))
const annotator = requireOption("annotator")
if (!/^[A-Za-z0-9._-]+$/.test(annotator)) fail("--annotator contains unsupported characters")
const model = requireOption("model")
const modelID = frozenAnnotationModelID(model)
const preflightPath = path.resolve(requireOption("preflight"))
const keyFile = requireAbsolute("AUTODRIVE_GATEWAY_KEY_FILE")
const budgetLedger = requireAbsolute("AUTODRIVE_EVAL_BUDGET_LEDGER")
const maxCostUSD = requirePositive("AUTODRIVE_ANNOTATION_MAX_COST_USD")
const perCallCeilingUSD = requirePositive("AUTODRIVE_ANNOTATION_PER_CALL_CEILING_USD")
const fixedBoundaryCostUSD = requireNonnegative("AUTODRIVE_BOUNDARY_FIXED_COST_USD")
const gateway = (Bun.env.AUTODRIVE_GATEWAY_BASE_URL ?? "https://ai-api.d-robotics.cc/v1").replace(/\/+$/, "")
const candidatesContent = await Bun.file(path.resolve(candidatesPath)).text()
assertSecretFree(candidatesContent)
const candidates = candidatesContent
  .split("\n")
  .filter((line) => line.trim())
  .map((line) => BoundaryCandidate.parse(JSON.parse(line)))
if (!candidates.length || candidates.length > 480) fail("Candidate frame must contain 1-480 real boundaries")
if (new Set(candidates.map((candidate) => candidate.id)).size !== candidates.length) fail("Candidate IDs are not unique")
const preflight = await loadPreflight(preflightPath, { scope: "annotation" })
assertBoundaryResearchReservation(await readOptional(budgetLedger), maxCostUSD, fixedBoundaryCostUSD)
const resolved = preflight.receipt.models.find((item) => item.model === model)
if (!resolved || resolved.trajectoryCapacity < candidates.length) fail("Annotation preflight does not cover the selected model and frame")

const candidatesSHA256 = digest(candidatesContent)
const requestsRoot = path.join(output, "requests")
const responsesRoot = path.join(output, "responses")
const rawResponsesRoot = path.join(output, "raw-responses")
const recordsRoot = path.join(output, "records")
const failuresRoot = path.join(output, "failures")
const checkpointsPath = path.join(output, "spend-checkpoints.jsonl")
const receiptPath = path.join(output, "receipt.json")
await Promise.all([
  mkdir(requestsRoot, { recursive: true }),
  mkdir(responsesRoot, { recursive: true }),
  mkdir(rawResponsesRoot, { recursive: true }),
  mkdir(recordsRoot, { recursive: true }),
  mkdir(failuresRoot, { recursive: true }),
])
await Promise.all([
  chmod(output, 0o700),
  chmod(requestsRoot, 0o700),
  chmod(responsesRoot, 0o700),
  chmod(rawResponsesRoot, 0o700),
  chmod(recordsRoot, 0o700),
  chmod(failuresRoot, 0o700),
])
const key = (await Bun.file(keyFile).text()).trim()
if (!key) fail("Gateway key file is empty")

const campaign = await loadOrCreateReceipt()
const budgetAmendment = await loadBudgetAmendment(campaign)
const records = new Map(
  (
    await Promise.all(
      candidates.map(async (candidate) => {
        const file = Bun.file(path.join(recordsRoot, `${candidate.id}.json`))
        if (!(await file.exists())) return
        const record = AnnotationRecord.parse(await file.json())
        if (record.candidateID !== candidate.id || record.annotator !== annotator || record.model !== model)
          throw new Error(`Conflicting annotation record: ${candidate.id}`)
        await Promise.all([verify(record.request), verify(record.response)])
        return [candidate.id, record] as const
      }),
    )
  ).filter((item): item is NonNullable<typeof item> => !!item),
)
const terminalExclusions = new Map(
  (
    await Promise.all(
      candidates.map(async (candidate) => {
        const exclusion = await readTerminalExclusion(candidate.id)
        if (exclusion) return [candidate.id, exclusion] as const
        const failure = await readFailure(candidate.id, 1)
        if (
          isStoredOutputFailure(failure?.error) &&
          (await Bun.file(artifactPaths(candidate.id, 1).rawResponse).exists())
        )
          return [candidate.id, await writeTerminalOutputExclusion(candidate.id, 1)] as const
        return undefined
      }),
    )
  ).filter((item): item is NonNullable<typeof item> => !!item),
)
if (Array.from(terminalExclusions).some(([candidateID]) => records.has(candidateID)))
  throw new Error("Terminal annotation exclusion conflicts with an immutable record")
if (await resumeCompletedCampaign()) process.exit(0)

const pending = await Promise.all(
  candidates
    .filter((candidate) => !records.has(candidate.id) && !terminalExclusions.has(candidate.id))
    .map(async (candidate) => {
      const first = artifactPaths(candidate.id, 1)
      const second = artifactPaths(candidate.id, 2)
      if (await Bun.file(first.response).exists())
        throw new Error(`Annotation response exists without a record: ${candidate.id}`)
      if (!(await Bun.file(first.request).exists())) return { candidate, attempt: 1 as const }
      if (await Bun.file(second.request).exists()) throw new Error(`Annotation retry is already consumed: ${candidate.id}`)
      const failure = await readFailure(candidate.id, 1)
      if (failure && !canRetryStoredFailure(failure.error)) await verifyPreproviderRecovery(candidate.id)
      return { candidate, attempt: 2 as const }
    }),
)
const recovered = pending.filter((item) => item.attempt === 2)
if (recovered.length) {
  const settledSpendUSD = await readSettledSpend()
  await Promise.all(
    recovered.map((item) =>
      writeFailure(
        item.candidate.id,
        1,
        new Error("Recovered an orphaned request after process termination"),
        settledSpendUSD,
      ),
    ),
  )
}

const queue = [...pending]
while (queue.length) {
  const batch = queue.splice(0, concurrency)
  const before = await readSpendWithRetries()
  const spent = before - campaign.baselineSpendUSD
  if (spent < 0) throw new Error("Gateway cumulative spend moved backwards")
  if (maxCostUSD - spent < batch.length * perCallCeilingUSD)
    throw new Error("Annotation budget cannot reserve the next bounded batch")
  const completed = await Promise.allSettled(batch.map((item) => annotate(item.candidate, item.attempt)))
  const settled = await readSettledSpend()
  const failed = completed.flatMap((result, index) => {
    if (result.status === "fulfilled") {
      records.set(result.value.candidateID, result.value)
      return []
    }
    return [{ item: batch[index]!, error: result.reason }]
  })
  await Promise.all(failed.map((item) => writeFailure(item.item.candidate.id, item.item.attempt, item.error, settled)))
  const outputFailures = failed.filter((item) => item.error instanceof ModelAnnotationOutputError)
  await Promise.all(
    outputFailures.map(async (item) => {
      const exclusion = await writeTerminalOutputExclusion(item.item.candidate.id, item.item.attempt)
      terminalExclusions.set(item.item.candidate.id, exclusion)
    }),
  )
  const delta = settled - campaign.baselineSpendUSD
  const checkpoint = {
    timestamp: new Date().toISOString(),
    completed: records.size,
    settledSpendUSD: settled,
    observedSpendDeltaUSD: Number(delta.toFixed(7)),
  }
  const serialized = JSON.stringify(checkpoint)
  assertSecretFree(serialized)
  await appendFile(checkpointsPath, serialized + "\n", { encoding: "utf8", flag: "a", mode: 0o600 })
  if (delta > maxCostUSD) throw new Error("Annotation campaign exceeded its authorized cost ceiling")
  const terminal = failed.find(
    (item) =>
      !(item.error instanceof ModelAnnotationOutputError) &&
      (item.item.attempt === 2 || !canRetryModelAnnotation(item.error)),
  )
  if (terminal) throw terminal.error
  queue.push(
    ...failed
      .filter((item) => !(item.error instanceof ModelAnnotationOutputError))
      .map((item) => ({ candidate: item.item.candidate, attempt: 2 as const })),
  )
}

const csv = renderCurrentCSV()
const settledSpendUSD = await readSettledSpend()
if (settledSpendUSD < campaign.baselineSpendUSD) throw new Error("Gateway cumulative spend moved backwards")
const final = {
  ...campaign,
  budgetAmendment: budgetAmendment?.reference,
  authorizedMaxCostUSD: budgetAmendment?.receipt.maxCostUSD,
  completedAt: new Date().toISOString(),
  examples: records.size,
  screened: candidates.length,
  terminalExclusions: Array.from(terminalExclusions, ([candidateID, exclusion]) => ({
    candidateID,
    path: path.relative(output, exclusion.path),
    sha256: exclusion.sha256,
  })).sort((left, right) => left.candidateID.localeCompare(right.candidateID)),
  modelVersion: Array.from(
    new Set([
      ...Array.from(records.values()).map((record) => record.modelVersion),
      ...Array.from(terminalExclusions.values()).map((exclusion) => exclusion.receipt.provider.modelVersion),
    ]),
  ).sort(),
  promptTokens:
    Array.from(records.values()).reduce((sum, record) => sum + record.promptTokens, 0) +
    Array.from(terminalExclusions.values()).reduce((sum, exclusion) => sum + exclusion.receipt.provider.promptTokens, 0),
  completionTokens:
    Array.from(records.values()).reduce((sum, record) => sum + record.completionTokens, 0) +
    Array.from(terminalExclusions.values()).reduce(
      (sum, exclusion) => sum + exclusion.receipt.provider.completionTokens,
      0,
    ),
  settledSpendUSD,
  costUSD: Number((settledSpendUSD - campaign.baselineSpendUSD).toFixed(7)),
  labelsSHA256: digest(csv),
}
assertSecretFree(JSON.stringify(final))
await writeFile(path.join(output, "labels.csv"), csv, { encoding: "utf8", flag: "wx", mode: 0o600 })
await writeFile(path.join(output, "manifest.json"), JSON.stringify(final, null, 2) + "\n", {
  encoding: "utf8",
  flag: "wx",
  mode: 0o600,
})
await admitBoundaryResearchCost(budgetLedger, `annotation:${annotator}`, {
  amountUSD: final.costUSD,
  promptTokens: final.promptTokens,
  completionTokens: final.completionTokens,
}, undefined, fixedBoundaryCostUSD)
console.log(
  JSON.stringify({ output, annotator, model, screened: candidates.length, examples: records.size, costUSD: final.costUSD }),
)

async function resumeCompletedCampaign() {
  const file = Bun.file(path.join(output, "manifest.json"))
  if (!(await file.exists())) return false
  const content = await file.text()
  assertSecretFree(content)
  const manifest = CampaignManifest.parse(JSON.parse(content))
  const labels = Bun.file(path.join(output, "labels.csv"))
  const screened = manifest.screened ?? manifest.examples
  const exclusions = manifest.terminalExclusions ?? []
  if (
    screened !== candidates.length ||
    records.size !== manifest.examples ||
    records.size + exclusions.length !== candidates.length ||
    exclusions.length !== terminalExclusions.size ||
    !(await labels.exists())
  )
    throw new Error("Completed annotation manifest conflicts with immutable records")
  await Promise.all(
    exclusions.map(async (exclusion) => {
      const stored = terminalExclusions.get(exclusion.candidateID)
      if (!stored || path.relative(output, stored.path) !== exclusion.path || stored.sha256 !== exclusion.sha256)
        throw new Error("Completed annotation manifest conflicts with immutable records")
      await verify(exclusion)
    }),
  )
  const labelsContent = await labels.text()
  assertSecretFree(labelsContent)
  const expected = {
    examples: records.size,
    modelVersion: Array.from(
      new Set([
        ...Array.from(records.values()).map((record) => record.modelVersion),
        ...Array.from(terminalExclusions.values()).map((exclusion) => exclusion.receipt.provider.modelVersion),
      ]),
    ).sort(),
    promptTokens:
      Array.from(records.values()).reduce((sum, record) => sum + record.promptTokens, 0) +
      Array.from(terminalExclusions.values()).reduce(
        (sum, exclusion) => sum + exclusion.receipt.provider.promptTokens,
        0,
      ),
    completionTokens:
      Array.from(records.values()).reduce((sum, record) => sum + record.completionTokens, 0) +
      Array.from(terminalExclusions.values()).reduce(
        (sum, exclusion) => sum + exclusion.receipt.provider.completionTokens,
        0,
      ),
    labelsSHA256: digest(labelsContent),
  }
  if (
    manifest.annotator !== campaign.annotator ||
    manifest.model !== campaign.model ||
    manifest.candidatesSHA256 !== campaign.candidatesSHA256 ||
    manifest.preflightSHA256 !== campaign.preflightSHA256 ||
    manifest.startedAt !== campaign.startedAt ||
    manifest.baselineSpendUSD !== campaign.baselineSpendUSD ||
    manifest.maxCostUSD !== campaign.maxCostUSD ||
    manifest.perCallCeilingUSD !== campaign.perCallCeilingUSD ||
    JSON.stringify(manifest.budgetAmendment) !== JSON.stringify(budgetAmendment?.reference) ||
    manifest.authorizedMaxCostUSD !== budgetAmendment?.receipt.maxCostUSD ||
    manifest.examples !== expected.examples ||
    JSON.stringify(manifest.modelVersion) !== JSON.stringify(expected.modelVersion) ||
    manifest.promptTokens !== expected.promptTokens ||
    manifest.completionTokens !== expected.completionTokens ||
    manifest.labelsSHA256 !== expected.labelsSHA256 ||
    labelsContent !== renderCurrentCSV() ||
    manifest.costUSD !== Number((manifest.settledSpendUSD - manifest.baselineSpendUSD).toFixed(7))
  )
    throw new Error("Completed annotation manifest conflicts with immutable records")
  await admitBoundaryResearchCost(
    budgetLedger,
    `annotation:${annotator}`,
    {
      amountUSD: manifest.costUSD,
      promptTokens: manifest.promptTokens,
      completionTokens: manifest.completionTokens,
    },
    undefined,
    fixedBoundaryCostUSD,
  )
  console.log(JSON.stringify({ output, annotator, model, examples: manifest.examples, costUSD: manifest.costUSD }))
  return true
}

function renderCurrentCSV() {
  return (
    renderModelAnnotationCSV(
      annotator,
      candidates.filter((candidate) => records.has(candidate.id)).map((candidate) => {
        const record = records.get(candidate.id)
        if (!record) throw new Error(`Annotation record is missing after execution: ${candidate.id}`)
        return { candidate, annotation: record.annotation, recordedAt: record.recordedAt }
      }),
    ) + "\n"
  )
}

async function annotate(candidate: z.infer<typeof BoundaryCandidate>, attempt: 1 | 2) {
  const prompt = buildModelAnnotationPrompt(candidate)
  const request = buildModelAnnotationRequest(modelID, prompt)
  const requestContent = JSON.stringify(request)
  assertSecretFree(requestContent)
  const paths = artifactPaths(candidate.id, attempt)
  const requestPath = paths.request
  await writeFile(requestPath, requestContent, { encoding: "utf8", flag: "wx", mode: 0o600 })
  const startedAt = Date.now()
  const response = await fetch(`${gateway}/chat/completions`, {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: requestContent,
    signal: AbortSignal.timeout(requestTimeoutMS),
  })
  const raw = await response.text()
  if (!response.ok) throw new Error(`Annotation provider returned HTTP ${response.status}`)
  assertSecretFree(raw)
  const rawPath = artifactPaths(candidate.id, attempt).rawResponse
  await writeFile(rawPath, raw, { encoding: "utf8", flag: "wx", mode: 0o600 })
  const parsedOutput = (() => {
    try {
      const parsed = parseModelAnnotationResponse(JSON.parse(raw))
      return { parsed, annotation: parseModelAnnotation(parsed.content) }
    } catch (error) {
      throw new ModelAnnotationOutputError(error)
    }
  })()
  const parsed = parsedOutput.parsed
  const annotation = parsedOutput.annotation
  const responseContent = JSON.stringify(parsed)
  const responsePath = paths.response
  await writeFile(responsePath, responseContent, { encoding: "utf8", flag: "wx", mode: 0o600 })
  const record = AnnotationRecord.parse({
    schemaVersion: 1,
    protocol: protocol.version,
    candidateID: candidate.id,
    annotator,
    model,
    modelVersion: parsed.modelVersion,
    recordedAt: new Date().toISOString(),
    latencyMS: Date.now() - startedAt,
    promptTokens: parsed.promptTokens,
    completionTokens: parsed.completionTokens,
    request: relativeReference(requestPath, requestContent),
    response: relativeReference(responsePath, responseContent),
    annotation,
  })
  const content = JSON.stringify(record, null, 2) + "\n"
  assertSecretFree(content)
  await writeFile(path.join(recordsRoot, `${candidate.id}.json`), content, { encoding: "utf8", flag: "wx", mode: 0o600 })
  return record
}

async function writeFailure(
  candidateID: string,
  attempt: 1 | 2,
  error: unknown,
  settledSpendUSD: number,
) {
  const target = path.join(failuresRoot, modelAnnotationArtifactName(candidateID, attempt))
  const existing = Bun.file(target)
  if (await existing.exists()) {
    const content = await existing.text()
    assertSecretFree(content)
    const failure = AnnotationFailure.parse(JSON.parse(content))
    if (
      failure.candidateID !== candidateID ||
      failure.annotator !== annotator ||
      failure.model !== model ||
      failure.attempt !== attempt
    )
      throw new Error(`Conflicting annotation failure receipt: ${candidateID}`)
    await verify(failure.request)
    return
  }
  const requestPath = artifactPaths(candidateID, attempt).request
  const requestContent = await Bun.file(requestPath).text()
  const details =
    error instanceof Error
      ? { name: error.name, message: error.message }
      : { name: "UnknownError", message: String(error) }
  const failure = AnnotationFailure.parse({
    schemaVersion: 1,
    protocol: protocol.version,
    method: "bounded-model-annotation-recovery",
    candidateID,
    annotator,
    model,
    attempt,
    failedAt: new Date().toISOString(),
    settledSpendUSD,
    request: relativeReference(requestPath, requestContent),
    error: details,
  })
  const content = JSON.stringify(failure, null, 2) + "\n"
  assertSecretFree(content)
  await writeFile(target, content, { encoding: "utf8", flag: "wx", mode: 0o600 })
}

function artifactPaths(candidateID: string, attempt: 1 | 2) {
  const name = modelAnnotationArtifactName(candidateID, attempt)
  return {
    request: path.join(requestsRoot, name),
    response: path.join(responsesRoot, name),
    rawResponse: path.join(rawResponsesRoot, name),
  }
}

async function writeTerminalOutputExclusion(candidateID: string, attempt: 1 | 2) {
  const target = path.join(failuresRoot, `${candidateID}-terminal-output.json`)
  if (await Bun.file(target).exists()) return (await readTerminalExclusion(candidateID))!
  const paths = artifactPaths(candidateID, attempt)
  const [requestContent, failureContent, rawContent] = await Promise.all(
    [paths.request, path.join(failuresRoot, modelAnnotationArtifactName(candidateID, attempt)), paths.rawResponse].map(
      async (filePath) => {
        const content = await Bun.file(filePath).text()
        assertSecretFree(content)
        return content
      },
    ),
  )
  z.object({ max_tokens: z.number().int().positive() }).loose().parse(JSON.parse(requestContent))
  const response = z
    .object({
      model: z.string().min(1),
      usage: z.object({
        prompt_tokens: z.number().int().nonnegative(),
        completion_tokens: z.number().int().nonnegative(),
      }),
    })
    .loose()
    .parse(JSON.parse(rawContent))
  const receipt = TerminalOutputExclusion.parse({
    schemaVersion: 1,
    protocol: protocol.version,
    method: "terminal-model-annotation-output",
    candidateID,
    annotator,
    model,
    attempt,
    classification: "provider-success-invalid-final-annotation",
    request: relativeReference(paths.request, requestContent),
    failure: relativeReference(path.join(failuresRoot, modelAnnotationArtifactName(candidateID, attempt)), failureContent),
    rawResponse: relativeReference(paths.rawResponse, rawContent),
    provider: {
      modelVersion: response.model,
      promptTokens: response.usage.prompt_tokens,
      completionTokens: response.usage.completion_tokens,
    },
  })
  const content = JSON.stringify(receipt, null, 2) + "\n"
  assertSecretFree(content)
  await writeFile(target, content, { encoding: "utf8", flag: "wx", mode: 0o600 })
  return { path: target, sha256: digest(content), receipt }
}

async function readTerminalExclusion(candidateID: string) {
  const target = path.join(failuresRoot, `${candidateID}-terminal-output.json`)
  const file = Bun.file(target)
  if (!(await file.exists())) return
  const content = await file.text()
  assertSecretFree(content)
  const receipt = TerminalOutputExclusion.parse(JSON.parse(content))
  if (receipt.candidateID !== candidateID || receipt.annotator !== annotator || receipt.model !== model)
    throw new Error(`Conflicting terminal annotation exclusion: ${candidateID}`)
  await Promise.all(
    [receipt.request, receipt.failure, receipt.rawResponse]
      .filter((item): item is z.infer<typeof ArtifactReference> => !!item)
      .map(verify),
  )
  return { path: target, sha256: digest(content), receipt }
}

async function readFailure(candidateID: string, attempt: 1 | 2) {
  const file = Bun.file(path.join(failuresRoot, modelAnnotationArtifactName(candidateID, attempt)))
  if (!(await file.exists())) return
  const content = await file.text()
  assertSecretFree(content)
  const failure = AnnotationFailure.parse(JSON.parse(content))
  if (
    failure.candidateID !== candidateID ||
    failure.annotator !== annotator ||
    failure.model !== model ||
    failure.attempt !== attempt
  )
    throw new Error(`Conflicting annotation failure receipt: ${candidateID}`)
  await verify(failure.request)
  return failure
}

function canRetryStoredFailure(error: z.infer<typeof AnnotationFailure>["error"]) {
  return (
    error.name === "TimeoutError" ||
    error.name === "AbortError" ||
    error.name === "TypeError" ||
    error.message === "Recovered an orphaned request after process termination"
  )
}

function isStoredOutputFailure(error: z.infer<typeof AnnotationFailure>["error"] | undefined) {
  if (!error) return false
  if (error.name === "ModelAnnotationOutputError") return true
  return (
    error.name === "ReferenceError" &&
    error.message === "Cannot access 'ModelAnnotationOutputError' before initialization."
  )
}

async function verifyPreproviderRecovery(candidateID: string) {
  const file = Bun.file(path.join(failuresRoot, `${candidateID}-preprovider.json`))
  if (!(await file.exists())) throw new Error(`Annotation failure is not retryable: ${candidateID}`)
  const content = await file.text()
  assertSecretFree(content)
  const receipt = PreproviderRecovery.parse(JSON.parse(content))
  if (receipt.candidateID !== candidateID) throw new Error(`Conflicting pre-provider recovery receipt: ${candidateID}`)
  await Promise.all([verify(receipt.request), verify(receipt.failure)])
}

async function loadOrCreateReceipt() {
  const file = Bun.file(receiptPath)
  if (await file.exists()) {
    const receipt = CampaignReceipt.parse(await file.json())
    if (
      receipt.annotator !== annotator ||
      receipt.model !== model ||
      receipt.candidatesSHA256 !== candidatesSHA256 ||
      receipt.preflightSHA256 !== preflight.sha256 ||
      receipt.perCallCeilingUSD !== perCallCeilingUSD
    )
      throw new Error("Annotation campaign receipt conflicts with this invocation")
    return receipt
  }
  const receipt = CampaignReceipt.parse({
    schemaVersion: 1,
    protocol: protocol.version,
    method: "independent-model-annotation",
    annotator,
    model,
    candidatesSHA256,
    preflightSHA256: preflight.sha256,
    startedAt: new Date().toISOString(),
    baselineSpendUSD: await readSpendWithRetries(),
    maxCostUSD,
    perCallCeilingUSD,
  })
  const content = JSON.stringify(receipt, null, 2) + "\n"
  assertSecretFree(content)
  await writeFile(receiptPath, content, { encoding: "utf8", flag: "wx", mode: 0o600 })
  return receipt
}

async function loadBudgetAmendment(campaign: z.infer<typeof CampaignReceipt>) {
  if (campaign.maxCostUSD === maxCostUSD) return undefined
  const target = optionalAbsolute("AUTODRIVE_ANNOTATION_BUDGET_AMENDMENT")
  if (!target) throw new Error("Annotation campaign budget change requires an immutable amendment")
  const content = await Bun.file(target).text()
  assertSecretFree(content)
  const receipt = AnnotationBudgetAmendment.parse(JSON.parse(content))
  const originalReceipt = await Bun.file(receiptPath).text()
  if (
    receipt.annotator !== annotator ||
    receipt.model !== model ||
    receipt.candidatesSHA256 !== candidatesSHA256 ||
    receipt.preflightSHA256 !== preflight.sha256 ||
    receipt.receiptSHA256 !== digest(originalReceipt) ||
    receipt.previousMaxCostUSD !== campaign.maxCostUSD ||
    receipt.maxCostUSD !== maxCostUSD
  )
    throw new Error("Annotation budget amendment conflicts with the immutable campaign")
  return { receipt, reference: relativeReference(target, content) }
}

async function verify(reference: z.infer<typeof ArtifactReference>) {
  const file = Bun.file(path.join(output, reference.path))
  if (!(await file.exists())) throw new Error(`Annotation artifact is missing: ${reference.path}`)
  const content = await file.text()
  assertSecretFree(content)
  if (digest(content) !== reference.sha256) throw new Error(`Annotation artifact hash mismatch: ${reference.path}`)
}

async function readSpendWithRetries() {
  const failures: unknown[] = []
  for (let attempt = 0; attempt < 4; attempt++) {
    const result = await Promise.allSettled([
      fetch(new URL("/key/info", new URL(gateway).origin), {
        headers: { authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(15_000),
      }),
    ])
    if (result[0].status === "fulfilled" && result[0].value.ok) {
      const body = await result[0].value.json()
      const spend = Number(body.info?.spend)
      if (Number.isFinite(spend) && spend >= 0) return spend
    }
    failures.push(result[0])
    if (attempt < 3) await Bun.sleep(1_000)
  }
  throw new Error(`Gateway spend endpoint failed after ${failures.length} bounded attempts`)
}

async function readSettledSpend() {
  const values: number[] = []
  for (let index = 0; index < 4; index++) {
    values.push(await readSpendWithRetries())
    if (index < 3) await Bun.sleep(2_000)
  }
  return Math.max(...values)
}

function relativeReference(target: string, content: string) {
  const relative = path.relative(output, target)
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("Annotation artifact escapes output root")
  return { path: relative.split(path.sep).join("/"), sha256: digest(content) }
}

function digest(content: string) {
  return new Bun.CryptoHasher("sha256").update(content).digest("hex")
}

function requireOption(name: string) {
  const index = Bun.argv.indexOf(`--${name}`)
  const value = index < 0 ? undefined : Bun.argv[index + 1]
  if (!value) fail(`--${name} is required`)
  return value
}

function requireAbsolute(name: string) {
  const value = Bun.env[name]
  if (!value || !path.isAbsolute(value)) fail(`${name} must be an absolute path`)
  return value
}

function optionalAbsolute(name: string) {
  const value = Bun.env[name]
  if (!value) return undefined
  if (!path.isAbsolute(value)) fail(`${name} must be an absolute path`)
  return value
}

function requirePositive(name: string) {
  const value = Number(Bun.env[name])
  if (!Number.isFinite(value) || value <= 0) fail(`${name} must be positive`)
  return value
}

function requireNonnegative(name: string) {
  const value = Number(Bun.env[name])
  if (!Number.isFinite(value) || value < 0) fail(`${name} must be a nonnegative number`)
  return value
}

function fail(message: string): never {
  console.error(message)
  process.exit(1)
}

async function readOptional(filePath: string) {
  const file = Bun.file(filePath)
  return (await file.exists()) ? file.text() : ""
}
