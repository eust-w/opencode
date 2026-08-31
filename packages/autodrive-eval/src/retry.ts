import path from "node:path"
import { assertSecretFree } from "./artifact"
import { parseExecutorFailureReceipt } from "./host-executor"
import { protocol, type Run } from "./protocol"

const retryableInfrastructureFailures = new Set([
  "setup\0Gateway proxy did not become ready",
  "startup-baseline\0Task image has tracked startup changes",
])

export async function admitInfrastructureRetry(input: { artifactRoot: string; ledgerPath: string; run: Run }) {
  const receiptPath = path.join(input.artifactRoot, "failures", input.run.id, "attempt-1.json")
  const attemptTwo = Bun.file(path.join(input.artifactRoot, "failures", input.run.id, "attempt-2.json"))
  if (await attemptTwo.exists()) throw new Error(`${input.run.id} already consumed its infrastructure retry`)

  const receiptContent = await readArtifact(receiptPath)
  const receipt = parseExecutorFailureReceipt(JSON.parse(receiptContent))
  if (
    receipt.protocol !== protocol.version ||
    receipt.classification !== "executor-failure" ||
    receipt.code !== "executor-error" ||
    receipt.runID !== input.run.id ||
    receipt.taskID !== input.run.taskID ||
    receipt.attempt !== 1 ||
    !retryableInfrastructureFailures.has(`${receipt.stage}\0${receipt.error.message}`)
  )
    throw new Error("Failure receipt is not a predefined zero-cost infrastructure failure")
  if (
    receipt.gateway.settlement.attempted ||
    !receipt.gateway.settlement.completed ||
    receipt.gateway.requests !== 0 ||
    receipt.gateway.responses !== 0 ||
    receipt.gateway.non200Responses !== 0 ||
    receipt.gateway.proxyErrors !== 0 ||
    receipt.gateway.usageCompleteResponses !== 0 ||
    receipt.gateway.promptTokens !== 0 ||
    receipt.gateway.completionTokens !== 0 ||
    (receipt.gateway.observedSpendDeltaUSD ?? 0) !== 0 ||
    receipt.gateway.captureErrors?.length ||
    receipt.recordingErrors.length
  )
    throw new Error("Infrastructure retries require complete zero-cost failure evidence")

  const ledger = Bun.file(input.ledgerPath)
  if (
    (await ledger.exists()) &&
    (await ledger.text())
      .split("\n")
      .filter((line) => line.trim())
      .some((line) => {
        const entry: unknown = JSON.parse(line)
        return !!entry && typeof entry === "object" && "runID" in entry && entry.runID === input.run.id
      })
  )
    throw new Error(`${input.run.id} already has an experiment ledger row`)

  await Promise.all(
    receipt.artifacts.map(async (artifact) => {
      const content = await readArtifact(path.join(input.artifactRoot, artifact.path))
      if (digest(content) !== artifact.sha256) throw new Error(`${artifact.path} artifact hash mismatch`)
    }),
  )
  return 2 as const
}

export const admitBoundaryInfrastructureRetry = admitInfrastructureRetry

async function readArtifact(target: string) {
  const file = Bun.file(target)
  if (!(await file.exists())) throw new Error(`Artifact is missing: ${path.basename(target)}`)
  const content = await file.text()
  assertSecretFree(content)
  return content
}

function digest(content: string) {
  return new Bun.CryptoHasher("sha256").update(content).digest("hex")
}
