#!/usr/bin/env bun

import { appendFile, chmod, mkdir } from "node:fs/promises"
import path from "node:path"
import { z } from "zod"
import { assertSecretFree, parseTrajectory } from "../src/artifact"
import { requireCompleteGatewayUsage } from "../src/gateway"
import {
  buildExperimentConfig,
  buildTaskPrompt,
  classifyIdleSession,
  gradePytest,
  parsePytestLog,
  parseTaskInput,
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
if (input.run.strategy !== "supervisor") fail("This executor stage accepts only supervisor runs")
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

try {
  await Bun.write(
    path.join(opencodeConfigRoot, "opencode.json"),
    JSON.stringify(
      buildExperimentConfig({
        workerModel,
        controllerModel,
        segmentSteps: input.run.segmentSteps,
        temperature: input.run.temperature,
      }),
      null,
      2,
    ) + "\n",
  )
  await Bun.write(path.join(configRoot, "models.json"), await Bun.file(modelMetadataPath).text())
  await command(["docker", "pull", task.image], { timeoutMS: 20 * 60_000 })
  const imageDigest = await inspectImageDigest()
  await command(["docker", "network", "create", "--internal", networkName])
  networkCreated = true

  const baselineSpend = await readSpend()
  await command([
    "docker",
    "run",
    "--detach",
    "--rm",
    "--name",
    proxyName,
    "--network",
    "bridge",
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
    `AUTODRIVE_GATEWAY_BASELINE_SPEND=${baselineSpend}`,
    "--env",
    `AUTODRIVE_GATEWAY_MAX_SPEND_USD=${input.budget.maxCostUSD}`,
    "--env",
    "AUTODRIVE_GATEWAY_HOLD_CONTROLLERS=1",
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
    "--publish",
    "127.0.0.1::4096",
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
  const availableModels = await api<{ providerID: string; id: string }[]>(address, "/api/model", { headers })
  if (
    !availableModels.some((model) => model.providerID === "openai" && model.id === workerModel) ||
    !availableModels.some((model) => model.providerID === "autodrive-controller" && model.id === controllerModel)
  )
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
  await api(address, `/api/session/${session.id}/auto-drive`, {
    method: "PUT",
    headers,
    body: JSON.stringify({
      enabled: true,
      policy: "supervisor",
      maxRuns: input.run.maxContinuations,
      supervisorModel: { providerID: "autodrive-controller", id: controllerModel },
      contextual: true,
      memory: true,
    }),
  })
  await trace({ type: "session-created", sessionID: session.id })
  await api(address, `/api/session/${session.id}/prompt`, {
    method: "POST",
    headers,
    body: JSON.stringify({ prompt: { text: buildTaskPrompt(task) } }),
  })

  const drained = await drain(address, session.id, headers)
  const boundaryPatches = drained.patches
  const finalPatch = await capturePatch("final")
  const firstPatch = boundaryPatches[0]?.content ?? finalPatch
  const firstGrade = await gradePatch("first-boundary", firstPatch)
  const finalGrade = firstPatch === finalPatch ? firstGrade : await gradePatch("final", finalPatch)
  const info = await api<{
    autoDrive: { status: { action?: string; continuationCount: number; reason?: string } }
  }>(address, `/api/session/${session.id}`, { headers })
  const messages = await api<unknown[]>(address, `/api/session/${session.id}/message?order=asc`, { headers })
  const context = await api<unknown>(address, `/api/session/${session.id}/context`, { headers })
  await trace({ type: "session-finished", autoDrive: info.autoDrive, messages, context })
  await Bun.write(path.join(patchRoot, "final.diff"), finalPatch)

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
  const trajectory = parseTrajectory({
    schemaVersion: 3,
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
    continuationCount: info.autoDrive.status.continuationCount,
    manualContinuationCount: 0,
    redundantTurns: boundaryPatches.filter((item, index) => index > 0 && item.sha256 === boundaryPatches[index - 1].sha256)
      .length,
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
    let idleSince: number | undefined
    while (Date.now() < deadline) {
      const requests = await readJSONL(requestManifest)
      for (const request of requests) {
        if (request.kind !== "controller" || released.has(number(request.sequence))) continue
        const sequence = number(request.sequence)
        const content = await capturePatch(`boundary-${String(patches.length).padStart(2, "0")}`)
        const sha256 = digest(content)
        patches.push({ sequence, content, sha256 })
        await Bun.write(path.join(patchRoot, `boundary-${String(patches.length - 1).padStart(2, "0")}.diff`), content)
        await Bun.write(path.join(controlRoot, `release-${sequence}`), "released\n")
        released.add(sequence)
        await trace({ type: "boundary-captured", sequence, sha256 })
      }
      const active = await api<Record<string, { type: string }>>(address, "/api/session/active", { headers })
      const info = await api<{ autoDrive: { status: { action?: string } } }>(address, `/api/session/${sessionID}`, {
        headers,
      })
      const pendingController = requests.some(
        (request) => request.kind === "controller" && !released.has(number(request.sequence)),
      )
      const idle = !active[sessionID] && !pendingController
      idleSince = idle ? (idleSince ?? Date.now()) : undefined
      const proxyEvents = await readJSONL(proxyTrace)
      const successful = proxyEvents.filter(
        (event) => event.type === "provider-response" && event.status === 200,
      )
      const classification = classifyIdleSession({
        active: !!active[sessionID],
        pendingController,
        action: info.autoDrive.status.action,
        idleMS: idleSince ? Date.now() - idleSince : 0,
        successfulResponses: successful.length,
        usageComplete: successful.every((event) => event.usageComplete === true),
      })
      if (classification === "complete") return { patches }
      if (classification) {
        await trace({ type: "session-failed", failure: classification, successfulResponses: successful.length })
        return { patches, failure: classification }
      }
      await Bun.sleep(200)
    }
    throw new Error("Session exceeded the frozen execution deadline")
  }

  async function capturePatch(label: string) {
    await command(["docker", "exec", taskName, "git", "-C", "/testbed", "add", "-A"])
    const patch = await command([
      "docker",
      "exec",
      taskName,
      "git",
      "-C",
      "/testbed",
      "diff",
      "--cached",
      "--binary",
      "--no-ext-diff",
      "HEAD",
      "--",
    ])
    await command(["docker", "exec", taskName, "git", "-C", "/testbed", "reset", "--mixed", "HEAD"])
    await trace({ type: "patch-captured", label, sha256: digest(patch.stdout), bytes: patch.stdout.length })
    return patch.stdout
  }

  async function gradePatch(label: string, modelPatch: string) {
    await command(["docker", "exec", taskName, "git", "-C", "/testbed", "reset", "--hard", task.baseCommit])
    await command(["docker", "exec", taskName, "git", "-C", "/testbed", "clean", "-fd"])
    if (modelPatch.trim())
      await command(["docker", "exec", "-i", taskName, "git", "-C", "/testbed", "apply", "--whitespace=nowarn", "-"], {
        stdin: modelPatch,
      })
    await command(["docker", "exec", "-i", taskName, "git", "-C", "/testbed", "apply", "--whitespace=nowarn", "-"], {
      stdin: task.testPatch,
    })
    const test = await command(["docker", "exec", taskName, "bash", "-lc", `cd /testbed && ${task.testCommand}`], {
      allowFailure: true,
      timeoutMS: 20 * 60_000,
    })
    const content = test.stdout + test.stderr
    const logPath = path.join(artifactRoot, "grader", input.run.id, `${label}.log`)
    await mkdir(path.dirname(logPath), { recursive: true })
    await Bun.write(logPath, content)
    const grade = gradePytest(task, parsePytestLog(content))
    await trace({ type: "grader-finished", label, exitCode: test.exitCode, grade, log: relativeArtifact(logPath) })
    return grade
  }

  async function inspectImageDigest() {
    const result = await command(["docker", "image", "inspect", task.image, "--format", "{{join .RepoDigests \"\\n\"}}"])
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
        ["docker", "exec", proxyName, "bun", "-e", "fetch('http://127.0.0.1:8080/healthz').then(r=>r.ok?process.exit(0):process.exit(1)).catch(()=>process.exit(1))"],
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
      const port = await command(["docker", "port", taskName, "4096/tcp"], { allowFailure: true })
      const match = port.stdout.match(/127\.0\.0\.1:(\d+)/)
      const containerIP = await command(
        [
          "docker",
          "inspect",
          "--format",
          `{{with index .NetworkSettings.Networks ${JSON.stringify(networkName)}}}{{.IPAddress}}{{end}}`,
          taskName,
        ],
        { allowFailure: true },
      )
      const addresses = [
        match ? `http://127.0.0.1:${match[1]}` : undefined,
        containerIP.stdout.trim() ? `http://${containerIP.stdout.trim()}:4096` : undefined,
      ].filter((item): item is string => !!item)
      for (const address of addresses) {
        const response = await fetch(new URL("/api/health", address)).catch(() => undefined)
        if (response?.ok) return address
      }
      const running = await command(["docker", "inspect", "--format", "{{.State.Running}}", taskName], {
        allowFailure: true,
      })
      if (running.stdout.trim() === "false") throw new Error("OpenCode task container exited before readiness")
      await Bun.sleep(500)
    }
    throw new Error("OpenCode server did not become ready")
  }

} finally {
  if (taskStarted) await command(["docker", "rm", "--force", taskName], { allowFailure: true })
  if (proxyStarted) await command(["docker", "rm", "--force", proxyName], { allowFailure: true })
  if (networkCreated) await command(["docker", "network", "rm", networkName], { allowFailure: true })
}

async function api<T = unknown>(address: string, pathname: string, init: RequestInit = {}) {
  const response = await fetch(new URL(pathname, address), { ...init, signal: AbortSignal.timeout(30_000) })
  const content = await response.text()
  assertSecretFree(content)
  if (!response.ok) throw new Error(`OpenCode API ${pathname} failed with HTTP ${response.status}: ${content.slice(0, 500)}`)
  if (!content.trim()) return undefined as T
  const body = JSON.parse(content)
  return (body.data ?? body) as T
}

async function command(
  args: string[],
  options: { allowFailure?: boolean; stdin?: string; timeoutMS?: number } = {},
) {
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
