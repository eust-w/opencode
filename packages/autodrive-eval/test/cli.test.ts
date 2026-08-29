import { describe, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import manifestInput from "../../../research/auto-drive/protocol/swe-evo-48.json"
import { createRunPlan, parseManifest } from "../src/protocol"

describe("paid experiment CLI gates", () => {
  test("refuses execution before reading an executor when no preflight is supplied", async () => {
    const run = createRunPlan(parseManifest(manifestInput))[0]
    const child = Bun.spawn(
      [Bun.which("bun")!, "src/cli.ts", "run", "--execute", "--executor", "/usr/bin/true", "--run-id", run.id],
      { cwd: import.meta.dir + "/..", stdout: "pipe", stderr: "pipe" },
    )
    const [exitCode, stderr] = await Promise.all([child.exited, new Response(child.stderr).text()])
    expect(exitCode).toBe(1)
    expect(stderr).toContain("--preflight PATH is required")
  })

  test("writes a minimal deterministic model metadata snapshot", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "autodrive-models-"))
    try {
      const source = path.join(directory, "source.json")
      const output = path.join(directory, "models.json")
      const resolutions = path.join(directory, "resolutions.json")
      await Bun.write(
        source,
        JSON.stringify({
          "d-robotics": {
            id: "d-robotics",
            models: {
              "qwen3.8-max": { id: "qwen3.8-max" },
              "deepseek-v4-pro": { id: "deepseek-v4-pro" },
              "glm-5.3": { id: "glm-5.3" },
              other: {},
            },
          },
        }),
      )
      const child = Bun.spawn(
        [
          Bun.which("bun")!,
          "src/cli.ts",
          "snapshot-models",
          "--source",
          source,
          "--output",
          output,
          "--resolutions",
          resolutions,
        ],
        { cwd: import.meta.dir + "/..", stdout: "pipe", stderr: "pipe" },
      )
      const [exitCode, stderr] = await Promise.all([child.exited, new Response(child.stderr).text()])
      expect(exitCode, stderr).toBe(0)
      expect(Object.keys((await Bun.file(output).json())["d-robotics"].models)).toEqual([
        "qwen3.8-max",
        "deepseek-v4-pro",
        "glm-5.3",
      ])
      expect(await Bun.file(resolutions).json()).toContainEqual({
        model: "d-robotics/deepseek-v4-pro",
        catalogModelID: "deepseek-v4-pro",
      })
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  test("rejects bulk selection for the paid canary", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "autodrive-canary-"))
    try {
      const child = Bun.spawn(
        [
          Bun.which("bun")!,
          "src/cli.ts",
          "canary",
          "--execute",
          "--executor",
          "/usr/bin/true",
          "--preflight",
          path.join(directory, "receipt.json"),
          "--artifact-root",
          directory,
          "--all",
        ],
        { cwd: import.meta.dir + "/..", stdout: "pipe", stderr: "pipe" },
      )
      const [exitCode, stderr] = await Promise.all([child.exited, new Response(child.stderr).text()])
      expect(exitCode).toBe(1)
      expect(stderr).toContain("exactly one --run-id")
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  test("verifies the host executor contract without appending an experiment result", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "autodrive-executor-"))
    const run = createRunPlan(parseManifest(manifestInput))[0]
    try {
      const child = Bun.spawn(
        [
          Bun.which("bun")!,
          "src/cli.ts",
          "verify-executor",
          "--executor",
          path.resolve(import.meta.dir, "../scripts/dry-run-executor.ts"),
          "--artifact-root",
          directory,
          "--run-id",
          run.id,
        ],
        {
          cwd: import.meta.dir + "/..",
          stdout: "pipe",
          stderr: "pipe",
          env: {
            ...Bun.env,
            GOOGLE_GENERATIVE_AI_API_KEY: "must-not-reach-dry-run",
          },
        },
      )
      const [exitCode, stdout, stderr] = await Promise.all([
        child.exited,
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
      ])
      expect(exitCode, stderr).toBe(0)
      expect(JSON.parse(stdout)).toMatchObject({
        status: "accepted",
        mode: "dry-run",
        runID: run.id,
        costUSD: 0,
      })
      expect(await Bun.file(path.join(directory, "dry-run", "raw", `${run.id}.jsonl`)).exists()).toBeTrue()
      expect(await Bun.file(path.join(directory, "results", "trajectories.jsonl")).exists()).toBeFalse()
      expect(await Bun.file(path.join(directory, "cost", "ledger.jsonl")).exists()).toBeFalse()
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})
