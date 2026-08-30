import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import {
  loadBoundaryExclusions,
  reconcileRetryGatewayNamespaceFailure,
  settleBoundaryExclusion,
  settlePendingBoundaryExclusions,
} from "../src/exclusion"
import { parseExecutorFailureReceipt } from "../src/host-executor"
import { createBoundaryRunPlan, parseManifest, protocol } from "../src/protocol"
import manifest from "../../../research/auto-drive/protocol/swe-evo-48.json"

const directories: string[] = []

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe("charged boundary exclusion settlement", () => {
  test("recovers one strict charged exclusion without duplicating its budget row", async () => {
    const directory = await temporaryDirectory()
    const run = createBoundaryRunPlan(parseManifest(manifest))[5]
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

  test("settles an exhausted charged retry when every request has a terminal event", async () => {
    const directory = await temporaryDirectory()
    const run = createBoundaryRunPlan(parseManifest(manifest))[6]
    const receiptPath = await writeFailureReceipt(directory, run, {
      attempt: 2,
      requests: 7,
      responses: 6,
      proxyErrors: 1,
      usageCompleteResponses: 6,
      observedSpendDeltaUSD: 0.0906303,
    })

    const exclusion = await settleBoundaryExclusion({
      artifactRoot: directory,
      ledgerPath: path.join(directory, "boundary/ledger.jsonl"),
      receiptPath,
      run,
      maxCostUSD: 1.0625,
    })

    expect(exclusion).toMatchObject({
      classification: "excluded-charged-evaluation-failure",
      runID: run.id,
      attempt: 2,
      costUSD: 0.0906303,
      requests: 7,
    })
  })

  test("reconstructs a strict charged retry receipt from a misrouted gateway namespace", async () => {
    const directory = await temporaryDirectory()
    const run = createBoundaryRunPlan(parseManifest(manifest))[6]
    const raw = '{"type":"executor-failed"}\n'
    const originalPath = path.join(directory, "failures", run.id, "attempt-2.json")
    await Bun.write(path.join(directory, "raw", `${run.id}-attempt-2.jsonl`), raw)
    await Bun.write(
      originalPath,
      JSON.stringify({
        schemaVersion: 1,
        protocol: protocol.version,
        classification: "executor-failure",
        stage: "trajectory-finalization",
        code: "executor-error",
        runID: run.id,
        taskID: run.taskID,
        attempt: 2,
        startedAt: "2026-08-30T21:43:15.122Z",
        recordedAt: "2026-08-30T21:56:21.461Z",
        error: { name: "ZodError", message: "modelRequests is empty" },
        gateway: {
          settlement: { attempted: false, completed: true },
          requests: 0,
          responses: 0,
          non200Responses: 0,
          proxyErrors: 0,
          usageCompleteResponses: 0,
          promptTokens: 0,
          completionTokens: 0,
          baselineSpendUSD: 4.8200276,
        },
        acceptance: { trajectoryAccepted: false, ledgerRowWritten: false },
        artifacts: [{ path: `raw/${run.id}-attempt-2.jsonl`, sha256: digest(raw) }],
        recordingErrors: [],
      }),
    )
    await writeMisroutedGatewayArtifacts(directory, run.id)

    const receiptPath = await reconcileRetryGatewayNamespaceFailure({
      artifactRoot: directory,
      run,
      originalReceiptPath: originalPath,
      spendSamples: [4.9106579, 4.9106579, 4.9106579, 4.9106579],
      recordedAt: new Date("2026-08-30T21:57:00.000Z"),
    })
    const receipt = parseExecutorFailureReceipt(await Bun.file(receiptPath).json())

    expect(receipt).toMatchObject({
      classification: "excluded-charged-evaluation-failure",
      stage: "gateway-artifact-namespace-mismatch",
      code: "retry-gateway-artifacts-written-under-base-run",
      runID: run.id,
      attempt: 2,
      gateway: {
        settlement: { attempted: true, completed: true },
        requests: 2,
        responses: 1,
        proxyErrors: 1,
        usageCompleteResponses: 1,
        promptTokens: 123,
        completionTokens: 45,
        baselineSpendUSD: 4.8200276,
        settledSpendUSD: 4.9106579,
        observedSpendDeltaUSD: 0.0906303,
      },
      acceptance: { trajectoryAccepted: false, ledgerRowWritten: false },
      recordingErrors: [],
    })
    expect(receipt.artifacts.map((artifact) => artifact.path)).toEqual([
      `failures/${run.id}/attempt-2.json`,
      `raw/${run.id}-attempt-2.jsonl`,
      `gateway/${run.id}/requests.jsonl`,
      `gateway/${run.id}/proxy.jsonl`,
      `gateway/${run.id}/requests/0000.json`,
      `gateway/${run.id}/responses/0000.txt`,
      `gateway/${run.id}/requests/0001.json`,
      `failures/${run.id}/attempt-2-settlement.json`,
    ])
    await expect(
      reconcileRetryGatewayNamespaceFailure({
        artifactRoot: directory,
        run,
        originalReceiptPath: originalPath,
        spendSamples: [4.9106579, 4.9106579, 4.9106579, 4.9106579],
        recordedAt: new Date("2026-08-30T21:58:00.000Z"),
      }),
    ).resolves.toBe(receiptPath)
  })

  test("rejects unstable settlement and gateway events outside the failed retry", async () => {
    const directory = await temporaryDirectory()
    const run = createBoundaryRunPlan(parseManifest(manifest))[6]
    const originalPath = await writeZeroRequestRetryReceipt(directory, run)
    await writeMisroutedGatewayArtifacts(directory, run.id)

    await expect(
      reconcileRetryGatewayNamespaceFailure({
        artifactRoot: directory,
        run,
        originalReceiptPath: originalPath,
        spendSamples: [4.9, 4.91, 4.91, 4.91],
      }),
    ).rejects.toThrow("stable spend samples")
    await writeMisroutedGatewayArtifacts(directory, run.id, "2026-08-30T21:40:00.000Z")
    await expect(
      reconcileRetryGatewayNamespaceFailure({
        artifactRoot: directory,
        run,
        originalReceiptPath: originalPath,
        spendSamples: [4.91, 4.91, 4.91, 4.91],
      }),
    ).rejects.toThrow("outside the retry window")
  })

  test("rejects incomplete or over-budget failure receipts before settlement", async () => {
    const directory = await temporaryDirectory()
    const run = createBoundaryRunPlan(parseManifest(manifest))[5]
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

    const overBudget = await writeFailureReceipt(
      directory,
      { ...run, id: "adr_aaaaaaaaaaaaaaaaaaaa" },
      {
        requests: 1,
        responses: 1,
        usageCompleteResponses: 1,
        observedSpendDeltaUSD: 1.0626,
      },
    )
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
    const run = createBoundaryRunPlan(parseManifest(manifest))[5]
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
    await writeFailureReceipt(directory, runs[1], {
      requests: 1,
      responses: 1,
      usageCompleteResponses: 1,
      observedSpendDeltaUSD: 0.1,
    })
    const ordinaryPath = await writeFailureReceipt(directory, runs[2], {
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
      accepted: new Set([runs[0].id]),
      maxCostUSD: 1.0625,
    })

    expect(exclusions.map((exclusion) => exclusion.runID)).toEqual([runs[1].id])
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
    attempt?: 1 | 2
    requests: number
    responses: number
    proxyErrors?: number
    usageCompleteResponses: number
    observedSpendDeltaUSD: number
  },
) {
  const attempt = gateway.attempt ?? 1
  const artifactID = attempt === 1 ? run.id : `${run.id}-attempt-${attempt}`
  const artifacts = await Promise.all(
    [
      [path.join("raw", `${artifactID}.jsonl`), '{"type":"executor-failed"}\n'],
      [path.join("gateway", artifactID, "requests.jsonl"), '{"sequence":0}\n'],
      [path.join("gateway", artifactID, "proxy.jsonl"), '{"type":"provider-response"}\n'],
    ].map(async ([relative, content]) => {
      const target = path.join(directory, relative)
      await Bun.write(target, content)
      return { path: relative, sha256: digest(content) }
    }),
  )
  const receiptPath = path.join(directory, "failures", run.id, `attempt-${attempt}.json`)
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
      attempt,
      startedAt: "2026-08-30T20:19:23.273Z",
      recordedAt: "2026-08-30T20:26:24.794Z",
      error: { name: "Error", message: "Model patch conflicts with the frozen test patch" },
      gateway: {
        settlement: { attempted: true, completed: true },
        requests: gateway.requests,
        responses: gateway.responses,
        non200Responses: 0,
        proxyErrors: gateway.proxyErrors ?? 0,
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

async function writeZeroRequestRetryReceipt(directory: string, run: ReturnType<typeof createBoundaryRunPlan>[number]) {
  const raw = '{"type":"executor-failed"}\n'
  const receiptPath = path.join(directory, "failures", run.id, "attempt-2.json")
  await Bun.write(path.join(directory, "raw", `${run.id}-attempt-2.jsonl`), raw)
  await Bun.write(
    receiptPath,
    JSON.stringify({
      schemaVersion: 1,
      protocol: protocol.version,
      classification: "executor-failure",
      stage: "trajectory-finalization",
      code: "executor-error",
      runID: run.id,
      taskID: run.taskID,
      attempt: 2,
      startedAt: "2026-08-30T21:43:15.122Z",
      recordedAt: "2026-08-30T21:56:21.461Z",
      error: { name: "ZodError", message: "modelRequests is empty" },
      gateway: {
        settlement: { attempted: false, completed: true },
        requests: 0,
        responses: 0,
        non200Responses: 0,
        proxyErrors: 0,
        usageCompleteResponses: 0,
        promptTokens: 0,
        completionTokens: 0,
        baselineSpendUSD: 4.8200276,
      },
      acceptance: { trajectoryAccepted: false, ledgerRowWritten: false },
      artifacts: [{ path: `raw/${run.id}-attempt-2.jsonl`, sha256: digest(raw) }],
      recordingErrors: [],
    }),
  )
  return receiptPath
}

async function writeMisroutedGatewayArtifacts(
  directory: string,
  runID: string,
  firstTimestamp = "2026-08-30T21:43:19.611Z",
) {
  const request0 = '{"model":"worker"}\n'
  const response0 = '{"usage":"complete"}\n'
  const request1 = '{"model":"controller"}\n'
  const references = [
    {
      sequence: 0,
      kind: "worker",
      requestSHA256: digest(request0),
      normalizedRequest: { path: `gateway/${runID}/requests/0000.json`, sha256: digest(request0) },
    },
    {
      sequence: 1,
      kind: "controller",
      requestSHA256: digest(request1),
      normalizedRequest: { path: `gateway/${runID}/requests/0001.json`, sha256: digest(request1) },
    },
  ]
  const root = path.join(directory, "gateway", runID)
  await Promise.all([
    Bun.write(path.join(root, "requests", "0000.json"), request0),
    Bun.write(path.join(root, "responses", "0000.txt"), response0),
    Bun.write(path.join(root, "requests", "0001.json"), request1),
    Bun.write(path.join(root, "requests.jsonl"), references.map((item) => JSON.stringify(item)).join("\n") + "\n"),
    Bun.write(
      path.join(root, "proxy.jsonl"),
      [
        { timestamp: firstTimestamp, type: "provider-request", ...references[0] },
        {
          timestamp: "2026-08-30T21:43:22.612Z",
          type: "provider-raw-response",
          sequence: 0,
          status: 200,
          response: { path: `gateway/${runID}/responses/0000.txt`, sha256: digest(response0) },
        },
        {
          timestamp: "2026-08-30T21:43:22.616Z",
          type: "provider-response",
          sequence: 0,
          status: 200,
          usageComplete: true,
          promptTokens: 123,
          completionTokens: 45,
        },
        { timestamp: "2026-08-30T21:44:05.609Z", type: "provider-request", ...references[1] },
        { timestamp: "2026-08-30T21:44:05.610Z", type: "controller-held", sequence: 1 },
        { timestamp: "2026-08-30T21:45:05.691Z", type: "proxy-error", sequence: 1, name: "Error" },
      ]
        .map((item) => JSON.stringify(item))
        .join("\n") + "\n",
    ),
  ])
}

function digest(content: string) {
  return new Bun.CryptoHasher("sha256").update(content).digest("hex")
}
