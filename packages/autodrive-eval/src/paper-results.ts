import { z } from "zod"

const Rate = z.number().min(0).max(1)
const RateSummary = z
  .object({
    trajectories: z.literal(48),
    resolved: z.number().int().min(0).max(48),
    resolvedRate: Rate,
    meanFixRate: Rate,
  })
  .loose()
  .refine(
    (value) => Math.abs(value.resolvedRate - value.resolved / value.trajectories) < 1e-12,
    "Resolved count and rate disagree",
  )
const Interval = z
  .object({ estimate: z.number(), lower: z.number(), upper: z.number(), samples: z.literal(10_000) })
  .loose()
  .refine((value) => value.lower <= value.upper, "Confidence interval limits are reversed")
const Difference = Interval.refine(
  (value) => [value.estimate, value.lower, value.upper].every((number) => number >= -1 && number <= 1),
  "Rate differences must lie in [-1, 1]",
)
const Classification = z
  .object({
    examples: z.literal(126),
    macroF1: Rate,
    stopUnsafeContinuationRate: Rate,
    deferUnsafeContinuationRate: Rate,
  })
  .loose()

export function renderPaperResults(input: unknown) {
  const parsed = z
    .object({
      frequency: z
        .object({
          plannedSourceTrajectories: z.number().int().positive(),
          labeledFirstBoundaries: z.number().int().positive(),
          missingSourceTrajectories: z.number().int().nonnegative(),
          counts: z.object({
            continue: z.number().int().nonnegative(),
            stop: z.number().int().nonnegative(),
            defer: z.number().int().nonnegative(),
          }),
          prematureHandoffRate: Rate,
        })
        .refine(
          (value) =>
            value.labeledFirstBoundaries + value.missingSourceTrajectories === value.plannedSourceTrajectories &&
            Object.values(value.counts).reduce((sum, count) => sum + count, 0) === value.labeledFirstBoundaries &&
            Math.abs(value.prematureHandoffRate - value.counts.continue / value.labeledFirstBoundaries) < 1e-12,
          "Frequency counts and denominators disagree",
        ),
      formal: z.object({
        matrix: z.object({ trajectories: z.literal(384), primary: z.literal(288), replication: z.literal(96) }),
        outcomeDefinition: z.object({
          resolved: z.literal("completed-and-test-resolved"),
          fixRate: z.literal("raw-final-grader-fraction"),
        }),
        off: RateSummary,
        primary: z.object({
          repeatZero: z.object({
            oracle: RateSummary,
            blind: RateSummary,
            regex: RateSummary,
            supervisor: RateSummary,
          }),
        }),
        comparisons: z.object({
          off: z.object({ resolvedDifference: Difference, adjustedPValue: Rate }),
          regex: z.object({
            resolvedDifference: Difference,
            costDifference: Interval,
            latencyDifferenceMS: Interval,
          }),
        }),
      }),
      ablation: z.object({
        examples: z.literal(126),
        variants: z.object({
          regex: Classification,
          "supervisor-only": Classification,
          goal: Classification,
          summary: Classification,
          memory: Classification,
        }),
      }),
    })
    .parse(input)
  for (const baseline of ["off", "regex"] as const) {
    const rate =
      baseline === "off" ? parsed.formal.off.resolvedRate : parsed.formal.primary.repeatZero.regex.resolvedRate
    if (
      Math.abs(
        parsed.formal.comparisons[baseline].resolvedDifference.estimate -
          (parsed.formal.primary.repeatZero.supervisor.resolvedRate - rate),
      ) > 1e-12
    )
      throw new Error(`Paper ${baseline} effect disagrees with policy outcome rates`)
  }
  const macros = {
    ResultStatus: "\\textsc{Measured outcomes available}",
    PrematureFrequency: percent(parsed.frequency.prematureHandoffRate),
    PrematureLabeledCount: String(parsed.frequency.labeledFirstBoundaries),
    PrematureSourceCount: String(parsed.frequency.plannedSourceTrajectories),
    PrematureMissingCount: String(parsed.frequency.missingSourceTrajectories),
    OffResolved: percent(parsed.formal.off.resolvedRate),
    OffFixRate: parsed.formal.off.meanFixRate.toFixed(3),
    OracleResolved: percent(parsed.formal.primary.repeatZero.oracle.resolvedRate),
    OracleFixRate: parsed.formal.primary.repeatZero.oracle.meanFixRate.toFixed(3),
    BlindResolved: percent(parsed.formal.primary.repeatZero.blind.resolvedRate),
    BlindFixRate: parsed.formal.primary.repeatZero.blind.meanFixRate.toFixed(3),
    RegexResolved: percent(parsed.formal.primary.repeatZero.regex.resolvedRate),
    RegexFixRate: parsed.formal.primary.repeatZero.regex.meanFixRate.toFixed(3),
    SupervisorResolved: percent(parsed.formal.primary.repeatZero.supervisor.resolvedRate),
    SupervisorDelta: points(parsed.formal.comparisons.off.resolvedDifference.estimate),
    SupervisorDeltaCI: intervalPoints(parsed.formal.comparisons.off.resolvedDifference),
    SupervisorAdjustedP: parsed.formal.comparisons.off.adjustedPValue.toPrecision(3),
    RegexDelta: points(parsed.formal.comparisons.regex.resolvedDifference.estimate),
    RegexDeltaCI: intervalPoints(parsed.formal.comparisons.regex.resolvedDifference),
    SupervisorFixRate: parsed.formal.primary.repeatZero.supervisor.meanFixRate.toFixed(3),
    // Ordinary trajectory counters do not establish a measured manual study or fault-recovery experiment.
    ManualReduction: "\\textsc{Pending}",
    BoundaryMacroFOne: parsed.ablation.variants.memory.macroF1.toFixed(3),
    StopUnsafeRate: percent(parsed.ablation.variants.memory.stopUnsafeContinuationRate),
    DeferUnsafeRate: percent(parsed.ablation.variants.memory.deferUnsafeContinuationRate),
    CostDelta: signed(parsed.formal.comparisons.regex.costDifference.estimate, " USD"),
    LatencyDelta: signed(parsed.formal.comparisons.regex.latencyDifferenceMS.estimate / 1000, " s"),
    RecoveryRate: "\\textsc{Pending}",
  }
  return (
    "% Generated from structurally validated summaries; artifact hashes and provenance require separate audit.\n" +
    Object.entries(macros)
      .map(([name, value]) => `\\newcommand{\\${name}}{${value}}`)
      .join("\n") +
    "\n"
  )
}

function intervalPoints(value: { lower: number; upper: number }) {
  return `[${signed(value.lower * 100, "")}, ${signed(value.upper * 100, "")}] pp`
}

function percent(value: number) {
  return `${(value * 100).toFixed(1)}\\%`
}

function points(value: number) {
  return signed(value * 100, " pp")
}

function signed(value: number, suffix: string) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}${suffix}`
}
