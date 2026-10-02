import { expect, test } from "bun:test"
import { renderPaperResults } from "../src/paper-results"

function fixture() {
  const strategy = (resolvedRate: number) => ({
    trajectories: 48,
    resolved: resolvedRate * 48,
    resolvedRate,
    meanFixRate: 0.5,
  })
  const interval = (estimate: number) => ({ estimate, lower: estimate - 0.1, upper: estimate + 0.1, samples: 10_000 })
  const classification = {
    examples: 126,
    macroF1: 0.8,
    stopUnsafeContinuationRate: 0.1,
    deferUnsafeContinuationRate: 0.05,
  }
  return {
    frequency: {
      plannedSourceTrajectories: 96,
      labeledFirstBoundaries: 80,
      missingSourceTrajectories: 16,
      counts: { continue: 20, stop: 30, defer: 30 },
      prematureHandoffRate: 0.25,
    },
    formal: {
      matrix: { trajectories: 384, primary: 288, replication: 96 },
      outcomeDefinition: { resolved: "completed-and-test-resolved", fixRate: "raw-final-grader-fraction" },
      primary: {
        repeatZero: { oracle: strategy(0.5), blind: strategy(0.25), regex: strategy(0.25), supervisor: strategy(0.5) },
      },
      off: { trajectories: 48, resolved: 6, resolvedRate: 0.125, meanFixRate: 0.2 },
      comparisons: {
        off: { resolvedDifference: interval(0.375), adjustedPValue: 0.02 },
        regex: {
          resolvedDifference: interval(0.25),
          manualContinuationDifference: interval(0),
          costDifference: interval(0.2),
          latencyDifferenceMS: interval(1500),
        },
      },
    },
    ablation: {
      examples: 126,
      variants: {
        regex: classification,
        "supervisor-only": classification,
        goal: classification,
        summary: classification,
        memory: classification,
      },
    },
    summary: { strategies: { supervisor: { ...strategy(0.5), recoveryRate: 1 } } },
  }
}

test("reports the paired off-prefix effect with uncertainty and labeled denominator", () => {
  const output = renderPaperResults(fixture())
  expect(output).toContain("\\newcommand{\\PrematureFrequency}{25.0\\%}")
  expect(output).toContain("\\newcommand{\\PrematureLabeledCount}{80}")
  expect(output).toContain("\\newcommand{\\PrematureSourceCount}{96}")
  expect(output).toContain("\\newcommand{\\SupervisorDelta}{+37.50 pp}")
  expect(output).toContain("\\newcommand{\\SupervisorDeltaCI}{[+27.50, +47.50] pp}")
  expect(output).toContain("\\newcommand{\\RegexDelta}{+25.00 pp}")
  expect(output).toContain("\\newcommand{\\OffFixRate}{0.200}")
  expect(output).toContain("\\newcommand{\\RegexFixRate}{0.500}")
  expect(output).toContain("\\newcommand{\\RecoveryRate}{\\textsc{Pending}}")
  expect(output).toContain("\\newcommand{\\ManualReduction}{\\textsc{Pending}}")
  expect(output).not.toContain("\\textsc{Complete}")
})

test("rejects incomplete matrices, missing variants, inconsistent denominators and invalid rates", () => {
  const partial = fixture()
  partial.formal.matrix.trajectories = 383
  expect(() => renderPaperResults(partial)).toThrow()
  const stratum = fixture()
  stratum.formal.primary.repeatZero.regex.trajectories = 47
  expect(() => renderPaperResults(stratum)).toThrow()
  const ablation = fixture()
  ablation.ablation.variants.regex.examples = 125
  expect(() => renderPaperResults(ablation)).toThrow()
  expect(() =>
    renderPaperResults({ ...fixture(), ablation: { variants: { memory: fixture().ablation.variants.memory } } }),
  ).toThrow()
  const frequency = fixture()
  frequency.frequency.missingSourceTrajectories = 0
  expect(() => renderPaperResults(frequency)).toThrow()
  const rate = fixture()
  rate.formal.primary.repeatZero.supervisor.resolvedRate = 2
  expect(() => renderPaperResults(rate)).toThrow()
  const interval = fixture()
  interval.formal.comparisons.off.resolvedDifference.lower = 1
  expect(() => renderPaperResults(interval)).toThrow()
  const mismatch = fixture()
  mismatch.formal.comparisons.off.resolvedDifference.estimate = 0.25
  expect(() => renderPaperResults(mismatch)).toThrow()
  const samples = fixture()
  samples.formal.comparisons.off.resolvedDifference.samples = 1
  expect(() => renderPaperResults(samples)).toThrow()
  const endpoint = fixture()
  endpoint.formal.outcomeDefinition.resolved = "raw-test-resolved"
  expect(() => renderPaperResults(endpoint)).toThrow()
})
