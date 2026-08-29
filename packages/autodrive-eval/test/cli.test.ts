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
          google: { id: "google", models: { "gemini-3.7-flash": { id: "gemini-3.7-flash" }, other: {} } },
          anthropic: { id: "anthropic", models: { "claude-sonnet-4-6": { id: "claude-sonnet-4-6" } } },
          openai: { id: "openai", models: { "gpt-5.4": { id: "gpt-5.4" } } },
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
      expect(Object.keys((await Bun.file(output).json()).google.models)).toEqual(["gemini-3.7-flash"])
      expect(await Bun.file(resolutions).json()).toContainEqual({
        model: "anthropic/claude-sonnet-4.6",
        catalogModelID: "claude-sonnet-4-6",
      })
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})
