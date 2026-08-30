import { describe, expect, test } from "bun:test"
import {
  extractSupervisorBoundaries,
  freezeAnnotations,
  renderBoundaryPacket,
  renderLabelTemplate,
  splitBoundaries,
} from "../src/annotation"

describe("boundary dataset split", () => {
  test("keeps base trajectories grouped in an exact 54/126 split", () => {
    const labels = ["continue", "stop", "defer"] as const
    const boundaries = labels.flatMap((label) =>
      Array.from({ length: 60 }, (_, index) => ({
        id: `${label}-${index}`,
        baseTrajectoryID: `${label}-trajectory-${index}`,
        label,
      })),
    )
    const split = splitBoundaries(boundaries, { developmentSize: 54, seed: "auto-drive-boundary-v1" })
    expect(split.development).toHaveLength(54)
    expect(split.frozen).toHaveLength(126)
    expect(new Set(split.development.map((item) => item.baseTrajectoryID))).not.toContainAnyValues(
      Array.from(new Set(split.frozen.map((item) => item.baseTrajectoryID))),
    )
    expect(splitBoundaries(boundaries, { developmentSize: 54, seed: "auto-drive-boundary-v1" })).toEqual(split)
  })

  test("rejects an imbalanced label pool before freezing", () => {
    const boundaries = Array.from({ length: 180 }, (_, index) => ({
      id: `item-${index}`,
      baseTrajectoryID: `trajectory-${index}`,
      label: index < 61 ? ("continue" as const) : index < 121 ? ("stop" as const) : ("defer" as const),
    }))
    expect(() => splitBoundaries(boundaries, { developmentSize: 54, seed: "x" })).toThrow(
      "exactly 60 examples per label",
    )
  })
})

describe("independent boundary annotation freeze", () => {
  test("seals two independent label files after kappa and balanced adjudication pass", () => {
    const candidates = boundaryCandidates()
    const first = labelsCSV(
      "annotator-a",
      candidates.map((candidate) => candidate.gold),
    )
    const secondLabels = candidates.map((candidate, index) => {
      if (index % 15 !== 0) return candidate.gold
      return candidate.gold === "continue" ? "stop" : candidate.gold === "stop" ? "defer" : "continue"
    })
    const second = labelsCSV("annotator-b", secondLabels)
    const adjudicated = labelsCSV(
      "adjudicator",
      candidates.map((candidate) => candidate.gold),
    )
    const frozen = freezeAnnotations({
      candidates,
      first,
      second,
      adjudicated,
      developmentSize: 54,
      seed: "auto-drive-boundary-v1",
      minimumKappa: 0.75,
    })

    expect(frozen.kappa).toBeCloseTo(0.9)
    expect(frozen.agreements).toBe(168)
    expect(frozen.counts).toEqual({ continue: 60, stop: 60, defer: 60 })
    expect(frozen.development).toHaveLength(54)
    expect(frozen.frozen).toHaveLength(126)
    expect(frozen.seal.sha256).toMatch(/^[a-f0-9]{64}$/)
  })

  test("rejects reused annotator identity and agreement below the frozen threshold", () => {
    const candidates = boundaryCandidates()
    const first = labelsCSV(
      "annotator-a",
      candidates.map((candidate) => candidate.gold),
    )
    const rotated = labelsCSV(
      "annotator-b",
      candidates.map((candidate) =>
        candidate.gold === "continue" ? "stop" : candidate.gold === "stop" ? "defer" : "continue",
      ),
    )
    const adjudicated = labelsCSV(
      "adjudicator",
      candidates.map((candidate) => candidate.gold),
    )
    const input = {
      candidates,
      first,
      second: rotated,
      adjudicated,
      developmentSize: 54,
      seed: "auto-drive-boundary-v1",
      minimumKappa: 0.75,
    }

    expect(() => freezeAnnotations(input)).toThrow("kappa")
    expect(() => freezeAnnotations({ ...input, second: first })).toThrow("independent")
  })

  test("renders a blank, identity-bound CSV template with quoted reasons", () => {
    const candidates = boundaryCandidates().slice(0, 2)
    const template = renderLabelTemplate(candidates, "annotator-a")
    expect(template.split("\n")[0]).toBe("boundary_id,annotator_id,label,confidence,reason,next_action,timestamp")
    expect(template).toContain("boundary-0,annotator-a,,,,,")
    expect(template).not.toContain("continue")
  })

  test("removes policy decisions and gold labels from the blinded packet", () => {
    const content = renderBoundaryPacket([
      {
        ...boundaryCandidates()[0],
        strategy: "supervisor",
        supervisorDecision: "continue",
      },
    ])
    expect(content).not.toContain("strategy")
    expect(content).not.toContain("supervisorDecision")
    expect(content).not.toContain("gold")
    expect(JSON.parse(content.trim())).toMatchObject({ id: "boundary-0", taskID: "task-0" })
  })

  test("extracts supervisor inputs while excluding reasoning and model decisions", () => {
    const candidates = extractSupervisorBoundaries({
      runID: `adr_${"1".repeat(20)}`,
      taskID: "task-1",
      messages: [
        { type: "user", text: "Fix the parser" },
        {
          type: "assistant",
          content: [
            { type: "reasoning", text: "SECRET_CHAIN" },
            { type: "tool", name: "read", state: { status: "completed", input: { path: "parser.ts" } } },
            { type: "text", text: "The parser still needs a regression test." },
          ],
        },
      ],
      controllers: [
        {
          requestSHA256: "2".repeat(64),
          workerResponses: 1,
          body: {
            messages: [
              {
                role: "user",
                content:
                  "<InitialUserGoal>\n(No explicit initial goal provided)\n</InitialUserGoal>\n<AutoDriveMemory>\nRead parser.ts\n</AutoDriveMemory>\n<WorkerLastOutput>\nThe parser still needs a regression test.\n</WorkerLastOutput>",
              },
            ],
          },
        },
      ],
      patches: ["diff --git a/parser.ts b/parser.ts\n"],
    })

    expect(candidates).toHaveLength(1)
    expect(candidates[0]).toMatchObject({
      baseTrajectoryID: `adr_${"1".repeat(20)}`,
      taskID: "task-1",
      boundaryIndex: 0,
      initialGoal: "Fix the parser",
      workerOutput: "The parser still needs a regression test.",
      memory: "Read parser.ts",
      patch: "diff --git a/parser.ts b/parser.ts\n",
    })
    expect(candidates[0].trajectorySummary).toContain("tool:read completed")
    expect(candidates[0].trajectorySummary).not.toContain("SECRET_CHAIN")
    expect(JSON.stringify(candidates)).not.toContain("decision")
  })
})

function boundaryCandidates() {
  const labels = ["continue", "stop", "defer"] as const
  return labels.flatMap((gold) =>
    Array.from({ length: 60 }, (_, index) => ({
      id: `boundary-${labels.indexOf(gold) * 60 + index}`,
      baseTrajectoryID: `trajectory-${labels.indexOf(gold) * 60 + index}`,
      taskID: `task-${index}`,
      boundaryIndex: index,
      initialGoal: "Fix the task",
      workerOutput: "I inspected the implementation.",
      trajectorySummary: "One provider turn completed.",
      patch: "",
      continuationCount: 0,
      memory: "",
      gold,
    })),
  )
}

function labelsCSV(annotator: string, labels: readonly ("continue" | "stop" | "defer")[]) {
  return [
    "boundary_id,annotator_id,label,confidence,reason,next_action,timestamp",
    ...labels.map(
      (label, index) =>
        `boundary-${index},${annotator},${label},high,\"reason, ${index}\",next step,2026-08-30T00:00:00.000Z`,
    ),
  ].join("\n")
}
