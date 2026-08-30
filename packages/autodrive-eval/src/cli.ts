import { appendFile, mkdir } from "node:fs/promises"
import path from "node:path"
import manifestInput from "../../../research/auto-drive/protocol/swe-evo-48.json"
import { assertTrajectoryProvenance } from "./acceptance"
import {
  BoundaryCandidate,
  extractSupervisorBoundaries,
  freezeAnnotations,
  renderBoundaryPacket,
  renderLabelTemplate,
} from "./annotation"
import {
  analyzeTrajectories,
  assertSecretFree,
  parseTrajectory,
  verifyTrajectoryArtifacts,
  type Trajectory,
} from "./artifact"
import { caps, summarizeBudget, type BudgetCategory, type LedgerEntry } from "./budget"
import { renderTaskManifest } from "./paper"
import { createPilotRun, loadPilotManifest } from "./pilot"
import { createModelMetadataSnapshot, loadPreflight, PreflightScope } from "./preflight"
import { createBoundaryRunPlan, createRunPlan, parseManifest, protocol, type Run } from "./protocol"
import { executeRuns, InfrastructureFailure, type ExecutionContext } from "./runner"

const root = path.resolve(import.meta.dir, "../../..")
const manifest = parseManifest(manifestInput)
const plan = createRunPlan(manifest)
const boundaryPlan = createBoundaryRunPlan(manifest)
const command = Bun.argv[2] ?? "validate"
const args = Bun.argv.slice(3)

if (command === "plan") await printPlan()
if (command === "paper-protocol") await paperProtocol()
if (command === "snapshot-models") await snapshotModels()
if (command === "preflight") await checkPreflight()
if (command === "validate") await validate()
if (command === "analyze") await analyze()
if (command === "annotations-extract") await annotationsExtract()
if (command === "annotations-prepare") await annotationsPrepare()
if (command === "annotations-freeze") await annotationsFreeze()
if (command === "boundary-plan") await printBoundaryPlan()
if (command === "boundary-run") await boundaryRun()
if (command === "verify-executor") await verifyExecutor()
if (command === "canary") await canary()
if (command === "pilot-plan") await pilotPlan()
if (command === "pilot") await pilot()
if (command === "run") await run()
if (
  !new Set([
    "plan",
    "paper-protocol",
    "snapshot-models",
    "preflight",
    "validate",
    "analyze",
    "annotations-extract",
    "annotations-prepare",
    "annotations-freeze",
    "boundary-plan",
    "boundary-run",
    "verify-executor",
    "canary",
    "pilot-plan",
    "pilot",
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

async function printBoundaryPlan() {
  const content = boundaryPlan.map((run) => JSON.stringify(run)).join("\n") + "\n"
  const output = option("output")
  if (!output) {
    process.stdout.write(content)
    return
  }
  await mkdir(path.dirname(path.resolve(output)), { recursive: true })
  await Bun.write(path.resolve(output), content)
  console.log(JSON.stringify({ output: path.resolve(output), trajectories: boundaryPlan.length }))
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
  if (!scope.success) fail("--scope must be canary, boundary, or full")
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
    "research/auto-drive/protocol/pilot-swe-bench-verified.json",
    "research/auto-drive/protocol/pilot-tasks/psf__requests-1142.json",
    "research/auto-drive/annotations/guidelines.md",
    "research/auto-drive/annotations/labels.template.csv",
    "research/auto-drive/host-executor.md",
    "research/auto-drive/environment.lock.json",
  ]
  const missing = []
  for (const relative of required) {
    if (!(await Bun.file(path.join(root, relative)).exists())) missing.push(relative)
  }
  if (missing.length) fail(`Missing frozen research artifacts:\n${missing.join("\n")}`)
  const pilotManifestPath = path.join(root, "research/auto-drive/protocol/pilot-swe-bench-verified.json")
  const pilot = await loadPilotManifest(
    pilotManifestPath,
    await Bun.file(pilotManifestPath).json(),
    new Set(manifest.tasks.map((task) => task.instanceID)),
  )

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
        pilot: {
          taskID: pilot.task.instanceID,
          dataset: pilot.manifest.source.dataset,
          revision: pilot.manifest.source.revision,
          imageDigest: pilot.manifest.task.imageDigest,
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

async function annotationsExtract() {
  const resultsPath = option("results")
  if (!resultsPath) fail("--results PATH is required")
  const artifactRoot = option("artifact-root")
  if (!artifactRoot) fail("--artifact-root PATH is required")
  const output = option("output")
  if (!output) fail("--output PATH is required")
  const resolvedArtifactRoot = path.resolve(artifactRoot)
  const records = await readJSONL(path.resolve(resultsPath), parseTrajectory)
  if (!records.length) fail("No trajectories are available for boundary extraction")
  const candidates = (
    await Promise.all(
      records.map(async (record) => {
        const controllers = record.modelRequests.filter((request) => request.kind === "controller")
        if (!controllers.length) return []
        await verifyTrajectoryArtifacts(record, resolvedArtifactRoot)
        const trace = await readJSONL(path.join(resolvedArtifactRoot, record.trace.path), parseRecord)
        const finished = trace.find((event) => event.type === "session-finished")
        if (!finished || !Array.isArray(finished.messages))
          throw new Error(`Trajectory ${record.runID} is missing its final Session transcript`)
        const boundaries = trace.filter((event) => event.type === "boundary-captured")
        if (boundaries.length !== controllers.length)
          throw new Error(`Trajectory ${record.runID} has mismatched controller and boundary counts`)
        const patches = await Promise.all(
          controllers.map(async (controller, index) => {
            const patch = await Bun.file(
              path.join(
                resolvedArtifactRoot,
                "patches",
                record.runID,
                `boundary-${String(index).padStart(2, "0")}.diff`,
              ),
            ).text()
            const boundary = boundaries[index]!
            const sha256 = new Bun.CryptoHasher("sha256").update(patch).digest("hex")
            if (boundary.sequence !== controller.sequence || boundary.sha256 !== sha256)
              throw new Error(`Trajectory ${record.runID} boundary patch does not match its trace`)
            return patch
          }),
        )
        const requests = await Promise.all(
          controllers.map(async (controller) => {
            const content = await Bun.file(path.join(resolvedArtifactRoot, controller.normalizedRequest.path)).text()
            assertSecretFree(content)
            return {
              requestSHA256: controller.requestSHA256,
              workerResponses: record.modelRequests.filter(
                (request) => request.kind === "worker" && request.sequence < controller.sequence,
              ).length,
              body: JSON.parse(content),
            }
          }),
        )
        return extractSupervisorBoundaries({
          runID: record.runID,
          taskID: record.taskID,
          messages: finished.messages,
          controllers: requests,
          patches,
        })
      }),
    )
  ).flat()
  if (!candidates.length) fail("No supervisor boundaries were found in the indexed trajectories")
  if (new Set(candidates.map((candidate) => candidate.id)).size !== candidates.length)
    throw new Error("Extracted boundary candidate IDs are not unique")
  const resolvedOutput = path.resolve(output)
  await mkdir(path.dirname(resolvedOutput), { recursive: true })
  await Bun.write(resolvedOutput, renderBoundaryPacket(candidates))
  console.log(
    JSON.stringify({
      output: resolvedOutput,
      trajectories: new Set(candidates.map((candidate) => candidate.baseTrajectoryID)).size,
      boundaries: candidates.length,
    }),
  )
}

async function annotationsPrepare() {
  const candidatesPath = option("candidates")
  if (!candidatesPath) fail("--candidates PATH is required")
  const output = option("output")
  if (!output) fail("--output PATH is required")
  const annotator = option("annotator")
  if (!annotator) fail("--annotator ID is required")
  const candidates = await readJSONL(path.resolve(candidatesPath), (input) => BoundaryCandidate.parse(input))
  if (!candidates.length) fail("Boundary candidate file is empty")
  const resolvedOutput = path.resolve(output)
  await mkdir(resolvedOutput, { recursive: true })
  await Promise.all([
    Bun.write(path.join(resolvedOutput, "examples.jsonl"), renderBoundaryPacket(candidates)),
    Bun.write(path.join(resolvedOutput, "labels.csv"), renderLabelTemplate(candidates, annotator) + "\n"),
  ])
  console.log(JSON.stringify({ output: resolvedOutput, examples: candidates.length, annotator }))
}

async function annotationsFreeze() {
  const candidatesPath = option("candidates")
  if (!candidatesPath) fail("--candidates PATH is required")
  const firstPath = option("first")
  if (!firstPath) fail("--first PATH is required")
  const secondPath = option("second")
  if (!secondPath) fail("--second PATH is required")
  const adjudicatedPath = option("adjudicated")
  if (!adjudicatedPath) fail("--adjudicated PATH is required")
  const output = option("output")
  if (!output) fail("--output PATH is required")
  const candidates = await readJSONL(path.resolve(candidatesPath), (input) => BoundaryCandidate.parse(input))
  const [first, second, adjudicated] = await Promise.all(
    [firstPath, secondPath, adjudicatedPath].map(async (filePath) => {
      const content = await Bun.file(path.resolve(filePath)).text()
      assertSecretFree(content)
      return content
    }),
  )
  const frozen = freezeAnnotations({
    candidates,
    first,
    second,
    adjudicated,
    developmentSize: 54,
    seed: "auto-drive-boundary-v1",
    minimumKappa: 0.75,
  })
  const resolvedOutput = path.resolve(output)
  await mkdir(resolvedOutput, { recursive: true })
  await Promise.all([
    Bun.write(
      path.join(resolvedOutput, "development.jsonl"),
      frozen.development.map((candidate) => JSON.stringify(candidate)).join("\n") + "\n",
    ),
    Bun.write(
      path.join(resolvedOutput, "test.jsonl"),
      frozen.frozen.map((candidate) => JSON.stringify(candidate)).join("\n") + "\n",
    ),
    Bun.write(
      path.join(resolvedOutput, "seal.json"),
      JSON.stringify(
        {
          schemaVersion: 1,
          frozenAt: new Date().toISOString(),
          kappa: frozen.kappa,
          agreements: frozen.agreements,
          counts: frozen.counts,
          development: frozen.development.length,
          test: frozen.frozen.length,
          sha256: frozen.seal.sha256,
        },
        null,
        2,
      ) + "\n",
    ),
  ])
  console.log(
    JSON.stringify({
      output: resolvedOutput,
      kappa: frozen.kappa,
      development: frozen.development.length,
      test: frozen.frozen.length,
      sha256: frozen.seal.sha256,
    }),
  )
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
  const maxCostUSD = Math.min(protocol.gateway.canaryMaxSpendUSD, 50 - spent)
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

async function pilotPlan() {
  const manifestPath = path.resolve(
    option("manifest") ?? path.join(root, "research/auto-drive/protocol/pilot-swe-bench-verified.json"),
  )
  const content = await Bun.file(manifestPath).text()
  assertSecretFree(content)
  const loaded = await loadPilotManifest(
    manifestPath,
    JSON.parse(content),
    new Set(manifest.tasks.map((task) => task.instanceID)),
  )
  const selected = createPilotRun(loaded)
  console.log(
    JSON.stringify({
      runID: selected.id,
      taskID: selected.taskID,
      dataset: loaded.manifest.source.dataset,
      revision: loaded.manifest.source.revision,
      strategy: selected.strategy,
      image: loaded.task.image,
      imageDigest: loaded.manifest.task.imageDigest,
    }),
  )
}

async function pilot() {
  if (!flag("execute")) fail("Paid pilot execution is disabled; pass --execute after verify-executor succeeds")
  const preflightPath = option("preflight")
  if (!preflightPath) fail("--preflight PATH is required")
  const artifactRoot = option("artifact-root")
  if (!artifactRoot) fail("--artifact-root PATH is required")
  const executorPath = option("executor")
  if (!executorPath) fail("--executor PATH is required")
  const sourceManifestPath = path.resolve(
    option("manifest") ?? path.join(root, "research/auto-drive/protocol/pilot-swe-bench-verified.json"),
  )
  const sourceManifestContent = await Bun.file(sourceManifestPath).text()
  assertSecretFree(sourceManifestContent)
  const sourcePilot = await loadPilotManifest(
    sourceManifestPath,
    JSON.parse(sourceManifestContent),
    new Set(manifest.tasks.map((task) => task.instanceID)),
  )
  const sourceTaskPath = path.resolve(path.dirname(sourceManifestPath), sourcePilot.manifest.taskInput.path)
  const sourceTaskContent = await Bun.file(sourceTaskPath).text()
  assertSecretFree(sourceTaskContent)

  const resolvedArtifactRoot = path.resolve(artifactRoot)
  const resolvedPreflightPath = path.resolve(preflightPath)
  assertInside(resolvedArtifactRoot, resolvedPreflightPath, "Preflight receipt")
  const protocolRoot = path.join(resolvedArtifactRoot, "pilot", "protocol")
  const copiedManifestPath = path.join(protocolRoot, path.basename(sourceManifestPath))
  const copiedTaskPath = path.join(protocolRoot, sourcePilot.manifest.taskInput.path)
  await Promise.all([
    mkdir(path.dirname(copiedTaskPath), { recursive: true }),
    mkdir(path.dirname(copiedManifestPath), { recursive: true }),
  ])
  await Promise.all([
    Bun.write(copiedManifestPath, sourceManifestContent),
    Bun.write(copiedTaskPath, sourceTaskContent),
  ])
  const loaded = await loadPilotManifest(
    copiedManifestPath,
    JSON.parse(sourceManifestContent),
    new Set(manifest.tasks.map((task) => task.instanceID)),
  )
  const selected = createPilotRun(loaded)
  const preflight = await loadPreflight(resolvedPreflightPath, { scope: "canary" })
  const resultsPath = path.join(resolvedArtifactRoot, "pilot", "trajectories.jsonl")
  const ledgerPath = path.join(resolvedArtifactRoot, "pilot", "ledger.jsonl")
  const existing = await readJSONL(resultsPath, parseTrajectory)
  if (existing.length) fail("A paid non-primary pilot result already exists for this artifact root")
  const ledger = await readJSONL(ledgerPath, parseLedger)
  const spent = summarizeBudget(ledger).categories.pilot
  const maxCostUSD = Math.min(protocol.gateway.canaryMaxSpendUSD, 50 - spent)
  if (maxCostUSD <= 0) fail("Pilot budget is exhausted")
  const records = await executeRuns(
    [selected],
    createExecutor(path.resolve(executorPath), {
      artifactRoot: resolvedArtifactRoot,
      preflight,
      preflightPath: resolvedPreflightPath,
      task: loaded.task,
      taskInputRoot: path.dirname(copiedTaskPath),
      imageDigest: loaded.manifest.task.imageDigest,
    }),
    {
      concurrency: 1,
      ledger,
      budget: () => ({ category: "pilot", maxCostUSD }),
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
    },
  )
  const manifestSHA256 = new Bun.CryptoHasher("sha256").update(sourceManifestContent).digest("hex")
  await Bun.write(
    path.join(resolvedArtifactRoot, "pilot", "receipt.json"),
    JSON.stringify(
      {
        schemaVersion: 1,
        protocol: protocol.version,
        runID: records[0].runID,
        manifest: { path: path.relative(resolvedArtifactRoot, copiedManifestPath), sha256: manifestSHA256 },
        taskInput: loaded.manifest.taskInput,
        preflightSHA256: preflight.sha256,
        trace: records[0].trace,
        costUSD: records[0].costUSD,
      },
      null,
      2,
    ) + "\n",
  )
  console.log(
    JSON.stringify({
      status: "accepted",
      mode: "paid-non-primary-pilot",
      runID: records[0].runID,
      costUSD: records[0].costUSD,
    }),
  )
}

async function boundaryRun() {
  if (!flag("execute"))
    fail("Paid boundary-source execution is disabled; pass --execute after validating the executor and pilot")
  const preflightPath = option("preflight")
  if (!preflightPath) fail("--preflight PATH is required")
  const artifactRoot = option("artifact-root")
  if (!artifactRoot) fail("--artifact-root PATH is required")
  const executorPath = option("executor")
  if (!executorPath) fail("--executor PATH is required")
  const requested = values("run-id")
  if (!requested.length && !flag("all")) fail("Select --run-id ID (repeatable) or explicitly pass --all")
  const unknown = requested.filter((runID) => !boundaryPlan.some((run) => run.id === runID))
  if (unknown.length) fail(`Run IDs are outside the frozen boundary plan: ${unknown.join(", ")}`)
  const resolvedArtifactRoot = path.resolve(artifactRoot)
  const resolvedPreflightPath = path.resolve(preflightPath)
  assertInside(resolvedArtifactRoot, resolvedPreflightPath, "Preflight receipt")
  const preflight = await loadPreflight(resolvedPreflightPath, { scope: "boundary" })
  const resultsPath = path.join(resolvedArtifactRoot, "boundary", "trajectories.jsonl")
  const ledgerPath = path.join(resolvedArtifactRoot, "boundary", "ledger.jsonl")
  const existing = await readJSONL(resultsPath, parseTrajectory)
  const completed = new Set(existing.map((record) => record.runID))
  const selected = boundaryPlan.filter(
    (run) => !completed.has(run.id) && (!requested.length || requested.includes(run.id)),
  )
  if (!selected.length) fail("No pending frozen boundary runs match the selection")
  const ledger = await readJSONL(ledgerPath, parseLedger)
  await Promise.all([
    mkdir(path.dirname(resultsPath), { recursive: true }),
    mkdir(path.dirname(ledgerPath), { recursive: true }),
  ])
  const records = await executeRuns(
    selected,
    createExecutor(path.resolve(executorPath), {
      artifactRoot: resolvedArtifactRoot,
      preflight,
      preflightPath: resolvedPreflightPath,
    }),
    {
      concurrency: protocol.concurrency,
      ledger,
      budget: () => ({ category: "boundary", maxCostUSD: caps.boundary / boundaryPlan.length }),
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
    },
  )
  console.log(
    JSON.stringify({
      completed: records.length,
      remaining: boundaryPlan.length - completed.size - records.length,
      results: resultsPath,
      category: "boundary",
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
    task?: { instanceID: string; image: string; baseCommit: string }
    taskInputRoot?: string
    imageDigest?: string
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
        ...(options.taskInputRoot ? { AUTODRIVE_TASK_INPUT_ROOT: options.taskInputRoot } : {}),
      },
    })
    if (record.runID !== run.id || record.attempt !== attempt)
      throw new Error(`Executor returned mismatched provenance for ${run.id}`)
    const task = options.task ?? manifest.tasks.find((item) => item.instanceID === run.taskID)
    if (!task) throw new Error(`Frozen task is missing: ${run.taskID}`)
    assertTrajectoryProvenance(record, {
      run,
      task,
      preflight: options.preflight,
    })
    if (options.imageDigest && record.environment.imageDigest !== options.imageDigest)
      throw new Error("Trajectory image digest does not match the frozen pilot manifest")
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

function parseRecord(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Expected a JSON object")
  return input as Record<string, unknown>
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
