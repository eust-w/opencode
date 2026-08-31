import { appendFile, mkdir, readdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { z } from "zod"
import { ArtifactReference, assertSecretFree } from "./artifact"
import { summarizeBudget } from "./budget"
import { gatewayRequestsSettled } from "./gateway"
import { parseExecutorFailureReceipt } from "./host-executor"
import { protocol, type Run } from "./protocol"

export const BoundaryExclusion = z
  .object({
    schemaVersion: z.literal(1),
    protocol: z.string().min(1),
    classification: z.enum(["excluded-charged-evaluation-failure", "excluded-charged-budget-overrun"]),
    runID: z.string().regex(/^adr_[a-f0-9]{20}$/),
    taskID: z.string().min(1),
    attempt: z.union([z.literal(1), z.literal(2)]),
    recordedAt: z.iso.datetime(),
    costUSD: z.number().nonnegative(),
    promptTokens: z.number().int().nonnegative(),
    completionTokens: z.number().int().nonnegative(),
    requests: z.number().int().positive(),
    failureReceipt: ArtifactReference,
    acceptance: z
      .object({ trajectoryAccepted: z.literal(false), trajectoryLedgerRowWritten: z.literal(false) })
      .strict(),
  })
  .strict()
export type BoundaryExclusion = z.infer<typeof BoundaryExclusion>

const DeadlineSpendLog = z
  .object({
    request_id: z.string().min(1),
    model: z.string().min(1),
    prompt_tokens: z.number().int().nonnegative(),
    completion_tokens: z.number().int().nonnegative(),
    spend: z.number().nonnegative(),
    startTime: z.iso.datetime(),
    endTime: z.iso.datetime(),
    status: z.string().min(1),
  })
  .loose()

const DeadlineTraceEvent = z
  .object({
    timestamp: z.iso.datetime(),
    type: z.string().min(1),
    runID: z.string().optional(),
    taskID: z.string().optional(),
    attempt: z.number().int().optional(),
    label: z.string().optional(),
  })
  .loose()

const DeadlineGatewayRequest = z
  .object({
    sequence: z.number().int().nonnegative(),
    kind: z.enum(["worker", "controller"]),
    modelID: z.string().min(1),
  })
  .loose()

const DeadlineGatewayEvent = z
  .object({
    type: z.string().min(1),
    sequence: z.number().int().nonnegative().optional(),
    status: z.number().int().optional(),
    usageComplete: z.boolean().optional(),
    promptTokens: z.number().int().nonnegative().optional(),
    completionTokens: z.number().int().nonnegative().optional(),
  })
  .loose()

export async function reconcileExecutorDeadlineFailure(input: {
  artifactRoot: string
  run: Run
  endedAt: string
  spendLogs: unknown
  maxCostUSD: number
  recordedAt?: Date
}) {
  const receiptPath = path.join(input.artifactRoot, "failures", input.run.id, "reconciled-attempt-1.json")
  const existing = Bun.file(receiptPath)
  if (await existing.exists()) {
    const receipt = parseExecutorFailureReceipt(await existing.json())
    requireSettledExclusion(receipt, input.run, input.maxCostUSD)
    await Promise.all(receipt.artifacts.map((artifact) => verifyArtifact(input.artifactRoot, artifact)))
    return receiptPath
  }

  const rawPath = path.posix.join("raw", `${input.run.id}.jsonl`)
  const requestPath = path.posix.join("gateway", input.run.id, "requests.jsonl")
  const proxyPath = path.posix.join("gateway", input.run.id, "proxy.jsonl")
  const [raw, requestManifest, proxyTrace] = await Promise.all(
    [rawPath, requestPath, proxyPath].map((artifact) => readArtifact(input.artifactRoot, artifact)),
  )
  const trace = parseJSONL(raw, DeadlineTraceEvent)
  const requests = parseJSONL(requestManifest, DeadlineGatewayRequest)
  const proxy = parseJSONL(proxyTrace, DeadlineGatewayEvent)
  const started = trace.find((event) => event.type === "executor-started")
  if (
    !started ||
    started.runID !== input.run.id ||
    started.taskID !== input.run.taskID ||
    started.attempt !== 1 ||
    !trace.some((event) => event.type === "grader-finished" && event.label === "first-boundary") ||
    trace.some(
      (event) =>
        (event.type === "grader-finished" && event.label === "final") ||
        new Set(["session-finished", "gateway-settled", "executor-failed"]).has(event.type),
    )
  )
    throw new Error("Executor deadline trace does not match the frozen final-grader kill window")
  const startedMS = Date.parse(started.timestamp)
  const endedMS = Date.parse(z.iso.datetime().parse(input.endedAt))
  const durationMS = endedMS - startedMS
  if (Math.abs(durationMS - input.run.timeoutMinutes * 60_000) > 5_000)
    throw new Error("Executor deadline evidence is outside the frozen run timeout")
  if (!requests.length || requests.some((request, index) => request.sequence !== index))
    throw new Error("Executor deadline request manifest is empty or non-contiguous")
  const responses = proxy.filter((event) => event.type === "provider-response")
  if (
    responses.length !== requests.length ||
    new Set(responses.map((event) => event.sequence)).size !== requests.length ||
    responses.some((event) => event.status !== 200 || event.usageComplete !== true) ||
    proxy.some((event) => event.type === "proxy-error")
  )
    throw new Error("Executor deadline gateway requests are not completely usage-sealed")

  const expectedModels = new Set(requests.map((request) => `openai/${request.modelID}`))
  const spendRows = z.array(DeadlineSpendLog).parse(input.spendLogs).filter((row) => {
    const timestamp = Date.parse(row.startTime)
    return timestamp >= startedMS && timestamp <= endedMS && expectedModels.has(row.model)
  })
  if (spendRows.length !== requests.length) throw new Error("Executor deadline spend rows do not match request count")
  if (spendRows.some((row) => row.status !== "success"))
    throw new Error("Executor deadline spend rows are not all successful")
  const modelCounts = (models: readonly string[]) =>
    JSON.stringify(
      [...new Set(models)].sort().map((model) => [model, models.filter((candidate) => candidate === model).length]),
    )
  if (
    modelCounts(spendRows.map((row) => row.model)) !==
    modelCounts(requests.map((request) => `openai/${request.modelID}`))
  )
    throw new Error("Executor deadline spend model counts do not match the request manifest")
  const requestHashes = spendRows.map((row) => digest(row.request_id))
  if (new Set(requestHashes).size !== requestHashes.length)
    throw new Error("Executor deadline spend rows contain duplicate request IDs")
  const promptTokens = responses.reduce((sum, event) => sum + (event.promptTokens ?? 0), 0)
  const completionTokens = responses.reduce((sum, event) => sum + (event.completionTokens ?? 0), 0)
  if (
    spendRows.reduce((sum, row) => sum + row.prompt_tokens, 0) !== promptTokens ||
    spendRows.reduce((sum, row) => sum + row.completion_tokens, 0) !== completionTokens
  )
    throw new Error("Executor deadline spend usage does not match sealed gateway usage")
  const costUSD = Number(spendRows.reduce((sum, row) => sum + row.spend, 0).toFixed(7))
  const classification =
    costUSD > input.maxCostUSD
      ? ("excluded-charged-budget-overrun" as const)
      : ("excluded-charged-evaluation-failure" as const)
  const settlementPath = path.posix.join("gateway", input.run.id, "deadline-spend-settlement.json")
  const settlement =
    JSON.stringify(
      {
        schemaVersion: 1,
        source: "litellm-spend-logs",
        runID: input.run.id,
        window: { startedAt: started.timestamp, endedAt: input.endedAt },
        rows: spendRows
          .map((row) => ({
            requestIDHash: digest(row.request_id),
            model: row.model,
            promptTokens: row.prompt_tokens,
            completionTokens: row.completion_tokens,
            spendUSD: row.spend,
            startTime: row.startTime,
            endTime: row.endTime,
            status: row.status,
          }))
          .sort((left, right) => left.startTime.localeCompare(right.startTime)),
        totals: { requests: spendRows.length, promptTokens, completionTokens, costUSD },
      },
      null,
      2,
    ) + "\n"
  assertSecretFree(settlement)
  await writeImmutable(path.join(input.artifactRoot, settlementPath), settlement)
  const artifacts = [
    { path: rawPath, sha256: digest(raw) },
    { path: requestPath, sha256: digest(requestManifest) },
    { path: proxyPath, sha256: digest(proxyTrace) },
    { path: settlementPath, sha256: digest(settlement) },
  ]
  const receipt = parseExecutorFailureReceipt({
    schemaVersion: 1,
    protocol: protocol.version,
    classification,
    stage: "final-grader-executor-deadline",
    code: "executor-killed-at-frozen-deadline",
    runID: input.run.id,
    taskID: input.run.taskID,
    attempt: 1,
    startedAt: started.timestamp,
    recordedAt: (input.recordedAt ?? new Date()).toISOString(),
    error: {
      name: "ExecutorDeadlineError",
      message: "The parent process terminated the executor at the frozen deadline while the final grader was running",
    },
    gateway: {
      settlement: { attempted: true, completed: true },
      requests: requests.length,
      responses: responses.length,
      non200Responses: 0,
      proxyErrors: 0,
      usageCompleteResponses: responses.length,
      promptTokens,
      completionTokens,
      observedSpendDeltaUSD: costUSD,
    },
    acceptance: { trajectoryAccepted: false, ledgerRowWritten: false },
    artifacts,
    recordingErrors: [],
  })
  const content = JSON.stringify(receipt, null, 2) + "\n"
  assertSecretFree(content)
  await writeImmutable(receiptPath, content)
  return receiptPath
}

export async function reconcilePostSessionSpendSamplingFailure(input: {
  artifactRoot: string
  originalReceiptPath: string
  run: Run
  maxCostUSD: number
  recordedAt?: Date
}) {
  const receiptPath = path.join(input.artifactRoot, "failures", input.run.id, "reconciled-attempt-1.json")
  const existing = Bun.file(receiptPath)
  if (await existing.exists()) {
    const receipt = parseExecutorFailureReceipt(await existing.json())
    requireSettledExclusion(receipt, input.run, input.maxCostUSD)
    await Promise.all(receipt.artifacts.map((artifact) => verifyArtifact(input.artifactRoot, artifact)))
    return receiptPath
  }

  const originalContent = await readArtifact(
    input.artifactRoot,
    relativePath(input.artifactRoot, input.originalReceiptPath),
  )
  const original = parseExecutorFailureReceipt(JSON.parse(originalContent))
  if (
    original.protocol !== protocol.version ||
    original.classification !== "executor-failure" ||
    original.stage !== "gateway-settlement" ||
    original.code !== "executor-error" ||
    original.runID !== input.run.id ||
    original.taskID !== input.run.taskID ||
    original.attempt !== 1 ||
    original.error.name !== "TimeoutError" ||
    original.error.message !== "The operation timed out."
  )
    throw new Error("Original receipt is not the frozen post-session spend sampling failure")
  if (
    !original.gateway.settlement.completed ||
    original.gateway.requests === 0 ||
    original.gateway.responses !== original.gateway.requests ||
    original.gateway.non200Responses !== 0 ||
    original.gateway.proxyErrors !== 0 ||
    original.gateway.usageCompleteResponses !== original.gateway.responses ||
    original.gateway.observedSpendDeltaUSD === undefined ||
    original.gateway.observedSpendDeltaUSD > input.maxCostUSD ||
    original.gateway.captureErrors?.length ||
    original.recordingErrors.length
  )
    throw new Error("Post-session spend sampling recovery requires complete settled usage within budget")
  await Promise.all(original.artifacts.map((artifact) => verifyArtifact(input.artifactRoot, artifact)))
  const raw = original.artifacts.find((artifact) => artifact.path.startsWith("raw/") && artifact.path.endsWith(".jsonl"))
  if (!raw) throw new Error("Post-session spend sampling recovery is missing the executor trace")
  const events = (await readArtifact(input.artifactRoot, raw.path))
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => z.object({ type: z.string(), runID: z.string().optional(), attempt: z.number().optional() }).loose().parse(JSON.parse(line)))
  const started = events.find((event) => event.type === "executor-started")
  if (
    started?.runID !== input.run.id ||
    started.attempt !== 1 ||
    !events.some((event) => event.type === "grader-finished") ||
    !events.some((event) => event.type === "session-finished") ||
    !events.some((event) => event.type === "gateway-settled") ||
    !events.some((event) => event.type === "executor-failed")
  )
    throw new Error("Post-session spend sampling recovery trace is incomplete")

  const receipt = parseExecutorFailureReceipt({
    ...original,
    classification: "excluded-charged-evaluation-failure",
    stage: "post-session-spend-sampling-timeout",
    code: "settled-run-excluded-after-spend-sample-timeout",
    recordedAt: (input.recordedAt ?? new Date()).toISOString(),
    error: {
      name: "PostSessionSpendSamplingTimeout",
      message: "The settled run is excluded because final cumulative-spend sampling timed out before trajectory admission",
    },
    artifacts: [
      ...original.artifacts,
      {
        path: relativePath(input.artifactRoot, input.originalReceiptPath),
        sha256: digest(originalContent),
      },
    ],
  })
  const content = JSON.stringify(receipt, null, 2) + "\n"
  assertSecretFree(content)
  await writeFile(receiptPath, content, { encoding: "utf8", flag: "wx", mode: 0o600 })
  return receiptPath
}

export async function reconcileGraderSecretScannerFalsePositive(input: {
  artifactRoot: string
  originalReceiptPath: string
  run: Run
  maxCostUSD: number
  recordedAt?: Date
}) {
  const receiptPath = path.join(input.artifactRoot, "failures", input.run.id, "reconciled-attempt-1.json")
  const existing = Bun.file(receiptPath)
  if (await existing.exists()) {
    const receipt = parseExecutorFailureReceipt(await existing.json())
    requireSettledExclusion(receipt, input.run, input.maxCostUSD)
    await Promise.all(receipt.artifacts.map((artifact) => verifyArtifact(input.artifactRoot, artifact)))
    return receiptPath
  }

  const originalContent = await readArtifact(
    input.artifactRoot,
    relativePath(input.artifactRoot, input.originalReceiptPath),
  )
  const original = parseExecutorFailureReceipt(JSON.parse(originalContent))
  if (
    original.protocol !== protocol.version ||
    original.classification !== "executor-failure" ||
    original.stage !== "first-boundary-grader" ||
    original.code !== "executor-error" ||
    original.runID !== input.run.id ||
    original.taskID !== input.run.taskID ||
    original.attempt !== 1 ||
    original.error.name !== "Error" ||
    original.error.message !== "Artifact contains a possible secret"
  )
    throw new Error("Original receipt is not the observed grader secret scanner false positive")
  if (
    !original.gateway.settlement.completed ||
    original.gateway.requests === 0 ||
    original.gateway.responses !== original.gateway.requests ||
    original.gateway.non200Responses !== 0 ||
    original.gateway.proxyErrors !== 0 ||
    original.gateway.usageCompleteResponses !== original.gateway.responses ||
    original.gateway.observedSpendDeltaUSD === undefined ||
    original.gateway.observedSpendDeltaUSD > input.maxCostUSD ||
    original.gateway.captureErrors?.length ||
    original.recordingErrors.length
  )
    throw new Error("Grader scanner recovery requires complete settled usage within budget")
  await Promise.all(original.artifacts.map((artifact) => verifyArtifact(input.artifactRoot, artifact)))
  const raw = original.artifacts.find((artifact) => artifact.path.startsWith("raw/") && artifact.path.endsWith(".jsonl"))
  if (!raw) throw new Error("Grader scanner recovery is missing the executor trace")
  const events = (await readArtifact(input.artifactRoot, raw.path))
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => z.object({ type: z.string(), runID: z.string().optional(), attempt: z.number().optional() }).loose().parse(JSON.parse(line)))
  const started = events.find((event) => event.type === "executor-started")
  if (
    started?.runID !== input.run.id ||
    started.attempt !== 1 ||
    !events.some((event) => event.type === "test-patch-prepared") ||
    !events.some((event) => event.type === "boundary-captured") ||
    events.filter((event) => event.type === "patch-captured").length !== 2 ||
    !events.some((event) => event.type === "gateway-settled") ||
    !events.some((event) => event.type === "executor-failed") ||
    events.some((event) => new Set(["grader-finished", "session-finished"]).has(event.type))
  )
    throw new Error("Grader scanner recovery trace does not match the observed failure window")

  const receipt = parseExecutorFailureReceipt({
    ...original,
    classification: "excluded-charged-evaluation-failure",
    stage: "first-boundary-grader-secret-scanner-false-positive",
    code: "grader-output-excluded-after-secret-scanner-false-positive",
    recordedAt: (input.recordedAt ?? new Date()).toISOString(),
    error: {
      name: "GraderSecretScannerFalsePositive",
      message: "The charged run is excluded because OpenSSH security-key algorithm names triggered the artifact secret scanner before grader admission",
    },
    artifacts: [
      ...original.artifacts,
      {
        path: relativePath(input.artifactRoot, input.originalReceiptPath),
        sha256: digest(originalContent),
      },
    ],
  })
  const content = JSON.stringify(receipt, null, 2) + "\n"
  assertSecretFree(content)
  await writeFile(receiptPath, content, { encoding: "utf8", flag: "wx", mode: 0o600 })
  return receiptPath
}

const MisroutedGatewayRequest = z
  .object({
    sequence: z.number().int().nonnegative(),
    kind: z.enum(["worker", "controller"]),
    requestSHA256: z.string().regex(/^[a-f0-9]{64}$/),
    normalizedRequest: ArtifactReference,
  })
  .loose()

const MisroutedGatewayEvent = z
  .object({
    timestamp: z.iso.datetime(),
    type: z.string().min(1),
    sequence: z.number().int().nonnegative(),
    status: z.number().int().optional(),
    usageComplete: z.boolean().optional(),
    promptTokens: z.number().int().nonnegative().optional(),
    completionTokens: z.number().int().nonnegative().optional(),
    requestSHA256: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
    normalizedRequest: ArtifactReference.optional(),
    response: ArtifactReference.optional(),
  })
  .loose()

const BoundaryExclusionLedgerRow = z
  .object({
    timestamp: z.iso.datetime(),
    runID: z.string().regex(/^adr_[a-f0-9]{20}$/),
    category: z.literal("boundary"),
    disposition: z.enum(["excluded-charged-evaluation-failure", "excluded-charged-budget-overrun"]),
    amountUSD: z.number().nonnegative(),
    promptTokens: z.number().int().nonnegative(),
    completionTokens: z.number().int().nonnegative(),
  })
  .strict()

const BoundaryBudgetRow = z
  .object({
    runID: z.string().min(1),
    category: z.literal("boundary"),
    amountUSD: z.number().nonnegative(),
  })
  .loose()

export async function reconcileRetryGatewayNamespaceFailure(input: {
  artifactRoot: string
  run: Run
  originalReceiptPath: string
  spendSamples: readonly number[]
  recordedAt?: Date
}) {
  const receiptPath = path.join(input.artifactRoot, "failures", input.run.id, "reconciled-attempt-2.json")
  const existing = Bun.file(receiptPath)
  if (await existing.exists()) {
    const receipt = parseExecutorFailureReceipt(await existing.json())
    requireSettledExclusion(receipt, input.run, Number.POSITIVE_INFINITY)
    await Promise.all(receipt.artifacts.map((artifact) => verifyArtifact(input.artifactRoot, artifact)))
    return receiptPath
  }

  const originalContent = await readArtifact(
    input.artifactRoot,
    relativePath(input.artifactRoot, input.originalReceiptPath),
  )
  const original = parseExecutorFailureReceipt(JSON.parse(originalContent))
  requireMisroutedRetry(original, input.run)
  const namespace = path.join("gateway", input.run.id)
  const requestPath = path.join(namespace, "requests.jsonl")
  const tracePath = path.join(namespace, "proxy.jsonl")
  const [requestContent, traceContent] = await Promise.all([
    readArtifact(input.artifactRoot, requestPath),
    readArtifact(input.artifactRoot, tracePath),
  ])
  const requests = parseJSONL(requestContent, MisroutedGatewayRequest)
  const events = parseJSONL(traceContent, MisroutedGatewayEvent)
  const artifacts = await validateMisroutedGatewayArtifacts({
    artifactRoot: input.artifactRoot,
    runID: input.run.id,
    startedAt: original.startedAt,
    recordedAt: original.recordedAt,
    requests,
    events,
  })
  const samples = input.spendSamples.map((sample) => z.number().nonnegative().finite().parse(sample))
  if (samples.length < 4 || Math.max(...samples) - Math.min(...samples) > 0.0000001)
    throw new Error("Charged retry reconciliation requires four stable spend samples")
  const settledSpend = Math.max(...samples)
  const baselineSpend = original.gateway.baselineSpendUSD
  if (baselineSpend === undefined) throw new Error("Original retry receipt is missing its baseline spend")
  if (settledSpend < baselineSpend) throw new Error("Gateway spend moved backwards during retry reconciliation")
  const recordedAt = (input.recordedAt ?? new Date()).toISOString()
  const settlementPath = path.join("failures", input.run.id, "attempt-2-settlement.json")
  const settlementContent =
    JSON.stringify(
      {
        schemaVersion: 1,
        runID: input.run.id,
        attempt: 2,
        recordedAt,
        samplesUSD: samples,
        stable: true,
      },
      null,
      2,
    ) + "\n"
  assertSecretFree(settlementContent)
  await mkdir(path.dirname(path.join(input.artifactRoot, settlementPath)), { recursive: true })
  await writeFile(path.join(input.artifactRoot, settlementPath), settlementContent, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  })

  const responses = events.filter((event) => event.type === "provider-response")
  const proxyErrors = events.filter((event) => event.type === "proxy-error")
  const receipt = parseExecutorFailureReceipt({
    schemaVersion: 1,
    protocol: original.protocol,
    classification: "excluded-charged-evaluation-failure",
    stage: "gateway-artifact-namespace-mismatch",
    code: "retry-gateway-artifacts-written-under-base-run",
    runID: input.run.id,
    taskID: input.run.taskID,
    attempt: 2,
    startedAt: original.startedAt,
    recordedAt,
    error: {
      name: "GatewayArtifactNamespaceMismatch",
      message: "Retry gateway artifacts were written under the base run namespace and excluded from empirical results",
    },
    ...(original.sessionID ? { sessionID: original.sessionID } : {}),
    gateway: {
      settlement: { attempted: true, completed: true },
      requests: requests.length,
      responses: responses.length,
      non200Responses: responses.filter((event) => event.status !== 200).length,
      proxyErrors: proxyErrors.length,
      usageCompleteResponses: responses.filter((event) => event.status === 200 && event.usageComplete).length,
      promptTokens: responses.reduce((sum, event) => sum + (event.promptTokens ?? 0), 0),
      completionTokens: responses.reduce((sum, event) => sum + (event.completionTokens ?? 0), 0),
      baselineSpendUSD: baselineSpend,
      settledSpendUSD: settledSpend,
      observedSpendDeltaUSD: Number((settledSpend - baselineSpend).toFixed(7)),
    },
    acceptance: { trajectoryAccepted: false, ledgerRowWritten: false },
    artifacts: [
      { path: relativePath(input.artifactRoot, input.originalReceiptPath), sha256: digest(originalContent) },
      ...original.artifacts,
      { path: requestPath, sha256: digest(requestContent) },
      { path: tracePath, sha256: digest(traceContent) },
      ...artifacts,
      { path: settlementPath, sha256: digest(settlementContent) },
    ],
    recordingErrors: [],
  })
  const content = JSON.stringify(receipt, null, 2) + "\n"
  assertSecretFree(content)
  await writeFile(receiptPath, content, { encoding: "utf8", flag: "wx", mode: 0o600 })
  return receiptPath
}

export async function reconcileBoundaryBudgetOverrunFailure(input: {
  artifactRoot: string
  run: Run
  originalReceiptPath: string
  maxCostUSD: number
  spendSamples: readonly number[]
  recordedAt?: Date
}) {
  const receiptPath = path.join(input.artifactRoot, "failures", input.run.id, "reconciled-attempt-1.json")
  const existing = Bun.file(receiptPath)
  if (await existing.exists()) {
    const receipt = parseExecutorFailureReceipt(await existing.json())
    requireSettledExclusion(receipt, input.run, input.maxCostUSD)
    await Promise.all(receipt.artifacts.map((artifact) => verifyArtifact(input.artifactRoot, artifact)))
    return receiptPath
  }

  const originalContent = await readArtifact(
    input.artifactRoot,
    relativePath(input.artifactRoot, input.originalReceiptPath),
  )
  const original = parseExecutorFailureReceipt(JSON.parse(originalContent))
  requireBudgetOverrunSettlementFailure(original, input.run, input.maxCostUSD)
  await Promise.all(original.artifacts.map((artifact) => verifyArtifact(input.artifactRoot, artifact)))

  const requestPath = path.posix.join("gateway", input.run.id, "requests.jsonl")
  const tracePath = path.posix.join("gateway", input.run.id, "proxy.jsonl")
  const [requestContent, traceContent] = await Promise.all([
    readArtifact(input.artifactRoot, requestPath),
    readArtifact(input.artifactRoot, tracePath),
  ])
  const requests = parseJSONL(requestContent, MisroutedGatewayRequest)
  const events = parseJSONL(traceContent, MisroutedGatewayEvent)
  const artifacts = await validateBudgetOverrunGatewayArtifacts({
    artifactRoot: input.artifactRoot,
    runID: input.run.id,
    startedAt: original.startedAt,
    recordedAt: original.recordedAt,
    requests,
    events,
    receipt: original.gateway,
  })
  const samples = input.spendSamples.map((sample) => z.number().nonnegative().finite().parse(sample))
  if (samples.length < 4 || Math.max(...samples) - Math.min(...samples) > 0.0000001)
    throw new Error("Budget-overrun reconciliation requires four stable spend samples")
  const settledSpend = Math.max(...samples)
  if (
    original.gateway.settledSpendUSD === undefined ||
    Math.abs(settledSpend - original.gateway.settledSpendUSD) > 0.0000001
  )
    throw new Error("Budget-overrun settlement does not match the original spend observation")
  const baselineSpend = original.gateway.baselineSpendUSD
  if (baselineSpend === undefined || settledSpend < baselineSpend)
    throw new Error("Budget-overrun receipt has invalid spend provenance")
  const observedSpend = Number((settledSpend - baselineSpend).toFixed(7))
  if (observedSpend !== original.gateway.observedSpendDeltaUSD || observedSpend <= input.maxCostUSD)
    throw new Error("Budget-overrun spend does not exceed the frozen per-run ceiling")

  const recordedAt = (input.recordedAt ?? new Date()).toISOString()
  const settlementPath = path.posix.join("failures", input.run.id, "attempt-1-settlement.json")
  const settlementContent =
    JSON.stringify(
      {
        schemaVersion: 1,
        runID: input.run.id,
        attempt: 1,
        recordedAt,
        samplesUSD: samples,
        stable: true,
      },
      null,
      2,
    ) + "\n"
  assertSecretFree(settlementContent)
  await writeImmutable(path.join(input.artifactRoot, settlementPath), settlementContent)

  const receipt = parseExecutorFailureReceipt({
    ...original,
    classification: "excluded-charged-budget-overrun",
    stage: "gateway-settlement-budget-overrun",
    code: "gateway-spend-exceeded-frozen-per-run-ceiling",
    recordedAt,
    error: {
      name: "BudgetExceeded",
      message: `Gateway spend exceeded the frozen per-run ceiling: $${observedSpend} > $${input.maxCostUSD}`,
    },
    gateway: {
      ...original.gateway,
      settlement: { attempted: true, completed: true },
      settledSpendUSD: settledSpend,
      observedSpendDeltaUSD: observedSpend,
    },
    artifacts: [
      {
        path: relativePath(input.artifactRoot, input.originalReceiptPath),
        sha256: digest(originalContent),
      },
      ...original.artifacts,
      ...artifacts,
      { path: settlementPath, sha256: digest(settlementContent) },
    ],
  })
  const content = JSON.stringify(receipt, null, 2) + "\n"
  assertSecretFree(content)
  await writeImmutable(receiptPath, content)
  return receiptPath
}

function requireBudgetOverrunSettlementFailure(
  receipt: ReturnType<typeof parseExecutorFailureReceipt>,
  run: Run,
  maxCostUSD: number,
) {
  if (
    receipt.protocol !== protocol.version ||
    receipt.classification !== "executor-failure" ||
    receipt.stage !== "gateway-settlement" ||
    receipt.code !== "executor-error" ||
    receipt.runID !== run.id ||
    receipt.taskID !== run.taskID ||
    receipt.attempt !== 1 ||
    receipt.error.message !== "Gateway requests did not settle before the frozen deadline"
  )
    throw new Error("Original receipt is not the frozen settlement false negative")
  if (
    receipt.gateway.settlement.completed ||
    receipt.gateway.requests === 0 ||
    receipt.gateway.responses !== receipt.gateway.requests ||
    receipt.gateway.non200Responses !== 0 ||
    receipt.gateway.usageCompleteResponses !== receipt.gateway.responses ||
    receipt.gateway.proxyErrors === 0 ||
    receipt.gateway.observedSpendDeltaUSD === undefined ||
    receipt.gateway.observedSpendDeltaUSD <= maxCostUSD ||
    receipt.gateway.captureErrors?.length ||
    receipt.recordingErrors.length
  )
    throw new Error("Settlement false negative does not contain a complete charged budget overrun")
}

async function validateBudgetOverrunGatewayArtifacts(input: {
  artifactRoot: string
  runID: string
  startedAt: string
  recordedAt: string
  requests: z.infer<typeof MisroutedGatewayRequest>[]
  events: z.infer<typeof MisroutedGatewayEvent>[]
  receipt: ReturnType<typeof parseExecutorFailureReceipt>["gateway"]
}) {
  if (!input.requests.length || !gatewayRequestsSettled(input.events, input.requests.length))
    throw new Error("Budget-overrun gateway requests are not settled")
  const startedAt = Date.parse(input.startedAt)
  const recordedAt = Date.parse(input.recordedAt)
  if (input.events.some((event) => Date.parse(event.timestamp) < startedAt || Date.parse(event.timestamp) > recordedAt))
    throw new Error("Budget-overrun gateway event falls outside the failed attempt")
  const providerRequests = input.events.filter((event) => event.type === "provider-request")
  const responses = input.events.filter((event) => event.type === "provider-response")
  const extraErrors = input.events.filter(
    (event) => event.type === "proxy-error" && event.sequence >= input.requests.length,
  )
  if (
    providerRequests.length !== input.requests.length ||
    responses.length !== input.requests.length ||
    extraErrors.length !== input.receipt.proxyErrors ||
    input.events.some((event) => event.type === "proxy-error" && event.sequence < input.requests.length)
  )
    throw new Error("Budget-overrun gateway trace does not match the sealed request manifest")

  const artifacts = await Promise.all(
    input.requests.map(async (request, index) => {
      if (request.sequence !== index) throw new Error("Budget-overrun gateway request sequence is not contiguous")
      const traced = providerRequests.find((event) => event.sequence === request.sequence)
      if (
        !traced ||
        traced.requestSHA256 !== request.requestSHA256 ||
        traced.normalizedRequest?.path !== request.normalizedRequest.path
      )
        throw new Error("Budget-overrun gateway request trace does not match its manifest")
      const expectedRequestPath = path.posix.join(
        "gateway",
        input.runID,
        "requests",
        `${String(request.sequence).padStart(4, "0")}.json`,
      )
      if (
        request.normalizedRequest.path !== expectedRequestPath ||
        request.normalizedRequest.sha256 !== request.requestSHA256
      )
        throw new Error("Budget-overrun gateway request artifact uses an unexpected namespace")
      await verifyArtifact(input.artifactRoot, request.normalizedRequest)
      const response = responses.find((event) => event.sequence === request.sequence)
      if (!response || response.status !== 200 || response.usageComplete !== true)
        throw new Error("Budget-overrun gateway response is not successful with complete usage")
      const raw = input.events.find(
        (event) => event.type === "provider-raw-response" && event.sequence === request.sequence,
      )
      const expectedResponsePath = path.posix.join(
        "gateway",
        input.runID,
        "responses",
        `${String(request.sequence).padStart(4, "0")}.txt`,
      )
      if (!raw?.response || raw.status !== 200 || raw.response.path !== expectedResponsePath)
        throw new Error("Budget-overrun gateway response artifact uses an unexpected namespace")
      await verifyArtifact(input.artifactRoot, raw.response)
      return [request.normalizedRequest, raw.response]
    }),
  )
  const promptTokens = responses.reduce((sum, event) => sum + (event.promptTokens ?? 0), 0)
  const completionTokens = responses.reduce((sum, event) => sum + (event.completionTokens ?? 0), 0)
  if (promptTokens !== input.receipt.promptTokens || completionTokens !== input.receipt.completionTokens)
    throw new Error("Budget-overrun gateway usage does not match the failure receipt")
  return artifacts.flat()
}

export async function settleBoundaryExclusion(input: {
  artifactRoot: string
  ledgerPath: string
  receiptPath: string
  run: Run
  maxCostUSD: number
}) {
  const receiptContent = await readArtifact(input.artifactRoot, relativePath(input.artifactRoot, input.receiptPath))
  const receipt = parseExecutorFailureReceipt(JSON.parse(receiptContent))
  requireSettledExclusion(receipt, input.run, input.maxCostUSD)
  await Promise.all(receipt.artifacts.map((artifact) => verifyArtifact(input.artifactRoot, artifact)))

  const exclusion = BoundaryExclusion.parse({
    schemaVersion: 1,
    protocol: receipt.protocol,
    classification: receipt.classification,
    runID: receipt.runID,
    taskID: receipt.taskID,
    attempt: receipt.attempt,
    recordedAt: receipt.recordedAt,
    costUSD: receipt.gateway.observedSpendDeltaUSD,
    promptTokens: receipt.gateway.promptTokens,
    completionTokens: receipt.gateway.completionTokens,
    requests: receipt.gateway.requests,
    failureReceipt: {
      path: relativePath(input.artifactRoot, input.receiptPath),
      sha256: digest(receiptContent),
    },
    acceptance: { trajectoryAccepted: false, trajectoryLedgerRowWritten: false },
  })
  const content = JSON.stringify(exclusion, null, 2) + "\n"
  assertSecretFree(content)
  await requireLedgerBudget(input.ledgerPath, exclusion)
  const exclusionPath = path.join(input.artifactRoot, "boundary", "exclusions", `${input.run.id}.json`)
  await mkdir(path.dirname(exclusionPath), { recursive: true })
  const created = await Promise.allSettled([
    writeFile(exclusionPath, content, { encoding: "utf8", flag: "wx", mode: 0o600 }),
  ])
  if (created[0].status === "rejected") {
    if (errorCode(created[0].reason) !== "EEXIST") throw created[0].reason
    const existing = BoundaryExclusion.parse(await Bun.file(exclusionPath).json())
    if (JSON.stringify(existing) !== JSON.stringify(exclusion))
      throw new Error(`${input.run.id} has a conflicting boundary exclusion settlement`)
  }

  await reconcileLedger(input.ledgerPath, exclusion)
  return exclusion
}

export async function loadBoundaryExclusions(artifactRoot: string) {
  const directory = path.join(artifactRoot, "boundary", "exclusions")
  const listed = await Promise.allSettled([readdir(directory)])
  if (listed[0].status === "rejected") {
    if (errorCode(listed[0].reason) === "ENOENT") return []
    throw listed[0].reason
  }
  const exclusions = await Promise.all(
    listed[0].value
      .filter((file) => file.endsWith(".json"))
      .sort()
      .map(async (file) => BoundaryExclusion.parse(await Bun.file(path.join(directory, file)).json())),
  )
  await Promise.all(exclusions.map((exclusion) => verifyArtifact(artifactRoot, exclusion.failureReceipt)))
  return exclusions
}

export async function settlePendingBoundaryExclusions(input: {
  artifactRoot: string
  ledgerPath: string
  runs: readonly Run[]
  accepted: ReadonlySet<string>
  maxCostUSD: number
}) {
  const settled = await loadBoundaryExclusions(input.artifactRoot)
  const completed = new Set([...input.accepted, ...settled.map((exclusion) => exclusion.runID)])
  for (const run of input.runs.filter((candidate) => !completed.has(candidate.id))) {
    const receiptPath = await findPendingBoundaryExclusionReceipt(input.artifactRoot, run.id)
    if (!receiptPath) continue
    settled.push(
      await settleBoundaryExclusion({
        artifactRoot: input.artifactRoot,
        ledgerPath: input.ledgerPath,
        receiptPath,
        run,
        maxCostUSD: input.maxCostUSD,
      }),
    )
    completed.add(run.id)
  }
  return settled.sort((left, right) => left.runID.localeCompare(right.runID))
}

async function findPendingBoundaryExclusionReceipt(artifactRoot: string, runID: string) {
  const candidates = [
    "reconciled-attempt-2.json",
    "attempt-2.json",
    "reconciled-attempt-1.json",
    "attempt-1.json",
  ].map((file) => path.join(artifactRoot, "failures", runID, file))
  const receipts = await Promise.all(
    candidates.map(async (receiptPath) => {
      const file = Bun.file(receiptPath)
      if (!(await file.exists())) return
      return { receiptPath, receipt: parseExecutorFailureReceipt(await file.json()) }
    }),
  )
  return receipts.find(
    (candidate) =>
      candidate &&
      new Set(["excluded-charged-evaluation-failure", "excluded-charged-budget-overrun"]).has(
        candidate.receipt.classification,
      ),
  )?.receiptPath
}

function requireSettledExclusion(
  receipt: ReturnType<typeof parseExecutorFailureReceipt>,
  run: Run,
  maxCostUSD: number,
) {
  if (receipt.protocol !== protocol.version) throw new Error("Failure receipt protocol does not match the frozen run")
  if (
    !new Set(["excluded-charged-evaluation-failure", "excluded-charged-budget-overrun"]).has(receipt.classification) ||
    receipt.runID !== run.id ||
    receipt.taskID !== run.taskID
  )
    throw new Error("Failure receipt does not match the frozen boundary run")
  const terminalsComplete =
    receipt.classification === "excluded-charged-budget-overrun"
      ? receipt.gateway.responses === receipt.gateway.requests
      : receipt.gateway.responses + receipt.gateway.proxyErrors === receipt.gateway.requests
  if (
    !receipt.gateway.settlement.completed ||
    receipt.gateway.requests === 0 ||
    !terminalsComplete ||
    receipt.gateway.usageCompleteResponses !== receipt.gateway.responses ||
    receipt.gateway.non200Responses !== 0 ||
    receipt.gateway.captureErrors?.length ||
    receipt.recordingErrors.length
  )
    throw new Error("Charged boundary exclusions require complete settled usage")
  if (receipt.gateway.observedSpendDeltaUSD === undefined)
    throw new Error("Charged boundary exclusions require a settled cost observation")
  if (
    receipt.classification === "excluded-charged-evaluation-failure" &&
    receipt.gateway.observedSpendDeltaUSD > maxCostUSD
  )
    throw new Error(
      `${run.id} cost $${receipt.gateway.observedSpendDeltaUSD} exceeds its preregistered $${maxCostUSD} ceiling`,
    )
  if (
    receipt.classification === "excluded-charged-budget-overrun" &&
    receipt.gateway.observedSpendDeltaUSD <= maxCostUSD
  )
    throw new Error("Charged budget-overrun exclusions must exceed the frozen per-run ceiling")
}

function requireMisroutedRetry(receipt: ReturnType<typeof parseExecutorFailureReceipt>, run: Run) {
  if (
    receipt.protocol !== protocol.version ||
    receipt.classification !== "executor-failure" ||
    receipt.runID !== run.id ||
    receipt.taskID !== run.taskID ||
    receipt.attempt !== 2
  )
    throw new Error("Original receipt does not identify the frozen failed retry")
  if (
    receipt.gateway.requests !== 0 ||
    receipt.gateway.responses !== 0 ||
    receipt.gateway.proxyErrors !== 0 ||
    receipt.gateway.baselineSpendUSD === undefined ||
    receipt.recordingErrors.length
  )
    throw new Error("Original failed retry receipt is not a gateway namespace mismatch")
}

async function validateMisroutedGatewayArtifacts(input: {
  artifactRoot: string
  runID: string
  startedAt: string
  recordedAt: string
  requests: z.infer<typeof MisroutedGatewayRequest>[]
  events: z.infer<typeof MisroutedGatewayEvent>[]
}) {
  if (!input.requests.length) throw new Error("Misrouted gateway namespace contains no provider requests")
  const startedAt = Date.parse(input.startedAt)
  const recordedAt = Date.parse(input.recordedAt)
  if (input.events.some((event) => Date.parse(event.timestamp) < startedAt || Date.parse(event.timestamp) > recordedAt))
    throw new Error("Misrouted gateway event falls outside the retry window")
  const providerRequests = input.events.filter((event) => event.type === "provider-request")
  if (providerRequests.length !== input.requests.length)
    throw new Error("Misrouted gateway manifest and trace request counts differ")
  const terminals = input.events.filter((event) => event.type === "provider-response" || event.type === "proxy-error")
  if (
    terminals.length !== input.requests.length ||
    new Set(terminals.map((event) => event.sequence)).size !== terminals.length
  )
    throw new Error("Misrouted gateway requests do not each have one terminal event")

  return (
    await Promise.all(
      input.requests.map(async (request, index) => {
        if (request.sequence !== index) throw new Error("Misrouted gateway request sequence is not contiguous")
        const traced = providerRequests.find((event) => event.sequence === request.sequence)
        if (
          !traced ||
          traced.requestSHA256 !== request.requestSHA256 ||
          traced.normalizedRequest?.path !== request.normalizedRequest.path
        )
          throw new Error("Misrouted gateway request trace does not match its manifest")
        const expectedRequestPath = path.posix.join(
          "gateway",
          input.runID,
          "requests",
          `${String(request.sequence).padStart(4, "0")}.json`,
        )
        if (
          request.normalizedRequest.path !== expectedRequestPath ||
          request.normalizedRequest.sha256 !== request.requestSHA256
        )
          throw new Error("Misrouted gateway request artifact uses an unexpected namespace")
        await verifyArtifact(input.artifactRoot, request.normalizedRequest)
        const terminal = terminals.find((event) => event.sequence === request.sequence)!
        if (terminal.type === "proxy-error") return [request.normalizedRequest]
        if (terminal.status !== 200 || terminal.usageComplete !== true)
          throw new Error("Misrouted gateway response is not successful with complete usage")
        const raw = input.events.find(
          (event) => event.type === "provider-raw-response" && event.sequence === request.sequence,
        )
        if (!raw?.response) throw new Error("Misrouted gateway response artifact is missing")
        const expectedResponsePath = path.posix.join(
          "gateway",
          input.runID,
          "responses",
          `${String(request.sequence).padStart(4, "0")}.txt`,
        )
        if (raw.status !== 200 || raw.response.path !== expectedResponsePath)
          throw new Error("Misrouted gateway response artifact uses an unexpected namespace")
        await verifyArtifact(input.artifactRoot, raw.response)
        return [request.normalizedRequest, raw.response]
      }),
    )
  ).flat()
}

async function reconcileLedger(ledgerPath: string, exclusion: BoundaryExclusion) {
  const row = BoundaryExclusionLedgerRow.parse({
    timestamp: exclusion.recordedAt,
    runID: exclusion.runID,
    category: "boundary",
    disposition: exclusion.classification,
    amountUSD: exclusion.costUSD,
    promptTokens: exclusion.promptTokens,
    completionTokens: exclusion.completionTokens,
  })
  const file = Bun.file(ledgerPath)
  const existing = (await file.exists())
    ? (await file.text())
        .split("\n")
        .filter((line) => line.trim())
        .map((line) => z.record(z.string(), z.unknown()).parse(JSON.parse(line)))
        .filter((entry) => entry.runID === exclusion.runID)
    : []
  if (existing.length > 1) throw new Error(`${exclusion.runID} has duplicate boundary ledger rows`)
  if (existing.length === 1) {
    if (JSON.stringify(BoundaryExclusionLedgerRow.parse(existing[0])) !== JSON.stringify(row))
      throw new Error(`${exclusion.runID} has a conflicting boundary ledger row`)
    return
  }
  await requireLedgerBudget(ledgerPath, exclusion)
  await mkdir(path.dirname(ledgerPath), { recursive: true })
  await appendFile(ledgerPath, JSON.stringify(row) + "\n", { encoding: "utf8", flag: "a", mode: 0o600 })
}

async function requireLedgerBudget(ledgerPath: string, exclusion: BoundaryExclusion) {
  const file = Bun.file(ledgerPath)
  const rows = (await file.exists())
    ? (await file.text())
        .split("\n")
        .filter((line) => line.trim())
        .map((line) => BoundaryBudgetRow.parse(JSON.parse(line)))
    : []
  const matches = rows.filter((row) => row.runID === exclusion.runID)
  if (matches.length > 1) throw new Error(`${exclusion.runID} has duplicate boundary ledger rows`)
  summarizeBudget([
    ...rows.map((row) => ({ category: row.category, amountUSD: row.amountUSD })),
    ...(matches.length ? [] : [{ category: "boundary" as const, amountUSD: exclusion.costUSD }]),
  ])
}

async function verifyArtifact(artifactRoot: string, artifact: z.infer<typeof ArtifactReference>) {
  const content = await readArtifact(artifactRoot, artifact.path)
  if (digest(content) !== artifact.sha256) throw new Error(`${artifact.path} artifact hash mismatch`)
}

async function readArtifact(artifactRoot: string, relative: string) {
  const artifact = ArtifactReference.shape.path.parse(relative)
  const file = Bun.file(path.join(artifactRoot, artifact))
  if (!(await file.exists())) throw new Error(`Artifact is missing: ${artifact}`)
  const content = await file.text()
  assertSecretFree(content)
  return content
}

function parseJSONL<T extends z.ZodType>(content: string, schema: T) {
  return content
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => schema.parse(JSON.parse(line)))
}

function relativePath(artifactRoot: string, target: string) {
  const relative = path.relative(artifactRoot, target)
  return ArtifactReference.shape.path.parse(relative.split(path.sep).join("/"))
}

function digest(content: string) {
  return new Bun.CryptoHasher("sha256").update(content).digest("hex")
}

function errorCode(error: unknown) {
  if (!error || typeof error !== "object" || !("code" in error)) return undefined
  return error.code
}

async function writeImmutable(target: string, content: string) {
  await mkdir(path.dirname(target), { recursive: true })
  const written = await Promise.allSettled([writeFile(target, content, { encoding: "utf8", flag: "wx", mode: 0o600 })])
  if (written[0].status === "fulfilled") return
  if (errorCode(written[0].reason) !== "EEXIST") throw written[0].reason
  if ((await Bun.file(target).text()) !== content) throw new Error(`${target} already exists with different content`)
}
