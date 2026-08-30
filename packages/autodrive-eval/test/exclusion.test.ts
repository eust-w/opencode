import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import {
  loadBoundaryExclusions,
  settleBoundaryExclusion,
  settlePendingBoundaryExclusions,
} from "../src/exclusion"
import { createBoundaryRunPlan, parseManifest, protocol } from "../src/protocol"
import manifest from "../../../research/auto-drive/protocol/swe-evo-48.json"

const directories: string[] = []

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe("charged boundary exclusion settlement", () => {
  test("recovers one strict charged exclusion without duplicating its budget row", async () => {
    const directory = await temporaryDirectory()
    const run = createBoundaryRunPlan(parseManifest(manifest))[5]!
    const receiptPath = await writeFailureReceipt(directory, run, {
      requests: 32,
      responses: 32,
      usageCompleteResponses: 32,
      observedSpendDeltaUSD: 0.413868,
    })

    const first = await settleBoundaryExclusion({
      artifactRoot: directory,
      ledgerPath: path.join(directory, "boundary/ledger.jsonl"),
      receiptPath,
      run,
      maxCostUSD: 1.0625,
    })
    const second = await settleBoundaryExclusion({
      artifactRoot: directory,
      ledgerPath: path.join(directory, "boundary/ledger.jsonl"),
      receiptPath,
      run,
      maxCostUSD: 1.0625,
    })

    expect(second).toEqual(first)
    expect(first).toMatchObject({
      schemaVersion: 1,
      protocol: protocol.version,
      classification: "excluded-charged-evaluation-failure",
      runID: run.id,
      taskID: run.taskID,
      attempt: 1,
      costUSD: 0.413868,
      promptTokens: 229_932,
      completionTokens: 10_213,
      requests: 32,
      acceptance: { trajectoryAccepted: false, trajectoryLedgerRowWritten: false },
    })
    expect(await loadBoundaryExclusions(directory)).toEqual([first])
    expect(
      (await Bun.file(path.join(directory, "boundary/ledger.jsonl")).text())
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line)),
    ).toEqual([
      {
        timestamp: first.recordedAt,
        runID: run.id,
        category: "boundary",
        disposition: "excluded-charged-evaluation-failure",
        amountUSD: 0.413868,
        promptTokens: 229_932,
        completionTokens: 10_213,
      },
    ])
  })

  test("rejects incomplete or over-budget failure receipts before settlement", async () => {
    const directory = await temporaryDirectory()
    const run = createBoundaryRunPlan(parseManifest(manifest))[5]!
    const incomplete = await writeFailureReceipt(directory, run, {
      requests: 2,
      responses: 1,
      usageCompleteResponses: 1,
      observedSpendDeltaUSD: 0.2,
    })

    await expect(
      settleBoundaryExclusion({
        artifactRoot: directory,
        ledgerPath: path.join(directory, "boundary/ledger.jsonl"),
        receiptPath: incomplete,
        run,
        maxCostUSD: 1.0625,
      }),
    ).rejects.toThrow("complete settled usage")

    const overBudget = await writeFailureReceipt(directory, { ...run, id: "adr_aaaaaaaaaaaaaaaaaaaa" }, {
      requests: 1,
      responses: 1,
      usageCompleteResponses: 1,
      observedSpendDeltaUSD: 1.0626,
    })
    await expect(
      settleBoundaryExclusion({
        artifactRoot: directory,
        ledgerPath: path.join(directory, "boundary/ledger.jsonl"),
        receiptPath: overBudget,
        run: { ...run, id: "adr_aaaaaaaaaaaaaaaaaaaa" },
        maxCostUSD: 1.0625,
      }),
    ).rejects.toThrow("exceeds its preregistered")
  })

  test("verifies every referenced failure artifact before recording an exclusion", async () => {
    const directory = await temporaryDirectory()
    const run = createBoundaryRunPlan(parseManifest(manifest))[5]!
    const receiptPath = await writeFailureReceipt(directory, run, {
      requests: 1,
      responses: 1,
      usageCompleteResponses: 1,
      observedSpendDeltaUSD: 0.1,
    })
    await Bun.write(path.join(directory, "raw", `${run.id}.jsonl`), "tampered\n")

    await expect(
      settleBoundaryExclusion({
        artifactRoot: directory,
        ledgerPath: path.join(directory, "boundary/ledger.jsonl"),
        receiptPath,
        run,
        maxCostUSD: 1.0625,
      }),
    ).rejects.toThrow("artifact hash mismatch")
    expect(await Bun.file(path.join(directory, "boundary/ledger.jsonl")).exists()).toBe(false)
  })

  test("discovers pending strict receipts while leaving accepted and ordinary failures untouched", async () => {
    const directory = await temporaryDirectory()
    const runs = createBoundaryRunPlan(parseManifest(manifest)).slice(4, 7)
    await writeFailureReceipt(directory, runs[1]!, {
      requests: 1,
      responses: 1,
      usageCompleteResponses: 1,
      observedSpendDeltaUSD: 0.1,
    })
    const ordinaryPath = await writeFailureReceipt(directory, runs[2]!, {
      requests: 1,
      responses: 1,
      usageCompleteResponses: 1,
      observedSpendDeltaUSD: 0.1,
    })
    const ordinary = await Bun.file(ordinaryPath).json()
    await Bun.write(ordinaryPath, JSON.stringify({ ...ordinary, classification: "executor-failure" }))

    const exclusions = await settlePendingBoundaryExclusions({
      artifactRoot: directory,
      ledgerPath: path.join(directory, "boundary/ledger.jsonl"),
      runs,
      accepted: new Set([runs[0]!.id]),
      maxCostUSD: 1.0625,
    })

    expect(exclusions.map((exclusion) => exclusion.runID)).toEqual([runs[1]!.id])
    expect(await loadBoundaryExclusions(directory)).toEqual(exclusions)
  })
})

async function temporaryDirectory() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "autodrive-exclusion-"))
  directories.push(directory)
  return directory
}

async function writeFailureReceipt(
  directory: string,
  run: ReturnType<typeof createBoundaryRunPlan>[number],
  gateway: {
    requests: number
    responses: number
    usageCompleteResponses: number
    observedSpendDeltaUSD: number
  },
) {
  const artifacts = await Promise.all(
    [
      [path.join("raw", `${run.id}.jsonl`), '{"type":"executor-failed"}\n'],
      [path.join("gateway", run.id, "requests.jsonl"), '{"sequence":0}\n'],
      [path.join("gateway", run.id, "proxy.jsonl"), '{"type":"provider-response"}\n'],
    ].map(async ([relative, content]) => {
      const target = path.join(directory, relative!)
      await Bun.write(target, content!)
      return { path: relative!, sha256: digest(content!) }
    }),
  )
  const receiptPath = path.join(directory, "failures", run.id, "attempt-1.json")
  await Bun.write(
    receiptPath,
    JSON.stringify({
      schemaVersion: 1,
      protocol: protocol.version,
      classification: "excluded-charged-evaluation-failure",
      stage: "final-grader-test-patch-conflict",
      code: "model-patch-conflicts-frozen-test-patch",
      runID: run.id,
      taskID: run.taskID,
      attempt: 1,
      startedAt: "2026-08-30T20:19:23.273Z",
      recordedAt: "2026-08-30T20:26:24.794Z",
      error: { name: "Error", message: "Model patch conflicts with the frozen test patch" },
      gateway: {
        settlement: { attempted: true, completed: true },
        requests: gateway.requests,
        responses: gateway.responses,
        non200Responses: 0,
        proxyErrors: 0,
        usageCompleteResponses: gateway.usageCompleteResponses,
        promptTokens: 229_932,
        completionTokens: 10_213,
        baselineSpendUSD: 4.4061596,
        settledSpendUSD: 4.8200276,
        observedSpendDeltaUSD: gateway.observedSpendDeltaUSD,
      },
      acceptance: { trajectoryAccepted: false, ledgerRowWritten: false },
      artifacts,
      recordingErrors: [],
    }),
  )
  return receiptPath
}

function digest(content: string) {
  return new Bun.CryptoHasher("sha256").update(content).digest("hex")
}
