import { describe, expect, test } from "bun:test"
import { BudgetExceeded, canRetry, summarizeBudget } from "../src/budget"

describe("budget and rerun policy", () => {
  test("enforces category caps and the 800 dollar hard limit", () => {
    const ledger = [
      { category: "pilot" as const, amountUSD: 50 },
      { category: "primary" as const, amountUSD: 360 },
      { category: "cross-model" as const, amountUSD: 288 },
      { category: "boundary" as const, amountUSD: 102 },
    ]
    expect(summarizeBudget(ledger)).toEqual({
      categories: { pilot: 50, primary: 360, "cross-model": 288, boundary: 102 },
      totalUSD: 800,
      remainingUSD: 0,
    })
    expect(() => summarizeBudget([...ledger, { category: "pilot", amountUSD: 0.01 }])).toThrow(BudgetExceeded)
  })

  test("allows one rerun only for a predefined infrastructure failure", () => {
    expect(canRetry({ failure: "infrastructure", attempt: 1 })).toBe(true)
    expect(canRetry({ failure: "infrastructure", attempt: 2 })).toBe(false)
    expect(canRetry({ failure: "model-timeout", attempt: 1 })).toBe(false)
    expect(canRetry({ failure: "loop", attempt: 1 })).toBe(false)
    expect(canRetry({ failure: "budget-exhausted", attempt: 1 })).toBe(false)
    expect(canRetry({ failure: "retryable-provider", attempt: 1 })).toBe(false)
  })
})
