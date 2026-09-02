#!/usr/bin/env bun

import { stat, writeFile } from "node:fs/promises"
import path from "node:path"
import { z } from "zod"
import { assertSecretFree } from "../src/artifact"
import { protocol } from "../src/protocol"
import { admitBoundaryResearchCost } from "../src/research-budget"

const Reference = z.object({ path: z.string().min(1), sha256: z.string().regex(/^[a-f0-9]{64}$/) })
const Reconciliation = z.object({
  schemaVersion: z.literal(1),
  protocol: z.literal(protocol.version),
  method: z.literal("failed-research-preflight-spend-reconciliation"),
  scope: z.literal("annotation"),
  sourceReceipt: Reference,
  models: z.array(
    z.object({
      model: z.string().min(1),
      modelVersion: z.string().min(1),
      promptTokens: z.number().int().nonnegative(),
      completionTokens: z.number().int().nonnegative(),
      spendUSD: z.number().nonnegative(),
      startTime: z.iso.datetime(),
      endTime: z.iso.datetime(),
      requestIDHash: z.string().regex(/^[a-f0-9]{64}$/),
    }),
  ),
  promptTokens: z.number().int().nonnegative(),
  completionTokens: z.number().int().nonnegative(),
  costUSD: z.number().nonnegative(),
})
const receiptPath = path.resolve(requireOption("receipt"))
const ledger = path.resolve(requireOption("ledger"))
const keyFile = requireAbsolute("AUTODRIVE_GATEWAY_KEY_FILE")
const fixedBoundaryCostUSD = requireNonnegative("AUTODRIVE_BOUNDARY_FIXED_COST_USD")
const gateway = (Bun.env.AUTODRIVE_GATEWAY_BASE_URL ?? "https://ai-api.d-robotics.cc/v1").replace(/\/+$/, "")
const root = path.dirname(receiptPath)
const receiptContent = await Bun.file(receiptPath).text()
assertSecretFree(receiptContent)
const receipt = z
  .object({
    schemaVersion: z.literal(1),
    protocol: z.literal(protocol.version),
    scope: z.literal("annotation"),
    capturedAt: z.iso.datetime(),
    models: z
      .array(
        z.object({ model: z.string().min(1), catalogModelID: z.string().min(1), probe: Reference }).loose(),
      )
      .min(1),
  })
  .loose()
  .parse(JSON.parse(receiptContent))
const target = path.join(root, "failed-preflight-reconciliation.json")
const runID = `preflight:annotation-failed:${digest(receiptContent).slice(0, 16)}`
if (await Bun.file(target).exists()) {
  const existingContent = await Bun.file(target).text()
  assertSecretFree(existingContent)
  const existing = Reconciliation.parse(JSON.parse(existingContent))
  await admitBoundaryResearchCost(
    ledger,
    runID,
    {
      amountUSD: existing.costUSD,
      promptTokens: existing.promptTokens,
      completionTokens: existing.completionTokens,
    },
    undefined,
    fixedBoundaryCostUSD,
  )
  console.log(JSON.stringify({ output: target, runID, costUSD: existing.costUSD }))
  process.exit(0)
}
const probes = await Promise.all(
  receipt.models.map(async (model) => {
    const content = await verify(model.probe)
    const probe = z
      .object({
        modelVersion: z.string().min(1),
        promptTokens: z.number().int().nonnegative(),
        completionTokens: z.number().int().nonnegative(),
        raw: Reference,
      })
      .loose()
      .parse(JSON.parse(content))
    await verify(probe.raw)
    return { model, probe }
  }),
)
const key = (await Bun.file(keyFile).text()).trim()
if (!key) fail("Gateway key file is empty")
const response = await fetch(new URL("/spend/logs", new URL(gateway).origin), {
  headers: { authorization: `Bearer ${key}` },
  signal: AbortSignal.timeout(30_000),
})
if (!response.ok) throw new Error(`Gateway spend logs returned HTTP ${response.status}`)
const body = await response.json()
const rows = Array.isArray(body) ? body : z.object({ data: z.array(z.unknown()) }).parse(body).data
const SpendRow = z
  .object({
    request_id: z.string().min(1),
    model: z.string().min(1),
    prompt_tokens: z.number().int().nonnegative(),
    completion_tokens: z.number().int().nonnegative(),
    spend: z.number().nonnegative(),
    startTime: z.iso.datetime(),
    endTime: z.iso.datetime(),
    status: z.literal("success"),
  })
  .loose()
const parsedRows = rows.flatMap((row) => {
  const parsed = SpendRow.safeParse(row)
  return parsed.success ? [parsed.data] : []
})
const endedBefore = (await stat(receiptPath)).mtimeMs + 60_000
const matched = probes.map((item) => {
  const matches = parsedRows.filter(
    (row) =>
      row.model.toLowerCase().includes(item.model.catalogModelID.toLowerCase()) &&
      row.prompt_tokens === item.probe.promptTokens &&
      row.completion_tokens === item.probe.completionTokens &&
      Date.parse(row.startTime) >= Date.parse(receipt.capturedAt) &&
      Date.parse(row.endTime) <= endedBefore,
  )
  if (matches.length !== 1) throw new Error(`Expected one exact preflight spend row for ${item.model.model}`)
  const match = matches[0]!
  return {
    model: item.model.model,
    modelVersion: item.probe.modelVersion,
    promptTokens: match.prompt_tokens,
    completionTokens: match.completion_tokens,
    spendUSD: match.spend,
    startTime: match.startTime,
    endTime: match.endTime,
    requestIDHash: digest(match.request_id),
  }
})
const reconciliation = Reconciliation.parse({
  schemaVersion: 1,
  protocol: protocol.version,
  method: "failed-research-preflight-spend-reconciliation",
  scope: "annotation",
  sourceReceipt: { path: path.basename(receiptPath), sha256: digest(receiptContent) },
  models: matched,
  promptTokens: matched.reduce((sum, row) => sum + row.promptTokens, 0),
  completionTokens: matched.reduce((sum, row) => sum + row.completionTokens, 0),
  costUSD: Number(matched.reduce((sum, row) => sum + row.spendUSD, 0).toFixed(7)),
})
const content = JSON.stringify(reconciliation, null, 2) + "\n"
assertSecretFree(content)
await writeFile(target, content, { encoding: "utf8", flag: "wx", mode: 0o600 })
await admitBoundaryResearchCost(
  ledger,
  runID,
  {
    amountUSD: reconciliation.costUSD,
    promptTokens: reconciliation.promptTokens,
    completionTokens: reconciliation.completionTokens,
  },
  undefined,
  fixedBoundaryCostUSD,
)
console.log(JSON.stringify({ output: target, runID, costUSD: reconciliation.costUSD }))

async function verify(reference: z.infer<typeof Reference>) {
  const resolved = path.resolve(root, reference.path)
  if (!resolved.startsWith(`${root}${path.sep}`)) throw new Error("Preflight artifact path escapes root")
  const content = await Bun.file(resolved).text()
  assertSecretFree(content)
  if (digest(content) !== reference.sha256) throw new Error(`Preflight artifact hash mismatch: ${reference.path}`)
  return content
}

function digest(content: string) {
  return new Bun.CryptoHasher("sha256").update(content).digest("hex")
}

function option(name: string) {
  const index = Bun.argv.indexOf(`--${name}`)
  return index === -1 ? undefined : Bun.argv[index + 1]
}

function requireOption(name: string) {
  const value = option(name)
  if (!value) fail(`--${name} VALUE is required`)
  return value
}

function requireAbsolute(name: string) {
  const value = Bun.env[name]
  if (!value || !path.isAbsolute(value)) fail(`${name} must be an absolute path`)
  return value
}

function requireNonnegative(name: string) {
  const value = Number(Bun.env[name])
  if (!Number.isFinite(value) || value < 0) fail(`${name} must be nonnegative`)
  return value
}

function fail(message: string): never {
  console.error(message)
  process.exit(1)
}
