import { exactMcNemar, holm, pairedBootstrap } from "./statistics"
import { protocol, type Run, type Strategy } from "./protocol"

export interface FormalRecord {
  readonly runID: string
  readonly taskID: string
  readonly model: string
  readonly strategy: Strategy
  readonly repeat: number
  readonly resolved: boolean
  readonly fixRate: number
  readonly firstBoundaryResolved: boolean
  readonly firstBoundaryFixRate: number
  readonly manualContinuationCount: number
  readonly redundantTurns: number
  readonly promptTokens: number
  readonly completionTokens: number
  readonly costUSD: number
  readonly latencyMS: number
}

export function analyzeFormalMatrix(
  input: readonly FormalRecord[],
  plan: readonly Run[],
  options: { bootstrapIterations?: number; bootstrapSeed?: number } = {},
) {
  if (plan.length !== 384 || input.length !== 384) throw new Error("Formal analysis requires exactly 384 rows")
  if (new Set(input.map((record) => record.runID)).size !== input.length)
    throw new Error("Formal analysis contains duplicate run IDs")
  const planned = new Map(plan.map((run) => [run.id, run]))
  input.forEach((record) => {
    const run = planned.get(record.runID)
    if (
      !run ||
      run.taskID !== record.taskID ||
      run.model !== record.model ||
      run.strategy !== record.strategy ||
      run.repeat !== record.repeat
    )
      throw new Error(`Formal row does not match the frozen plan: ${record.runID}`)
  })

  const primary = input.filter((record) => record.model === protocol.models.primary)
  const replication = input.filter((record) => record.model !== protocol.models.primary)
  if (primary.length !== 288 || replication.length !== 96)
    throw new Error("Formal matrix model strata are incomplete")
  const repeatZero = primary.filter((record) => record.repeat === 0)
  const policy = Object.fromEntries(
    protocol.strategies.map((strategy) => [strategy, summarize(repeatZero.filter((record) => record.strategy === strategy))]),
  ) as Record<Strategy, ReturnType<typeof summarize>>
  const baselines = ["oracle", "blind", "regex"] as const
  const raw = baselines.map((strategy, index) =>
    compare(
      repeatZero.filter((record) => record.strategy === strategy),
      repeatZero.filter((record) => record.strategy === "supervisor"),
      {
        iterations: options.bootstrapIterations,
        seed: (options.bootstrapSeed ?? 20_260_830) + index,
      },
    ),
  )
  const adjusted = holm(raw.map((comparison) => comparison.pValue))
  const comparisons = Object.fromEntries(
    baselines.map((strategy, index) => [strategy, { ...raw[index]!, adjustedPValue: adjusted[index]! }]),
  ) as Record<(typeof baselines)[number], ReturnType<typeof compare> & { adjustedPValue: number }>
  const replications = Object.fromEntries(
    protocol.models.replication.map((model) => [
      model,
      protocol.strategies.map((strategy) => ({
        strategy,
        ...summarize(replication.filter((record) => record.model === model && record.strategy === strategy)),
      })),
    ]),
  ) as Record<(typeof protocol.models.replication)[number], Array<{ strategy: Strategy } & ReturnType<typeof summarize>>>
  const off = repeatZero.filter((record) => record.strategy === "supervisor")

  return {
    matrix: { trajectories: input.length, primary: primary.length, replication: replication.length },
    primary: {
      repeatZero: policy,
      repeats: summarize(primary.filter((record) => record.repeat > 0)),
    },
    comparisons,
    replications,
    off: {
      trajectories: off.length,
      resolved: off.filter((record) => record.firstBoundaryResolved).length,
      resolvedRate: mean(off.map((record) => Number(record.firstBoundaryResolved))),
      meanFixRate: mean(off.map((record) => record.firstBoundaryFixRate)),
    },
  }
}

function compare(
  baseline: readonly FormalRecord[],
  supervisor: readonly FormalRecord[],
  bootstrap: { iterations?: number; seed: number },
) {
  if (baseline.length !== 48 || supervisor.length !== 48)
    throw new Error("Primary policy comparisons require 48 paired tasks")
  const treatment = new Map(supervisor.map((record) => [record.taskID, record]))
  const pairs = baseline.map((record) => {
    const matched = treatment.get(record.taskID)
    if (!matched) throw new Error(`Supervisor pair is missing for ${record.taskID}`)
    return [record, matched] as const
  })
  const baselineOnly = pairs.filter(([left, right]) => left.resolved && !right.resolved).length
  const supervisorOnly = pairs.filter(([left, right]) => !left.resolved && right.resolved).length
  const interval = (metric: (record: FormalRecord) => number) =>
    pairedBootstrap(
      pairs.map(([record]) => metric(record)),
      pairs.map(([, record]) => metric(record)),
      { iterations: bootstrap.iterations, seed: bootstrap.seed },
    )
  return {
    baselineOnly,
    supervisorOnly,
    pValue: exactMcNemar({ baselineOnly, treatmentOnly: supervisorOnly }),
    resolvedDifference: interval((record) => Number(record.resolved)),
    fixRateDifference: interval((record) => record.fixRate),
    manualContinuationDifference: interval((record) => record.manualContinuationCount),
    redundantTurnDifference: interval((record) => record.redundantTurns),
    tokenDifference: interval((record) => record.promptTokens + record.completionTokens),
    costDifference: interval((record) => record.costUSD),
    latencyDifferenceMS: interval((record) => record.latencyMS),
  }
}

function summarize(records: readonly FormalRecord[]) {
  if (!records.length) throw new Error("Formal policy stratum is empty")
  return {
    trajectories: records.length,
    resolved: records.filter((record) => record.resolved).length,
    resolvedRate: mean(records.map((record) => Number(record.resolved))),
    meanFixRate: mean(records.map((record) => record.fixRate)),
    meanManualContinuations: mean(records.map((record) => record.manualContinuationCount)),
    meanRedundantTurns: mean(records.map((record) => record.redundantTurns)),
    meanTokens: mean(records.map((record) => record.promptTokens + record.completionTokens)),
    totalCostUSD: records.reduce((sum, record) => sum + record.costUSD, 0),
    meanLatencyMS: mean(records.map((record) => record.latencyMS)),
  }
}

function mean(values: readonly number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length
}
