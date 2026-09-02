#!/usr/bin/env bun

import { stat, writeFile } from "node:fs/promises"
import path from "node:path"
import { z } from "zod"
import { assertSecretFree } from "../src/artifact"
import { modelAnnotationArtifactName } from "../src/model-annotation"
import { protocol } from "../src/protocol"

const output = path.resolve(requireOption("output"))
const candidateID = requireOption("candidate")
const annotator = requireOption("annotator")
const model = requireOption("model")
const keyFile = requireAbsolute("AUTODRIVE_GATEWAY_KEY_FILE")
const gateway = (Bun.env.AUTODRIVE_GATEWAY_BASE_URL ?? "https://ai-api.d-robotics.cc/v1").replace(/\/+$/, "")
const requestPath = path.join(output, "requests", modelAnnotationArtifactName(candidateID, 1))
const failurePath = path.join(output, "failures", modelAnnotationArtifactName(candidateID, 1))
const target = path.join(output, "failures", `${candidateID}-terminal-output.json`)
if (await Bun.file(target).exists()) fail(`Terminal annotation exclusion already exists: ${target}`)
const [requestContent, failureContent] = await Promise.all(
  [requestPath, failurePath].map(async (filePath) => {
    const content = await Bun.file(filePath).text()
    assertSecretFree(content)
    return content
  }),
)
const request = z
  .object({ model: z.string().min(1), max_tokens: z.number().int().positive() })
  .loose()
  .parse(JSON.parse(requestContent))
const failure = z
  .object({
    candidateID: z.literal(candidateID),
    annotator: z.literal(annotator),
    model: z.literal(model),
    attempt: z.literal(1),
    failedAt: z.iso.datetime(),
    error: z.object({
      name: z.literal("Error"),
      message: z.literal("Model annotation response requires content, model version, and complete usage"),
    }),
  })
  .loose()
  .parse(JSON.parse(failureContent))
const key = (await Bun.file(keyFile).text()).trim()
if (!key) fail("Gateway key file is empty")
const startedAfter = (await stat(requestPath)).mtimeMs - 60_000
const endedBefore = Date.parse(failure.failedAt) + 60_000
const response = await fetch(new URL("/spend/logs", new URL(gateway).origin), {
  headers: { authorization: `Bearer ${key}` },
  signal: AbortSignal.timeout(30_000),
})
if (!response.ok) throw new Error(`Gateway spend logs returned HTTP ${response.status}`)
const body = await response.json()
const rows = Array.isArray(body) ? body : z.object({ data: z.array(z.unknown()) }).parse(body).data
const matches = z
  .array(
    z
      .object({
        request_id: z.string().min(1),
        model: z.string().min(1),
        prompt_tokens: z.number().int().nonnegative(),
        completion_tokens: z.number().int().nonnegative(),
        spend: z.number().positive(),
        startTime: z.iso.datetime(),
        endTime: z.iso.datetime(),
        status: z.literal("success"),
      })
      .loose(),
  )
  .parse(rows)
  .filter(
    (row) =>
      row.model.includes(request.model) &&
      row.completion_tokens === request.max_tokens &&
      Date.parse(row.startTime) >= startedAfter &&
      Date.parse(row.endTime) <= endedBefore,
  )
if (matches.length !== 1) throw new Error(`Expected one exact terminal output-limit response, found ${matches.length}`)
const match = matches[0]!
const receipt = {
  schemaVersion: 1,
  protocol: protocol.version,
  method: "annotation-terminal-output-reconciliation",
  candidateID,
  annotator,
  model,
  attempt: 1,
  classification: "provider-success-invalid-final-annotation",
  request: reference(requestPath, requestContent),
  failure: reference(failurePath, failureContent),
  provider: {
    modelVersion: request.model,
    promptTokens: match.prompt_tokens,
    completionTokens: match.completion_tokens,
    spendUSD: match.spend,
    requestIDHash: digest(match.request_id),
  },
}
const content = JSON.stringify(receipt, null, 2) + "\n"
assertSecretFree(content)
await writeFile(target, content, { encoding: "utf8", flag: "wx", mode: 0o600 })
console.log(JSON.stringify({ output: target, candidateID, receiptSHA256: digest(content), spendUSD: match.spend }))

function reference(target: string, content: string) {
  return { path: path.relative(output, target), sha256: digest(content) }
}

function digest(content: string) {
  return new Bun.CryptoHasher("sha256").update(content).digest("hex")
}

function option(name: string) {
  const index = Bun.argv.indexOf(`--${name}`)
  return index === -1 ? undefined : Bun.argv[index + 1]
}

function requireOption(name: string) {
  const value = option(name)
  if (!value) fail(`--${name} VALUE is required`)
  return value
}

function requireAbsolute(name: string) {
  const value = Bun.env[name]
  if (!value || !path.isAbsolute(value)) fail(`${name} must be an absolute path`)
  return value
}

function fail(message: string): never {
  console.error(message)
  process.exit(1)
}
