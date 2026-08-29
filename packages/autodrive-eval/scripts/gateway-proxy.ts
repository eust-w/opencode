#!/usr/bin/env bun

import { appendFile, mkdir, stat } from "node:fs/promises"
import path from "node:path"
import { assertSecretFree } from "../src/artifact"
import { proxyGatewayRequest, requireGatewayBudget } from "../src/gateway"

const keyFile = requireAbsolute("AUTODRIVE_GATEWAY_KEY_FILE")
const artifactRoot = requireAbsolute("AUTODRIVE_EVAL_ARTIFACT_ROOT")
const runID = requireValue("AUTODRIVE_RUN_ID")
const upstream = Bun.env.AUTODRIVE_GATEWAY_UPSTREAM ?? "https://ai-api.d-robotics.cc"
const baselineSpend = requireNumber("AUTODRIVE_GATEWAY_BASELINE_SPEND")
const maxSpendUSD = requireNumber("AUTODRIVE_GATEWAY_MAX_SPEND_USD")
const port = Number(Bun.env.AUTODRIVE_GATEWAY_PROXY_PORT ?? "8080")

if (!/^adr_[a-f0-9]{20}$/.test(runID)) fail("AUTODRIVE_RUN_ID is invalid")
if (!Number.isInteger(port) || port < 1 || port > 65_535) fail("AUTODRIVE_GATEWAY_PROXY_PORT is invalid")
if ((await stat(keyFile)).mode & 0o077) fail("Gateway key file must not be accessible by group or other users")
const key = (await Bun.file(keyFile).text()).trim()
if (!key) fail("Gateway key file is empty")

const runRoot = path.join(artifactRoot, "gateway", runID)
const requestRoot = path.join(runRoot, "requests")
const manifestPath = path.join(runRoot, "requests.jsonl")
const tracePath = path.join(runRoot, "proxy.jsonl")
await mkdir(requestRoot, { recursive: true })

let sequence = 0

Bun.serve({
  hostname: "0.0.0.0",
  port,
  async fetch(input) {
    if (new URL(input.url).pathname === "/healthz") return Response.json({ status: "ready", runID })
    const current = sequence++
    try {
      requireGatewayBudget({
        baselineSpend,
        currentSpend: await readSpend(),
        maxSpendUSD,
      })
      return await proxyGatewayRequest(input, {
        key,
        upstream,
        sequence: current,
        onRequest: async (request) => {
          assertSecretFree(request.normalized)
          const relative = path.join("gateway", runID, "requests", `${String(request.sequence).padStart(4, "0")}.json`)
          await Bun.write(path.join(artifactRoot, relative), request.normalized)
          const record = JSON.stringify({
            sequence: request.sequence,
            kind: request.kind,
            provider: request.provider,
            modelID: request.modelID,
            modelVersion: request.modelVersion,
            requestSHA256: request.requestSHA256,
            normalizedRequest: { path: relative, sha256: request.requestSHA256 },
            temperature: request.temperature,
            maxOutputTokens: request.maxOutputTokens,
          })
          assertSecretFree(record)
          await appendFile(manifestPath, record + "\n", { encoding: "utf8", mode: 0o600 })
          await writeTrace({ type: "provider-request", ...JSON.parse(record) })
        },
        beforeUpstream: async (request) => {
          if (request.kind !== "controller" || Bun.env.AUTODRIVE_GATEWAY_HOLD_CONTROLLERS !== "1") return
          await writeTrace({ type: "controller-held", sequence: request.sequence })
          const release = Bun.file(path.join(runRoot, "control", `release-${request.sequence}`))
          const deadline = Date.now() + 60_000
          while (!(await release.exists())) {
            if (Date.now() >= deadline) throw new Error("Controller release timed out")
            await Bun.sleep(100)
          }
          await writeTrace({ type: "controller-released", sequence: request.sequence })
        },
        onResponse: async (response) => writeTrace({ type: "provider-response", ...response }),
      })
    } catch (error) {
      await writeTrace({
        type: "proxy-error",
        sequence: current,
        name: error instanceof Error ? error.name : "UnknownError",
      })
      return Response.json({ error: { message: "AutoDrive gateway proxy rejected the request" } }, { status: 502 })
    }
  },
})

process.stdout.write(JSON.stringify({ status: "ready", port, runID }) + "\n")

async function readSpend() {
  const response = await fetch(new URL("/key/info", upstream), {
    headers: { authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok) throw new Error("Gateway spend endpoint failed")
  const body = await response.json()
  return Number(body.info?.spend)
}

async function writeTrace(input: unknown) {
  const record = JSON.stringify({ timestamp: new Date().toISOString(), ...asRecord(input) })
  assertSecretFree(record)
  await appendFile(tracePath, record + "\n", { encoding: "utf8", mode: 0o600 })
}

function asRecord(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Trace event must be an object")
  return input as Record<string, unknown>
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

function requireNumber(name: string) {
  const value = Number(requireValue(name))
  if (!Number.isFinite(value) || value < 0) fail(`${name} must be a nonnegative number`)
  return value
}

function fail(message: string): never {
  console.error(message)
  process.exit(1)
}
