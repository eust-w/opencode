import { expect, test } from "bun:test"
import { renderPaperResults } from "../src/paper-results"

test("renders complete paper macros only from frozen result objects", () => {
  const strategy = (resolvedRate: number) => ({ resolvedRate, meanFixRate: 0.5, recoveryRate: 1 })
  const interval = (estimate: number) => ({ estimate, lower: estimate - 0.1, upper: estimate + 0.1, samples: 10_000 })
  const output = renderPaperResults({
    frequency: { prematureHandoffRate: 0.25 },
    formal: {
      primary: {
        repeatZero: {
          oracle: strategy(0.5),
          blind: strategy(0.4),
          regex: strategy(0.3),
          supervisor: strategy(0.6),
        },
      },
      comparisons: {
        regex: {
          resolvedDifference: interval(0.3),
          manualContinuationDifference: interval(-0.5),
          costDifference: interval(0.2),
          latencyDifferenceMS: interval(1500),
        },
      },
    },
    ablation: {
      variants: {
        memory: { macroF1: 0.8, stopUnsafeContinuationRate: 0.1, deferUnsafeContinuationRate: 0.05 },
      },
    },
    summary: { strategies: { supervisor: strategy(0.6) } },
  })
  expect(output).toContain("\\newcommand{\\PrematureFrequency}{25.0\\%}")
  expect(output).toContain("\\newcommand{\\BoundaryMacroFOne}{0.800}")
  expect(output).toContain("\\newcommand{\\SupervisorDelta}{+30.00 pp}")
  expect(output).toContain("\\newcommand{\\RecoveryRate}{100.0\\%}")
  expect(output).not.toContain("Pending")
})
