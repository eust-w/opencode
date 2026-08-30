import { appendFile, mkdir, readdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { z } from "zod"
import { ArtifactReference, assertSecretFree } from "./artifact"
import { parseExecutorFailureReceipt } from "./host-executor"
import { protocol, type Run } from "./protocol"

export const BoundaryExclusion = z
  .object({
    schemaVersion: z.literal(1),
    protocol: z.string().min(1),
    classification: z.literal("excluded-charged-evaluation-failure"),
    runID: z.string().regex(/^adr_[a-f0-9]{20}$/),
    taskID: z.string().min(1),
    attempt: z.literal(1),
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

const BoundaryExclusionLedgerRow = z
  .object({
    timestamp: z.iso.datetime(),
    runID: z.string().regex(/^adr_[a-f0-9]{20}$/),
    category: z.literal("boundary"),
    disposition: z.literal("excluded-charged-evaluation-failure"),
    amountUSD: z.number().nonnegative(),
    promptTokens: z.number().int().nonnegative(),
    completionTokens: z.number().int().nonnegative(),
  })
  .strict()

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
  const exclusionPath = path.join(input.artifactRoot, "boundary", "exclusions", `${input.run.id}.json`)
  await mkdir(path.dirname(exclusionPath), { recursive: true })
  const created = await Promise.allSettled([writeFile(exclusionPath, content, { encoding: "utf8", flag: "wx", mode: 0o600 })])
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
    const receiptPath = path.join(input.artifactRoot, "failures", run.id, "attempt-1.json")
    const file = Bun.file(receiptPath)
    if (!(await file.exists())) continue
    const receipt = parseExecutorFailureReceipt(await file.json())
    if (receipt.classification !== "excluded-charged-evaluation-failure") continue
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

function requireSettledExclusion(
  receipt: ReturnType<typeof parseExecutorFailureReceipt>,
  run: Run,
  maxCostUSD: number,
) {
  if (receipt.protocol !== protocol.version) throw new Error("Failure receipt protocol does not match the frozen run")
  if (
    receipt.classification !== "excluded-charged-evaluation-failure" ||
    receipt.runID !== run.id ||
    receipt.taskID !== run.taskID ||
    receipt.attempt !== 1
  )
    throw new Error("Failure receipt does not match the frozen boundary run")
  if (
    !receipt.gateway.settlement.completed ||
    receipt.gateway.requests === 0 ||
    receipt.gateway.responses !== receipt.gateway.requests ||
    receipt.gateway.usageCompleteResponses !== receipt.gateway.requests ||
    receipt.gateway.non200Responses !== 0 ||
    receipt.gateway.proxyErrors !== 0 ||
    receipt.gateway.captureErrors?.length ||
    receipt.recordingErrors.length
  )
    throw new Error("Charged boundary exclusions require complete settled usage")
  if (receipt.gateway.observedSpendDeltaUSD === undefined)
    throw new Error("Charged boundary exclusions require a settled cost observation")
  if (receipt.gateway.observedSpendDeltaUSD > maxCostUSD)
    throw new Error(`${run.id} cost $${receipt.gateway.observedSpendDeltaUSD} exceeds its preregistered $${maxCostUSD} ceiling`)
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
        .map((line) => JSON.parse(line) as Record<string, unknown>)
        .filter((entry) => entry.runID === exclusion.runID)
    : []
  if (existing.length > 1) throw new Error(`${exclusion.runID} has duplicate boundary ledger rows`)
  if (existing.length === 1) {
    if (JSON.stringify(BoundaryExclusionLedgerRow.parse(existing[0])) !== JSON.stringify(row))
      throw new Error(`${exclusion.runID} has a conflicting boundary ledger row`)
    return
  }
  await mkdir(path.dirname(ledgerPath), { recursive: true })
  await appendFile(ledgerPath, JSON.stringify(row) + "\n", { encoding: "utf8", flag: "a", mode: 0o600 })
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
