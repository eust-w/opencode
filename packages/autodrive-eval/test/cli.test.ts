import { describe, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import manifestInput from "../../../research/auto-drive/protocol/swe-evo-48.json"
import { createBoundaryRunPlan, createRunPlan, parseManifest } from "../src/protocol"

describe("paid experiment CLI gates", () => {
  test("requires indexed trajectories before extracting boundary candidates", async () => {
    const child = Bun.spawn([Bun.which("bun")!, "src/cli.ts", "annotations-extract"], {
      cwd: import.meta.dir + "/..",
      stdout: "pipe",
      stderr: "pipe",
    })
    const [exitCode, stderr] = await Promise.all([child.exited, new Response(child.stderr).text()])
    expect(exitCode).toBe(1)
    expect(stderr).toContain("--results PATH is required")
  })

  test("prepares blinded boundary packets without provider access", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "autodrive-annotations-"))
    try {
      const candidates = path.join(directory, "candidates.jsonl")
      const output = path.join(directory, "packet")
      await Bun.write(
        candidates,
        JSON.stringify({
          id: "boundary-1",
          baseTrajectoryID: "trajectory-1",
          taskID: "task-1",
          boundaryIndex: 0,
          initialGoal: "Fix the task",
          workerOutput: "Inspected the code",
          trajectorySummary: "One turn",
          patch: "",
          continuationCount: 0,
          memory: "",
          gold: "continue",
          supervisorDecision: "continue",
        }) + "\n",
      )
      const child = Bun.spawn(
        [
          Bun.which("bun")!,
          "src/cli.ts",
          "annotations-prepare",
          "--candidates",
          candidates,
          "--output",
          output,
          "--annotator",
          "annotator-a",
        ],
        { cwd: import.meta.dir + "/..", stdout: "pipe", stderr: "pipe" },
      )
      const [exitCode, stderr] = await Promise.all([child.exited, new Response(child.stderr).text()])
      expect(exitCode, stderr).toBe(0)
      expect(await Bun.file(path.join(output, "examples.jsonl")).text()).not.toContain("supervisorDecision")
      expect(await Bun.file(path.join(output, "labels.csv")).text()).toContain("boundary-1,annotator-a,,,,,")
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  test("freezes balanced adjudicated labels into grouped development and test sets", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "autodrive-freeze-"))
    try {
      const candidates = path.join(directory, "candidates.jsonl")
      const first = path.join(directory, "first.csv")
      const second = path.join(directory, "second.csv")
      const adjudicated = path.join(directory, "adjudicated.csv")
      const output = path.join(directory, "frozen")
      const examples = ["continue", "stop", "defer"].flatMap((label, labelIndex) =>
        Array.from({ length: 60 }, (_, index) => ({
          id: `boundary-${labelIndex * 60 + index}`,
          baseTrajectoryID: `trajectory-${labelIndex * 60 + index}`,
          taskID: `task-${index}`,
          boundaryIndex: index,
          initialGoal: "Fix the task",
          workerOutput: "Inspected the code",
          trajectorySummary: "One turn",
          patch: "",
          continuationCount: 0,
          memory: "",
          label,
        })),
      )
      const csv = (annotator: string) =>
        [
          "boundary_id,annotator_id,label,confidence,reason,next_action,timestamp",
          ...examples.map(
            (example) => `${example.id},${annotator},${example.label},high,reviewed,next step,2026-08-30T00:00:00.000Z`,
          ),
        ].join("\n") + "\n"
      await Promise.all([
        Bun.write(
          candidates,
          examples.map(({ label: _label, ...example }) => JSON.stringify(example)).join("\n") + "\n",
        ),
        Bun.write(first, csv("annotator-a")),
        Bun.write(second, csv("annotator-b")),
        Bun.write(adjudicated, csv("adjudicator")),
      ])
      const child = Bun.spawn(
        [
          Bun.which("bun")!,
          "src/cli.ts",
          "annotations-freeze",
          "--candidates",
          candidates,
          "--first",
          first,
          "--second",
          second,
          "--adjudicated",
          adjudicated,
          "--output",
          output,
        ],
        { cwd: import.meta.dir + "/..", stdout: "pipe", stderr: "pipe" },
      )
      const [exitCode, stderr] = await Promise.all([child.exited, new Response(child.stderr).text()])
      expect(exitCode, stderr).toBe(0)
      expect((await Bun.file(path.join(output, "development.jsonl")).text()).trim().split("\n")).toHaveLength(54)
      expect((await Bun.file(path.join(output, "test.jsonl")).text()).trim().split("\n")).toHaveLength(126)
      expect(await Bun.file(path.join(output, "seal.json")).json()).toMatchObject({
        kappa: 1,
        counts: { continue: 60, stop: 60, defer: 60 },
        sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      })
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  test("prints the frozen non-primary pilot without provider access", async () => {
    const child = Bun.spawn([Bun.which("bun")!, "src/cli.ts", "pilot-plan"], {
      cwd: import.meta.dir + "/..",
      stdout: "pipe",
      stderr: "pipe",
    })
    const [exitCode, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ])
    expect(exitCode, stderr).toBe(0)
    expect(JSON.parse(stdout)).toMatchObject({
      taskID: "psf__requests-1142",
      dataset: "princeton-nlp/SWE-bench_Verified",
      strategy: "supervisor",
      imageDigest: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
      runID: expect.stringMatching(/^adr_[a-f0-9]{20}$/),
    })
  })

  test("prints the isolated boundary-source plan without provider access", async () => {
    const child = Bun.spawn([Bun.which("bun")!, "src/cli.ts", "boundary-plan"], {
      cwd: import.meta.dir + "/..",
      stdout: "pipe",
      stderr: "pipe",
    })
    const [exitCode, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ])
    expect(exitCode, stderr).toBe(0)
    const runs = stdout
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line))
    const formal = new Set(createRunPlan(parseManifest(manifestInput)).map((run) => run.id))
    expect(runs).toHaveLength(96)
    expect(runs.every((run) => run.strategy === "supervisor" && !formal.has(run.id))).toBeTrue()
  })

  test("requires a sealed boundary preflight before loading its paid executor", async () => {
    const run = createBoundaryRunPlan(parseManifest(manifestInput))[0]
    const child = Bun.spawn(
      [Bun.which("bun")!, "src/cli.ts", "boundary-run", "--execute", "--executor", "/usr/bin/true", "--run-id", run.id],
      { cwd: import.meta.dir + "/..", stdout: "pipe", stderr: "pipe" },
    )
    const [exitCode, stderr] = await Promise.all([child.exited, new Response(child.stderr).text()])
    expect(exitCode).toBe(1)
    expect(stderr).toContain("--preflight PATH is required")
  })

  test("keeps the non-primary pilot fail-closed without explicit execution", async () => {
    const child = Bun.spawn([Bun.which("bun")!, "src/cli.ts", "pilot"], {
      cwd: import.meta.dir + "/..",
      stdout: "pipe",
      stderr: "pipe",
    })
    const [exitCode, stderr] = await Promise.all([child.exited, new Response(child.stderr).text()])
    expect(exitCode).toBe(1)
    expect(stderr).toContain("Paid pilot execution is disabled")
  })

  test("requires a sealed preflight before loading the paid pilot executor", async () => {
    const child = Bun.spawn([Bun.which("bun")!, "src/cli.ts", "pilot", "--execute", "--executor", "/usr/bin/true"], {
      cwd: import.meta.dir + "/..",
      stdout: "pipe",
      stderr: "pipe",
    })
    const [exitCode, stderr] = await Promise.all([child.exited, new Response(child.stderr).text()])
    expect(exitCode).toBe(1)
    expect(stderr).toContain("--preflight PATH is required")
  })

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
              "deepseek-v4-pro": { id: "deepseek-v4-pro" },
              "qwen3.7-max": { id: "qwen3.7-max" },
              "deepseek-v4-flash": { id: "deepseek-v4-flash" },
              "qwen3.8-max": { id: "qwen3.8-max" },
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
        "deepseek-v4-pro",
        "qwen3.7-max",
        "deepseek-v4-flash",
        "qwen3.8-max",
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
      expect(await Bun.file(path.join(directory, "dry-run/patches/startup-baseline.json")).exists()).toBeTrue()
      expect(await Bun.file(path.join(directory, "dry-run/patches/startup-baseline.diff")).exists()).toBeTrue()
      expect(await Bun.file(path.join(directory, "results", "trajectories.jsonl")).exists()).toBeFalse()
      expect(await Bun.file(path.join(directory, "cost", "ledger.jsonl")).exists()).toBeFalse()
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})
