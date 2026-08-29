import { describe, expect, test } from "bun:test"
import manifest from "../../../research/auto-drive/protocol/swe-evo-48.json"
import { createRunPlan, parseManifest, protocol } from "../src/protocol"

describe("frozen AutoDrive protocol", () => {
  test("records all pre-execution protocol amendments", async () => {
    expect(protocol.version).toBe("auto-drive-swe-evo-v1.4")
    expect(protocol.models.primary).toBe("d-robotics/qwen3.8-max")
    expect(protocol.models.replication).toEqual(["d-robotics/deepseek-v4-pro", "d-robotics/glm-5.3"])
    expect(protocol.models.controller).toBe("d-robotics/qwen3.8-max")
    expect(protocol.workerMaxOutputTokens).toBe(32_000)
    expect(protocol.controllerMaxOutputTokens).toBe(1_024)
    expect(protocol.gateway.canaryMaxSpendUSD).toBe(5)
    expect(
      await Bun.file(new URL("../../../research/auto-drive/protocol/preregistration.md", import.meta.url)).text(),
    ).toContain("Gateway model-matrix amendment")
    expect(
      await Bun.file(new URL("../../../research/auto-drive/protocol/preregistration.md", import.meta.url)).text(),
    ).toContain("Responses transport amendment")
  })

  test("pins all 48 unique SWE-EVO tasks from seven repositories", () => {
    const parsed = parseManifest(manifest)
    expect(parsed.tasks).toHaveLength(48)
    expect(new Set(parsed.tasks.map((task) => task.instanceID)).size).toBe(48)
    expect(new Set(parsed.tasks.map((task) => task.repo)).size).toBe(7)
    expect(parsed.source.commit).toBe("9b83d5af943ba7a17567336f5b18239f73960219")
    expect(parsed.source.sha256).toBe("74e7c63160ada4ceba71d5d89a9bb7c9794f4574b384458d546eb65cdb730520")
  })

  test("expands the preregistered matrix to exactly 384 paid trajectories", () => {
    const runs = createRunPlan(parseManifest(manifest))
    expect(runs).toHaveLength(384)
    expect(new Set(runs.map((run) => run.id)).size).toBe(384)
    expect(runs.filter((run) => run.model === protocol.models.primary)).toHaveLength(288)
    expect(runs.filter((run) => run.model !== protocol.models.primary)).toHaveLength(96)
    expect(runs.filter((run) => run.repeat > 0)).toHaveLength(96)
  })

  test("uses four continuation strategies and derives off from the first-boundary prefix", () => {
    const runs = createRunPlan(parseManifest(manifest))
    expect(new Set(runs.map((run) => run.strategy))).toEqual(new Set(["oracle", "blind", "regex", "supervisor"]))
    expect(protocol.offPolicy).toBe("first-boundary-prefix")
    expect(runs.map((run) => run.strategy)).not.toContain("off")
  })

  test("pins twelve cross-model replication tasks with repository coverage", () => {
    const parsed = parseManifest(manifest)
    expect(protocol.replicationTaskIDs).toHaveLength(12)
    const replicationTaskIDs = new Set<string>(protocol.replicationTaskIDs)
    const tasks = parsed.tasks.filter((task) => replicationTaskIDs.has(task.instanceID))
    expect(tasks).toHaveLength(12)
    expect(new Set(tasks.map((task) => task.repo)).size).toBe(7)
  })
})
