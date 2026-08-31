#!/usr/bin/env bun

import { appendFile, chmod, mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { z } from "zod"
import {
  AblationVariant,
  buildAblationPrompt,
  buildAblationRequest,
  createAblationPrediction,
  parseAblationResponse,
} from "../src/ablation"
import { BoundaryCandidate } from "../src/annotation"
import { assertSecretFree } from "../src/artifact"
import { loadPreflight } from "../src/preflight"
import { protocol } from "../src/protocol"
import { admitBoundaryResearchCost, assertBoundaryResearchReservation } from "../src/research-budget"

const concurrency = 2
const testPath = path.resolve(requireOption("test"))
const output = path.resolve(requireOption("output"))
const preflightPath = path.resolve(requireOption("preflight"))
const keyFile = requireAbsolute("AUTODRIVE_GATEWAY_KEY_FILE")
const budgetLedger = requireAbsolute("AUTODRIVE_EVAL_BUDGET_LEDGER")
const maxCostUSD = requirePositive("AUTODRIVE_ABLATION_MAX_COST_USD")
const perCallCeilingUSD = requirePositive("AUTODRIVE_ABLATION_PER_CALL_CEILING_USD")
const fixedBoundaryCostUSD = requireNonnegative("AUTODRIVE_BOUNDARY_FIXED_COST_USD")
const gateway = (Bun.env.AUTODRIVE_GATEWAY_BASE_URL ?? "https://ai-api.d-robotics.cc/v1").replace(/\/+$/, "")
const testContent = await Bun.file(testPath).text()
assertSecretFree(testContent)
const candidates = testContent
  .split("\n")
  .filter((line) => line.trim())
  .map((line) => BoundaryCandidate.parse(JSON.parse(line)))
if (candidates.length !== 126) fail("Frozen ablation test must contain exactly 126 boundaries")
if (new Set(candidates.map((candidate) => candidate.id)).size !== candidates.length) fail("Boundary IDs are not unique")
const preflight = await loadPreflight(preflightPath, { scope: "ablation" })
assertBoundaryResearchReservation(await readOptional(budgetLedger), maxCostUSD, fixedBoundaryCostUSD)
const controller = preflight.receipt.models.find((item) => item.model === protocol.models.controller)
if (!controller || controller.trajectoryCapacity < candidates.length * 4)
  fail("Ablation preflight does not cover all 504 controller calls")
const modelID = protocol.models.controller.slice(protocol.models.controller.indexOf("/") + 1)
const testSHA256 = digest(testContent)
const requestsRoot = path.join(output, "requests")
const responsesRoot = path.join(output, "responses")
const recordsRoot = path.join(output, "records")
const receiptPath = path.join(output, "receipt.json")
const checkpointsPath = path.join(output, "spend-checkpoints.jsonl")
await Promise.all([mkdir(requestsRoot, { recursive: true }), mkdir(responsesRoot, { recursive: true }), mkdir(recordsRoot, { recursive: true })])
await Promise.all([output, requestsRoot, responsesRoot, recordsRoot].map((directory) => chmod(directory, 0o700)))
const key = (await Bun.file(keyFile).text()).trim()
if (!key) fail("Gateway key file is empty")
const campaign = await loadOrCreateReceipt()
const records = new Map(
  (
    await Promise.all(
      candidates.flatMap((candidate) =>
        AblationVariant.options.map(async (variant) => {
          const id = `${candidate.id}.${variant}`
          const file = Bun.file(path.join(recordsRoot, `${id}.json`))
          if (!(await file.exists())) return
          const record = Record.parse(await file.json())
          if (record.boundaryID !== candidate.id || record.variant !== variant) throw new Error(`Conflicting ablation record: ${id}`)
          if (variant !== "regex") await Promise.all([verify(record.request!), verify(record.response!)])
          return [id, record] as const
        }),
      ),
    )
  ).filter((item): item is NonNullable<typeof item> => !!item),
)

for (const candidate of candidates) {
  const id = `${candidate.id}.regex`
  if (records.has(id)) continue
  const record = Record.parse({
    schemaVersion: 1,
    protocol: protocol.version,
    boundaryID: candidate.id,
    variant: "regex",
    prediction: createAblationPrediction(candidate, "regex").label,
    recordedAt: new Date().toISOString(),
    model: "production-regex",
    modelVersion: protocol.commit,
    promptTokens: 0,
    completionTokens: 0,
  })
  await persist(id, record)
  records.set(id, record)
}

const pending = candidates.flatMap((candidate) =>
  (["supervisor-only", "goal", "summary", "memory"] as const)
    .filter((variant) => !records.has(`${candidate.id}.${variant}`))
    .map((variant) => ({ candidate, variant })),
)
for (let index = 0; index < pending.length; index += concurrency) {
  const batch = pending.slice(index, index + concurrency)
  const before = await readSpendWithRetries()
  const spent = before - campaign.baselineSpendUSD
  if (spent < 0) throw new Error("Gateway cumulative spend moved backwards")
  if (maxCostUSD - spent < batch.length * perCallCeilingUSD)
    throw new Error("Ablation budget cannot reserve the next bounded batch")
  const completed = await Promise.all(batch.map(runModelVariant))
  completed.forEach(({ id, record }) => records.set(id, record))
  const settled = await readSettledSpend()
  const delta = settled - campaign.baselineSpendUSD
  await append(checkpointsPath, {
    timestamp: new Date().toISOString(),
    completed: records.size,
    settledSpendUSD: settled,
    observedSpendDeltaUSD: Number(delta.toFixed(7)),
  })
  if (delta > maxCostUSD) throw new Error("Ablation campaign exceeded its authorized cost ceiling")
}

const predictions = AblationVariant.options.flatMap((variant) =>
  candidates.map((candidate) => {
    const record = records.get(`${candidate.id}.${variant}`)
    if (!record) throw new Error(`Ablation record is missing: ${candidate.id}.${variant}`)
    return { boundaryID: candidate.id, variant, label: record.prediction }
  }),
)
const serialized = predictions.map((prediction) => JSON.stringify(prediction)).join("\n") + "\n"
const settledSpendUSD = await readSettledSpend()
const manifest = {
  ...campaign,
  completedAt: new Date().toISOString(),
  predictions: predictions.length,
  controllerCalls: predictions.length - candidates.length,
  promptTokens: Array.from(records.values()).reduce((sum, record) => sum + record.promptTokens, 0),
  completionTokens: Array.from(records.values()).reduce((sum, record) => sum + record.completionTokens, 0),
  settledSpendUSD,
  costUSD: Number((settledSpendUSD - campaign.baselineSpendUSD).toFixed(7)),
  predictionsSHA256: digest(serialized),
}
await Promise.all([
  writeFile(path.join(output, "predictions.jsonl"), serialized, { encoding: "utf8", mode: 0o600 }),
  writeFile(path.join(output, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n", { encoding: "utf8", mode: 0o600 }),
])
await admitBoundaryResearchCost(budgetLedger, "boundary-ablation:r1", {
  amountUSD: manifest.costUSD,
  promptTokens: manifest.promptTokens,
  completionTokens: manifest.completionTokens,
}, undefined, fixedBoundaryCostUSD)
console.log(JSON.stringify({ output, predictions: predictions.length, costUSD: manifest.costUSD }))

async function runModelVariant(item: { candidate: z.infer<typeof BoundaryCandidate>; variant: Exclude<z.infer<typeof AblationVariant>, "regex"> }) {
  const id = `${item.candidate.id}.${item.variant}`
  const prompt = buildAblationPrompt(item.candidate, item.variant)
  const requestContent = JSON.stringify(buildAblationRequest(modelID, prompt))
  assertSecretFree(requestContent)
  const requestPath = path.join(requestsRoot, `${id}.json`)
  await writeFile(requestPath, requestContent, { encoding: "utf8", flag: "wx", mode: 0o600 })
  const response = await fetch(`${gateway}/chat/completions`, {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: requestContent,
    signal: AbortSignal.timeout(60_000),
  })
  const raw = await response.text()
  if (!response.ok) throw new Error(`Ablation provider returned HTTP ${response.status}`)
  assertSecretFree(raw)
  const parsed = parseAblationResponse(item.candidate, item.variant, JSON.parse(raw))
  const responseContent = JSON.stringify(JSON.parse(raw))
  const responsePath = path.join(responsesRoot, `${id}.json`)
  await writeFile(responsePath, responseContent, { encoding: "utf8", flag: "wx", mode: 0o600 })
  const record = Record.parse({
    schemaVersion: 1,
    protocol: protocol.version,
    boundaryID: item.candidate.id,
    variant: item.variant,
    prediction: parsed.prediction.label,
    recordedAt: new Date().toISOString(),
    model: protocol.models.controller,
    modelVersion: parsed.modelVersion,
    promptTokens: parsed.promptTokens,
    completionTokens: parsed.completionTokens,
    request: reference(requestPath, requestContent),
    response: reference(responsePath, responseContent),
  })
  await persist(id, record)
  return { id, record }
}

async function persist(id: string, record: z.infer<typeof Record>) {
  const content = JSON.stringify(record, null, 2) + "\n"
  assertSecretFree(content)
  await writeFile(path.join(recordsRoot, `${id}.json`), content, { encoding: "utf8", flag: "wx", mode: 0o600 })
}

async function loadOrCreateReceipt() {
  const file = Bun.file(receiptPath)
  if (await file.exists()) {
    const receipt = Receipt.parse(await file.json())
    if (receipt.testSHA256 !== testSHA256 || receipt.preflightSHA256 !== preflight.sha256 || receipt.maxCostUSD !== maxCostUSD || receipt.perCallCeilingUSD !== perCallCeilingUSD)
      throw new Error("Ablation campaign receipt conflicts with this invocation")
    return receipt
  }
  const receipt = Receipt.parse({
    schemaVersion: 1,
    protocol: protocol.version,
    method: "frozen-boundary-component-ablation",
    testSHA256,
    preflightSHA256: preflight.sha256,
    startedAt: new Date().toISOString(),
    baselineSpendUSD: await readSpendWithRetries(),
    maxCostUSD,
    perCallCeilingUSD,
  })
  await writeFile(receiptPath, JSON.stringify(receipt, null, 2) + "\n", { encoding: "utf8", flag: "wx", mode: 0o600 })
  return receipt
}

async function verify(item: z.infer<typeof Reference>) {
  const file = Bun.file(path.join(output, item.path))
  if (!(await file.exists())) throw new Error(`Ablation artifact is missing: ${item.path}`)
  const content = await file.text()
  assertSecretFree(content)
  if (digest(content) !== item.sha256) throw new Error(`Ablation artifact hash mismatch: ${item.path}`)
}

async function readSpendWithRetries() {
  for (let attempt = 0; attempt < 4; attempt++) {
    const response = await fetch(new URL("/key/info", new URL(gateway).origin), {
      headers: { authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(15_000),
    }).catch(() => undefined)
    if (response?.ok) {
      const spend = Number((await response.json()).info?.spend)
      if (Number.isFinite(spend) && spend >= 0) return spend
    }
    if (attempt < 3) await Bun.sleep(1_000)
  }
  throw new Error("Gateway spend endpoint failed after bounded retries")
}

async function readSettledSpend() {
  const values: number[] = []
  for (let index = 0; index < 4; index++) {
    values.push(await readSpendWithRetries())
    if (index < 3) await Bun.sleep(2_000)
  }
  return Math.max(...values)
}

async function append(file: string, input: unknown) {
  const content = JSON.stringify(input)
  assertSecretFree(content)
  await appendFile(file, content + "\n", { encoding: "utf8", flag: "a", mode: 0o600 })
}

function reference(file: string, content: string) {
  return Reference.parse({ path: path.relative(output, file), sha256: digest(content) })
}

function digest(content: string) {
  return new Bun.CryptoHasher("sha256").update(content).digest("hex")
}

function requireOption(name: string) {
  const flag = `--${name}`
  const index = Bun.argv.indexOf(flag)
  const value = index < 0 ? undefined : Bun.argv[index + 1]
  if (!value || value.startsWith("--")) fail(`${flag} is required`)
  return value
}

function requireAbsolute(name: string) {
  const value = Bun.env[name]
  if (!value || !path.isAbsolute(value)) fail(`${name} must be an absolute file path`)
  return value
}

function requirePositive(name: string) {
  const value = Number(Bun.env[name])
  if (!Number.isFinite(value) || value <= 0) fail(`${name} must be a positive number`)
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

const Reference = z.object({ path: z.string().min(1), sha256: z.string().regex(/^[a-f0-9]{64}$/) })
const Record = z.object({
  schemaVersion: z.literal(1),
  protocol: z.literal(protocol.version),
  boundaryID: z.string().min(1),
  variant: AblationVariant,
  prediction: z.enum(["continue", "stop", "defer"]),
  recordedAt: z.iso.datetime(),
  model: z.string().min(1),
  modelVersion: z.string().min(1),
  promptTokens: z.number().int().nonnegative(),
  completionTokens: z.number().int().nonnegative(),
  request: Reference.optional(),
  response: Reference.optional(),
}).superRefine((record, context) => {
  if (record.variant === "regex" && (record.request || record.response))
    context.addIssue({ code: "custom", message: "Regex ablation cannot reference provider artifacts" })
  if (record.variant !== "regex" && (!record.request || !record.response))
    context.addIssue({ code: "custom", message: "Model ablation requires request and response artifacts" })
})
const Receipt = z.object({
  schemaVersion: z.literal(1),
  protocol: z.literal(protocol.version),
  method: z.literal("frozen-boundary-component-ablation"),
  testSHA256: z.string().regex(/^[a-f0-9]{64}$/),
  preflightSHA256: z.string().regex(/^[a-f0-9]{64}$/),
  startedAt: z.iso.datetime(),
  baselineSpendUSD: z.number().nonnegative(),
  maxCostUSD: z.number().positive(),
  perCallCeilingUSD: z.number().positive(),
})
