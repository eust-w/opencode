import { createHash } from "node:crypto"
import { z } from "zod"
import { serializeNormalizedRequest } from "./artifact"

const gatewayModels = {
  primary: "qwen3.8-max",
  replication: ["deepseek-v4-pro", "glm-5.3"],
  controller: "qwen3.8-max",
} as const

const Catalog = z.object({
  object: z.literal("list"),
  data: z.array(z.object({ id: z.string().min(1) }).loose()),
})

export function parseGatewayCatalog(input: unknown) {
  const ids = new Set(Catalog.parse(input).data.map((item) => item.id))
  const required = [gatewayModels.primary, ...gatewayModels.replication]
  const missing = required.filter((model) => !ids.has(model))
  if (missing.length) throw new Error(`Gateway is missing frozen models: ${missing.join(", ")}`)
  return {
    primary: gatewayModels.primary,
    replication: [...gatewayModels.replication],
    controller: gatewayModels.controller,
  }
}

export function gatewayRoute(pathname: string) {
  const match = pathname.match(/^\/(worker|controller)(\/v1\/(?:chat\/completions|responses))$/)
  if (!match) throw new Error("Gateway route must identify worker or controller traffic")
  return {
    kind: z.enum(["worker", "controller"]).parse(match[1]),
    upstreamPath: match[2],
  }
}

export function createGatewayRequest(input: {
  sequence: number
  kind: "worker" | "controller"
  body: unknown
}) {
  if (!input.body || typeof input.body !== "object" || Array.isArray(input.body))
    throw new Error("Gateway request body must be an object")
  const body = input.body as Record<string, unknown>
  if (body.temperature !== undefined && body.temperature !== 0)
    throw new Error("Gateway requests must use temperature zero")
  const modelID = z.string().min(1).parse(body.model)
  const maxOutputTokens = input.kind === "worker" ? 32_000 : 1_024
  const requestedMax = body.max_tokens ?? body.max_completion_tokens ?? body.max_output_tokens
  if (requestedMax !== undefined && requestedMax !== maxOutputTokens)
    throw new Error("Gateway request differs from the frozen output allowance")
  const normalizedBody = Object.fromEntries(
    Object.entries(body).filter(
      ([name]) => name !== "temperature" && name !== "max_completion_tokens" && name !== "max_output_tokens",
    ),
  )
  normalizedBody.temperature = 0
  normalizedBody.max_tokens = maxOutputTokens
  const normalized = serializeNormalizedRequest(normalizedBody)
  return {
    sequence: z.number().int().nonnegative().parse(input.sequence),
    kind: input.kind,
    provider: "d-robotics-gateway",
    modelID,
    modelVersion: modelID,
    requestSHA256: createHash("sha256").update(normalized).digest("hex"),
    temperature: 0 as const,
    maxOutputTokens,
    normalized,
  }
}

export function gatewayHeaders(input: Headers, key: string) {
  const headers = new Headers()
  ;["accept", "content-type"].forEach((name) => {
    const value = input.get(name)
    if (value) headers.set(name, value)
  })
  headers.set("authorization", `Bearer ${key}`)
  return headers
}

export function parseGatewayUsage(input: string) {
  const values = input.trimStart().startsWith("data:")
    ? input
        .split("\n")
        .filter((line) => line.startsWith("data: ") && line !== "data: [DONE]")
        .map((line) => JSON.parse(line.slice(6)))
    : [JSON.parse(input)]
  const result = values.reduce(
    (current, value) => ({
      modelVersion: typeof value.model === "string" ? value.model : current.modelVersion,
      promptTokens:
        typeof value.usage?.prompt_tokens === "number" ? value.usage.prompt_tokens : current.promptTokens,
      completionTokens:
        typeof value.usage?.completion_tokens === "number" ? value.usage.completion_tokens : current.completionTokens,
    }),
    { modelVersion: "", promptTokens: -1, completionTokens: -1 },
  )
  return z
    .object({
      modelVersion: z.string().min(1),
      promptTokens: z.number().int().nonnegative(),
      completionTokens: z.number().int().nonnegative(),
    })
    .parse(result)
}

export function requireGatewayBudget(input: {
  baselineSpend: number
  currentSpend: number
  maxSpendUSD: number
}) {
  if (![input.baselineSpend, input.currentSpend, input.maxSpendUSD].every(Number.isFinite))
    throw new Error("Gateway spend is unavailable")
  const spent = input.currentSpend - input.baselineSpend
  if (spent < 0) throw new Error("Gateway spend moved backwards")
  const remaining = input.maxSpendUSD - spent
  if (remaining <= 0) throw new Error("Gateway spend cap exhausted")
  return remaining
}

export async function proxyGatewayRequest(
  input: Request,
  options: {
    key: string
    upstream: string
    sequence: number
    onRequest: (request: ReturnType<typeof createGatewayRequest>) => void | Promise<void>
    beforeUpstream?: (request: ReturnType<typeof createGatewayRequest>) => void | Promise<void>
    onResponse: (response: {
      sequence: number
      status: number
      modelVersion?: string
      promptTokens?: number
      completionTokens?: number
    }) => void | Promise<void>
  },
) {
  if (input.method !== "POST") throw new Error("Gateway proxy accepts only POST requests")
  const route = gatewayRoute(new URL(input.url).pathname)
  const request = createGatewayRequest({
    sequence: options.sequence,
    kind: route.kind,
    body: await input.json(),
  })
  await options.onRequest(request)
  await options.beforeUpstream?.(request)
  const upstream = await fetch(new URL(route.upstreamPath, options.upstream), {
    method: "POST",
    headers: gatewayHeaders(input.headers, options.key),
    body: request.normalized,
  })
  const content = await upstream.text()
  const usage = upstream.ok ? parseGatewayUsage(content) : undefined
  await options.onResponse({
    sequence: request.sequence,
    status: upstream.status,
    ...(usage ?? {}),
  })
  const headers = new Headers(upstream.headers)
  ;["content-length", "set-cookie", "transfer-encoding"].forEach((name) => headers.delete(name))
  return new Response(content, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers,
  })
}
