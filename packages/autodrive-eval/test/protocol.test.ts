import { describe, expect, test } from "bun:test"
import manifest from "../../../research/auto-drive/protocol/swe-evo-48.json"
import { parseTaskInput } from "../src/host-executor"
import { createBoundaryRunPlan, createRunPlan, parseManifest, protocol } from "../src/protocol"

describe("frozen AutoDrive protocol", () => {
  test("records all pre-execution protocol amendments", async () => {
    expect(protocol.version).toBe("auto-drive-swe-evo-v1.14")
    expect(protocol.models.primary).toBe("d-robotics/deepseek-v4-pro")
    expect(protocol.models.replication).toEqual(["d-robotics/qwen3.7-max", "d-robotics/deepseek-v4-flash"])
    expect(protocol.models.controller).toBe("d-robotics/qwen3.8-max")
    expect(protocol.workerMaxOutputTokens).toBe(4_096)
    expect(protocol.workerReasoningEffort).toBe("low")
    expect(protocol.controllerMaxOutputTokens).toBe(1_024)
    expect(protocol.controllerTimeoutSeconds).toBe(15)
    expect(protocol.controllerFailureAction).toBe("defer")
    expect(protocol.gateway.canaryMaxSpendUSD).toBe(5)
    expect(
      await Bun.file(new URL("../../../research/auto-drive/protocol/preregistration.md", import.meta.url)).text(),
    ).toContain("Gateway model-matrix amendment")
    expect(
      await Bun.file(new URL("../../../research/auto-drive/protocol/preregistration.md", import.meta.url)).text(),
    ).toContain("Responses transport amendment")
    expect(
      await Bun.file(new URL("../../../research/auto-drive/protocol/preregistration.md", import.meta.url)).text(),
    ).toContain("Response-accounting amendment")
    expect(
      await Bun.file(new URL("../../../research/auto-drive/protocol/preregistration.md", import.meta.url)).text(),
    ).toContain("Bounded provider-failure amendment")
    expect(
      await Bun.file(new URL("../../../research/auto-drive/protocol/preregistration.md", import.meta.url)).text(),
    ).toContain("Worker reasoning amendment")
    expect(
      await Bun.file(new URL("../../../research/auto-drive/protocol/preregistration.md", import.meta.url)).text(),
    ).toContain("V2 request-routing amendment")
    expect(
      await Bun.file(new URL("../../../research/auto-drive/protocol/preregistration.md", import.meta.url)).text(),
    ).toContain("Worker compatibility amendment")
    expect(
      await Bun.file(new URL("../../../research/auto-drive/protocol/preregistration.md", import.meta.url)).text(),
    ).toContain("Gateway output-normalization amendment")
    expect(
      await Bun.file(new URL("../../../research/auto-drive/protocol/preregistration.md", import.meta.url)).text(),
    ).toContain("Controller-release amendment")
    expect(
      await Bun.file(new URL("../../../research/auto-drive/protocol/preregistration.md", import.meta.url)).text(),
    ).toContain("Four-policy executor amendment")
    expect(
      await Bun.file(new URL("../../../research/auto-drive/protocol/preregistration.md", import.meta.url)).text(),
    ).toContain("Overlapping test-patch amendment")
    expect(
      await Bun.file(new URL("../../../research/auto-drive/protocol/preregistration.md", import.meta.url)).text(),
    ).toContain("Supervisor failure-abstention amendment")
    expect(
      await Bun.file(new URL("../../../research/auto-drive/protocol/preregistration.md", import.meta.url)).text(),
    ).toContain("Startup patch-baseline amendment")
  })

  test("pins all 48 unique SWE-EVO tasks from seven repositories", () => {
    const parsed = parseManifest(manifest)
    expect(parsed.tasks).toHaveLength(48)
    expect(new Set(parsed.tasks.map((task) => task.instanceID)).size).toBe(48)
    expect(new Set(parsed.tasks.map((task) => task.repo)).size).toBe(7)
    expect(parsed.source.commit).toBe("9b83d5af943ba7a17567336f5b18239f73960219")
    expect(parsed.source.sha256).toBe("74e7c63160ada4ceba71d5d89a9bb7c9794f4574b384458d546eb65cdb730520")
  })

  test("materializes every pinned SWE-EVO task into the host-executor contract", async () => {
    const parsed = parseManifest(manifest)
    const inputs = await Promise.all(
      parsed.tasks.map(async (task) =>
        parseTaskInput(
          await Bun.file(
            new URL(`../../../research/auto-drive/protocol/tasks/${task.instanceID}.json`, import.meta.url),
          ).json(),
        ),
      ),
    )

    expect(inputs).toHaveLength(48)
    expect(
      inputs.map((input) => ({
        instanceID: input.instanceID,
        repo: input.repo,
        baseCommit: input.baseCommit,
        environmentSetupCommit: input.environmentSetupCommit,
        image: input.image,
        failToPassCount: input.failToPass.length,
        passToPassCount: input.passToPass.length,
        source: input.source,
      })),
    ).toEqual(
      parsed.tasks.map((task) => ({
        instanceID: task.instanceID,
        repo: task.repo,
        baseCommit: task.baseCommit,
        environmentSetupCommit: task.environmentSetupCommit,
        image: task.image,
        failToPassCount: task.failToPassCount,
        passToPassCount: task.passToPassCount,
        source: { commit: parsed.source.commit, sha256: parsed.source.sha256 },
      })),
    )
  })

  test("expands the preregistered matrix to exactly 384 paid trajectories", () => {
    const runs = createRunPlan(parseManifest(manifest))
    expect(runs).toHaveLength(384)
    expect(new Set(runs.map((run) => run.id)).size).toBe(384)
    expect(runs.filter((run) => run.model === protocol.models.primary)).toHaveLength(288)
    expect(runs.filter((run) => run.model !== protocol.models.primary)).toHaveLength(96)
    expect(runs.filter((run) => run.repeat > 0)).toHaveLength(96)
  })

  test("keeps 96 boundary-source trajectories outside the formal matrix", async () => {
    const parsed = parseManifest(manifest)
    const formal = createRunPlan(parsed)
    const boundary = createBoundaryRunPlan(parsed)
    expect(boundary).toHaveLength(96)
    expect(new Set(boundary.map((run) => run.id)).size).toBe(96)
    expect(boundary.every((run) => run.model === protocol.models.primary && run.strategy === "supervisor")).toBeTrue()
    expect(new Set(boundary.map((run) => run.taskID)).size).toBe(48)
    expect(boundary.filter((run) => run.repeat === 0)).toHaveLength(48)
    expect(boundary.filter((run) => run.repeat === 1)).toHaveLength(48)
    expect(boundary.some((run) => formal.some((item) => item.id === run.id))).toBeFalse()
    expect(
      (await Bun.file("../../research/auto-drive/protocol/boundary-run-plan.jsonl").text())
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line)),
    ).toEqual(boundary)
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

  test("keeps the request and fault contracts aligned with supervisor abstention", async () => {
    const requests = await Bun.file(
      new URL("../../../research/auto-drive/protocol/model-requests.json", import.meta.url),
    ).json()
    const faults = await Bun.file(
      new URL("../../../research/auto-drive/protocol/fault-injection.json", import.meta.url),
    ).json()

    expect(requests).toMatchObject({
      protocol: protocol.version,
      worker: { models: [protocol.models.primary, ...protocol.models.replication] },
      supervisor: {
        model: protocol.models.controller,
        timeoutSeconds: protocol.controllerTimeoutSeconds,
        fallback: protocol.controllerFailureAction,
      },
    })
    expect(
      faults.scenarios.find((scenario: { id: string }) => scenario.id === "supervisor-timeout")?.invariant,
    ).toContain("defer")
    expect(
      faults.scenarios.find((scenario: { id: string }) => scenario.id === "supervisor-invalid-json")?.invariant,
    ).toContain("defer")
  })
})
