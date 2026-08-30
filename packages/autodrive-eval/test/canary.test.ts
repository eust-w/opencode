import { describe, expect, test } from "bun:test"
import {
  analyzeCanaryAblation,
  renderCanaryCSV,
  renderCanaryLatex,
  renderCanaryLatexTable,
} from "../src/canary"

const base = {
  taskID: "task-1",
  firstBoundaryResolved: false,
  firstBoundaryFixRate: 0,
  resolved: false,
  fixRate: 0,
  continuationCount: 0,
  redundantTurns: 0,
  promptTokens: 100,
  completionTokens: 10,
  costUSD: 0.1,
  latencyMS: 1000,
  unsafeContinuationCount: 0,
  modelRequests: [{ kind: "worker" as const }],
}

describe("analyzeCanaryAblation", () => {
  test("orders the four policies and derives comparable metrics", () => {
    const rows = analyzeCanaryAblation([
      { ...base, strategy: "supervisor", continuationCount: 1, modelRequests: [{ kind: "worker" }, { kind: "controller" }] },
      { ...base, strategy: "regex" },
      { ...base, strategy: "blind", resolved: true, fixRate: 1, continuationCount: 5 },
      { ...base, strategy: "oracle", resolved: true, fixRate: 1, continuationCount: 5 },
    ])

    expect(rows.map((row) => row.strategy)).toEqual(["oracle", "blind", "regex", "supervisor"])
    expect(rows[0]).toMatchObject({ finalResolved: true, resolvedGain: 1, workerRequests: 1, controllerRequests: 0 })
    expect(rows[3]).toMatchObject({ finalResolved: false, resolvedGain: 0, workerRequests: 1, controllerRequests: 1 })
  })

  test("rejects duplicate or cross-task canary inputs", () => {
    const valid = [
      { ...base, strategy: "oracle" as const },
      { ...base, strategy: "blind" as const },
      { ...base, strategy: "regex" as const },
      { ...base, strategy: "supervisor" as const },
    ]

    expect(() => analyzeCanaryAblation([...valid.slice(0, 3), valid[2]])).toThrow("exactly once")
    expect(() => analyzeCanaryAblation([...valid.slice(0, 3), { ...valid[3], taskID: "task-2" }])).toThrow(
      "same task",
    )
  })
})

describe("canary table rendering", () => {
  const rows = analyzeCanaryAblation([
    { ...base, strategy: "oracle", resolved: true, fixRate: 1, continuationCount: 5 },
    { ...base, strategy: "blind", resolved: true, fixRate: 1, continuationCount: 5 },
    { ...base, strategy: "regex" },
    { ...base, strategy: "supervisor", continuationCount: 1, modelRequests: [{ kind: "worker" }, { kind: "controller" }] },
  ])

  test("renders stable CSV and LaTeX rows", () => {
    expect(renderCanaryCSV(rows)).toContain("strategy,first_boundary_resolved,final_resolved")
    expect(renderCanaryCSV(rows)).toContain("blind,false,true,1,5")
    expect(renderCanaryLatex(rows)).toContain("Supervisor & 0 & 0 & 0 & 1")
    expect(renderCanaryLatexTable(rows)).toContain("Single-task v1.13 paid canary ablation")
    expect(renderCanaryLatexTable(rows)).toContain("\\texttt{task-1}")
    expect(renderCanaryLatexTable(rows)).toContain("\\label{tab:canary-ablation}")
  })
})
