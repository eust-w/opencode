import { describe, expect, test } from "bun:test"
import { chmod, mkdir, mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import manifestInput from "../../../research/auto-drive/protocol/swe-evo-48.json"
import { createBoundaryRunPlan, createRunPlan, parseManifest } from "../src/protocol"
import { admitBoundaryInfrastructureRetry, admitInfrastructureRetry } from "../src/retry"

describe("paid experiment CLI gates", () => {
  test("ships a resumable pairwise formal runner with the annotation gate", async () => {
    const script = await Bun.file(
      path.resolve(import.meta.dir, "../../../research/auto-drive/execution/run-formal-r1.sh"),
    ).text()
    expect(script).toContain("--annotations")
    expect(script).toContain("--run-id")
    expect(script).toContain("batch_size=2")
    expect(script).toContain("accepted=384")
  })

  test("ships a label-blind bounded boundary augmentation runner", async () => {
    const script = await Bun.file(
      new URL("../../../research/auto-drive/execution/run-boundary-augmentation-r1.sh", import.meta.url),
    ).text()
    expect(script).toContain("candidate_count")
    expect(script).toContain('if [ "$candidate_count" -ge 180 ]')
    expect(script).toContain("--augmentation")
    expect(script).toContain("batch_size=2")
    expect(script).toContain('dispositions" -ne 48')
  })

  test("ships a fail-closed post-boundary pipeline", async () => {
    const script = await Bun.file(
      new URL("../../../research/auto-drive/execution/run-post-boundary-r1.sh", import.meta.url),
    ).text()
    expect(script).toContain("set -euo pipefail")
    expect(script).toContain("ensure_preflight")
    expect(script).toContain("research-preflight.ts")
    expect(script).toContain("run-boundary-augmentation-r1.sh")
    expect(script).toContain("model-qwen3.7-max")
    expect(script).toContain("model-deepseek-v4-flash")
    expect(script).toContain("model-deepseek-v4-pro-adjudicator")
    expect(script).toContain("annotations-freeze")
    expect(script).toContain("ablation-runner.ts")
    expect(script).toContain("ablation-analyze")
    expect(script).toContain("run-formal-r1.sh")
  })

  test("ships a bounded source-to-pipeline watcher", async () => {
    const script = await Bun.file(
      new URL("../../../research/auto-drive/execution/watch-boundary-then-run-r1.sh", import.meta.url),
    ).text()
    expect(script).toContain('while kill -0 "$runner_pid"')
    expect(script).toContain("accepted + excluded")
    expect(script).toContain("-ne 96")
    expect(script).toContain("seq 1 120")
    expect(script).toContain("run-post-boundary-r1.sh")
  })

  test("ships an autonomous boundary finalizer that refuses incomplete campaigns", async () => {
    const script = await Bun.file(
      path.resolve(import.meta.dir, "../../../research/auto-drive/execution/finalize-boundary-r1.sh"),
    ).text()
    expect(script).toContain("completed" )
    expect(script).toContain("-ne 96")
    expect(script).toContain("annotations-extract")
    expect(script).toContain("candidates.jsonl")
  })

  test("ships a boundary runner pinned to the isolated Docker storage gate", async () => {
    const script = await Bun.file(
      path.resolve(import.meta.dir, "../../../research/auto-drive/execution/run-boundary-r1-v10.sh"),
    ).text()
    expect(script).toContain("DOCKER_HOST=unix:///run/autodrive-docker2.sock")
    expect(script).toContain("AUTODRIVE_DOCKER_EGRESS_NETWORK=autodrive-egress")
    expect(script).toContain("docker_storage=/dev/shm/autodrive-docker2-data")
    expect(script).toContain('docker info --format "{{.Driver}} {{.DockerRootDir}}"')
    expect(script).toContain('df --output=avail -k "$docker_storage"')
    expect(script).toContain("52428800")
  })

  test("ships a deadline-safe runner pinned to the exact reconciled exclusion", async () => {
    const script = await Bun.file(
      path.resolve(import.meta.dir, "../../../research/auto-drive/execution/run-boundary-r1-v11.sh"),
    ).text()
    expect(script).toContain("autodrive-workspace-8b90c2f545")
    expect(script).toContain("b2a4108c66a6a3955315dd33286322917869a6f0c1f3d33d9947eb331dc929e5")
    expect(script).toContain("deadline_receipt_sha256=67996df4")
    expect(script).toContain("deadline_exclusion_sha256=325d7f01")
    expect(script).toContain("DOCKER_HOST=unix:///run/autodrive-docker2.sock")
  })

  test("admits the same sealed zero-cost retry contract for formal runs", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "autodrive-formal-retry-"))
    try {
      const run = createRunPlan(parseManifest(manifestInput))[0]
      await writeZeroCostInfrastructureReceipt(directory, run)
      expect(
        await admitInfrastructureRetry({
          artifactRoot: directory,
          ledgerPath: path.join(directory, "formal", "ledger.jsonl"),
          run,
        }),
      ).toBe(2)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

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

  test("requires explicit labeled inputs before balanced annotation selection", async () => {
    const child = Bun.spawn([Bun.which("bun")!, "src/cli.ts", "annotations-select"], {
      cwd: import.meta.dir + "/..",
      stdout: "pipe",
      stderr: "pipe",
    })
    const [exitCode, stderr] = await Promise.all([child.exited, new Response(child.stderr).text()])
    expect(exitCode).toBe(1)
    expect(stderr).toContain("--candidates PATH is required")
  })

  test("keeps post-session spend reconciliation explicit and single-run", async () => {
    const child = Bun.spawn([Bun.which("bun")!, "src/cli.ts", "boundary-reconcile-spend"], {
      cwd: import.meta.dir + "/..",
      stdout: "pipe",
      stderr: "pipe",
    })
    const [exitCode, stderr] = await Promise.all([child.exited, new Response(child.stderr).text()])
    expect(exitCode).toBe(1)
    expect(stderr).toContain("--artifact-root PATH is required")
  })

  test("keeps grader scanner reconciliation explicit and single-run", async () => {
    const child = Bun.spawn([Bun.which("bun")!, "src/cli.ts", "boundary-reconcile-grader-scanner"], {
      cwd: import.meta.dir + "/..",
      stdout: "pipe",
      stderr: "pipe",
    })
    const [exitCode, stderr] = await Promise.all([child.exited, new Response(child.stderr).text()])
    expect(exitCode).toBe(1)
    expect(stderr).toContain("--artifact-root PATH is required")
  })

  test("ships an exact per-request deadline reconciliation command", async () => {
    const packageJSON = await Bun.file(path.join(import.meta.dir, "../package.json")).json()
    expect(packageJSON.scripts["boundary:reconcile-deadline"]).toBe("bun scripts/reconcile-executor-deadline.ts")
    const script = await Bun.file(path.join(import.meta.dir, "../scripts/reconcile-executor-deadline.ts")).text()
    expect(script).toContain('url.searchParams.set("summarize", "false")')
    expect(script).toContain("reconcileExecutorDeadlineFailure")
    expect(script).toContain("settleBoundaryExclusion")
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
          "--method",
          "model-panel",
        ],
        { cwd: import.meta.dir + "/..", stdout: "pipe", stderr: "pipe" },
      )
      const [exitCode, stderr] = await Promise.all([child.exited, new Response(child.stderr).text()])
      expect(exitCode, stderr).toBe(0)
      expect((await Bun.file(path.join(output, "development.jsonl")).text()).trim().split("\n")).toHaveLength(54)
      expect((await Bun.file(path.join(output, "test.jsonl")).text()).trim().split("\n")).toHaveLength(126)
      expect(await Bun.file(path.join(output, "seal.json")).json()).toMatchObject({
        schemaVersion: 3,
        referenceStandard: "independent-model-panel",
        kappa: 1,
        counts: { continue: 60, stop: 60, defer: 60 },
        corpusSHA256: expect.stringMatching(/^[a-f0-9]{64}$/),
        annotators: ["annotator-a", "annotator-b", "adjudicator"],
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

  test("projects the frozen SWE-EVO task inputs into boundary executors", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "autodrive-boundary-inputs-"))
    try {
      const preflight = path.join(directory, "preflight")
      const metadata = path.join(preflight, "metadata/models.json")
      const workerProbe = path.join(preflight, "probes/worker.json")
      const controllerProbe = path.join(preflight, "probes/controller.json")
      const capture = path.join(directory, "task-root.txt")
      const executor = path.join(directory, "executor.ts")
      await Promise.all([
        mkdir(path.dirname(metadata), { recursive: true }),
        mkdir(path.dirname(workerProbe), { recursive: true }),
      ])
      const model = (id: string, output: number) => ({
        id,
        name: id,
        release_date: "2026-08-30",
        attachment: false,
        reasoning: true,
        temperature: true,
        tool_call: true,
        limit: { context: 131_072, output },
        modalities: { input: ["text"], output: ["text"] },
      })
      const metadataContent =
        JSON.stringify({
          "d-robotics": {
            models: {
              "deepseek-v4-pro": model("deepseek-v4-pro", 4_096),
              "qwen3.8-max": model("qwen3.8-max", 1_024),
            },
          },
        }) + "\n"
      const workerContent =
        JSON.stringify({ billing: "paid", modelVersion: "deepseek-v4-pro", trajectoryCapacity: 96 }) + "\n"
      const controllerContent =
        JSON.stringify({ billing: "paid", modelVersion: "qwen3.8-max", trajectoryCapacity: 96 }) + "\n"
      const digest = (content: string) => new Bun.CryptoHasher("sha256").update(content).digest("hex")
      await Promise.all([
        Bun.write(metadata, metadataContent),
        Bun.write(workerProbe, workerContent),
        Bun.write(controllerProbe, controllerContent),
        Bun.write(
          executor,
          `#!/usr/bin/env bun\nimport path from "node:path"\nconst root = Bun.env.AUTODRIVE_TASK_INPUT_ROOT\nconst task = root ? Bun.file(path.join(root, "conan-io__conan_2.0.14_2.0.15.json")) : undefined\nawait Bun.write(Bun.env.AUTODRIVE_TEST_ENV_CAPTURE!, root && task && await task.exists() ? root : "missing")\nconsole.error("zero-cost infrastructure probe")\nprocess.exit(75)\n`,
        ),
      ])
      await Promise.all([
        chmod(executor, 0o755),
        Bun.write(
          path.join(preflight, "receipt.json"),
          JSON.stringify({
            schemaVersion: 1,
            protocol: "auto-drive-swe-evo-v1.14",
            scope: "boundary",
            capturedAt: new Date(Date.now() - 60_000).toISOString(),
            expiresAt: new Date(Date.now() + 60_000).toISOString(),
            models: [
              {
                model: "d-robotics/deepseek-v4-pro",
                catalogModelID: "deepseek-v4-pro",
                modelVersion: "deepseek-v4-pro",
                credentialPresent: true,
                billing: "paid",
                trajectoryCapacity: 96,
                probe: { path: "probes/worker.json", sha256: digest(workerContent) },
              },
              {
                model: "d-robotics/qwen3.8-max",
                catalogModelID: "qwen3.8-max",
                modelVersion: "qwen3.8-max",
                credentialPresent: true,
                billing: "paid",
                trajectoryCapacity: 96,
                probe: { path: "probes/controller.json", sha256: digest(controllerContent) },
              },
            ],
            modelMetadata: { path: "metadata/models.json", sha256: digest(metadataContent) },
            runtime: {
              disableExternalSkills: true,
              disableClaudeCodeSkills: true,
              disableModelsFetch: true,
            },
          }) + "\n",
        ),
      ])
      const run = createBoundaryRunPlan(parseManifest(manifestInput))[0]
      const child = Bun.spawn(
        [
          Bun.which("bun")!,
          "src/cli.ts",
          "boundary-run",
          "--execute",
          "--executor",
          executor,
          "--preflight",
          path.join(preflight, "receipt.json"),
          "--artifact-root",
          directory,
          "--run-id",
          run.id,
        ],
        {
          cwd: import.meta.dir + "/..",
          stdout: "pipe",
          stderr: "pipe",
          env: { ...Bun.env, AUTODRIVE_TEST_ENV_CAPTURE: capture },
        },
      )
      await child.exited
      expect(await Bun.file(capture).text()).toEndWith("research/auto-drive/protocol/tasks")
      expect(await Bun.file(path.join(directory, "boundary/trajectories.jsonl")).exists()).toBeFalse()
      expect(await Bun.file(path.join(directory, "boundary/ledger.jsonl")).exists()).toBeFalse()
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  test("recovers a strict charged boundary exclusion before invoking its executor again", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "autodrive-boundary-exclusion-"))
    const run = createBoundaryRunPlan(parseManifest(manifestInput))[5]!
    try {
      const preflight = await writeBoundaryPreflight(directory)
      const marker = path.join(directory, "executor-called")
      const executor = path.join(directory, "executor.ts")
      await Bun.write(
        executor,
        `#!/usr/bin/env bun\nawait Bun.write(${JSON.stringify(marker)}, "called")\nprocess.exit(1)\n`,
      )
      await chmod(executor, 0o755)
      const artifacts = await Promise.all(
        [
          [path.join("raw", `${run.id}.jsonl`), '{"type":"executor-failed"}\n'],
          [path.join("gateway", run.id, "requests.jsonl"), '{"sequence":0}\n'],
          [path.join("gateway", run.id, "proxy.jsonl"), '{"type":"provider-response"}\n'],
        ].map(async ([relative, content]) => {
          const target = path.join(directory, relative!)
          await Bun.write(target, content!)
          return { path: relative!, sha256: digest(content!) }
        }),
      )
      await Bun.write(
        path.join(directory, "failures", run.id, "attempt-1.json"),
        JSON.stringify({
          schemaVersion: 1,
          protocol: "auto-drive-swe-evo-v1.14",
          classification: "excluded-charged-evaluation-failure",
          stage: "final-grader-test-patch-conflict",
          code: "model-patch-conflicts-frozen-test-patch",
          runID: run.id,
          taskID: run.taskID,
          attempt: 1,
          startedAt: "2026-08-30T20:19:23.273Z",
          recordedAt: "2026-08-30T20:26:24.794Z",
          error: { name: "Error", message: "Model patch conflicts with the frozen test patch" },
          gateway: {
            settlement: { attempted: true, completed: true },
            requests: 1,
            responses: 1,
            non200Responses: 0,
            proxyErrors: 0,
            usageCompleteResponses: 1,
            promptTokens: 100,
            completionTokens: 20,
            baselineSpendUSD: 1,
            settledSpendUSD: 1.1,
            observedSpendDeltaUSD: 0.1,
          },
          acceptance: { trajectoryAccepted: false, ledgerRowWritten: false },
          artifacts,
          recordingErrors: [],
        }),
      )

      const child = Bun.spawn(
        [
          Bun.which("bun")!,
          "src/cli.ts",
          "boundary-run",
          "--execute",
          "--executor",
          executor,
          "--preflight",
          preflight,
          "--artifact-root",
          directory,
          "--run-id",
          run.id,
        ],
        { cwd: import.meta.dir + "/..", stdout: "pipe", stderr: "pipe" },
      )
      const [exitCode, stdout, stderr] = await Promise.all([
        child.exited,
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
      ])

      expect(exitCode, stderr).toBe(0)
      expect(JSON.parse(stdout)).toMatchObject({ completed: 0, excluded: 1, remaining: 95 })
      expect(await Bun.file(marker).exists()).toBeFalse()
      expect(await Bun.file(path.join(directory, "boundary/exclusions", `${run.id}.json`)).exists()).toBeTrue()
      expect((await Bun.file(path.join(directory, "boundary/ledger.jsonl")).text()).trim().split("\n")).toHaveLength(1)
      expect(await Bun.file(path.join(directory, "boundary/trajectories.jsonl")).exists()).toBeFalse()
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  test("settles a strict charged exclusion produced by the current executor invocation", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "autodrive-boundary-current-exclusion-"))
    const run = createBoundaryRunPlan(parseManifest(manifestInput))[6]!
    try {
      const preflight = await writeBoundaryPreflight(directory)
      const marker = path.join(directory, "executor-called")
      const executor = path.join(directory, "executor.ts")
      await Bun.write(
        executor,
        `#!/usr/bin/env bun
import { mkdir } from "node:fs/promises"
import path from "node:path"
const input = JSON.parse(await Bun.stdin.text())
const root = Bun.env.AUTODRIVE_EVAL_ARTIFACT_ROOT
if (!root) process.exit(2)
await Bun.write(${JSON.stringify(marker)}, "called")
const entries = [
  [path.join("raw", input.run.id + ".jsonl"), '{"type":"executor-failed"}\\n'],
  [path.join("gateway", input.run.id, "requests.jsonl"), '{"sequence":0}\\n'],
  [path.join("gateway", input.run.id, "proxy.jsonl"), '{"type":"provider-response"}\\n'],
]
const artifacts = []
for (const [relative, content] of entries) {
  const target = path.join(root, relative)
  await mkdir(path.dirname(target), { recursive: true })
  await Bun.write(target, content)
  artifacts.push({ path: relative, sha256: new Bun.CryptoHasher("sha256").update(content).digest("hex") })
}
const receipt = path.join(root, "failures", input.run.id, "attempt-1.json")
await mkdir(path.dirname(receipt), { recursive: true })
await Bun.write(receipt, JSON.stringify({
  schemaVersion: 1,
  protocol: "auto-drive-swe-evo-v1.14",
  classification: "excluded-charged-evaluation-failure",
  stage: "final-grader-test-patch-conflict",
  code: "model-patch-conflicts-frozen-test-patch",
  runID: input.run.id,
  taskID: input.run.taskID,
  attempt: 1,
  startedAt: "2026-08-30T20:19:23.273Z",
  recordedAt: "2026-08-30T20:26:24.794Z",
  error: { name: "Error", message: "Model patch conflicts with the frozen test patch" },
  gateway: {
    settlement: { attempted: true, completed: true },
    requests: 1,
    responses: 1,
    non200Responses: 0,
    proxyErrors: 0,
    usageCompleteResponses: 1,
    promptTokens: 100,
    completionTokens: 20,
    baselineSpendUSD: 1,
    settledSpendUSD: 1.1,
    observedSpendDeltaUSD: 0.1,
  },
  acceptance: { trajectoryAccepted: false, ledgerRowWritten: false },
  artifacts,
  recordingErrors: [],
}))
console.error("Model patch conflicts with the frozen test patch")
process.exit(1)
`,
      )
      await chmod(executor, 0o755)

      const child = Bun.spawn(
        [
          Bun.which("bun")!,
          "src/cli.ts",
          "boundary-run",
          "--execute",
          "--executor",
          executor,
          "--preflight",
          preflight,
          "--artifact-root",
          directory,
          "--run-id",
          run.id,
        ],
        { cwd: import.meta.dir + "/..", stdout: "pipe", stderr: "pipe" },
      )
      const [exitCode, stdout, stderr] = await Promise.all([
        child.exited,
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
      ])

      expect(exitCode, stderr).toBe(0)
      expect(JSON.parse(stdout)).toMatchObject({ completed: 0, excluded: 1, remaining: 95 })
      expect(await Bun.file(marker).text()).toBe("called")
      expect(await Bun.file(path.join(directory, "boundary/exclusions", `${run.id}.json`)).exists()).toBeTrue()
      expect((await Bun.file(path.join(directory, "boundary/ledger.jsonl")).text()).trim().split("\n")).toHaveLength(1)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  test("resumes a recorded zero-cost setup failure as attempt two without overwriting attempt one", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "autodrive-boundary-retry-"))
    const run = createBoundaryRunPlan(parseManifest(manifestInput))[6]!
    try {
      const preflight = await writeBoundaryPreflight(directory)
      const marker = path.join(directory, "attempt.txt")
      const executor = path.join(directory, "executor.ts")
      await Bun.write(
        executor,
        `#!/usr/bin/env bun
const input = JSON.parse(await Bun.stdin.text())
await Bun.write(${JSON.stringify(marker)}, String(input.attempt))
console.error("stop after capturing the resumed attempt")
process.exit(1)
`,
      )
      await chmod(executor, 0o755)
      const receipt = await writeZeroCostInfrastructureReceipt(directory, run)
      const before = digest(await Bun.file(receipt).text())

      const child = Bun.spawn(
        [
          Bun.which("bun")!,
          "src/cli.ts",
          "boundary-run",
          "--execute",
          "--resume-infrastructure",
          "--executor",
          executor,
          "--preflight",
          preflight,
          "--artifact-root",
          directory,
          "--run-id",
          run.id,
        ],
        { cwd: import.meta.dir + "/..", stdout: "pipe", stderr: "pipe" },
      )
      const [exitCode] = await Promise.all([child.exited, new Response(child.stderr).text()])

      expect(exitCode).toBe(1)
      expect(await Bun.file(marker).text()).toBe("2")
      expect(digest(await Bun.file(receipt).text())).toBe(before)
      expect(await Bun.file(path.join(directory, "boundary/trajectories.jsonl")).exists()).toBeFalse()
      expect(await Bun.file(path.join(directory, "boundary/ledger.jsonl")).exists()).toBeFalse()
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  test("requires explicit retry adjudication before touching a pending failure receipt", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "autodrive-boundary-retry-gate-"))
    const run = createBoundaryRunPlan(parseManifest(manifestInput))[6]!
    try {
      const preflight = await writeBoundaryPreflight(directory)
      const marker = path.join(directory, "executor-called")
      const executor = path.join(directory, "executor.ts")
      await Bun.write(
        executor,
        `#!/usr/bin/env bun\nawait Bun.write(${JSON.stringify(marker)}, "called")\nprocess.exit(1)\n`,
      )
      await chmod(executor, 0o755)
      await writeZeroCostInfrastructureReceipt(directory, run)

      const child = Bun.spawn(
        [
          Bun.which("bun")!,
          "src/cli.ts",
          "boundary-run",
          "--execute",
          "--executor",
          executor,
          "--preflight",
          preflight,
          "--artifact-root",
          directory,
          "--run-id",
          run.id,
        ],
        { cwd: import.meta.dir + "/..", stdout: "pipe", stderr: "pipe" },
      )
      const [exitCode, stderr] = await Promise.all([child.exited, new Response(child.stderr).text()])

      expect(exitCode).toBe(1)
      expect(stderr).toContain("requires explicit --resume-infrastructure adjudication")
      expect(await Bun.file(marker).exists()).toBeFalse()
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  test("admits only the exact tracked startup-baseline infrastructure failure", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "autodrive-boundary-retry-baseline-"))
    const run = createBoundaryRunPlan(parseManifest(manifestInput))[6]!
    try {
      const receipt = await writeZeroCostInfrastructureReceipt(directory, run, {
        stage: "startup-baseline",
        message: "Task image has tracked startup changes",
      })
      expect(
        await admitBoundaryInfrastructureRetry({
          artifactRoot: directory,
          ledgerPath: path.join(directory, "boundary/ledger.jsonl"),
          run,
        }),
      ).toBe(2)

      const content = await Bun.file(receipt).json()
      content.stage = "setup"
      await Bun.write(receipt, JSON.stringify(content))
      await expect(
        admitBoundaryInfrastructureRetry({
          artifactRoot: directory,
          ledgerPath: path.join(directory, "boundary/ledger.jsonl"),
          run,
        }),
      ).rejects.toThrow("not a predefined zero-cost infrastructure failure")
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  test("rejects a retry receipt with any observed provider usage", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "autodrive-boundary-retry-cost-"))
    const run = createBoundaryRunPlan(parseManifest(manifestInput))[6]!
    try {
      const preflight = await writeBoundaryPreflight(directory)
      const marker = path.join(directory, "executor-called")
      const executor = path.join(directory, "executor.ts")
      await Bun.write(
        executor,
        `#!/usr/bin/env bun\nawait Bun.write(${JSON.stringify(marker)}, "called")\nprocess.exit(1)\n`,
      )
      await chmod(executor, 0o755)
      const receipt = await writeZeroCostInfrastructureReceipt(directory, run)
      const content = await Bun.file(receipt).json()
      content.gateway.requests = 1
      content.gateway.promptTokens = 1
      await Bun.write(receipt, JSON.stringify(content))

      const child = Bun.spawn(
        [
          Bun.which("bun")!,
          "src/cli.ts",
          "boundary-run",
          "--execute",
          "--resume-infrastructure",
          "--executor",
          executor,
          "--preflight",
          preflight,
          "--artifact-root",
          directory,
          "--run-id",
          run.id,
        ],
        { cwd: import.meta.dir + "/..", stdout: "pipe", stderr: "pipe" },
      )
      const [exitCode, stderr] = await Promise.all([child.exited, new Response(child.stderr).text()])

      expect(exitCode).toBe(1)
      expect(stderr).toContain("require complete zero-cost failure evidence")
      expect(await Bun.file(marker).exists()).toBeFalse()
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
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

  test("requires the sealed human annotation corpus before formal execution", async () => {
    const run = createRunPlan(parseManifest(manifestInput))[0]
    const child = Bun.spawn(
      [
        Bun.which("bun")!,
        "src/cli.ts",
        "run",
        "--execute",
        "--preflight",
        "/tmp/preflight.json",
        "--artifact-root",
        "/tmp/autodrive-artifacts",
        "--executor",
        "/usr/bin/true",
        "--run-id",
        run.id,
      ],
      { cwd: import.meta.dir + "/..", stdout: "pipe", stderr: "pipe" },
    )
    const [exitCode, stderr] = await Promise.all([child.exited, new Response(child.stderr).text()])
    expect(exitCode).toBe(1)
    expect(stderr).toContain("--annotations PATH is required")
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

async function writeBoundaryPreflight(directory: string) {
  const preflight = path.join(directory, "preflight")
  const metadata = path.join(preflight, "metadata/models.json")
  const workerProbe = path.join(preflight, "probes/worker.json")
  const controllerProbe = path.join(preflight, "probes/controller.json")
  const model = (id: string, output: number) => ({
    id,
    name: id,
    release_date: "2026-08-30",
    attachment: false,
    reasoning: true,
    temperature: true,
    tool_call: true,
    limit: { context: 131_072, output },
    modalities: { input: ["text"], output: ["text"] },
  })
  const metadataContent =
    JSON.stringify({
      "d-robotics": {
        models: {
          "deepseek-v4-pro": model("deepseek-v4-pro", 4_096),
          "qwen3.8-max": model("qwen3.8-max", 1_024),
        },
      },
    }) + "\n"
  const workerContent =
    JSON.stringify({ billing: "paid", modelVersion: "deepseek-v4-pro", trajectoryCapacity: 96 }) + "\n"
  const controllerContent =
    JSON.stringify({ billing: "paid", modelVersion: "qwen3.8-max", trajectoryCapacity: 96 }) + "\n"
  await Promise.all([
    Bun.write(metadata, metadataContent),
    Bun.write(workerProbe, workerContent),
    Bun.write(controllerProbe, controllerContent),
  ])
  const receipt = path.join(preflight, "receipt.json")
  await Bun.write(
    receipt,
    JSON.stringify({
      schemaVersion: 1,
      protocol: "auto-drive-swe-evo-v1.14",
      scope: "boundary",
      capturedAt: new Date(Date.now() - 60_000).toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      models: [
        {
          model: "d-robotics/deepseek-v4-pro",
          catalogModelID: "deepseek-v4-pro",
          modelVersion: "deepseek-v4-pro",
          credentialPresent: true,
          billing: "paid",
          trajectoryCapacity: 96,
          probe: { path: "probes/worker.json", sha256: digest(workerContent) },
        },
        {
          model: "d-robotics/qwen3.8-max",
          catalogModelID: "qwen3.8-max",
          modelVersion: "qwen3.8-max",
          credentialPresent: true,
          billing: "paid",
          trajectoryCapacity: 96,
          probe: { path: "probes/controller.json", sha256: digest(controllerContent) },
        },
      ],
      modelMetadata: { path: "metadata/models.json", sha256: digest(metadataContent) },
      runtime: { disableExternalSkills: true, disableClaudeCodeSkills: true, disableModelsFetch: true },
    }) + "\n",
  )
  return receipt
}

async function writeZeroCostInfrastructureReceipt(
  directory: string,
  run: ReturnType<typeof createBoundaryRunPlan>[number],
  failure = { stage: "setup", message: "Gateway proxy did not become ready" },
) {
  const relative = path.join("raw", `${run.id}.jsonl`)
  const content = '{"type":"executor-failed"}\n'
  const receipt = path.join(directory, "failures", run.id, "attempt-1.json")
  await Promise.all([
    mkdir(path.dirname(path.join(directory, relative)), { recursive: true }),
    mkdir(path.dirname(receipt), { recursive: true }),
  ])
  await Bun.write(path.join(directory, relative), content)
  await Bun.write(
    receipt,
    JSON.stringify({
      schemaVersion: 1,
      protocol: "auto-drive-swe-evo-v1.14",
      classification: "executor-failure",
      stage: failure.stage,
      code: "executor-error",
      runID: run.id,
      taskID: run.taskID,
      attempt: 1,
      startedAt: "2026-08-30T21:00:06.929Z",
      recordedAt: "2026-08-30T21:03:56.711Z",
      error: { name: "Error", message: failure.message },
      gateway: {
        settlement: { attempted: false, completed: true },
        requests: 0,
        responses: 0,
        non200Responses: 0,
        proxyErrors: 0,
        usageCompleteResponses: 0,
        promptTokens: 0,
        completionTokens: 0,
        baselineSpendUSD: 4.8200276,
      },
      acceptance: { trajectoryAccepted: false, ledgerRowWritten: false },
      artifacts: [{ path: relative, sha256: digest(content) }],
      recordingErrors: [],
    }),
  )
  return receipt
}

function digest(content: string) {
  return new Bun.CryptoHasher("sha256").update(content).digest("hex")
}
