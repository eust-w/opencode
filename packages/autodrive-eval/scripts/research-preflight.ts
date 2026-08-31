#!/usr/bin/env bun

import { chmod, mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { assertSecretFree } from "../src/artifact"
import { loadPreflight, PreflightScope } from "../src/preflight"
import {
  buildResearchProbeRequest,
  parseResearchProbeResponse,
  researchPreflightPlan,
  type ResearchPreflightScope,
} from "../src/research-preflight"
import { admitBoundaryResearchCost, assertBoundaryResearchReservation } from "../src/research-budget"
import { protocol } from "../src/protocol"

const parsedScope = PreflightScope.safeParse(requireOption("scope"))
if (!parsedScope.success || parsedScope.data === "canary" || parsedScope.data === "boundary")
  fail("--scope must be boundary-augmentation, annotation, ablation, or full")
const scope: ResearchPreflightScope = parsedScope.data
const output = path.resolve(requireOption("output"))
const metadataSource = path.resolve(requireOption("metadata"))
const keyFile = requireAbsolute("AUTODRIVE_GATEWAY_KEY_FILE")
const budgetLedger = requireAbsolute("AUTODRIVE_EVAL_BUDGET_LEDGER")
const maxCostUSD = requirePositive("AUTODRIVE_PREFLIGHT_MAX_COST_USD")
const fixedBoundaryCostUSD = requireNonnegative("AUTODRIVE_BOUNDARY_FIXED_COST_USD")
const gateway = (Bun.env.AUTODRIVE_GATEWAY_BASE_URL ?? "https://ai-api.d-robotics.cc/v1").replace(/\/+$/, "")
const metadata = await Bun.file(metadataSource).text()
assertSecretFree(metadata)
const metadataJSON = JSON.parse(metadata) as Record<string, { models?: Record<string, unknown> }>
const plan = researchPreflightPlan(scope)
plan.forEach((item) => {
  const modelID = item.model.slice(item.model.indexOf("/") + 1)
  if (!metadataJSON[protocol.gateway.logicalProvider]?.models?.[modelID])
    fail(`Model metadata is missing ${item.model}`)
})
assertBoundaryResearchReservation(await readOptional(budgetLedger), maxCostUSD, fixedBoundaryCostUSD)
const key = (await Bun.file(keyFile).text()).trim()
if (!key) fail("Gateway key file is empty")
const rawRoot = path.join(output, "raw")
const probesRoot = path.join(output, "probes")
const metadataRoot = path.join(output, "metadata")
await Promise.all([mkdir(rawRoot, { recursive: true }), mkdir(probesRoot, { recursive: true }), mkdir(metadataRoot, { recursive: true })])
await Promise.all([output, rawRoot, probesRoot, metadataRoot].map((directory) => chmod(directory, 0o700)))
const capturedAt = new Date()
const spendBeforeUSD = await readSpendWithRetries()
const results = []
for (const item of plan) {
  const modelID = item.model.slice(item.model.indexOf("/") + 1)
  const request = buildResearchProbeRequest(item.model, item.transport)
  const requestContent = JSON.stringify(request)
  assertSecretFree(requestContent)
  const endpoint = item.transport === "chat" ? "chat/completions" : "responses"
  const response = await fetch(`${gateway}/${endpoint}`, {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: requestContent,
    signal: AbortSignal.timeout(90_000),
  })
  const raw = await response.text()
  if (!response.ok) throw new Error(`${item.model} ${item.transport} probe returned HTTP ${response.status}`)
  assertSecretFree(raw)
  const parsed = parseResearchProbeResponse(item.transport, JSON.parse(raw))
  const rawPath = path.join(rawRoot, `${modelID}.json`)
  await writeFile(rawPath, raw, { encoding: "utf8", flag: "wx", mode: 0o600 })
  results.push({ ...item, modelID, parsed, raw: reference(rawPath, raw), requestSHA256: digest(requestContent) })
}
const spendAfterUSD = await readSettledSpend()
const costUSD = Number((spendAfterUSD - spendBeforeUSD).toFixed(7))
if (costUSD < 0) throw new Error("Gateway cumulative spend moved backwards")
const models = await Promise.all(
  results.map(async (result) => {
    const probe = {
      schemaVersion: 1,
      provider: protocol.gateway.requestProvider,
      billing: "sponsored" as const,
      modelVersion: result.parsed.modelVersion,
      trajectoryCapacity: result.capacity,
      capacityBasis: `user-authorized ${scope} execution; concurrency 2; shared USD 102 boundary cap`,
      transport: result.transport,
      requestSHA256: result.requestSHA256,
      raw: result.raw,
      promptTokens: result.parsed.promptTokens,
      completionTokens: result.parsed.completionTokens,
      spendBeforeUSD,
      spendAfterUSD,
    }
    const content = JSON.stringify(probe, null, 2) + "\n"
    assertSecretFree(content)
    const file = path.join(probesRoot, `${result.modelID}.json`)
    await writeFile(file, content, { encoding: "utf8", flag: "wx", mode: 0o600 })
    return {
      model: result.model,
      catalogModelID: result.modelID,
      modelVersion: result.parsed.modelVersion,
      credentialPresent: true as const,
      billing: "sponsored" as const,
      trajectoryCapacity: result.capacity,
      probe: reference(file, content),
    }
  }),
)
const metadataPath = path.join(metadataRoot, "models.json")
await writeFile(metadataPath, metadata, { encoding: "utf8", flag: "wx", mode: 0o600 })
const receipt = {
  schemaVersion: 1 as const,
  protocol: protocol.version,
  scope,
  capturedAt: capturedAt.toISOString(),
  expiresAt: new Date(capturedAt.getTime() + 48 * 60 * 60 * 1000).toISOString(),
  models,
  modelMetadata: reference(metadataPath, metadata),
  runtime: {
    disableExternalSkills: true as const,
    disableClaudeCodeSkills: true as const,
    disableModelsFetch: true as const,
  },
}
const receiptContent = JSON.stringify(receipt, null, 2) + "\n"
assertSecretFree(receiptContent)
const receiptPath = path.join(output, "receipt.json")
await writeFile(receiptPath, receiptContent, { encoding: "utf8", flag: "wx", mode: 0o600 })
await loadPreflight(receiptPath, { scope })
await admitBoundaryResearchCost(
  budgetLedger,
  `preflight:${scope}:${digest(receiptContent).slice(0, 16)}`,
  {
    amountUSD: costUSD,
    promptTokens: results.reduce((sum, result) => sum + result.parsed.promptTokens, 0),
    completionTokens: results.reduce((sum, result) => sum + result.parsed.completionTokens, 0),
  },
  undefined,
  fixedBoundaryCostUSD,
)
if (costUSD > maxCostUSD) throw new Error(`Research preflight cost $${costUSD} exceeded $${maxCostUSD}`)
console.log(JSON.stringify({ output, scope, models: models.length, costUSD, receiptSHA256: digest(receiptContent) }))

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

async function readOptional(filePath: string) {
  const file = Bun.file(filePath)
  return (await file.exists()) ? file.text() : ""
}

function reference(file: string, content: string) {
  return { path: path.relative(output, file), sha256: digest(content) }
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
