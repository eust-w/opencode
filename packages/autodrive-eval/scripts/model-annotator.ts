#!/usr/bin/env bun

import { appendFile, chmod, mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { z } from "zod"
import { BoundaryCandidate } from "../src/annotation"
import { assertSecretFree } from "../src/artifact"
import { frozenWorkerModelID } from "../src/host-executor"
import {
  buildModelAnnotationPrompt,
  buildModelAnnotationRequest,
  parseModelAnnotation,
  parseModelAnnotationResponse,
  renderModelAnnotationCSV,
} from "../src/model-annotation"
import { loadPreflight } from "../src/preflight"
import { protocol } from "../src/protocol"
import { admitBoundaryResearchCost, assertBoundaryResearchReservation } from "../src/research-budget"

const concurrency = 2
const candidatesPath = requireOption("candidates")
const output = path.resolve(requireOption("output"))
const annotator = requireOption("annotator")
if (!/^[A-Za-z0-9._-]+$/.test(annotator)) fail("--annotator contains unsupported characters")
const model = requireOption("model")
const modelID = frozenWorkerModelID(model)
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
const recordsRoot = path.join(output, "records")
const checkpointsPath = path.join(output, "spend-checkpoints.jsonl")
const receiptPath = path.join(output, "receipt.json")
await Promise.all([
  mkdir(requestsRoot, { recursive: true }),
  mkdir(responsesRoot, { recursive: true }),
  mkdir(recordsRoot, { recursive: true }),
])
await Promise.all([chmod(output, 0o700), chmod(requestsRoot, 0o700), chmod(responsesRoot, 0o700), chmod(recordsRoot, 0o700)])
const key = (await Bun.file(keyFile).text()).trim()
if (!key) fail("Gateway key file is empty")

const campaign = await loadOrCreateReceipt()
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

const pending = candidates.filter((candidate) => !records.has(candidate.id))
for (let index = 0; index < pending.length; index += concurrency) {
  const batch = pending.slice(index, index + concurrency)
  const before = await readSpendWithRetries()
  const spent = before - campaign.baselineSpendUSD
  if (spent < 0) throw new Error("Gateway cumulative spend moved backwards")
  if (maxCostUSD - spent < batch.length * perCallCeilingUSD)
    throw new Error("Annotation budget cannot reserve the next bounded batch")
  const completed = await Promise.all(batch.map(annotate))
  completed.forEach((record) => records.set(record.candidateID, record))
  const settled = await readSettledSpend()
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
}

const ordered = candidates.map((candidate) => {
  const record = records.get(candidate.id)
  if (!record) throw new Error(`Annotation record is missing after execution: ${candidate.id}`)
  return { candidate, annotation: record.annotation, recordedAt: record.recordedAt }
})
const csv = renderModelAnnotationCSV(annotator, ordered) + "\n"
const settledSpendUSD = await readSettledSpend()
const final = {
  ...campaign,
  completedAt: new Date().toISOString(),
  examples: candidates.length,
  modelVersion: Array.from(new Set(Array.from(records.values()).map((record) => record.modelVersion))).sort(),
  promptTokens: Array.from(records.values()).reduce((sum, record) => sum + record.promptTokens, 0),
  completionTokens: Array.from(records.values()).reduce((sum, record) => sum + record.completionTokens, 0),
  settledSpendUSD,
  costUSD: Number((settledSpendUSD - campaign.baselineSpendUSD).toFixed(7)),
  labelsSHA256: digest(csv),
}
assertSecretFree(JSON.stringify(final))
await Promise.all([
  writeFile(path.join(output, "labels.csv"), csv, { encoding: "utf8", mode: 0o600 }),
  writeFile(path.join(output, "manifest.json"), JSON.stringify(final, null, 2) + "\n", {
    encoding: "utf8",
    mode: 0o600,
  }),
])
await admitBoundaryResearchCost(budgetLedger, `annotation:${annotator}`, {
  amountUSD: final.costUSD,
  promptTokens: final.promptTokens,
  completionTokens: final.completionTokens,
}, undefined, fixedBoundaryCostUSD)
console.log(JSON.stringify({ output, annotator, model, examples: candidates.length, costUSD: final.costUSD }))

async function annotate(candidate: z.infer<typeof BoundaryCandidate>) {
  const prompt = buildModelAnnotationPrompt(candidate)
  const request = buildModelAnnotationRequest(modelID, prompt)
  const requestContent = JSON.stringify(request)
  assertSecretFree(requestContent)
  const requestPath = path.join(requestsRoot, `${candidate.id}.json`)
  await writeFile(requestPath, requestContent, { encoding: "utf8", flag: "wx", mode: 0o600 })
  const startedAt = Date.now()
  const response = await fetch(`${gateway}/chat/completions`, {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: requestContent,
    signal: AbortSignal.timeout(60_000),
  })
  const raw = await response.text()
  if (!response.ok) throw new Error(`Annotation provider returned HTTP ${response.status}`)
  assertSecretFree(raw)
  const parsed = parseModelAnnotationResponse(JSON.parse(raw))
  const annotation = parseModelAnnotation(parsed.content)
  const responseContent = JSON.stringify(parsed)
  const responsePath = path.join(responsesRoot, `${candidate.id}.json`)
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

async function loadOrCreateReceipt() {
  const file = Bun.file(receiptPath)
  if (await file.exists()) {
    const receipt = CampaignReceipt.parse(await file.json())
    if (
      receipt.annotator !== annotator ||
      receipt.model !== model ||
      receipt.candidatesSHA256 !== candidatesSHA256 ||
      receipt.preflightSHA256 !== preflight.sha256 ||
      receipt.maxCostUSD !== maxCostUSD ||
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
