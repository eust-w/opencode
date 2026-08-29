import { describe, expect, test } from "bun:test"
import manifest from "../../../research/auto-drive/protocol/swe-evo-48.json"
import type { Trajectory } from "../src/artifact"
import { createRunPlan, parseManifest } from "../src/protocol"
import { executeRuns, InfrastructureFailure } from "../src/runner"

describe("bounded experiment runner", () => {
  test("uses at most two concurrent tasks", async () => {
    const runs = createRunPlan(parseManifest(manifest)).slice(0, 5)
    let active = 0
    let peak = 0
    const records = await executeRuns(runs, async (run, attempt) => {
      active += 1
      peak = Math.max(peak, active)
      await Bun.sleep(5)
      active -= 1
      return { runID: run.id, attempt, costUSD: 0.01 } as Trajectory
    })
    expect(records).toHaveLength(5)
    expect(peak).toBe(2)
  })

  test("reruns an infrastructure failure once with identical run specification", async () => {
    const run = createRunPlan(parseManifest(manifest))[0]!
    const calls: string[] = []
    const records = await executeRuns([run], async (input, attempt) => {
      calls.push(`${input.id}:${attempt}`)
      if (attempt === 1) throw new InfrastructureFailure("container pull reset")
      return { runID: input.id, attempt, costUSD: 0.01 } as Trajectory
    })
    expect(calls).toEqual([`${run.id}:1`, `${run.id}:2`])
    expect(records[0]).toMatchObject({ runID: run.id, attempt: 2 })
  })

  test("does not rerun model timeouts or arbitrary errors", async () => {
    const run = createRunPlan(parseManifest(manifest))[0]!
    let calls = 0
    await expect(
      executeRuns([run], async () => {
        calls += 1
        throw new Error("model timeout")
      }),
    ).rejects.toThrow("model timeout")
    expect(calls).toBe(1)
  })

  test("uses the isolated pilot budget policy for a canary", async () => {
    const run = createRunPlan(parseManifest(manifest))[0]
    const contexts: unknown[] = []
    await expect(
      executeRuns(
        [run],
        async (_input, _attempt, context) => {
          contexts.push(context)
          throw new Error("stop after observing the reserved budget")
        },
        {
          budget: () => ({ category: "pilot", maxCostUSD: 50 }),
        },
      ),
    ).rejects.toThrow("stop after observing the reserved budget")
    expect(contexts).toEqual([{ category: "pilot", maxCostUSD: 50, remainingUSD: 750 }])
  })
})
