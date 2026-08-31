#!/usr/bin/env bun

import { stat } from "node:fs/promises"
import path from "node:path"
import { z } from "zod"
import manifestInput from "../../../research/auto-drive/protocol/swe-evo-48.json"
import { caps } from "../src/budget"
import { reconcileExecutorDeadlineFailure, settleBoundaryExclusion } from "../src/exclusion"
import { createBoundaryRunPlan, parseManifest } from "../src/protocol"

if (!flag("execute")) fail("Executor deadline reconciliation is disabled without --execute")
const artifactRoot = requireAbsolute("artifact-root")
const keyFile = requireAbsolute("key-file")
const runID = requireOption("run-id")
const endedAt = z.iso.datetime().parse(requireOption("ended-at"))
const upstream = option("upstream") ?? "https://ai-api.d-robotics.cc"
const run = createBoundaryRunPlan(parseManifest(manifestInput)).find((candidate) => candidate.id === runID)
if (!run) fail("--run-id is outside the frozen boundary plan")
if ((await stat(keyFile)).mode & 0o077) fail("Gateway key file must not be accessible by group or other users")

const receiptPath = await reconcileExecutorDeadlineFailure({
  artifactRoot,
  run,
  endedAt,
  spendLogs: await readSpendLogs(),
  maxCostUSD: caps.boundary / 96,
})
const exclusion = await settleBoundaryExclusion({
  artifactRoot,
  ledgerPath: path.join(artifactRoot, "boundary", "ledger.jsonl"),
  receiptPath,
  run,
  maxCostUSD: caps.boundary / 96,
})
console.log(
  JSON.stringify({
    status: exclusion.classification,
    runID: exclusion.runID,
    requests: exclusion.requests,
    promptTokens: exclusion.promptTokens,
    completionTokens: exclusion.completionTokens,
    costUSD: exclusion.costUSD,
    receipt: path.relative(artifactRoot, receiptPath),
  }),
)

async function readSpendLogs() {
  const key = (await Bun.file(keyFile).text()).trim()
  if (!key) fail("Gateway key file is empty")
  const raw = await Bun.file(path.join(artifactRoot, "raw", `${run.id}.jsonl`)).text()
  const startedAt = z
    .object({ timestamp: z.iso.datetime(), type: z.literal("executor-started") })
    .loose()
    .parse(
      raw
        .split("\n")
        .filter((line) => line.trim())
        .map((line) => JSON.parse(line))
        .find((event) => event.type === "executor-started"),
    ).timestamp
  const end = new Date(endedAt)
  end.setUTCDate(end.getUTCDate() + 1)
  const url = new URL("/spend/logs", upstream)
  url.searchParams.set("start_date", startedAt.slice(0, 10))
  url.searchParams.set("end_date", end.toISOString().slice(0, 10))
  url.searchParams.set("summarize", "false")
  const response = await fetch(url, {
    headers: { authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(30_000),
  })
  if (!response.ok) fail(`Gateway spend logs endpoint failed with HTTP ${response.status}`)
  const body = await response.json()
  const rows = Array.isArray(body) ? body : z.object({ data: z.array(z.unknown()) }).parse(body).data
  return z
    .array(
      z
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
        .loose(),
    )
    .parse(rows)
    .map((row) => ({
      request_id: row.request_id,
      model: row.model,
      prompt_tokens: row.prompt_tokens,
      completion_tokens: row.completion_tokens,
      spend: row.spend,
      startTime: row.startTime,
      endTime: row.endTime,
      status: row.status,
    }))
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
  const value = requireOption(name)
  if (!path.isAbsolute(value)) fail(`--${name} must be absolute`)
  return value
}

function flag(name: string) {
  return Bun.argv.includes(`--${name}`)
}

function fail(message: string): never {
  console.error(message)
  process.exit(1)
}
