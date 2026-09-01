#!/usr/bin/env bun

import { stat, writeFile } from "node:fs/promises"
import path from "node:path"
import { z } from "zod"
import { assertSecretFree } from "../src/artifact"
import { normalizeModelAnnotationText } from "../src/model-annotation"
import { protocol } from "../src/protocol"

const output = path.resolve(requireOption("output"))
const candidateID = requireOption("candidate")
if (!/^adb_[a-f0-9]{20}$/.test(candidateID)) fail("--candidate must be a boundary candidate ID")
const keyFile = requireAbsolute("AUTODRIVE_GATEWAY_KEY_FILE")
const gateway = (Bun.env.AUTODRIVE_GATEWAY_BASE_URL ?? "https://ai-api.d-robotics.cc/v1").replace(/\/+$/, "")
const requestPath = path.join(output, "requests", `${candidateID}.json`)
const failurePath = path.join(output, "failures", `${candidateID}.json`)
const target = path.join(output, "failures", `${candidateID}-preprovider.json`)
const requestContent = await Bun.file(requestPath).text()
const failureContent = await Bun.file(failurePath).text()
assertSecretFree(requestContent)
assertSecretFree(failureContent)
const request = z
  .object({
    model: z.string().min(1),
    messages: z.array(z.object({ role: z.literal("user"), content: z.string() })).length(1),
  })
  .loose()
  .parse(JSON.parse(requestContent))
const failure = z
  .object({
    protocol: z.literal(protocol.version),
    candidateID: z.literal(candidateID),
    attempt: z.literal(1),
    failedAt: z.iso.datetime(),
    error: z.object({ name: z.literal("Error"), message: z.literal("Annotation provider returned HTTP 400") }),
  })
  .loose()
  .parse(JSON.parse(failureContent))
if (normalizeModelAnnotationText(request.messages[0]!.content) === request.messages[0]!.content)
  throw new Error("Annotation request does not contain an unpaired UTF-16 surrogate")
const key = (await Bun.file(keyFile).text()).trim()
if (!key) fail("Gateway key file is empty")
const response = await fetch(new URL("/spend/logs", new URL(gateway).origin), {
  headers: { authorization: `Bearer ${key}` },
  signal: AbortSignal.timeout(30_000),
})
if (!response.ok) throw new Error(`Gateway spend logs returned HTTP ${response.status}`)
const rows = z.array(z.record(z.string(), z.unknown())).parse(await response.json())
const startedAfter = (await stat(requestPath)).mtimeMs - 60_000
const endedBefore = Date.parse(failure.failedAt) + 60_000
const matches = rows.flatMap((row) => {
  const metadata = z.record(z.string(), z.unknown()).safeParse(row.metadata)
  if (!metadata.success) return []
  const error = z
    .object({
      error_code: z.literal("500"),
      error_class: z.literal("InternalServerError"),
      error_message: z.string(),
    })
    .loose()
    .safeParse(metadata.data.error_information)
  const startTime = z.string().safeParse(row.startTime)
  const endTime = z.string().safeParse(row.endTime)
  const requestID = z.string().safeParse(row.request_id)
  if (!error.success || !startTime.success || !endTime.success || !requestID.success) return []
  if (Date.parse(startTime.data) < startedAfter || Date.parse(startTime.data) > endedBefore) return []
  if (row.status !== "failure" || row.spend !== 0 || row.prompt_tokens !== 0 || row.completion_tokens !== 0) return []
  if (!String(row.model).includes(request.model)) return []
  if (!error.data.error_message.includes("surrogates not allowed")) return []
  if (metadata.data.attempted_retries !== 2 || metadata.data.max_retries !== 2) return []
  return [{ row, metadata: metadata.data, error: error.data, startTime: startTime.data, endTime: endTime.data, requestID: requestID.data }]
})
if (matches.length !== 1) throw new Error(`Expected one exact surrogate transport failure, found ${matches.length}`)
const match = matches[0]!
const receipt = {
  schemaVersion: 1,
  protocol: protocol.version,
  method: "annotation-surrogate-preprovider-reconciliation",
  candidateID,
  attempt: 1,
  classification: "zero-cost-pre-provider-transport",
  request: relativeReference(requestPath, requestContent),
  failure: relativeReference(failurePath, failureContent),
  provider: {
    startTime: match.startTime,
    endTime: match.endTime,
    status: "failure",
    spendUSD: 0,
    promptTokens: 0,
    completionTokens: 0,
    errorCode: match.error.error_code,
    errorClass: match.error.error_class,
    attemptedRetries: match.metadata.attempted_retries,
    maxRetries: match.metadata.max_retries,
    requestIDHash: digest(match.requestID),
    errorMessageHash: digest(match.error.error_message),
  },
  normalization: "replace-unpaired-utf16-surrogates-with-u+fffd",
}
const content = JSON.stringify(receipt, null, 2) + "\n"
assertSecretFree(content)
await writeFile(target, content, { encoding: "utf8", flag: "wx", mode: 0o600 })
console.log(JSON.stringify({ output: target, candidateID, receiptSHA256: digest(content) }))

function relativeReference(target: string, content: string) {
  const relative = path.relative(output, target)
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("Artifact escapes output root")
  return { path: relative.split(path.sep).join("/"), sha256: digest(content) }
}

function digest(content: string) {
  return new Bun.CryptoHasher("sha256").update(content).digest("hex")
}

function requireOption(name: string) {
  const index = Bun.argv.indexOf(`--${name}`)
  const value = index < 0 ? undefined : Bun.argv[index + 1]
  if (!value) fail(`--${name} is required`)
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
