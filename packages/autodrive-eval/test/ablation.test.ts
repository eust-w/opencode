import { describe, expect, test } from "bun:test"
import { analyzeBoundaryAblations, buildAblationPrompt, type AblationVariant } from "../src/ablation"

const candidate = {
  id: "boundary-1",
  baseTrajectoryID: "trajectory-1",
  taskID: "task-1",
  boundaryIndex: 0,
  initialGoal: "Fix and test the parser",
  workerOutput: "I inspected parser.ts.",
  trajectorySummary: "Read parser.ts; no tests run.",
  patch: "",
  continuationCount: 0,
  memory: "Avoid the previous parsing approach.",
}

describe("boundary component ablations", () => {
  test("adds frozen context cumulatively without changing decision rules", () => {
    const only = buildAblationPrompt(candidate, "supervisor-only")
    const goal = buildAblationPrompt(candidate, "goal")
    const summary = buildAblationPrompt(candidate, "summary")
    const memory = buildAblationPrompt(candidate, "memory")
    expect(only).toContain("WorkerLastOutput")
    expect(only).not.toContain("Fix and test the parser")
    expect(goal).toContain("Fix and test the parser")
    expect(goal).not.toContain("no tests run")
    expect(summary).toContain("no tests run")
    expect(summary).not.toContain("previous parsing approach")
    expect(memory).toContain("previous parsing approach")
    expect([only, goal, summary, memory].every((prompt) => prompt.includes('"action": "continue"'))).toBeTrue()
  })

  test("requires one prediction per variant and frozen test boundary", () => {
    const labels = ["continue", "stop", "defer"] as const
    const gold = Array.from({ length: 126 }, (_, index) => ({
      ...candidate,
      id: `boundary-${index}`,
      baseTrajectoryID: `trajectory-${index}`,
      label: labels[index % labels.length],
    }))
    const variants: AblationVariant[] = ["regex", "supervisor-only", "goal", "summary", "memory"]
    const predictions = variants.flatMap((variant) =>
      gold.map((item) => ({ boundaryID: item.id, variant, label: item.label })),
    )
    const analysis = analyzeBoundaryAblations(gold, predictions)
    expect(analysis.examples).toBe(126)
    expect(analysis.variants.memory).toMatchObject({ macroF1: 1, stopUnsafeContinuationRate: 0 })
    expect(() => analyzeBoundaryAblations(gold, predictions.slice(1))).toThrow("complete")
  })
})
