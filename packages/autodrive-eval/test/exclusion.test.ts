import { afterEach, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import {
  loadBoundaryExclusions,
  reconcileGraderSecretScannerFalsePositive,
  reconcileExecutorDeadlineFailure,
  reconcilePostSessionSpendSamplingFailure,
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
  test("reconstructs a killed executor only from exact per-request spend evidence", async () => {
    const directory = await temporaryDirectory()
    const run = createBoundaryRunPlan(parseManifest(manifest))[60]
    const startedAt = "2026-08-31T21:59:32.000Z"
    const endedAt = "2026-08-31T22:44:32.000Z"
    const raw = [
      { timestamp: startedAt, type: "executor-started", runID: run.id, attempt: 1, taskID: run.taskID },
      { timestamp: "2026-08-31T22:24:31.000Z", type: "grader-finished", label: "first-boundary" },
    ].map((event) => JSON.stringify(event)).join("\n") + "\n"
    const requests = [
      { sequence: 0, kind: "worker", modelID: "deepseek-v4-pro" },
      { sequence: 1, kind: "controller", modelID: "qwen3.8-max" },
    ]
    const proxy = [
      { timestamp: "2026-08-31T22:03:17.000Z", type: "provider-request", ...requests[0] },
      { timestamp: "2026-08-31T22:03:20.000Z", type: "provider-response", sequence: 0, status: 200, usageComplete: true, promptTokens: 2_828, completionTokens: 248 },
      { timestamp: "2026-08-31T22:04:16.000Z", type: "provider-request", ...requests[1] },
      { timestamp: "2026-08-31T22:04:36.000Z", type: "provider-response", sequence: 1, status: 200, usageComplete: true, promptTokens: 872, completionTokens: 743 },
    ].map((event) => JSON.stringify(event)).join("\n") + "\n"
    await Promise.all([
      mkdir(path.join(directory, "raw"), { recursive: true }),
      mkdir(path.join(directory, "gateway", run.id), { recursive: true }),
    ])
    await Promise.all([
      Bun.write(path.join(directory, "raw", `${run.id}.jsonl`), raw),
      Bun.write(path.join(directory, "gateway", run.id, "requests.jsonl"), requests.map((item) => JSON.stringify(item)).join("\n") + "\n"),
      Bun.write(path.join(directory, "gateway", run.id, "proxy.jsonl"), proxy),
    ])

    const spendLogs = [
      { request_id: "resp-worker", model: "openai/deepseek-v4-pro", prompt_tokens: 2_828, completion_tokens: 248, spend: 0.0043812, startTime: "2026-08-31T22:03:17.503Z", endTime: "2026-08-31T22:03:20.831Z", status: "success" as const },
      { request_id: "chatcmpl-controller", model: "openai/qwen3.8-max", prompt_tokens: 872, completion_tokens: 743, spend: 0.058308, startTime: "2026-08-31T22:04:16.828Z", endTime: "2026-08-31T22:04:36.052Z", status: "success" as const },
    ]
    await expect(reconcileExecutorDeadlineFailure({
      artifactRoot: directory,
      run,
      endedAt,
      maxCostUSD: 1.0625,
      spendLogs: spendLogs.map((row) => ({ ...row, model: "openai/deepseek-v4-pro" })),
    })).rejects.toThrow("model counts")

    const receiptPath = await reconcileExecutorDeadlineFailure({
      artifactRoot: directory,
      run,
      endedAt,
      maxCostUSD: 1.0625,
      recordedAt: new Date("2026-08-31T23:00:00.000Z"),
      spendLogs: [
        ...spendLogs,
        { request_id: "unrelated", model: "openai/other", prompt_tokens: 1, completion_tokens: 0, spend: 0, startTime: "2026-08-31T22:05:00.000Z", endTime: "2026-08-31T22:05:01.000Z", status: "failure" },
      ],
    })
    const receipt = parseExecutorFailureReceipt(await Bun.file(receiptPath).json())
    expect(receipt).toMatchObject({
      classification: "excluded-charged-evaluation-failure",
      stage: "final-grader-executor-deadline",
      code: "executor-killed-at-frozen-deadline",
      gateway: {
        requests: 2,
        responses: 2,
        promptTokens: 3_700,
        completionTokens: 991,
        observedSpendDeltaUSD: 0.0626892,
      },
    })
    const settlement = await Bun.file(path.join(directory, "gateway", run.id, "deadline-spend-settlement.json")).text()
    expect(settlement).not.toContain("resp-worker")
    expect(settlement).not.toContain("chatcmpl-controller")
    expect(settlement).toContain(digest("resp-worker"))
  })

  test("reconciles the observed OpenSSH grader scanner false positive without admitting a trajectory", async () => {
    const directory = await temporaryDirectory()
    const run = createBoundaryRunPlan(parseManifest(manifest))[14]
    const raw = [
      { type: "executor-started", runID: run.id, attempt: 1 },
      { type: "test-patch-prepared" },
      { type: "boundary-captured" },
      { type: "patch-captured", phase: "boundary" },
      { type: "patch-captured", phase: "final" },
      { type: "gateway-settled", requests: 7 },
      { type: "executor-failed", classification: "executor-failure", stage: "first-boundary-grader" },
    ]
      .map((event) => JSON.stringify({ timestamp: "2026-08-31T17:07:00.000Z", ...event }))
      .join("\n") + "\n"
    const relative = `raw/${run.id}.jsonl`
    await Bun.write(path.join(directory, relative), raw)
    const receiptPath = path.join(directory, "failures", run.id, "attempt-1.json")
    await Bun.write(
      receiptPath,
      JSON.stringify({
        schemaVersion: 1,
        protocol: protocol.version,
        classification: "executor-failure",
        stage: "first-boundary-grader",
        code: "executor-error",
        runID: run.id,
        taskID: run.taskID,
        attempt: 1,
        startedAt: "2026-08-31T17:05:00.000Z",
        recordedAt: "2026-08-31T17:07:39.000Z",
        error: { name: "Error", message: "Artifact contains a possible secret" },
        gateway: {
          settlement: { attempted: true, completed: true },
          requests: 7,
          responses: 7,
          non200Responses: 0,
          proxyErrors: 0,
          usageCompleteResponses: 7,
          promptTokens: 30_949,
          completionTokens: 2_994,
          baselineSpendUSD: 17.7740826,
          settledSpendUSD: 17.9269788,
          observedSpendDeltaUSD: 0.1528962,
        },
        acceptance: { trajectoryAccepted: false, ledgerRowWritten: false },
        artifacts: [{ path: relative, sha256: digest(raw) }],
        recordingErrors: [],
      }),
    )

    const reconciled = await reconcileGraderSecretScannerFalsePositive({
      artifactRoot: directory,
      originalReceiptPath: receiptPath,
      run,
      maxCostUSD: 1.0625,
      recordedAt: new Date("2026-08-31T18:00:00.000Z"),
    })
    expect(parseExecutorFailureReceipt(await Bun.file(reconciled).json())).toMatchObject({
      classification: "excluded-charged-evaluation-failure",
      stage: "first-boundary-grader-secret-scanner-false-positive",
      code: "grader-output-excluded-after-secret-scanner-false-positive",
      acceptance: { trajectoryAccepted: false, ledgerRowWritten: false },
    })
    await expect(
      reconcileGraderSecretScannerFalsePositive({
        artifactRoot: directory,
        originalReceiptPath: receiptPath,
        run,
        maxCostUSD: 1.0625,
      }),
    ).resolves.toBe(reconciled)
  })

  test("reconciles a fully settled post-session spend sampling timeout without rerunning", async () => {
    const directory = await temporaryDirectory()
    const run = createBoundaryRunPlan(parseManifest(manifest))[12]
    const raw = [
      { type: "executor-started", runID: run.id, attempt: 1 },
      { type: "grader-finished", label: "first-boundary" },
      { type: "session-finished" },
      { type: "gateway-settled", requests: 7 },
      { type: "executor-failed", classification: "executor-failure", stage: "gateway-settlement" },
    ]
      .map((event) => JSON.stringify({ timestamp: "2026-08-31T13:58:00.000Z", ...event }))
      .join("\n") + "\n"
    const relative = `raw/${run.id}.jsonl`
    await Bun.write(path.join(directory, relative), raw)
    const receiptPath = path.join(directory, "failures", run.id, "attempt-1.json")
    await Bun.write(
      receiptPath,
      JSON.stringify({
        schemaVersion: 1,
        protocol: protocol.version,
        classification: "executor-failure",
        stage: "gateway-settlement",
        code: "executor-error",
        runID: run.id,
        taskID: run.taskID,
        attempt: 1,
        startedAt: "2026-08-31T13:55:03.497Z",
        recordedAt: "2026-08-31T13:58:09.763Z",
        error: { name: "TimeoutError", message: "The operation timed out." },
        gateway: {
          settlement: { attempted: true, completed: true },
          requests: 7,
          responses: 7,
          non200Responses: 0,
          proxyErrors: 0,
          usageCompleteResponses: 7,
          promptTokens: 27_028,
          completionTokens: 2_276,
          baselineSpendUSD: 10.1838435,
          settledSpendUSD: 10.2844134,
          observedSpendDeltaUSD: 0.1005699,
        },
        acceptance: { trajectoryAccepted: false, ledgerRowWritten: false },
        artifacts: [{ path: relative, sha256: digest(raw) }],
        recordingErrors: [],
      }),
    )

    const reconciled = await reconcilePostSessionSpendSamplingFailure({
      artifactRoot: directory,
      originalReceiptPath: receiptPath,
      run,
      maxCostUSD: 1.0625,
      recordedAt: new Date("2026-08-31T14:00:00.000Z"),
    })
    const receipt = parseExecutorFailureReceipt(await Bun.file(reconciled).json())
    expect(receipt).toMatchObject({
      classification: "excluded-charged-evaluation-failure",
      stage: "post-session-spend-sampling-timeout",
      runID: run.id,
      gateway: { observedSpendDeltaUSD: 0.1005699 },
    })
    expect(await reconcilePostSessionSpendSamplingFailure({
      artifactRoot: directory,
      originalReceiptPath: receiptPath,
      run,
      maxCostUSD: 1.0625,
    })).toBe(reconciled)
  })

  test("classifies an over-ceiling post-session sampling timeout as a budget overrun", async () => {
    const directory = await temporaryDirectory()
    const run = createBoundaryRunPlan(parseManifest(manifest))[13]
    const raw = [
      { type: "executor-started", runID: run.id, attempt: 1 },
      { type: "grader-finished", label: "final" },
      { type: "session-finished" },
      { type: "gateway-settled", requests: 13 },
      { type: "executor-failed", classification: "executor-failure", stage: "gateway-settlement" },
    ]
      .map((event) => JSON.stringify({ timestamp: "2026-09-01T06:24:25.764Z", ...event }))
      .join("\n") + "\n"
    const relative = `raw/${run.id}.jsonl`
    await Bun.write(path.join(directory, relative), raw)
    const receiptPath = path.join(directory, "failures", run.id, "attempt-1.json")
    await Bun.write(
      receiptPath,
      JSON.stringify({
        schemaVersion: 1,
        protocol: protocol.version,
        classification: "executor-failure",
        stage: "gateway-settlement",
        code: "executor-error",
        runID: run.id,
        taskID: run.taskID,
        attempt: 1,
        startedAt: "2026-09-01T06:09:40.000Z",
        recordedAt: "2026-09-01T06:24:25.764Z",
        error: { name: "TimeoutError", message: "The operation timed out." },
        gateway: {
          settlement: { attempted: true, completed: true },
          requests: 13,
          responses: 13,
          non200Responses: 0,
          proxyErrors: 0,
          usageCompleteResponses: 13,
          promptTokens: 81_594,
          completionTokens: 6_250,
          baselineSpendUSD: 14.8922667,
          settledSpendUSD: 16.0723587,
          observedSpendDeltaUSD: 1.180092,
        },
        acceptance: { trajectoryAccepted: false, ledgerRowWritten: false },
        artifacts: [{ path: relative, sha256: digest(raw) }],
        recordingErrors: [],
      }),
    )

    const reconciled = await reconcilePostSessionSpendSamplingFailure({
      artifactRoot: directory,
      originalReceiptPath: receiptPath,
      run,
      maxCostUSD: 1.0625,
      recordedAt: new Date("2026-09-01T06:25:00.000Z"),
    })
    expect(parseExecutorFailureReceipt(await Bun.file(reconciled).json())).toMatchObject({
      classification: "excluded-charged-budget-overrun",
      stage: "post-session-spend-sampling-budget-overrun",
      gateway: { observedSpendDeltaUSD: 1.180092 },
    })
  })

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

  test("discovers a charged attempt two before an earlier zero-cost attempt one", async () => {
    const directory = await temporaryDirectory()
    const run = createBoundaryRunPlan(parseManifest(manifest))[6]
    const attemptTwoPath = await writeFailureReceipt(directory, run, {
      attempt: 2,
      requests: 28,
      responses: 28,
      usageCompleteResponses: 28,
      observedSpendDeltaUSD: 0.7139073,
    })
    const attemptOne = await Bun.file(attemptTwoPath).json()
    await Bun.write(
      path.join(directory, "failures", run.id, "attempt-1.json"),
      JSON.stringify({
        ...attemptOne,
        classification: "executor-failure",
        stage: "startup-baseline",
        runID: run.id,
        attempt: 1,
        error: { name: "Error", message: "Task image has tracked startup changes" },
        gateway: {
          settlement: { attempted: false, completed: true },
          requests: 0,
          responses: 0,
          non200Responses: 0,
          proxyErrors: 0,
          usageCompleteResponses: 0,
          promptTokens: 0,
          completionTokens: 0,
          baselineSpendUSD: 7.1315505,
        },
      }),
    )

    const exclusions = await settlePendingBoundaryExclusions({
      artifactRoot: directory,
      ledgerPath: path.join(directory, "boundary/ledger.jsonl"),
      runs: [run],
      accepted: new Set(),
      maxCostUSD: 1.0625,
    })

    expect(exclusions).toHaveLength(1)
    expect(exclusions[0]).toMatchObject({
      runID: run.id,
      attempt: 2,
      costUSD: 0.7139073,
      failureReceipt: { path: `failures/${run.id}/attempt-2.json` },
    })
  })

  test("accounts for a charged budget overrun without accepting an empirical trajectory", async () => {
    const directory = await temporaryDirectory()
    const run = createBoundaryRunPlan(parseManifest(manifest))[7]
    const receiptPath = await writeFailureReceipt(directory, run, {
      requests: 40,
      responses: 40,
      proxyErrors: 3,
      usageCompleteResponses: 40,
      observedSpendDeltaUSD: 1.2186096,
    })
    const receipt = await Bun.file(receiptPath).json()
    await Bun.write(
      receiptPath,
      JSON.stringify({
        ...receipt,
        classification: "excluded-charged-budget-overrun",
        stage: "gateway-settlement-budget-overrun",
        code: "gateway-spend-exceeded-frozen-per-run-ceiling",
      }),
    )

    const exclusion = await settleBoundaryExclusion({
      artifactRoot: directory,
      ledgerPath: path.join(directory, "boundary/ledger.jsonl"),
      receiptPath,
      run,
      maxCostUSD: 1.0625,
    })

    expect(exclusion).toMatchObject({
      classification: "excluded-charged-budget-overrun",
      runID: run.id,
      costUSD: 1.2186096,
      acceptance: { trajectoryAccepted: false, trajectoryLedgerRowWritten: false },
    })
    expect(JSON.parse((await Bun.file(path.join(directory, "boundary/ledger.jsonl")).text()).trim())).toMatchObject({
      runID: run.id,
      disposition: "excluded-charged-budget-overrun",
      amountUSD: 1.2186096,
    })
  })

  test("rejects a charged exclusion before it would exceed the frozen category budget", async () => {
    const directory = await temporaryDirectory()
    const run = createBoundaryRunPlan(parseManifest(manifest))[7]
    const ledgerPath = path.join(directory, "boundary/ledger.jsonl")
    await Bun.write(
      ledgerPath,
      JSON.stringify({
        timestamp: "2026-08-31T00:00:00.000Z",
        runID: "adr_00000000000000000000",
        category: "boundary",
        amountUSD: 101,
        promptTokens: 0,
        completionTokens: 0,
      }) + "\n",
    )
    const receiptPath = await writeFailureReceipt(directory, run, {
      requests: 40,
      responses: 40,
      usageCompleteResponses: 40,
      observedSpendDeltaUSD: 1.2186096,
    })
    const receipt = await Bun.file(receiptPath).json()
    await Bun.write(
      receiptPath,
      JSON.stringify({
        ...receipt,
        classification: "excluded-charged-budget-overrun",
        stage: "gateway-settlement-budget-overrun",
        code: "gateway-spend-exceeded-frozen-per-run-ceiling",
      }),
    )

    await expect(
      settleBoundaryExclusion({
        artifactRoot: directory,
        ledgerPath,
        receiptPath,
        run,
        maxCostUSD: 1.0625,
      }),
    ).rejects.toThrow("boundary budget exceeds $102")
    expect(await Bun.file(path.join(directory, "boundary/exclusions", `${run.id}.json`)).exists()).toBe(false)
    expect((await Bun.file(ledgerPath).text()).trim().split("\n")).toHaveLength(1)
  })

  test("reconciles the observed settlement false negative into an immutable budget-overrun receipt", async () => {
    const module: Record<string, unknown> = await import("../src/exclusion")
    expect(module.reconcileBoundaryBudgetOverrunFailure).toBeFunction()
    if (typeof module.reconcileBoundaryBudgetOverrunFailure !== "function") return
    const directory = await temporaryDirectory()
    const run = createBoundaryRunPlan(parseManifest(manifest))[7]
    const originalReceiptPath = await writeBudgetOverrunSettlementFailure(directory, run)

    const receiptPath = await module.reconcileBoundaryBudgetOverrunFailure({
      artifactRoot: directory,
      run,
      originalReceiptPath,
      maxCostUSD: 1.0625,
      spendSamples: [4.0391964, 4.0391964, 4.0391964, 4.0391964],
      recordedAt: new Date("2026-08-31T03:00:00.000Z"),
    })
    const receipt = parseExecutorFailureReceipt(await Bun.file(receiptPath).json())

    expect(receipt).toMatchObject({
      classification: "excluded-charged-budget-overrun",
      stage: "gateway-settlement-budget-overrun",
      code: "gateway-spend-exceeded-frozen-per-run-ceiling",
      runID: run.id,
      attempt: 1,
      gateway: {
        settlement: { attempted: true, completed: true },
        requests: 2,
        responses: 2,
        proxyErrors: 2,
        usageCompleteResponses: 2,
        observedSpendDeltaUSD: 1.2186096,
      },
    })
    expect(receipt.artifacts.map((artifact) => artifact.path)).toEqual([
      `failures/${run.id}/attempt-1.json`,
      `raw/${run.id}.jsonl`,
      `gateway/${run.id}/requests.jsonl`,
      `gateway/${run.id}/proxy.jsonl`,
      `gateway/${run.id}/requests/0000.json`,
      `gateway/${run.id}/responses/0000.txt`,
      `gateway/${run.id}/requests/0001.json`,
      `gateway/${run.id}/responses/0001.txt`,
      `failures/${run.id}/attempt-1-settlement.json`,
    ])
    await expect(
      module.reconcileBoundaryBudgetOverrunFailure({
        artifactRoot: directory,
        run,
        originalReceiptPath,
        maxCostUSD: 1.0625,
        spendSamples: [4.0391964, 4.0391964, 4.0391964, 4.0391964],
        recordedAt: new Date("2026-08-31T04:00:00.000Z"),
      }),
    ).resolves.toBe(receiptPath)
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

  test("reclassifies a settled evaluation failure that exceeded the frozen ceiling", async () => {
    const directory = await temporaryDirectory()
    const run = createBoundaryRunPlan(parseManifest(manifest))[5]
    const originalReceiptPath = await writeFailureReceipt(directory, run, {
      requests: 1,
      responses: 1,
      proxyErrors: 3,
      usageCompleteResponses: 1,
      observedSpendDeltaUSD: 1.1264694,
    })

    const exclusions = await settlePendingBoundaryExclusions({
      artifactRoot: directory,
      ledgerPath: path.join(directory, "boundary/ledger.jsonl"),
      runs: [run],
      accepted: new Set(),
      maxCostUSD: 1.0625,
    })

    expect(exclusions).toMatchObject([
      {
        classification: "excluded-charged-budget-overrun",
        runID: run.id,
        costUSD: 1.1264694,
        failureReceipt: { path: `failures/${run.id}/reconciled-attempt-1.json` },
      },
    ])
    const reconciled = parseExecutorFailureReceipt(
      await Bun.file(path.join(directory, "failures", run.id, "reconciled-attempt-1.json")).json(),
    )
    expect(reconciled).toMatchObject({
      classification: "excluded-charged-budget-overrun",
      stage: "evaluation-failure-budget-overrun",
      code: "gateway-spend-exceeded-frozen-per-run-ceiling",
    })
    expect(reconciled.artifacts[0]).toEqual({
      path: `failures/${run.id}/attempt-1.json`,
      sha256: digest(await Bun.file(originalReceiptPath).text()),
    })
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
    const runs = createBoundaryRunPlan(parseManifest(manifest)).slice(4, 8)
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
    const overrunPath = await writeFailureReceipt(directory, runs[3], {
      requests: 1,
      responses: 1,
      usageCompleteResponses: 1,
      observedSpendDeltaUSD: 1.2186096,
    })
    const overrun = await Bun.file(overrunPath).json()
    await Bun.write(
      overrunPath,
      JSON.stringify({
        ...overrun,
        classification: "excluded-charged-budget-overrun",
        stage: "gateway-settlement-budget-overrun",
        code: "gateway-spend-exceeded-frozen-per-run-ceiling",
      }),
    )

    const exclusions = await settlePendingBoundaryExclusions({
      artifactRoot: directory,
      ledgerPath: path.join(directory, "boundary/ledger.jsonl"),
      runs,
      accepted: new Set([runs[0].id]),
      maxCostUSD: 1.0625,
    })

    expect(exclusions.map((exclusion) => exclusion.runID)).toEqual([runs[1].id, runs[3].id].sort())
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

async function writeBudgetOverrunSettlementFailure(
  directory: string,
  run: ReturnType<typeof createBoundaryRunPlan>[number],
) {
  const requestContents = ['{"model":"worker"}\n', '{"model":"controller"}\n']
  const responseContents = ['{"usage":"worker"}\n', '{"usage":"controller"}\n']
  const requests = requestContents.map((content, sequence) => ({
    sequence,
    kind: sequence === 0 ? "worker" : "controller",
    provider: "d-robotics-gateway",
    modelID: sequence === 0 ? "deepseek-v4-pro" : "qwen3.8-max",
    modelVersion: sequence === 0 ? "deepseek-v4-pro" : "qwen3.8-max",
    requestSHA256: digest(content),
    normalizedRequest: {
      path: `gateway/${run.id}/requests/${String(sequence).padStart(4, "0")}.json`,
      sha256: digest(content),
    },
    temperature: 0,
    maxOutputTokens: sequence === 0 ? 4096 : 1024,
  }))
  const events: Record<string, unknown>[] = requests.flatMap((request, sequence) => [
    { timestamp: `2026-08-31T02:40:4${sequence}.000Z`, type: "provider-request", ...request },
    {
      timestamp: `2026-08-31T02:40:5${sequence}.000Z`,
      type: "provider-raw-response",
      sequence,
      status: 200,
      response: {
        path: `gateway/${run.id}/responses/${String(sequence).padStart(4, "0")}.txt`,
        sha256: digest(responseContents[sequence]),
      },
    },
    {
      timestamp: `2026-08-31T02:40:5${sequence}.100Z`,
      type: "provider-response",
      sequence,
      status: 200,
      usageComplete: true,
      promptTokens: 100 + sequence,
      completionTokens: 20 + sequence,
    },
  ])
  events.push(
    { timestamp: "2026-08-31T02:41:00.000Z", type: "proxy-error", sequence: 2, name: "Error" },
    { timestamp: "2026-08-31T02:41:01.000Z", type: "proxy-error", sequence: 3, name: "Error" },
  )
  const raw =
    [
      { timestamp: "2026-08-31T02:40:40.000Z", type: "executor-started" },
      { timestamp: "2026-08-31T02:41:02.000Z", type: "executor-failed" },
    ]
      .map((event) => JSON.stringify(event))
      .join("\n") + "\n"
  const requestManifest = requests.map((request) => JSON.stringify(request)).join("\n") + "\n"
  const proxyTrace = events.map((event) => JSON.stringify(event)).join("\n") + "\n"
  const artifacts = [
    [path.join("raw", `${run.id}.jsonl`), raw],
    [path.join("gateway", run.id, "requests.jsonl"), requestManifest],
    [path.join("gateway", run.id, "proxy.jsonl"), proxyTrace],
  ] as const
  await Promise.all([
    ...artifacts.map(([relative, content]) => Bun.write(path.join(directory, relative), content)),
    ...requestContents.map((content, sequence) =>
      Bun.write(path.join(directory, requests[sequence].normalizedRequest.path), content),
    ),
    ...responseContents.map((content, sequence) =>
      Bun.write(path.join(directory, `gateway/${run.id}/responses/${String(sequence).padStart(4, "0")}.txt`), content),
    ),
  ])
  const receiptPath = path.join(directory, "failures", run.id, "attempt-1.json")
  await Bun.write(
    receiptPath,
    JSON.stringify({
      schemaVersion: 1,
      protocol: protocol.version,
      classification: "executor-failure",
      stage: "gateway-settlement",
      code: "executor-error",
      runID: run.id,
      taskID: run.taskID,
      attempt: 1,
      startedAt: "2026-08-31T02:40:40.000Z",
      recordedAt: "2026-08-31T02:56:05.000Z",
      error: { name: "Error", message: "Gateway requests did not settle before the frozen deadline" },
      gateway: {
        settlement: {
          attempted: true,
          completed: false,
          error: "Gateway requests did not settle before the frozen deadline",
        },
        requests: 2,
        responses: 2,
        non200Responses: 0,
        proxyErrors: 2,
        usageCompleteResponses: 2,
        promptTokens: 201,
        completionTokens: 41,
        baselineSpendUSD: 2.8205868,
        settledSpendUSD: 4.0391964,
        observedSpendDeltaUSD: 1.2186096,
      },
      acceptance: { trajectoryAccepted: false, ledgerRowWritten: false },
      artifacts: artifacts.map(([relative, content]) => ({ path: relative, sha256: digest(content) })),
      recordingErrors: [],
    }),
  )
  return receiptPath
}

function digest(content: string) {
  return new Bun.CryptoHasher("sha256").update(content).digest("hex")
}
