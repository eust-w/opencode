import { appendFile } from "node:fs/promises"
import { z } from "zod"
import { assertSecretFree } from "./artifact"
import { caps } from "./budget"

const Entry = z
  .object({
    runID: z.string().min(1),
    category: z.literal("boundary"),
    amountUSD: z.number().nonnegative(),
    promptTokens: z.number().int().nonnegative().optional(),
    completionTokens: z.number().int().nonnegative().optional(),
  })
  .loose()

export function assertBoundaryResearchReservation(content: string, reservationUSD: number, fixedCostUSD = 0) {
  if (!Number.isFinite(reservationUSD) || reservationUSD <= 0) throw new Error("Research reservation must be positive")
  if (!Number.isFinite(fixedCostUSD) || fixedCostUSD < 0) throw new Error("Fixed boundary cost must be nonnegative")
  assertSecretFree(content)
  const spent = content
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => Entry.parse(JSON.parse(line)))
    .reduce((sum, entry) => sum + entry.amountUSD, 0)
  if (fixedCostUSD + spent + reservationUSD > caps.boundary)
    throw new Error(`Boundary research reservation would exceed $${caps.boundary}`)
  return spent
}

export async function admitBoundaryResearchCost(
  ledgerPath: string,
  runID: string,
  input: { amountUSD: number; promptTokens: number; completionTokens: number },
  timestamp = new Date().toISOString(),
  fixedCostUSD = 0,
) {
  const file = Bun.file(ledgerPath)
  const content = (await file.exists()) ? await file.text() : ""
  const existing = content
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => Entry.parse(JSON.parse(line)))
    .find((entry) => entry.runID === runID)
  if (existing) {
    if (
      existing.amountUSD !== input.amountUSD ||
      existing.promptTokens !== input.promptTokens ||
      existing.completionTokens !== input.completionTokens
    )
      throw new Error(`Boundary research ledger entry conflicts: ${runID}`)
    return existing
  }
  assertBoundaryResearchReservation(content, input.amountUSD, fixedCostUSD)
  const entry = Entry.parse({ timestamp, runID, category: "boundary", ...input })
  const serialized = JSON.stringify(entry)
  assertSecretFree(serialized)
  await appendFile(ledgerPath, serialized + "\n", { encoding: "utf8", flag: "a", mode: 0o600 })
  return entry
}
