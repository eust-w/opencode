import { describe, expect, test } from "bun:test"
import { splitBoundaries } from "../src/annotation"

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
