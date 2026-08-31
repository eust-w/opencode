import { describe, expect, test } from "bun:test"
import { mkdtemp } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { admitBoundaryResearchCost, assertBoundaryResearchReservation } from "../src/research-budget"

describe("boundary research campaign accounting", () => {
  test("reserves against the shared USD 102 category cap", () => {
    const ledger = `${JSON.stringify({ runID: "source", category: "boundary", amountUSD: 90 })}\n`
    expect(assertBoundaryResearchReservation(ledger, 12)).toBe(90)
    expect(() => assertBoundaryResearchReservation(ledger, 12.01)).toThrow("$102")
    expect(() => assertBoundaryResearchReservation(ledger, 11.5, 0.51)).toThrow("$102")
  })

  test("admits one idempotent campaign row", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "autodrive-research-budget-"))
    const ledger = path.join(directory, "ledger.jsonl")
    await Bun.write(ledger, `${JSON.stringify({ runID: "source", category: "boundary", amountUSD: 10 })}\n`)
    const entry = { amountUSD: 1.25, promptTokens: 100, completionTokens: 20 }
    await admitBoundaryResearchCost(ledger, "annotation:model-a", entry, "2026-08-31T00:00:00.000Z")
    await admitBoundaryResearchCost(ledger, "annotation:model-a", entry, "2026-08-31T00:00:00.000Z")
    expect((await Bun.file(ledger).text()).trim().split("\n")).toHaveLength(2)
    expect(() =>
      admitBoundaryResearchCost(ledger, "annotation:model-a", { ...entry, amountUSD: 2 }, "2026-08-31T00:00:00.000Z"),
    ).toThrow("conflicts")
  })
})
