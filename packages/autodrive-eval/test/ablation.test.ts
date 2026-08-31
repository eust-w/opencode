import { describe, expect, test } from "bun:test"
import path from "node:path"
import {
  analyzeBoundaryAblations,
  buildAblationPrompt,
  buildAblationRequest,
  createAblationPrediction,
  parseAblationResponse,
  type AblationVariant,
} from "../src/ablation"

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
  test("ships a bounded, append-only ablation executor", async () => {
    const script = await Bun.file(path.join(import.meta.dir, "../scripts/ablation-runner.ts")).text()
    expect(script).toContain('scope: "ablation"')
    expect(script).toContain("AUTODRIVE_ABLATION_MAX_COST_USD")
    expect(script).toContain("AUTODRIVE_EVAL_BUDGET_LEDGER")
    expect(script).toContain("concurrency = 2")
    expect(script).toContain("createAblationPrediction")
    expect(script).not.toMatch(/sk-[A-Za-z0-9_-]{20,}/)
  })

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
    expect(memory).not.toContain("no tests run")
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

  test("uses the production heuristic and strict supervisor parser", () => {
    expect(createAblationPrediction(candidate, "regex")).toEqual({
      boundaryID: candidate.id,
      variant: "regex",
      label: "stop",
    })
    expect(
      parseAblationResponse(candidate, "goal", {
        model: "qwen3.8-max-20260831",
        choices: [{ message: { content: '{"action":"continue","reason":"Tests remain"}' } }],
        usage: { prompt_tokens: 100, completion_tokens: 12 },
      }),
    ).toMatchObject({
      prediction: { boundaryID: candidate.id, variant: "goal", label: "continue" },
      modelVersion: "qwen3.8-max-20260831",
      promptTokens: 100,
      completionTokens: 12,
    })
    expect(() =>
      parseAblationResponse(candidate, "memory", {
        model: "qwen3.8-max",
        choices: [{ message: { content: "not json" } }],
        usage: { prompt_tokens: 1, completion_tokens: 1 },
      }),
    ).toThrow("valid tri-state")
  })

  test("pins one deterministic controller request per model ablation", () => {
    expect(buildAblationRequest("qwen3.8-max", "prompt")).toEqual({
      model: "qwen3.8-max",
      messages: [{ role: "user", content: "prompt" }],
      temperature: 0,
      max_tokens: 1024,
      stream: false,
    })
  })
})
