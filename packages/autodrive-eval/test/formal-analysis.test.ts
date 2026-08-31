import { describe, expect, test } from "bun:test"
import manifest from "../../../research/auto-drive/protocol/swe-evo-48.json"
import { analyzeFormalMatrix } from "../src/formal-analysis"
import { createRunPlan, parseManifest, protocol } from "../src/protocol"

describe("formal matrix analysis", () => {
  test("validates all 384 paired rows and applies preregistered policy statistics", () => {
    const plan = createRunPlan(parseManifest(manifest))
    const records = plan.map((run, index) => {
      const primaryTask = plan
        .filter((candidate) => candidate.model === protocol.models.primary && candidate.repeat === 0)
        .findIndex((candidate) => candidate.id === run.id)
      const taskIndex = primaryTask < 0 ? index : Math.floor(primaryTask / 4)
      const resolved =
        run.model === protocol.models.primary && run.repeat === 0
          ? run.strategy === "supervisor"
            ? taskIndex < 10
            : run.strategy === "regex"
              ? taskIndex < 5
              : false
          : false
      return {
        runID: run.id,
        taskID: run.taskID,
        model: run.model,
        strategy: run.strategy,
        repeat: run.repeat,
        resolved,
        fixRate: Number(resolved),
        firstBoundaryResolved: false,
        firstBoundaryFixRate: 0,
        manualContinuationCount: 0,
        redundantTurns: run.strategy === "supervisor" ? 1 : 0,
        promptTokens: 100,
        completionTokens: 10,
        costUSD: run.strategy === "supervisor" ? 0.2 : 0.1,
        latencyMS: run.strategy === "supervisor" ? 2_000 : 1_000,
      }
    })

    const analysis = analyzeFormalMatrix(records, plan, { bootstrapIterations: 1_000, bootstrapSeed: 7 })
    expect(analysis.matrix).toEqual({ trajectories: 384, primary: 288, replication: 96 })
    expect(analysis.primary.repeatZero.supervisor).toMatchObject({ trajectories: 48, resolved: 10 })
    expect(analysis.primary.repeatZero.regex).toMatchObject({ trajectories: 48, resolved: 5 })
    expect(analysis.comparisons.regex).toMatchObject({ baselineOnly: 0, supervisorOnly: 5 })
    expect(analysis.comparisons.regex.pValue).toBeCloseTo(0.0625)
    expect(analysis.comparisons.regex.adjustedPValue).toBeGreaterThanOrEqual(analysis.comparisons.regex.pValue)
    expect(analysis.replications[protocol.models.replication[0]]).toHaveLength(4)
    expect(analysis.off).toMatchObject({ trajectories: 48, resolved: 0 })
  })

  test("rejects partial, duplicate, or off-plan matrices", () => {
    const plan = createRunPlan(parseManifest(manifest))
    expect(() => analyzeFormalMatrix([], plan)).toThrow("384")
    const record = {
      runID: plan[0].id,
      taskID: plan[0].taskID,
      model: plan[0].model,
      strategy: plan[0].strategy,
      repeat: plan[0].repeat,
      resolved: false,
      fixRate: 0,
      firstBoundaryResolved: false,
      firstBoundaryFixRate: 0,
      manualContinuationCount: 0,
      redundantTurns: 0,
      promptTokens: 0,
      completionTokens: 0,
      costUSD: 0,
      latencyMS: 0,
    }
    expect(() => analyzeFormalMatrix(Array.from({ length: 384 }, () => record), plan)).toThrow("duplicate")
  })
})
