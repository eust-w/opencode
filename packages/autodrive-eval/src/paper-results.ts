import { z } from "zod"

const RateSummary = z.object({ resolvedRate: z.number(), meanFixRate: z.number(), recoveryRate: z.number().optional() }).loose()
const Interval = z.object({ estimate: z.number(), lower: z.number(), upper: z.number(), samples: z.number() }).loose()

export function renderPaperResults(input: unknown) {
  const parsed = z
    .object({
      frequency: z.object({ prematureHandoffRate: z.number().min(0).max(1) }),
      formal: z.object({
        primary: z.object({
          repeatZero: z.object({
            oracle: RateSummary,
            blind: RateSummary,
            regex: RateSummary,
            supervisor: RateSummary,
          }),
        }),
        comparisons: z.object({
          regex: z.object({
            resolvedDifference: Interval,
            manualContinuationDifference: Interval,
            costDifference: Interval,
            latencyDifferenceMS: Interval,
          }),
        }),
      }),
      ablation: z.object({
        variants: z.object({
          memory: z.object({
            macroF1: z.number().min(0).max(1),
            stopUnsafeContinuationRate: z.number().min(0).max(1),
            deferUnsafeContinuationRate: z.number().min(0).max(1),
          }),
        }),
      }),
      summary: z.object({ strategies: z.object({ supervisor: RateSummary }) }),
    })
    .parse(input)
  const macros = {
    ResultStatus: "\\textsc{Complete}",
    PrematureFrequency: percent(parsed.frequency.prematureHandoffRate),
    OracleResolved: percent(parsed.formal.primary.repeatZero.oracle.resolvedRate),
    BlindResolved: percent(parsed.formal.primary.repeatZero.blind.resolvedRate),
    RegexResolved: percent(parsed.formal.primary.repeatZero.regex.resolvedRate),
    SupervisorResolved: percent(parsed.formal.primary.repeatZero.supervisor.resolvedRate),
    SupervisorDelta: points(parsed.formal.comparisons.regex.resolvedDifference.estimate),
    SupervisorFixRate: parsed.formal.primary.repeatZero.supervisor.meanFixRate.toFixed(3),
    ManualReduction: signed(-parsed.formal.comparisons.regex.manualContinuationDifference.estimate, " turns"),
    BoundaryMacroFOne: parsed.ablation.variants.memory.macroF1.toFixed(3),
    StopUnsafeRate: percent(parsed.ablation.variants.memory.stopUnsafeContinuationRate),
    DeferUnsafeRate: percent(parsed.ablation.variants.memory.deferUnsafeContinuationRate),
    CostDelta: signed(parsed.formal.comparisons.regex.costDifference.estimate, " USD"),
    LatencyDelta: signed(parsed.formal.comparisons.regex.latencyDifferenceMS.estimate / 1000, " s"),
    RecoveryRate: percent(parsed.summary.strategies.supervisor.recoveryRate ?? 0),
  }
  return (
    "% Generated only after all frozen result gates pass.\n" +
    Object.entries(macros)
      .map(([name, value]) => `\\newcommand{\\${name}}{${value}}`)
      .join("\n") +
    "\n"
  )
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
