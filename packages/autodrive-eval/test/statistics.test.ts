import { describe, expect, test } from "bun:test"
import { cohenKappa, exactMcNemar, holm, macroF1, pairedBootstrap } from "../src/statistics"

describe("preregistered statistics", () => {
  test("computes the exact two-sided McNemar test", () => {
    expect(exactMcNemar({ baselineOnly: 0, treatmentOnly: 5 })).toBeCloseTo(0.0625, 10)
    expect(exactMcNemar({ baselineOnly: 1, treatmentOnly: 3 })).toBeCloseTo(0.625, 10)
    expect(exactMcNemar({ baselineOnly: 0, treatmentOnly: 0 })).toBe(1)
  })

  test("computes deterministic task-level paired bootstrap intervals", () => {
    const result = pairedBootstrap([0, 0, 1, 1], [0, 1, 1, 1], { iterations: 2_000, seed: 7 })
    expect(result.estimate).toBe(0.25)
    expect(result.lower).toBeGreaterThanOrEqual(0)
    expect(result.upper).toBeLessThanOrEqual(0.75)
    expect(result.samples).toBe(2_000)
  })

  test("applies monotone Holm correction", () => {
    expect(holm([0.01, 0.04, 0.03])).toEqual([0.03, 0.06, 0.06])
  })

  test("scores tri-state boundary labels", () => {
    const expected = ["continue", "stop", "defer", "continue"] as const
    expect(cohenKappa(expected, expected)).toBe(1)
    expect(macroF1(expected, ["continue", "stop", "stop", "defer"])).toBeCloseTo(0.4444444444, 8)
  })
})
