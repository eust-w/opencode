#!/usr/bin/env bun

import { stat } from "node:fs/promises"
import path from "node:path"
import { z } from "zod"
import manifestInput from "../../../research/auto-drive/protocol/swe-evo-48.json"
import { caps } from "../src/budget"
import { reconcileBoundaryBudgetOverrunFailure, settleBoundaryExclusion } from "../src/exclusion"
import { createBoundaryRunPlan, parseManifest } from "../src/protocol"

if (!flag("execute")) fail("Boundary budget reconciliation is disabled without --execute")
const artifactRoot = requireAbsolute("artifact-root")
const keyFile = requireAbsolute("key-file")
const runID = requireOption("run-id")
const upstream = option("upstream") ?? "https://ai-api.d-robotics.cc"
const run = createBoundaryRunPlan(parseManifest(manifestInput)).find((candidate) => candidate.id === runID)
if (!run) fail("--run-id is outside the frozen boundary plan")
if ((await stat(keyFile)).mode & 0o077) fail("Gateway key file must not be accessible by group or other users")

const receiptPath = await reconcileBoundaryBudgetOverrunFailure({
  artifactRoot,
  run,
  originalReceiptPath: path.join(artifactRoot, "failures", run.id, "attempt-1.json"),
  maxCostUSD: caps.boundary / 96,
  spendSamples: await readStableSpendSamples(),
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
    status: "excluded-charged-budget-overrun",
    runID: exclusion.runID,
    attempt: exclusion.attempt,
    requests: exclusion.requests,
    costUSD: exclusion.costUSD,
    receipt: path.relative(artifactRoot, receiptPath),
  }),
)

async function readStableSpendSamples() {
  const key = (await Bun.file(keyFile).text()).trim()
  if (!key) fail("Gateway key file is empty")
  const samples: number[] = []
  for (let index = 0; index < 4; index++) {
    const response = await fetch(new URL("/key/info", upstream), {
      headers: { authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(15_000),
    })
    if (!response.ok) fail("Gateway spend endpoint failed")
    const body = z.object({ info: z.object({ spend: z.number().nonnegative() }) }).parse(await response.json())
    const spend = body.info.spend
    if (!Number.isFinite(spend) || spend < 0) fail("Gateway spend is unavailable")
    samples.push(spend)
    if (index < 3) await Bun.sleep(2_000)
  }
  return samples
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
