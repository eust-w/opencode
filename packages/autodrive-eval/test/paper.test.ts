import { describe, expect, test } from "bun:test"
import manifest from "../../../research/auto-drive/protocol/swe-evo-48.json"
import { renderTaskManifest } from "../src/paper"
import { parseManifest } from "../src/protocol"

describe("paper artifact generation", () => {
  test("renders all frozen tasks into a generated LaTeX table", () => {
    const parsed = parseManifest(manifest)
    const output = renderTaskManifest(parsed.tasks)

    expect(output).toContain("Generated from protocol/swe-evo-48.json")
    expect(output).toContain("Frozen 48-task manifest")
    expect(output).toContain("\\renewcommand{\\arraystretch}{0.85}")
    expect(output).toContain("scikit-learn/scikit-learn")
    expect(output).toContain("0.21.1--0.21.2")
    expect(output.split("% task-row\n")).toHaveLength(49)
    for (const task of parsed.tasks) expect(output).toContain(`${task.startVersion}--${task.endVersion}`)
  })
})
