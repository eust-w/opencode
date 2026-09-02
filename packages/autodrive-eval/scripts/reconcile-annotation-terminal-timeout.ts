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
const requestPath = path.join(output, "requests", modelAnnotationArtifactName(candidateID, 2))
const failurePath = path.join(output, "failures", modelAnnotationArtifactName(candidateID, 2))
const target = path.join(output, "failures", `${candidateID}-terminal-output.json`)
if (await Bun.file(target).exists()) fail(`Terminal annotation exclusion already exists: ${target}`)
const [requestContent, failureContent] = await Promise.all(
  [requestPath, failurePath].map(async (filePath) => {
    const content = await Bun.file(filePath).text()
    assertSecretFree(content)
    return content
  }),
)
const request = z.object({ model: z.string().min(1) }).loose().parse(JSON.parse(requestContent))
const failure = z
  .object({
    candidateID: z.literal(candidateID),
    annotator: z.literal(annotator),
    model: z.literal(model),
    attempt: z.literal(2),
    failedAt: z.iso.datetime(),
    error: z.object({ name: z.literal("TimeoutError"), message: z.string().min(1) }),
  })
  .loose()
  .parse(JSON.parse(failureContent))
const key = (await Bun.file(keyFile).text()).trim()
if (!key) fail("Gateway key file is empty")
const rawResponseFiles = await Array.fromAsync(
  new Bun.Glob("*.json").scan({ cwd: path.join(output, "raw-responses"), onlyFiles: true }),
)
const knownRequestIDs = new Set(
  (
    await Promise.all(
      rawResponseFiles.map(async (file) => {
        const content = await Bun.file(path.join(output, "raw-responses", file)).text()
        assertSecretFree(content)
        const parsed = z.object({ id: z.string().min(1) }).loose().safeParse(JSON.parse(content))
        return parsed.success ? parsed.data.id : undefined
      }),
    )
  ).filter((id): id is string => !!id),
)
const requestTime = (await stat(requestPath)).mtimeMs
const response = await fetch(new URL("/spend/logs", new URL(gateway).origin), {
  headers: { authorization: `Bearer ${key}` },
  signal: AbortSignal.timeout(30_000),
})
if (!response.ok) throw new Error(`Gateway spend logs returned HTTP ${response.status}`)
const body = await response.json()
const rows = Array.isArray(body) ? body : z.object({ data: z.array(z.unknown()) }).parse(body).data
const SpendRow = z
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
  .loose()
const matches = rows
  .flatMap((row) => {
    const parsed = SpendRow.safeParse(row)
    return parsed.success ? [parsed.data] : []
  })
  .filter(
    (row) =>
      row.model.toLowerCase().includes(request.model.toLowerCase()) &&
      !knownRequestIDs.has(row.request_id) &&
      Math.abs(Date.parse(row.startTime) - requestTime) <= 2_000 &&
      Date.parse(row.endTime) <= Date.parse(failure.failedAt) + 5 * 60_000,
  )
if (matches.length !== 1) throw new Error(`Expected one exact late provider success, found ${matches.length}`)
const match = matches[0]!
const receipt = {
  schemaVersion: 1,
  protocol: protocol.version,
  method: "annotation-terminal-timeout-reconciliation",
  candidateID,
  annotator,
  model,
  attempt: 2,
  classification: "provider-success-after-client-timeout",
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

function requireOption(name: string) {
  const index = Bun.argv.indexOf(`--${name}`)
  const value = index < 0 ? undefined : Bun.argv[index + 1]
  if (!value || value.startsWith("--")) fail(`--${name} is required`)
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
