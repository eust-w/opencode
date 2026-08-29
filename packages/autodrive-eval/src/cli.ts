import { appendFile, mkdir } from "node:fs/promises"
import path from "node:path"
import manifestInput from "../../../research/auto-drive/protocol/swe-evo-48.json"
import { assertTrajectoryProvenance } from "./acceptance"
import {
  analyzeTrajectories,
  assertSecretFree,
  parseTrajectory,
  verifyTrajectoryArtifacts,
  type Trajectory,
} from "./artifact"
import { summarizeBudget, type BudgetCategory, type LedgerEntry } from "./budget"
import { renderTaskManifest } from "./paper"
import { createModelMetadataSnapshot, loadPreflight, PreflightScope } from "./preflight"
import { createRunPlan, parseManifest, protocol, type Run } from "./protocol"
import { executeRuns, InfrastructureFailure, type ExecutionContext } from "./runner"

const root = path.resolve(import.meta.dir, "../../..")
const manifest = parseManifest(manifestInput)
const plan = createRunPlan(manifest)
const command = Bun.argv[2] ?? "validate"
const args = Bun.argv.slice(3)

if (command === "plan") await printPlan()
if (command === "paper-protocol") await paperProtocol()
if (command === "snapshot-models") await snapshotModels()
if (command === "preflight") await checkPreflight()
if (command === "validate") await validate()
if (command === "analyze") await analyze()
if (command === "verify-executor") await verifyExecutor()
if (command === "canary") await canary()
if (command === "run") await run()
if (
  !new Set([
    "plan",
    "paper-protocol",
    "snapshot-models",
    "preflight",
    "validate",
    "analyze",
    "verify-executor",
    "canary",
    "run",
  ]).has(command)
)
  fail(`Unknown command: ${command}`)

async function printPlan() {
  const content = plan.map((run) => JSON.stringify(run)).join("\n") + "\n"
  const output = option("output")
  if (!output) {
    process.stdout.write(content)
    return
  }
  await mkdir(path.dirname(path.resolve(output)), { recursive: true })
  await Bun.write(path.resolve(output), content)
  console.log(JSON.stringify({ output: path.resolve(output), trajectories: plan.length }))
}

async function paperProtocol() {
  const output = path.resolve(
    option("output") ?? path.join(root, "research/auto-drive/paper/generated/task-manifest.tex"),
  )
  await mkdir(path.dirname(output), { recursive: true })
  await Bun.write(output, renderTaskManifest(manifest.tasks))
  console.log(JSON.stringify({ output, tasks: manifest.tasks.length }))
}

async function snapshotModels() {
  const source = option("source")
  const output = option("output")
  const resolutions = option("resolutions")
  if (!source || !output || !resolutions) fail("--source, --output and --resolutions are required")
  const content = await Bun.file(path.resolve(source)).text()
  assertSecretFree(content)
  const snapshot = createModelMetadataSnapshot(JSON.parse(content))
  await Promise.all([
    mkdir(path.dirname(path.resolve(output)), { recursive: true }),
    mkdir(path.dirname(path.resolve(resolutions)), { recursive: true }),
  ])
  const serialized = JSON.stringify(snapshot.providers, null, 2) + "\n"
  await Promise.all([
    Bun.write(path.resolve(output), serialized),
    Bun.write(path.resolve(resolutions), JSON.stringify(snapshot.resolutions, null, 2) + "\n"),
  ])
  console.log(
    JSON.stringify({
      output: path.resolve(output),
      sha256: new Bun.CryptoHasher("sha256").update(serialized).digest("hex"),
      resolutions: path.resolve(resolutions),
    }),
  )
}

async function checkPreflight() {
  const receipt = option("receipt")
  if (!receipt) fail("--receipt PATH is required")
  const scope = PreflightScope.safeParse(option("scope") ?? "canary")
  if (!scope.success) fail("--scope must be canary or full")
  const loaded = await loadPreflight(path.resolve(receipt), {
    scope: scope.data,
  })
  console.log(
    JSON.stringify(
      {
        status: "ready",
        scope: loaded.receipt.scope,
        expiresAt: loaded.receipt.expiresAt,
        models: loaded.receipt.models.map((model) => ({
          model: model.model,
          modelVersion: model.modelVersion,
          trajectoryCapacity: model.trajectoryCapacity,
        })),
        modelMetadataSHA256: loaded.receipt.modelMetadata.sha256,
        receiptSHA256: loaded.sha256,
      },
      null,
      2,
    ),
  )
}

async function validate() {
  const required = [
    "research/auto-drive/protocol/swe-evo-48.json",
    "research/auto-drive/protocol/preregistration.md",
    "research/auto-drive/protocol/model-requests.json",
    "research/auto-drive/protocol/fault-injection.json",
    "research/auto-drive/annotations/guidelines.md",
    "research/auto-drive/host-executor.md",
    "research/auto-drive/environment.lock.json",
  ]
  const missing = []
  for (const relative of required) {
    if (!(await Bun.file(path.join(root, relative)).exists())) missing.push(relative)
  }
  if (missing.length) fail(`Missing frozen research artifacts:\n${missing.join("\n")}`)

  const resultsPath = path.resolve(
    option("results") ?? path.join(root, "research/auto-drive/results/trajectories.jsonl"),
  )
  const records = await readJSONL(resultsPath, parseTrajectory)
  const ledgerPath = path.resolve(option("ledger") ?? path.join(root, "research/auto-drive/cost/ledger.jsonl"))
  const ledger = await readJSONL(ledgerPath, parseLedger)
  const budget = summarizeBudget(ledger)
  const completed = new Set(records.map((record) => record.runID))
  const unknown = records.filter((record) => !plan.some((run) => run.id === record.runID))
  if (unknown.length) fail(`Results contain ${unknown.length} run IDs outside the frozen plan`)
  console.log(
    JSON.stringify(
      {
        status: records.length === 384 ? "complete" : "pending",
        manifest: {
          tasks: manifest.tasks.length,
          commit: manifest.source.commit,
          sha256: manifest.source.sha256,
        },
        plan: {
          trajectories: plan.length,
          completed: completed.size,
          remaining: plan.length - completed.size,
        },
        budget,
        secrets: "not detected in indexed artifacts",
      },
      null,
      2,
    ),
  )
}

async function analyze() {
  const resultsPath = path.resolve(
    option("results") ?? path.join(root, "research/auto-drive/results/trajectories.jsonl"),
  )
  const records = await readJSONL(resultsPath, parseTrajectory)
  if (!records.length) fail("No real trajectories are available; analysis remains pending")
  const analysis = analyzeTrajectories(records)
  const output = path.resolve(option("output") ?? path.join(root, "research/auto-drive/results/derived"))
  await mkdir(output, { recursive: true })
  await Bun.write(path.join(output, "summary.json"), JSON.stringify(analysis, null, 2) + "\n")
  await Bun.write(path.join(output, "runs.csv"), toCSV(records))
  console.log(JSON.stringify({ output, trajectories: records.length }))
}

async function verifyExecutor() {
  const executorPath = option("executor")
  if (!executorPath) fail("--executor PATH is required")
  const artifactRoot = option("artifact-root")
  if (!artifactRoot) fail("--artifact-root PATH is required")
  const selected = selectOneRun()
  const resolvedArtifactRoot = path.resolve(artifactRoot)
  await mkdir(resolvedArtifactRoot, { recursive: true })
  const record = await invokeExecutor(path.resolve(executorPath), selected, 1, {
    context: { category: "pilot", maxCostUSD: 0, remainingUSD: 800 },
    env: dryRunEnvironment(resolvedArtifactRoot),
    timeoutMS: 30_000,
  })
  assertDryRunTrajectory(record, selected)
  await verifyTrajectoryArtifacts(record, resolvedArtifactRoot)
  console.log(
    JSON.stringify({
      status: "accepted",
      mode: "dry-run",
      runID: record.runID,
      costUSD: record.costUSD,
    }),
  )
}

async function canary() {
  if (!flag("execute")) fail("Paid canary execution is disabled; pass --execute after verify-executor succeeds")
  const selected = selectOneRun()
  if (selected.model !== protocol.models.primary) fail("Canary must use the frozen primary model")
  const preflightPath = option("preflight")
  if (!preflightPath) fail("--preflight PATH is required")
  const artifactRoot = option("artifact-root")
  if (!artifactRoot) fail("--artifact-root PATH is required")
  const executorPath = option("executor")
  if (!executorPath) fail("--executor PATH is required")
  const resolvedArtifactRoot = path.resolve(artifactRoot)
  const resolvedPreflightPath = path.resolve(preflightPath)
  assertInside(resolvedArtifactRoot, resolvedPreflightPath, "Preflight receipt")
  const preflight = await loadPreflight(resolvedPreflightPath, {
    scope: "canary",
  })
  const resultsPath = path.join(resolvedArtifactRoot, "canary", "trajectories.jsonl")
  const ledgerPath = path.join(resolvedArtifactRoot, "canary", "ledger.jsonl")
  const existing = await readJSONL(resultsPath, parseTrajectory)
  if (existing.length) fail("A paid canary result already exists for this artifact root")
  const ledger = await readJSONL(ledgerPath, parseLedger)
  const spent = summarizeBudget(ledger).categories.pilot
  const maxCostUSD = 50 - spent
  if (maxCostUSD <= 0) fail("Pilot budget is exhausted")
  await Promise.all([
    mkdir(path.dirname(resultsPath), { recursive: true }),
    mkdir(path.dirname(ledgerPath), { recursive: true }),
  ])
  const records = await executeRuns(
    [selected],
    createExecutor(path.resolve(executorPath), {
      artifactRoot: resolvedArtifactRoot,
      preflight,
      preflightPath: resolvedPreflightPath,
    }),
    {
      concurrency: 1,
      ledger,
      budget: () => ({ category: "pilot", maxCostUSD }),
      onRecord: async (record, entry) => {
        const serialized = JSON.stringify(record)
        assertSecretFree(serialized)
        await appendFile(resultsPath, serialized + "\n", {
          encoding: "utf8",
          flag: "a",
          mode: 0o600,
        })
        await appendFile(
          ledgerPath,
          JSON.stringify({
            timestamp: record.endedAt,
            runID: record.runID,
            category: entry.category,
            amountUSD: entry.amountUSD,
            promptTokens: record.promptTokens,
            completionTokens: record.completionTokens,
          }) + "\n",
          { encoding: "utf8", flag: "a", mode: 0o600 },
        )
      },
    },
  )
  console.log(
    JSON.stringify({
      status: "accepted",
      mode: "paid-canary",
      runID: records[0].runID,
      costUSD: records[0].costUSD,
    }),
  )
}

async function run() {
  if (!flag("execute")) fail("Paid execution is disabled; pass --execute after validating the executor and pilot")
  const preflightPath = option("preflight")
  if (!preflightPath) fail("--preflight PATH is required")
  const artifactRoot = option("artifact-root")
  if (!artifactRoot) fail("--artifact-root PATH is required")
  const executorPath = option("executor")
  if (!executorPath) fail("--executor PATH is required")
  const requested = values("run-id")
  if (!requested.length && !flag("all")) fail("Select --run-id ID (repeatable) or explicitly pass --all")
  const resultsPath = path.resolve(
    option("results") ?? path.join(root, "research/auto-drive/results/trajectories.jsonl"),
  )
  const ledgerPath = path.resolve(option("ledger") ?? path.join(root, "research/auto-drive/cost/ledger.jsonl"))
  const existing = await readJSONL(resultsPath, parseTrajectory)
  const completed = new Set(existing.map((record) => record.runID))
  const selected = plan.filter((run) => !completed.has(run.id) && (!requested.length || requested.includes(run.id)))
  if (!selected.length) fail("No pending frozen runs match the selection")
  const ledger = await readJSONL(ledgerPath, parseLedger)
  const resolvedPreflightPath = path.resolve(preflightPath)
  const resolvedArtifactRoot = path.resolve(artifactRoot)
  assertInside(resolvedArtifactRoot, resolvedPreflightPath, "Preflight receipt")
  const preflight = await loadPreflight(resolvedPreflightPath, {
    scope: "full",
  })
  await mkdir(path.dirname(resultsPath), { recursive: true })
  await mkdir(path.dirname(ledgerPath), { recursive: true })
  const records = await executeRuns(
    selected,
    createExecutor(path.resolve(executorPath), {
      artifactRoot: resolvedArtifactRoot,
      preflight,
      preflightPath: resolvedPreflightPath,
    }),
    {
      ledger,
      onRecord: async (record, entry) => {
        const serialized = JSON.stringify(record)
        assertSecretFree(serialized)
        await appendFile(resultsPath, serialized + "\n", {
          encoding: "utf8",
          flag: "a",
          mode: 0o600,
        })
        await appendFile(
          ledgerPath,
          JSON.stringify({
            timestamp: record.endedAt,
            runID: record.runID,
            category: entry.category,
            amountUSD: entry.amountUSD,
            promptTokens: record.promptTokens,
            completionTokens: record.completionTokens,
          }) + "\n",
          { encoding: "utf8", flag: "a", mode: 0o600 },
        )
      },
    },
  )
  console.log(
    JSON.stringify({
      completed: records.length,
      remaining: 384 - completed.size - records.length,
    }),
  )
}

function createExecutor(
  executable: string,
  options: {
    artifactRoot: string
    preflight: Awaited<ReturnType<typeof loadPreflight>>
    preflightPath: string
  },
) {
  return async (run: Run, attempt: number, context: ExecutionContext) => {
    const record = await invokeExecutor(executable, run, attempt, {
      context,
      timeoutMS: run.timeoutMinutes * 60_000,
      env: {
        ...Bun.env,
        AUTODRIVE_EVAL_ARTIFACT_ROOT: options.artifactRoot,
        AUTODRIVE_EVAL_PREFLIGHT_PATH: options.preflightPath,
        AUTODRIVE_EVAL_PREFLIGHT_SHA256: options.preflight.sha256,
        AUTODRIVE_EVAL_PROTOCOL: protocol.version,
        OPENCODE_DISABLE_CLAUDE_CODE_SKILLS: "1",
        OPENCODE_DISABLE_EXTERNAL_SKILLS: "1",
        OPENCODE_DISABLE_MODELS_FETCH: "1",
        OPENCODE_MODELS_PATH: path.resolve(
          path.dirname(options.preflightPath),
          options.preflight.receipt.modelMetadata.path,
        ),
      },
    })
    if (record.runID !== run.id || record.attempt !== attempt)
      throw new Error(`Executor returned mismatched provenance for ${run.id}`)
    const task = manifest.tasks.find((item) => item.instanceID === run.taskID)
    if (!task) throw new Error(`Frozen task is missing: ${run.taskID}`)
    assertTrajectoryProvenance(record, {
      run,
      task,
      preflight: options.preflight,
    })
    await verifyTrajectoryArtifacts(record, options.artifactRoot)
    return record
  }
}

async function invokeExecutor(
  executable: string,
  run: Run,
  attempt: number,
  options: {
    context: ExecutionContext
    env: Record<string, string | undefined>
    timeoutMS: number
  },
) {
  const process = Bun.spawn([executable], {
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
    env: options.env,
  })
  process.stdin.write(JSON.stringify({ run, attempt, budget: options.context }))
  process.stdin.end()
  const timeout = setTimeout(() => process.kill(), options.timeoutMS)
  const exitCode = await process.exited.finally(() => clearTimeout(timeout))
  const stdout = await new Response(process.stdout).text()
  const stderr = await new Response(process.stderr).text()
  assertSecretFree(stderr)
  if (exitCode !== 0) {
    if (exitCode === 75) throw new InfrastructureFailure(stderr.trim() || "executor infrastructure failure")
    throw new Error(stderr.trim() || `executor exited ${exitCode}`)
  }
  assertSecretFree(stdout)
  return parseTrajectory(JSON.parse(stdout))
}

function selectOneRun() {
  const requested = values("run-id")
  if (flag("all") || requested.length !== 1) fail("Select exactly one --run-id ID; --all is forbidden")
  const selected = plan.find((run) => run.id === requested[0])
  if (!selected) fail(`Run ID is outside the frozen plan: ${requested[0]}`)
  return selected
}

function dryRunEnvironment(artifactRoot: string) {
  return {
    PATH: Bun.env.PATH,
    LANG: Bun.env.LANG,
    LC_ALL: Bun.env.LC_ALL,
    TMPDIR: Bun.env.TMPDIR,
    AUTODRIVE_EVAL_MODE: "dry-run",
    AUTODRIVE_EVAL_ARTIFACT_ROOT: artifactRoot,
    AUTODRIVE_EVAL_PROTOCOL: protocol.version,
    OPENCODE_DISABLE_CLAUDE_CODE_SKILLS: "1",
    OPENCODE_DISABLE_EXTERNAL_SKILLS: "1",
    OPENCODE_DISABLE_MODELS_FETCH: "1",
  }
}

function assertDryRunTrajectory(record: Trajectory, run: Run) {
  if (record.runID !== run.id || record.attempt !== 1)
    throw new Error("Dry-run executor returned mismatched provenance")
  if (
    record.taskID !== run.taskID ||
    record.model !== run.model ||
    record.controllerModel !== run.controllerModel ||
    record.strategy !== run.strategy ||
    record.repeat !== run.repeat
  )
    throw new Error("Dry-run executor changed the frozen run configuration")
  if (record.costUSD !== 0 || record.promptTokens !== 0 || record.completionTokens !== 0)
    throw new Error("Dry-run executor must report zero provider usage")
  if (record.status !== "failed" || record.failure !== "infrastructure")
    throw new Error("Dry-run executor must use the non-empirical infrastructure outcome")
  const task = manifest.tasks.find((item) => item.instanceID === run.taskID)
  if (!task || record.environment.image !== task.image || record.environment.baseCommit !== task.baseCommit)
    throw new Error("Dry-run executor changed the frozen task environment")
  if (
    record.modelRequests.some(
      (request) =>
        request.kind !== "worker" ||
        request.provider !== run.model.slice(0, run.model.indexOf("/")) ||
        request.modelID !== run.model.slice(run.model.indexOf("/") + 1) ||
        request.modelVersion !== "dry-run-contract-v1",
    )
  )
    throw new Error("Dry-run executor must use the synthetic worker request contract")
  const references = [
    ...record.modelRequests.map((request) => request.normalizedRequest.path),
    record.environment.modelMetadata.path,
    record.preflight.path,
    record.trace.path,
  ]
  if (references.some((reference) => !reference.startsWith("dry-run/")))
    throw new Error("Dry-run artifacts must stay under dry-run/")
}

function assertInside(root: string, target: string, label: string) {
  if (target === root || target.startsWith(`${root}${path.sep}`)) return
  fail(`${label} must be inside --artifact-root`)
}

async function readJSONL<T>(filePath: string, parse: (input: unknown) => T) {
  const file = Bun.file(filePath)
  if (!(await file.exists())) return []
  const content = await file.text()
  assertSecretFree(content)
  return content
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => parse(JSON.parse(line)))
}

function parseLedger(input: unknown): LedgerEntry {
  if (!input || typeof input !== "object") throw new Error("Invalid ledger entry")
  const entry = input as Record<string, unknown>
  if (!new Set(["pilot", "primary", "cross-model", "boundary"]).has(String(entry.category)))
    throw new Error("Invalid ledger category")
  if (typeof entry.amountUSD !== "number") throw new Error("Invalid ledger amount")
  return {
    category: entry.category as BudgetCategory,
    amountUSD: entry.amountUSD,
  }
}

function toCSV(records: readonly Trajectory[]) {
  const fields = [
    "runID",
    "taskID",
    "model",
    "strategy",
    "repeat",
    "attempt",
    "status",
    "failure",
    "resolved",
    "fixRate",
    "firstBoundaryResolved",
    "firstBoundaryFixRate",
    "continuationCount",
    "manualContinuationCount",
    "redundantTurns",
    "promptTokens",
    "completionTokens",
    "costUSD",
    "latencyMS",
    "recoverySucceeded",
    "unsafeContinuationCount",
  ] as const
  const escape = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`
  return (
    [fields.join(","), ...records.map((record) => fields.map((field) => escape(record[field])).join(","))].join("\n") +
    "\n"
  )
}

function option(name: string) {
  const index = args.indexOf(`--${name}`)
  return index === -1 ? undefined : args[index + 1]
}

function values(name: string) {
  return args.flatMap((value, index) => (value === `--${name}` && args[index + 1] ? [args[index + 1]!] : []))
}

function flag(name: string) {
  return args.includes(`--${name}`)
}

function fail(message: string): never {
  console.error(message)
  process.exit(1)
}
