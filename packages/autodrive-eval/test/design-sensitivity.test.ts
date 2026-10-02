import { describe, expect, test } from "bun:test"
import {
  binomialProbabilities,
  designSensitivity,
  exactMcNemarPower,
  zeroEventUpperBound,
} from "../src/design-sensitivity"

describe("offline exact design sensitivity", () => {
  test("binomial enumeration has unit mass and handles degenerate probabilities", () => {
    expect(binomialProbabilities(2, 0.25)).toEqual([0.5625, 0.375, 0.0625])
    expect(binomialProbabilities(2, 0)).toEqual([1, 0, 0])
    expect(binomialProbabilities(2, 1)).toEqual([0, 0, 1])
    expect(binomialProbabilities(512, 0.99).reduce((sum, value) => sum + value, 0)).toBeCloseTo(1, 12)
    for (const n of [0, 48, 96, 192]) {
      for (const p of [0, 0.1, 0.25, 0.5, 0.65, 0.75, 0.85, 1]) {
        expect(binomialProbabilities(n, p).reduce((sum, value) => sum + value, 0)).toBeCloseTo(1, 12)
      }
    }
  })

  test("six discordances reject only at either extreme at alpha .05", () => {
    // Exact two-sided McNemar p = 2 / 2^6 = .03125 at 0:6 or 6:0.
    // Any D <= 5 cannot reject at .05, so unconditional rejection needs D = 6.
    expect(exactMcNemarPower({ n: 6, discordance: 1, winProbability: 0.75, alpha: 0.05 }).power).toBeCloseTo(
      0.75 ** 6 + 0.25 ** 6,
      14,
    )
    expect(exactMcNemarPower({ n: 6, discordance: 0.5, winProbability: 0.75, alpha: 0.05 }).power).toBeCloseTo(
      0.5 ** 6 * (0.75 ** 6 + 0.25 ** 6),
      14,
    )
    expect(exactMcNemarPower({ n: 6, discordance: 1, winProbability: 0.75, alpha: 0.0125 }).power).toBe(0)
  })

  test("no discordance never rejects and exchanging treatment and baseline preserves power", () => {
    expect(exactMcNemarPower({ n: 48, discordance: 0, winProbability: 0.85, alpha: 0.05 }).power).toBe(0)
    expect(exactMcNemarPower({ n: 0, discordance: 0.5, winProbability: 0.85, alpha: 0.05 }).power).toBe(0)
    expect(exactMcNemarPower({ n: 48, discordance: 0.25, winProbability: 0.75, alpha: 0.05 }).power).toBeCloseTo(
      exactMcNemarPower({ n: 48, discordance: 0.25, winProbability: 0.25, alpha: 0.05 }).power,
      12,
    )
  })

  test("hypothetical grid is exhaustive and null rejection remains at most nominal alpha", () => {
    const report = designSensitivity()
    expect(report.kind).toBe("hypothetical-design-sensitivity-not-empirical-results")
    expect(report.rows).toHaveLength(72)
    for (const row of report.rows) {
      expect(row.power).toBeGreaterThanOrEqual(0)
      expect(row.power).toBeLessThanOrEqual(1)
      expect(row.probabilityMass).toBeCloseTo(1, 11)
      expect(row.expectedDifference).toBeCloseTo(row.discordance * (2 * row.winProbability - 1), 12)
      if (row.winProbability === 0.5) expect(row.power).toBeLessThanOrEqual(row.alpha + 1e-12)
      if (row.alpha === 0.0125) {
        const unadjusted = report.rows.find(
          (other) =>
            other.n === row.n &&
            other.discordance === row.discordance &&
            other.winProbability === row.winProbability &&
            other.alpha === 0.05,
        )!
        expect(row.power).toBeLessThanOrEqual(unadjusted.power)
      }
    }
  })

  test("zero-event upper bound solves the exact one-sided binomial tail", () => {
    expect(zeroEventUpperBound(1, 0.05)).toBeCloseTo(0.95, 14)
    for (const n of [42, 126]) {
      expect((1 - zeroEventUpperBound(n, 0.05)) ** n).toBeCloseTo(0.05, 13)
    }
    expect(zeroEventUpperBound(126, 0.05)).toBeLessThan(zeroEventUpperBound(42, 0.05))
  })

  test("invalid counts, probabilities, or significance levels fail closed", () => {
    for (const n of [-1, 1.5, 513, NaN]) expect(() => binomialProbabilities(n, 0.5)).toThrow()
    for (const p of [-0.1, 1.1, NaN]) expect(() => binomialProbabilities(6, p)).toThrow()
    for (const alpha of [0, 1, NaN]) {
      expect(() => exactMcNemarPower({ n: 6, discordance: 0.5, winProbability: 0.75, alpha })).toThrow()
      expect(() => zeroEventUpperBound(42, alpha)).toThrow()
    }
    expect(() => zeroEventUpperBound(0, 0.05)).toThrow()
  })
})
