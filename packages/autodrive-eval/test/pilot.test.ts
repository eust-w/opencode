import { describe, expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { mkdir, mkdtemp } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { createPilotRun, loadPilotManifest } from "../src/pilot"
import { protocol } from "../src/protocol"

const task = {
  schemaVersion: 1 as const,
  instanceID: "psf__requests-1142",
  repo: "psf/requests",
  baseCommit: "2".repeat(40),
  environmentSetupCommit: "2".repeat(40),
  image: "xingyaoww/sweb.eval.x86_64.psf_s_requests-1142",
  problemStatement: "GET requests should not send a content length header.",
  testPatch: "diff --git a/test_requests.py b/test_requests.py\n",
  testCommand: "pytest -rA",
  logParser: "parse_log_pytest" as const,
  failToPass: ["test_requests.py::RequestsTestCase::test_no_content_length"],
  passToPass: ["test_requests.py::RequestsTestCase::test_basic_building"],
  source: { commit: "3".repeat(40), sha256: "4".repeat(64) },
}

describe("non-primary pilot protocol", () => {
  test("loads a hash-sealed task outside the formal SWE-EVO manifest", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "autodrive-pilot-"))
    await mkdir(path.join(directory, "tasks"), { recursive: true })
    const content = JSON.stringify(task, null, 2) + "\n"
    await Bun.write(path.join(directory, "tasks/task.json"), content)
    const loaded = await loadPilotManifest(
      path.join(directory, "manifest.json"),
      manifest(createHash("sha256").update(content).digest("hex")),
      new Set(["formal-task"]),
    )

    expect(loaded.task).toEqual(task)
    expect(loaded.manifest.taskInput.sha256).toBe(createHash("sha256").update(content).digest("hex"))
    expect(createPilotRun(loaded)).toEqual({
      id: expect.stringMatching(/^adr_[a-f0-9]{20}$/),
      taskID: task.instanceID,
      model: protocol.models.primary,
      controllerModel: protocol.models.controller,
      strategy: "supervisor",
      repeat: 0,
      temperature: 0,
      segmentSteps: 6,
      maxContinuations: 5,
      timeoutMinutes: 45,
    })
  })

  test("rejects pilot task overlap and task-input hash drift", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "autodrive-pilot-"))
    await mkdir(path.join(directory, "tasks"), { recursive: true })
    const content = JSON.stringify(task) + "\n"
    await Bun.write(path.join(directory, "tasks/task.json"), content)
    const input = manifest(createHash("sha256").update(content).digest("hex"))

    expect(loadPilotManifest(path.join(directory, "manifest.json"), input, new Set([task.instanceID]))).rejects.toThrow(
      "overlaps",
    )
    expect(
      loadPilotManifest(
        path.join(directory, "manifest.json"),
        { ...input, taskInput: { ...input.taskInput, sha256: "f".repeat(64) } },
        new Set(),
      ),
    ).rejects.toThrow("hash mismatch")
  })
})

function manifest(sha256: string) {
  return {
    schemaVersion: 1 as const,
    frozenAt: "2026-08-30T00:00:00+08:00",
    source: {
      dataset: "princeton-nlp/SWE-bench_Verified",
      revision: "5".repeat(40),
      parquetSHA256: "6".repeat(64),
      harnessRepository: "https://github.com/SWE-bench/SWE-bench",
      harnessCommit: "3".repeat(40),
    },
    task: {
      instanceID: task.instanceID,
      image: task.image,
      imageDigest: `sha256:${"7".repeat(64)}`,
    },
    taskInput: { path: "tasks/task.json", sha256 },
    strategy: "supervisor" as const,
  }
}
