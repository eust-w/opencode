#!/usr/bin/env bun

import { appendFile, chmod, mkdir } from "node:fs/promises"
import path from "node:path"
import { z } from "zod"
import { assertSecretFree, parseTrajectory } from "../src/artifact"
import { gatewayRequestsSettled, requireCompleteGatewayUsage } from "../src/gateway"
import {
  buildAutoDriveUpdate,
  buildTaskPrompt,
  capturePatchFromBaseline,
  captureRepositoryBaseline,
  captureGatewayFailureEvidence,
  classifyExecutorFailure,
  classifyIdleSession,
  classifyTestPatch,
  decideExternalContinuation,
  dockerPortPublish,
  gradePytest,
  hasExperimentModels,
  parseExecutorFailureReceipt,
  parsePytestLog,
  parseTaskInput,
  prepareExperimentConfig,
} from "../src/host-executor"
import { protocol, Run } from "../src/protocol"

const Input = z.object({
  run: Run,
  attempt: z.number().int().min(1).max(2),
  budget: z.object({
    category: z.enum(["pilot", "primary", "cross-model", "boundary"]),
    maxCostUSD: z.number().nonnegative(),
    remainingUSD: z.number().nonnegative(),
  }),
})

const input = Input.parse(JSON.parse(await Bun.stdin.text()))
const artifactRoot = requireAbsolute("AUTODRIVE_EVAL_ARTIFACT_ROOT")
const preflightPath = requireAbsolute("AUTODRIVE_EVAL_PREFLIGHT_PATH")
const preflightSHA256 = requireSHA("AUTODRIVE_EVAL_PREFLIGHT_SHA256")
const modelMetadataPath = requireAbsolute("OPENCODE_MODELS_PATH")
const taskRoot = requireAbsolute("AUTODRIVE_TASK_INPUT_ROOT")
const keyFile = requireAbsolute("AUTODRIVE_GATEWAY_KEY_FILE")
const sourceRoot = requireAbsolute("AUTODRIVE_SOURCE_ROOT")
const opencodeBinary = requireAbsolute("AUTODRIVE_OPENCODE_BINARY")
const opencodeCommit = requireCommit("AUTODRIVE_OPENCODE_COMMIT")
const gatewayUpstream = Bun.env.AUTODRIVE_GATEWAY_UPSTREAM ?? "https://ai-api.d-robotics.cc"

if (Bun.env.AUTODRIVE_EVAL_PROTOCOL !== protocol.version) fail("Frozen protocol mismatch")
if (input.run.model !== protocol.models.primary) fail("This canary executor accepts only the primary worker")
if (input.budget.maxCostUSD <= 0) fail("Real execution requires a positive run cost ceiling")

const task = parseTaskInput(await Bun.file(path.join(taskRoot, `${input.run.taskID}.json`)).json())
if (task.instanceID !== input.run.taskID || task.image.length === 0) fail("Task input does not match the run")
const workerModel = modelID(input.run.model)
const controllerModel = modelID(input.run.controllerModel)
const suffix = `${input.run.id.slice(4, 12)}-${input.attempt}`
const networkName = `autodrive-${suffix}`
const proxyName = `autodrive-proxy-${suffix}`
const taskName = `autodrive-task-${suffix}`
const runtimeRoot = path.join(artifactRoot, "runtime", input.run.id, `attempt-${input.attempt}`)
const configRoot = path.join(runtimeRoot, "config")
const opencodeConfigRoot = path.join(configRoot, "opencode")
const stateRoot = path.join(runtimeRoot, "state")
const tracePath = path.join(artifactRoot, "raw", `${input.run.id}.jsonl`)
const patchRoot = path.join(artifactRoot, "patches", input.run.id)
const gatewayRoot = path.join(artifactRoot, "gateway", input.run.id)
const requestManifest = path.join(gatewayRoot, "requests.jsonl")
const proxyTrace = path.join(gatewayRoot, "proxy.jsonl")
const controlRoot = path.join(gatewayRoot, "control")
const failurePath = path.join(artifactRoot, "failures", input.run.id, `attempt-${input.attempt}.json`)
const baselineManifestPath = path.join(patchRoot, "startup-baseline.json")
const baselinePatchPath = path.join(patchRoot, "startup-baseline.diff")
const startedAt = new Date()

await Promise.all([
  mkdir(configRoot, { recursive: true }),
  mkdir(opencodeConfigRoot, { recursive: true }),
  mkdir(stateRoot, { recursive: true }),
  mkdir(path.dirname(tracePath), { recursive: true }),
  mkdir(patchRoot, { recursive: true }),
  mkdir(controlRoot, { recursive: true }),
])
await trace({ type: "executor-started", runID: input.run.id, attempt: input.attempt, taskID: task.instanceID })

let proxyStarted = false
let taskStarted = false
let networkCreated = false
const execution: { baselineSpend?: number; sessionID?: string; stage: string } = { stage: "setup" }

try {
  await prepareExperimentConfig(opencodeConfigRoot, {
    workerModel,
    controllerModel,
    segmentSteps: input.run.segmentSteps,
    temperature: input.run.temperature,
  })
  await Bun.write(path.join(configRoot, "models.json"), await Bun.file(modelMetadataPath).text())
  await command(["docker", "pull", task.image], { timeoutMS: 20 * 60_000 })
  const imageDigest = await inspectImageDigest()
  await command(["docker", "network", "create", "--internal", networkName])
  networkCreated = true

  const baselineSpend = await readSpend()
  execution.baselineSpend = baselineSpend
  await command([
    "docker",
    "run",
    "--detach",
    "--rm",
    "--name",
    proxyName,
    "--network",
    "bridge",
    "--publish",
    dockerPortPublish(8_080),
    "--read-only",
    "--cap-drop",
    "ALL",
    "--security-opt",
    "no-new-privileges",
    "--tmpfs",
    "/tmp:rw,noexec,nosuid,size=64m",
    "--mount",
    `type=bind,src=${sourceRoot},dst=/workspace,readonly`,
    "--mount",
    `type=bind,src=${artifactRoot},dst=/artifacts`,
    "--mount",
    `type=bind,src=${keyFile},dst=/run/secrets/gateway-key,readonly`,
    "--env",
    "AUTODRIVE_GATEWAY_KEY_FILE=/run/secrets/gateway-key",
    "--env",
    "AUTODRIVE_EVAL_ARTIFACT_ROOT=/artifacts",
    "--env",
    `AUTODRIVE_RUN_ID=${input.run.id}`,
    "--env",
    `AUTODRIVE_GATEWAY_UPSTREAM=${gatewayUpstream}`,
    "--env",
    `AUTODRIVE_TASK_UPSTREAM=http://${taskName}:4096`,
    "--env",
    `AUTODRIVE_GATEWAY_BASELINE_SPEND=${baselineSpend}`,
    "--env",
    `AUTODRIVE_GATEWAY_MAX_SPEND_USD=${input.budget.maxCostUSD}`,
    "--env",
    "AUTODRIVE_GATEWAY_HOLD_CONTROLLERS=1",
    "--env",
    `AUTODRIVE_GATEWAY_HOLD_WORKERS=${input.run.strategy === "regex" ? "1" : "0"}`,
    "--workdir",
    "/workspace/packages/autodrive-eval",
    "oven/bun:1.4.0",
    "bun",
    "scripts/gateway-proxy.ts",
  ])
  proxyStarted = true
  await command(["docker", "network", "connect", "--alias", "autodrive-proxy", networkName, proxyName])
  await waitForProxy()

  await command([
    "docker",
    "run",
    "--detach",
    "--rm",
    "--name",
    taskName,
    "--network",
    networkName,
    "--cpus",
    "8",
    "--memory",
    "32g",
    "--pids-limit",
    "4096",
    "--cap-drop",
    "ALL",
    "--security-opt",
    "no-new-privileges",
    "--mount",
    `type=bind,src=${opencodeBinary},dst=/usr/local/bin/opencode,readonly`,
    "--mount",
    `type=bind,src=${configRoot},dst=/autodrive-config,readonly`,
    "--mount",
    `type=bind,src=${stateRoot},dst=/autodrive-state`,
    "--env",
    "OPENCODE_CONFIG_DIR=/autodrive-config/opencode",
    "--env",
    "OPENCODE_MODELS_PATH=/autodrive-config/models.json",
    "--env",
    "OPENCODE_DISABLE_CLAUDE_CODE_SKILLS=1",
    "--env",
    "OPENCODE_DISABLE_EXTERNAL_SKILLS=1",
    "--env",
    "OPENCODE_DISABLE_MODELS_FETCH=1",
    "--env",
    "XDG_DATA_HOME=/autodrive-state/data",
    "--env",
    "XDG_CACHE_HOME=/autodrive-state/cache",
    "--env",
    "XDG_CONFIG_HOME=/autodrive-config",
    "--env",
    "XDG_STATE_HOME=/autodrive-state/state",
    "--workdir",
    "/testbed",
    task.image,
    "/usr/local/bin/opencode",
    "serve",
    "--hostname",
    "0.0.0.0",
    "--port",
    "4096",
    "--pure",
    "--print-logs",
    "--log-level",
    "INFO",
  ])
  taskStarted = true
  const address = await waitForServer()
  const headers = { "content-type": "application/json", "x-opencode-directory": "/testbed" }
  const availableModels = await api<unknown>(address, "/config/providers", { headers })
  if (!hasExperimentModels(availableModels, workerModel, controllerModel))
    throw new Error("Frozen worker or controller model is unavailable in the task server")
  await trace({ type: "models-validated", workerModel, controllerModel })
  const session = await api<{ id: string }>(address, "/api/session", {
    method: "POST",
    headers,
    body: JSON.stringify({
      agent: "experiment",
      model: { providerID: "openai", id: workerModel },
    }),
  })
  execution.sessionID = session.id
  await api(address, `/api/session/${session.id}/auto-drive`, {
    method: "PUT",
    headers,
    body: JSON.stringify(
      buildAutoDriveUpdate({
        strategy: input.run.strategy,
        maxContinuations: input.run.maxContinuations,
        controllerModel,
      }),
    ),
  })
  execution.stage = "startup-baseline"
  const taskGit = (args: string[]) => command(["docker", "exec", taskName, "git", "-C", "/testbed", ...args])
  const startupBaseline = await captureRepositoryBaseline(taskGit, task.baseCommit)
  const baselineManifest =
    JSON.stringify(
      {
        schemaVersion: 1,
        head: startupBaseline.head,
        tree: startupBaseline.tree,
        trackedClean: true,
        untrackedPaths: startupBaseline.untrackedPaths,
        untrackedRoots: startupBaseline.untrackedRoots,
      },
      null,
      2,
    ) + "\n"
  assertSecretFree(baselineManifest)
  assertSecretFree(startupBaseline.content)
  await Promise.all([
    Bun.write(baselineManifestPath, baselineManifest),
    Bun.write(baselinePatchPath, startupBaseline.content),
  ])
  await trace({
    type: "startup-baseline-captured",
    head: startupBaseline.head,
    tree: startupBaseline.tree,
    trackedClean: true,
    untrackedPathCount: startupBaseline.untrackedPaths.length,
    untrackedRootCount: startupBaseline.untrackedRoots.length,
    manifest: { path: relativeArtifact(baselineManifestPath), sha256: digest(baselineManifest) },
    patch: { path: relativeArtifact(baselinePatchPath), sha256: digest(startupBaseline.content) },
  })
  await trace({ type: "session-created", sessionID: session.id })
  await api(address, `/api/session/${session.id}/prompt`, {
    method: "POST",
    headers,
    body: JSON.stringify({ prompt: { text: buildTaskPrompt(task) } }),
  })

  const gradeCache = new Map<string, Awaited<ReturnType<typeof gradePatch>>>()
  execution.stage = "session-drain"
  const drained = await drain(address, session.id, headers)
  const boundaryPatches = drained.patches
  const finalPatch = await capturePatch("final")
  const firstPatch = boundaryPatches[0]?.content ?? finalPatch
  execution.stage = "first-boundary-grader"
  const firstGrade = await gradeCached("first-boundary", firstPatch)
  execution.stage = "final-grader"
  const finalGrade = firstPatch === finalPatch ? firstGrade : await gradeCached("final", finalPatch)
  execution.stage = "session-artifacts"
  const info = await api<{
    autoDrive: { status: { action?: string; continuationCount: number; reason?: string } }
  }>(address, `/api/session/${session.id}`, { headers })
  const messages = await api<unknown[]>(address, `/api/session/${session.id}/message?order=asc`, { headers })
  const context = await api<unknown>(address, `/api/session/${session.id}/context`, { headers })
  await trace({ type: "session-finished", autoDrive: info.autoDrive, messages, context })
  await Bun.write(path.join(patchRoot, "final.diff"), finalPatch)

  execution.stage = "gateway-settlement"
  await waitForGatewaySettlement()
  const requests = await readJSONL(requestManifest)
  const proxyEvents = await readJSONL(proxyTrace)
  if (!drained.failure) requireCompleteGatewayUsage(proxyEvents)
  const usage = proxyEvents.filter(
    (event) => event.type === "provider-response" && event.status === 200 && event.usageComplete === true,
  )
  const usageComplete = !proxyEvents.some(
    (event) => event.type === "provider-response" && event.status === 200 && event.usageComplete !== true,
  )
  const costUSD = Math.max(0, (await readSettledSpend()) - baselineSpend)
  const serverLog = await command(["docker", "logs", taskName], { allowFailure: true })
  await trace({ type: "server-log", stdout: serverLog.stdout, stderr: serverLog.stderr })
  const endedAt = new Date()
  execution.stage = "trajectory-finalization"
  const trajectory = parseTrajectory({
    schemaVersion: 4,
    runID: input.run.id,
    taskID: input.run.taskID,
    model: input.run.model,
    controllerModel: input.run.controllerModel,
    strategy: input.run.strategy,
    repeat: input.run.repeat,
    attempt: input.attempt,
    startedAt: startedAt.toISOString(),
    endedAt: endedAt.toISOString(),
    status: drained.failure ? "failed" : "succeeded",
    failure: drained.failure,
    resolved: finalGrade.resolved,
    fixRate: finalGrade.fixRate,
    firstBoundaryResolved: firstGrade.resolved,
    firstBoundaryFixRate: firstGrade.fixRate,
    continuationCount: drained.externalContinuationCount ?? info.autoDrive.status.continuationCount,
    manualContinuationCount: 0,
    redundantTurns: boundaryPatches.filter(
      (item, index) => index > 0 && item.sha256 === boundaryPatches[index - 1].sha256,
    ).length,
    promptTokens: usage.reduce((sum, event) => sum + number(event.promptTokens), 0),
    completionTokens: usage.reduce((sum, event) => sum + number(event.completionTokens), 0),
    usageComplete,
    costUSD,
    latencyMS: endedAt.getTime() - startedAt.getTime(),
    recoverySucceeded: !drained.failure,
    unsafeContinuationCount: 0,
    modelRequests: requests,
    environment: {
      image: task.image,
      imageDigest,
      baseCommit: task.baseCommit,
      opencodeCommit,
      modelMetadata: {
        path: relativeArtifact(modelMetadataPath),
        sha256: digest(await Bun.file(modelMetadataPath).text()),
      },
      startupBaseline: {
        head: startupBaseline.head,
        tree: startupBaseline.tree,
        trackedClean: true,
        untrackedPathCount: startupBaseline.untrackedPaths.length,
        manifest: { path: relativeArtifact(baselineManifestPath), sha256: digest(baselineManifest) },
        patch: { path: relativeArtifact(baselinePatchPath), sha256: digest(startupBaseline.content) },
      },
    },
    preflight: { path: relativeArtifact(preflightPath), sha256: preflightSHA256 },
    trace: { path: relativeArtifact(tracePath), sha256: digest(await Bun.file(tracePath).text()) },
  })
  assertSecretFree(JSON.stringify(trajectory))
  process.stdout.write(JSON.stringify(trajectory))

  async function drain(address: string, sessionID: string, headers: Record<string, string>) {
    const released = new Set<number>()
    const patches: { sequence: number; content: string; sha256: string }[] = []
    const deadline = Date.now() + input.run.timeoutMinutes * 60_000 - 60_000
    let capturedContinuationCount = 0
    let externalContinuationCount = 0
    let lastBoundaryWorkerResponses = 0
    let idleSince: number | undefined
    while (Date.now() < deadline) {
      const requests = await readJSONL(requestManifest)
      const active = await api<Record<string, { type: string }>>(address, "/api/session/active", { headers })
      const info = await api<{ autoDrive: { status: { action?: string; continuationCount: number } } }>(
        address,
        `/api/session/${sessionID}`,
        { headers },
      )
      const proxyEvents = await readJSONL(proxyTrace)
      const successful = proxyEvents.filter((event) => event.type === "provider-response" && event.status === 200)
      const providerFailure = proxyEvents.some(
        (event) => event.type === "proxy-error" || (event.type === "provider-response" && event.status !== 200),
      )
      const workerSequences = new Set(
        requests.filter((request) => request.kind === "worker").map((request) => number(request.sequence)),
      )
      const successfulWorkers = successful.filter((event) => workerSequences.has(number(event.sequence)))
      for (const request of requests) {
        const sequence = number(request.sequence)
        if (released.has(sequence)) continue
        if (request.kind === "controller") {
          await recordBoundary(sequence)
          lastBoundaryWorkerResponses = successfulWorkers.length
          await release(sequence, request.kind)
          continue
        }
        if (input.run.strategy !== "regex" || sequence === 0) continue
        if (info.autoDrive.status.continuationCount > capturedContinuationCount) {
          await recordBoundary(sequence)
          capturedContinuationCount = info.autoDrive.status.continuationCount
          lastBoundaryWorkerResponses = successfulWorkers.length
        }
        await release(sequence, request.kind)
      }
      const pendingController = requests.some(
        (request) => request.kind === "controller" && !released.has(number(request.sequence)),
      )
      const idle = !active[sessionID] && !pendingController
      idleSince = idle ? (idleSince ?? Date.now()) : undefined
      if (idle && !providerFailure && successfulWorkers.length > lastBoundaryWorkerResponses) {
        const sequence = Math.max(...successfulWorkers.map((event) => number(event.sequence)))
        const boundary = await recordBoundary(sequence)
        lastBoundaryWorkerResponses = successfulWorkers.length
        const grade =
          input.run.strategy === "oracle"
            ? await gradeCached(`oracle-boundary-${patches.length - 1}`, boundary.content)
            : undefined
        const decision = decideExternalContinuation({
          strategy: input.run.strategy,
          continuationCount: externalContinuationCount,
          maxContinuations: input.run.maxContinuations,
          resolved: grade?.resolved,
        })
        if (decision) {
          await trace({
            type: "external-continuation-decided",
            boundary: patches.length,
            action: decision.action,
            reason: decision.reason,
            resolved: grade?.resolved,
            continuationCount: externalContinuationCount,
          })
          if (decision.action === "stop") return { patches, externalContinuationCount }
          externalContinuationCount++
          await api(address, `/api/session/${sessionID}/prompt`, {
            method: "POST",
            headers,
            body: JSON.stringify({ prompt: { text: decision.prompt }, delivery: "queue" }),
          })
          await trace({
            type: "external-continuation-admitted",
            boundary: patches.length,
            continuationCount: externalContinuationCount,
          })
          idleSince = undefined
          continue
        }
      }
      const classification = classifyIdleSession({
        active: !!active[sessionID],
        pendingController,
        action: info.autoDrive.status.action,
        idleMS: idleSince ? Date.now() - idleSince : 0,
        successfulResponses: successful.length,
        usageComplete: successful.every((event) => event.usageComplete === true),
      })
      if (classification === "complete") return { patches, externalContinuationCount: undefined }
      if (classification) {
        await trace({ type: "session-failed", failure: classification, successfulResponses: successful.length })
        return { patches, externalContinuationCount: undefined, failure: classification }
      }
      await Bun.sleep(200)
    }
    throw new Error("Session exceeded the frozen execution deadline")

    async function recordBoundary(sequence: number) {
      const content = await capturePatch(`boundary-${String(patches.length).padStart(2, "0")}`)
      const sha256 = digest(content)
      const boundary = { sequence, content, sha256 }
      patches.push(boundary)
      await Bun.write(path.join(patchRoot, `boundary-${String(patches.length - 1).padStart(2, "0")}.diff`), content)
      await trace({ type: "boundary-captured", sequence, sha256, strategy: input.run.strategy })
      return boundary
    }

    async function release(sequence: number, kind: unknown) {
      await Bun.write(path.join(controlRoot, `release-${sequence}`), "released\n")
      released.add(sequence)
      await trace({ type: "gateway-request-released", sequence, kind })
    }
  }

  async function capturePatch(label: string) {
    const patch = await capturePatchFromBaseline(taskGit, startupBaseline)
    await trace({
      type: "patch-captured",
      label,
      sha256: digest(patch.content),
      bytes: patch.content.length,
      changedPaths: patch.changedPaths,
      excludedPaths: patch.excludedPaths,
    })
    return patch.content
  }

  async function gradeCached(label: string, modelPatch: string) {
    const sha256 = digest(modelPatch)
    const cached = gradeCache.get(sha256)
    if (cached) {
      await trace({ type: "grader-reused", label, sha256, grade: cached })
      return cached
    }
    const grade = await gradePatch(label, modelPatch)
    gradeCache.set(sha256, grade)
    return grade
  }

  async function gradePatch(label: string, modelPatch: string) {
    const graderName = `autodrive-grade-${suffix}-${digest(label).slice(0, 8)}`
    let graderStarted = false
    try {
      await command(["docker", "rm", "--force", graderName], { allowFailure: true })
      await command([
        "docker",
        "run",
        "--detach",
        "--rm",
        "--name",
        graderName,
        "--network",
        "none",
        "--cpus",
        "8",
        "--memory",
        "32g",
        "--pids-limit",
        "4096",
        "--cap-drop",
        "ALL",
        "--security-opt",
        "no-new-privileges",
        "--workdir",
        "/testbed",
        "--entrypoint",
        "sleep",
        task.image,
        "infinity",
      ])
      graderStarted = true
      await command(["docker", "exec", graderName, "git", "-C", "/testbed", "reset", "--hard", task.baseCommit])
      await command(["docker", "exec", graderName, "git", "-C", "/testbed", "clean", "-fd"])
      if (modelPatch.trim())
        await command(
          ["docker", "exec", "-i", graderName, "git", "-C", "/testbed", "apply", "--whitespace=nowarn", "-"],
          { stdin: modelPatch },
        )
      const forward = task.testPatch.trim()
        ? await command(
            [
              "docker",
              "exec",
              "-i",
              graderName,
              "git",
              "-C",
              "/testbed",
              "apply",
              "--check",
              "--whitespace=nowarn",
              "-",
            ],
            { allowFailure: true, stdin: task.testPatch },
          )
        : undefined
      const reverse =
        !forward || forward.exitCode === 0
          ? undefined
          : await command(
              [
                "docker",
                "exec",
                "-i",
                graderName,
                "git",
                "-C",
                "/testbed",
                "apply",
                "--reverse",
                "--check",
                "--whitespace=nowarn",
                "-",
              ],
              { allowFailure: true, stdin: task.testPatch },
            )
      const disposition = classifyTestPatch({
        patch: task.testPatch,
        forwardApplies: forward?.exitCode === 0,
        reverseApplies: reverse?.exitCode === 0,
      })
      if (disposition === "apply")
        await command(
          ["docker", "exec", "-i", graderName, "git", "-C", "/testbed", "apply", "--whitespace=nowarn", "-"],
          { stdin: task.testPatch },
        )
      await trace({ type: "test-patch-prepared", label, disposition })
      const test = await command(["docker", "exec", graderName, "bash", "-lc", `cd /testbed && ${task.testCommand}`], {
        allowFailure: true,
        timeoutMS: 20 * 60_000,
      })
      const content = test.stdout + test.stderr
      const logPath = path.join(artifactRoot, "grader", input.run.id, `${label}.log`)
      await mkdir(path.dirname(logPath), { recursive: true })
      await Bun.write(logPath, content)
      const grade = gradePytest(task, parsePytestLog(content, task.logParser))
      await trace({ type: "grader-finished", label, exitCode: test.exitCode, grade, log: relativeArtifact(logPath) })
      return grade
    } finally {
      if (graderStarted) await command(["docker", "rm", "--force", graderName], { allowFailure: true })
    }
  }

  async function inspectImageDigest() {
    const result = await command(["docker", "image", "inspect", task.image, "--format", '{{join .RepoDigests "\\n"}}'])
    const value = result.stdout
      .split("\n")
      .map((item) => item.trim())
      .find((item) => item.includes("@sha256:"))
      ?.split("@")[1]
    if (!value || !/^sha256:[a-f0-9]{64}$/.test(value)) throw new Error("Task image digest is unavailable")
    return value
  }

  async function waitForProxy() {
    const deadline = Date.now() + 30_000
    while (Date.now() < deadline) {
      const result = await command(
        [
          "docker",
          "exec",
          proxyName,
          "bun",
          "-e",
          "fetch('http://127.0.0.1:8080/healthz').then(r=>r.ok?process.exit(0):process.exit(1)).catch(()=>process.exit(1))",
        ],
        { allowFailure: true },
      )
      if (result.exitCode === 0) return
      await Bun.sleep(250)
    }
    throw new Error("Gateway proxy did not become ready")
  }

  async function waitForServer() {
    const deadline = Date.now() + 90_000
    while (Date.now() < deadline) {
      const port = await command(["docker", "port", proxyName, "8080/tcp"], { allowFailure: true })
      const match = port.stdout.match(/127\.0\.0\.1:(\d+)/)
      const address = match ? `http://127.0.0.1:${match[1]}` : undefined
      const response = address
        ? await fetch(new URL("/_autodrive/task/api/health", address)).catch(() => undefined)
        : undefined
      if (address && response?.ok) return address
      const running = await command(["docker", "inspect", "--format", "{{.State.Running}}", taskName], {
        allowFailure: true,
      })
      if (running.stdout.trim() === "false") throw new Error("OpenCode task container exited before readiness")
      await Bun.sleep(500)
    }
    throw new Error("OpenCode server did not become ready")
  }
} catch (error) {
  const captured = await Promise.allSettled([recordExecutorFailure(error)])
  if (captured[0].status === "rejected") {
    const failure = classifyExecutorFailure(captured[0].reason, "failure-receipt")
    assertSecretFree(failure.message)
    console.error(`Failure receipt capture failed: ${failure.message}`)
  }
  throw error
} finally {
  if (taskStarted) await command(["docker", "rm", "--force", taskName], { allowFailure: true })
  if (proxyStarted) await command(["docker", "rm", "--force", proxyName], { allowFailure: true })
  if (networkCreated) await command(["docker", "network", "rm", networkName], { allowFailure: true })
}

async function recordExecutorFailure(error: unknown) {
  const failure = classifyExecutorFailure(error, execution.stage)
  const gateway = await captureGatewayFailureEvidence({
    proxyStarted,
    baselineSpend: execution.baselineSpend,
    readRequests: () => readJSONL(requestManifest),
    waitForSettlement: waitForGatewaySettlement,
    readEvents: () => readJSONL(proxyTrace),
    readSettledSpend,
  })
  const failureTrace = await Promise.allSettled([
    trace({
      type: "executor-failed",
      classification: failure.classification,
      stage: failure.stage,
      code: failure.code,
      error: { name: failure.name, message: failure.message },
      gateway,
    }),
  ])
  const artifacts = await Promise.allSettled([
    failureArtifact(tracePath),
    failureArtifact(requestManifest),
    failureArtifact(proxyTrace),
  ])
  const receipt = parseExecutorFailureReceipt({
    schemaVersion: 1,
    protocol: protocol.version,
    classification: failure.classification,
    stage: failure.stage,
    code: failure.code,
    runID: input.run.id,
    taskID: input.run.taskID,
    attempt: input.attempt,
    startedAt: startedAt.toISOString(),
    recordedAt: new Date().toISOString(),
    error: { name: failure.name, message: failure.message },
    ...(execution.sessionID ? { sessionID: execution.sessionID } : {}),
    gateway,
    acceptance: { trajectoryAccepted: false, ledgerRowWritten: false },
    artifacts: artifacts.flatMap((artifact) =>
      artifact.status === "fulfilled" && artifact.value ? [artifact.value] : [],
    ),
    recordingErrors: [
      ...(failureTrace[0].status === "rejected"
        ? [`failure trace: ${classifyExecutorFailure(failureTrace[0].reason, "failure-trace").message}`]
        : []),
      ...artifacts.flatMap((artifact, index) =>
        artifact.status === "rejected"
          ? [`artifact ${index}: ${classifyExecutorFailure(artifact.reason, "failure-artifact").message}`]
          : [],
      ),
    ],
  })
  const content = JSON.stringify(receipt, null, 2) + "\n"
  assertSecretFree(content)
  await mkdir(path.dirname(failurePath), { recursive: true })
  await Bun.write(failurePath, content)
  await chmod(failurePath, 0o600)
}

async function failureArtifact(filePath: string) {
  const file = Bun.file(filePath)
  if (!(await file.exists())) return undefined
  const content = await file.text()
  assertSecretFree(content)
  return { path: relativeArtifact(filePath), sha256: digest(content) }
}

async function waitForGatewaySettlement() {
  const deadline = Date.now() + 5 * 60_000
  while (Date.now() < deadline) {
    const requests = await readJSONL(requestManifest)
    const events = await readJSONL(proxyTrace)
    if (gatewayRequestsSettled(events, requests.length)) {
      await trace({ type: "gateway-settled", requests: requests.length })
      return
    }
    await Bun.sleep(200)
  }
  throw new Error("Gateway requests did not settle before the frozen deadline")
}

async function api<T = unknown>(address: string, pathname: string, init: RequestInit = {}) {
  const response = await fetch(new URL(`/_autodrive/task${pathname}`, address), {
    ...init,
    signal: AbortSignal.timeout(30_000),
  })
  const content = await response.text()
  assertSecretFree(content)
  if (!response.ok)
    throw new Error(`OpenCode API ${pathname} failed with HTTP ${response.status}: ${content.slice(0, 500)}`)
  if (!content.trim()) return undefined as T
  const body = JSON.parse(content)
  return (body.data ?? body) as T
}

async function command(args: string[], options: { allowFailure?: boolean; stdin?: string; timeoutMS?: number } = {}) {
  const child = Bun.spawn(args, {
    stdin: options.stdin === undefined ? "ignore" : "pipe",
    stdout: "pipe",
    stderr: "pipe",
  })
  if (options.stdin !== undefined) {
    child.stdin.write(options.stdin)
    child.stdin.end()
  }
  const timeout = options.timeoutMS ? setTimeout(() => child.kill(), options.timeoutMS) : undefined
  const exitCode = await child.exited.finally(() => {
    if (timeout) clearTimeout(timeout)
  })
  const stdout = await new Response(child.stdout).text()
  const stderr = await new Response(child.stderr).text()
  assertSecretFree(stdout)
  assertSecretFree(stderr)
  if (exitCode !== 0 && !options.allowFailure)
    throw new Error(`${args[0]} ${args[1] ?? ""} failed (${exitCode}): ${stderr.slice(0, 1_000)}`)
  return { exitCode, stdout, stderr }
}

async function readSpend() {
  const key = (await Bun.file(keyFile).text()).trim()
  const response = await fetch(new URL("/key/info", gatewayUpstream), {
    headers: { authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok) throw new Error("Gateway spend endpoint failed")
  const body = await response.json()
  const spend = Number(body.info?.spend)
  if (!Number.isFinite(spend) || spend < 0) throw new Error("Gateway spend is unavailable")
  return spend
}

async function readSettledSpend() {
  const values: number[] = []
  for (let index = 0; index < 8; index++) {
    values.push(await readSpend())
    if (index < 7) await Bun.sleep(2_000)
  }
  return Math.max(...values)
}

async function readJSONL(filePath: string) {
  const file = Bun.file(filePath)
  if (!(await file.exists())) return [] as Record<string, unknown>[]
  const content = await file.text()
  assertSecretFree(content)
  return content
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as Record<string, unknown>)
}

async function trace(event: Record<string, unknown>) {
  const content = JSON.stringify({ timestamp: new Date().toISOString(), ...event })
  assertSecretFree(content)
  await appendFile(tracePath, content + "\n", { encoding: "utf8", mode: 0o600 })
  await chmod(tracePath, 0o600)
}

function relativeArtifact(filePath: string) {
  const relative = path.relative(artifactRoot, filePath)
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("Artifact escapes its root")
  return relative
}

function modelID(value: string) {
  const separator = value.indexOf("/")
  if (separator < 1 || separator === value.length - 1) fail("Invalid logical model")
  return value.slice(separator + 1)
}

function number(value: unknown) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) throw new Error("Expected a finite number")
  return parsed
}

function digest(content: string) {
  return new Bun.CryptoHasher("sha256").update(content).digest("hex")
}

function requireValue(name: string) {
  const value = Bun.env[name]
  if (!value) fail(`${name} is required`)
  return value
}

function requireAbsolute(name: string) {
  const value = requireValue(name)
  if (!path.isAbsolute(value)) fail(`${name} must be absolute`)
  return value
}

function requireSHA(name: string) {
  const value = requireValue(name)
  if (!/^[a-f0-9]{64}$/.test(value)) fail(`${name} is invalid`)
  return value
}

function requireCommit(name: string) {
  const value = requireValue(name)
  if (!/^[a-f0-9]{40}$/.test(value)) fail(`${name} is invalid`)
  return value
}

function fail(message: string): never {
  console.error(message)
  process.exit(1)
}
