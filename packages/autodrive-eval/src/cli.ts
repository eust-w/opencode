import { appendFile, mkdir } from "node:fs/promises"
import path from "node:path"
import manifestInput from "../../../research/auto-drive/protocol/swe-evo-48.json"
import { analyzeTrajectories, assertSecretFree, parseTrajectory, type Trajectory } from "./artifact"
import { summarizeBudget, type BudgetCategory, type LedgerEntry } from "./budget"
import { renderTaskManifest } from "./paper"
import { createRunPlan, parseManifest, protocol, type Run } from "./protocol"
import { executeRuns, InfrastructureFailure, type ExecutionContext } from "./runner"

const root = path.resolve(import.meta.dir, "../../..")
const manifest = parseManifest(manifestInput)
const plan = createRunPlan(manifest)
const command = Bun.argv[2] ?? "validate"
const args = Bun.argv.slice(3)

if (command === "plan") await printPlan()
if (command === "paper-protocol") await paperProtocol()
if (command === "validate") await validate()
if (command === "analyze") await analyze()
if (command === "run") await run()
if (!new Set(["plan", "paper-protocol", "validate", "analyze", "run"]).has(command)) fail(`Unknown command: ${command}`)

async function printPlan() {
  const content = plan.map((run) => JSON.stringify(run)).join("\n") + "\n"
  const output = option("output")
  if (!output) return process.stdout.write(content)
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

async function validate() {
  const required = [
    "research/auto-drive/protocol/swe-evo-48.json",
    "research/auto-drive/protocol/preregistration.md",
    "research/auto-drive/protocol/model-requests.json",
    "research/auto-drive/protocol/fault-injection.json",
    "research/auto-drive/annotations/guidelines.md",
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
        manifest: { tasks: manifest.tasks.length, commit: manifest.source.commit, sha256: manifest.source.sha256 },
        plan: { trajectories: plan.length, completed: completed.size, remaining: plan.length - completed.size },
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

async function run() {
  if (!flag("execute")) fail("Paid execution is disabled; pass --execute after validating the executor and pilot")
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
  await mkdir(path.dirname(resultsPath), { recursive: true })
  await mkdir(path.dirname(ledgerPath), { recursive: true })
  const records = await executeRuns(selected, createExecutor(path.resolve(executorPath)), {
    ledger,
    onRecord: async (record, entry) => {
      const serialized = JSON.stringify(record)
      assertSecretFree(serialized)
      await appendFile(resultsPath, serialized + "\n", { encoding: "utf8", flag: "a", mode: 0o600 })
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
  })
  console.log(JSON.stringify({ completed: records.length, remaining: 384 - completed.size - records.length }))
}

function createExecutor(executable: string) {
  return async (run: Run, attempt: number, context: ExecutionContext) => {
    const process = Bun.spawn([executable], {
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
      env: { ...Bun.env, AUTODRIVE_EVAL_PROTOCOL: protocol.version },
    })
    process.stdin.write(JSON.stringify({ run, attempt, budget: context }))
    process.stdin.end()
    const timeout = setTimeout(() => process.kill(), run.timeoutMinutes * 60_000)
    const exitCode = await process.exited.finally(() => clearTimeout(timeout))
    const stdout = await new Response(process.stdout).text()
    const stderr = await new Response(process.stderr).text()
    if (exitCode !== 0) {
      if (exitCode === 75) throw new InfrastructureFailure(stderr.trim() || "executor infrastructure failure")
      throw new Error(stderr.trim() || `executor exited ${exitCode}`)
    }
    assertSecretFree(stdout)
    const record = parseTrajectory(JSON.parse(stdout))
    if (record.runID !== run.id || record.attempt !== attempt)
      throw new Error(`Executor returned mismatched provenance for ${run.id}`)
    return record
  }
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
  return { category: entry.category as BudgetCategory, amountUSD: entry.amountUSD }
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
