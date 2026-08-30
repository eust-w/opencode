import { createHash } from "node:crypto"
import { z } from "zod"
import { serializeNormalizedRequest } from "./artifact"

const gatewayModels = {
  primary: "deepseek-v4-pro",
  replication: ["qwen3.7-max", "deepseek-v4-flash"],
  controller: "qwen3.8-max",
} as const

const Catalog = z.object({
  object: z.literal("list"),
  data: z.array(z.object({ id: z.string().min(1) }).loose()),
})

export function parseGatewayCatalog(input: unknown) {
  const ids = new Set(Catalog.parse(input).data.map((item) => item.id))
  const required = Array.from(new Set([gatewayModels.primary, ...gatewayModels.replication, gatewayModels.controller]))
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
    endpoint: match[2] === "/v1/responses" ? ("responses" as const) : ("chat" as const),
    upstreamPath: match[2],
  }
}

export function createGatewayRequest(input: {
  sequence: number
  kind: "worker" | "controller"
  endpoint: "chat" | "responses"
  body: unknown
}) {
  if (!input.body || typeof input.body !== "object" || Array.isArray(input.body))
    throw new Error("Gateway request body must be an object")
  const body = input.body as Record<string, unknown>
  if (body.temperature !== undefined && body.temperature !== 0)
    throw new Error("Gateway requests must use temperature zero")
  const modelID = z.string().min(1).parse(body.model)
  const maxOutputTokens = input.kind === "worker" ? 4_096 : 1_024
  const requestedMax = body.max_tokens ?? body.max_completion_tokens ?? body.max_output_tokens
  if (requestedMax !== undefined && requestedMax !== maxOutputTokens)
    throw new Error("Gateway request differs from the frozen output allowance")
  const normalizedBody = Object.fromEntries(
    Object.entries(body).filter(
      ([name]) =>
        name !== "temperature" &&
        name !== "max_tokens" &&
        name !== "max_completion_tokens" &&
        name !== "max_output_tokens",
    ),
  )
  normalizedBody.temperature = 0
  normalizedBody[input.endpoint === "responses" ? "max_output_tokens" : "max_tokens"] = maxOutputTokens
  const normalized = serializeNormalizedRequest(normalizedBody)
  return {
    sequence: z.number().int().nonnegative().parse(input.sequence),
    kind: input.kind,
    endpoint: input.endpoint,
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

export async function relayTaskRequest(input: Request, upstream: string) {
  const source = new URL(input.url)
  const prefix = "/_autodrive/task"
  if (!source.pathname.startsWith(`${prefix}/`)) throw new Error("Task relay path is invalid")
  const headers = new Headers()
  ;["accept", "content-type", "x-opencode-directory"].forEach((name) => {
    const value = input.headers.get(name)
    if (value) headers.set(name, value)
  })
  const method = input.method.toUpperCase()
  return fetch(new URL(source.pathname.slice(prefix.length) + source.search, upstream), {
    method,
    headers,
    body: method === "GET" || method === "HEAD" ? undefined : await input.arrayBuffer(),
    redirect: "manual",
  })
}

export function parseGatewayUsage(input: string) {
  const data = input
    .split("\n")
    .filter((line) => line.startsWith("data: ") && line !== "data: [DONE]")
  const values = data.length
    ? input
        .split("\n")
        .filter((line) => line.startsWith("data: ") && line !== "data: [DONE]")
        .map((line) => JSON.parse(line.slice(6)))
    : [JSON.parse(input)]
  const result = values.reduce(
    (current, value) => {
      const event = UsageEvent.parse(value)
      const response = event.response ?? event
      return {
        modelVersion: response.model ?? current.modelVersion,
        promptTokens: response.usage?.prompt_tokens ?? response.usage?.input_tokens ?? current.promptTokens,
        completionTokens:
          response.usage?.completion_tokens ?? response.usage?.output_tokens ?? current.completionTokens,
      }
    },
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

const Usage = z
  .object({
    prompt_tokens: z.number().int().nonnegative().optional(),
    completion_tokens: z.number().int().nonnegative().optional(),
    input_tokens: z.number().int().nonnegative().optional(),
    output_tokens: z.number().int().nonnegative().optional(),
  })
  .loose()

const UsageResponse = z
  .object({
    model: z.string().min(1).optional(),
    usage: Usage.optional(),
  })
  .loose()

const UsageEvent = UsageResponse.extend({ response: UsageResponse.optional() }).loose()

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

export function requireCompleteGatewayUsage(events: readonly unknown[]) {
  const incomplete = events.some((event) => {
    const parsed = z
      .object({
        type: z.string().optional(),
        status: z.number().optional(),
        usageComplete: z.boolean().optional(),
      })
      .loose()
      .safeParse(event)
    return (
      parsed.success &&
      parsed.data.type === "provider-response" &&
      parsed.data.status === 200 &&
      parsed.data.usageComplete !== true
    )
  })
  if (incomplete) throw new Error("Successful provider response has incomplete usage accounting")
}

export function gatewayRequestsSettled(events: readonly unknown[], requestCount: number) {
  if (!Number.isInteger(requestCount) || requestCount < 0) throw new Error("Gateway request count is invalid")
  const terminal = new Set(
    events.flatMap((event) => {
      const parsed = z
        .object({ type: z.string(), sequence: z.number().int().nonnegative() })
        .loose()
        .safeParse(event)
      if (!parsed.success || !new Set(["provider-response", "proxy-error"]).has(parsed.data.type)) return []
      return [parsed.data.sequence]
    }),
  )
  return (
    terminal.size === requestCount &&
    Array.from({ length: requestCount }, (_, sequence) => terminal.has(sequence)).every(Boolean)
  )
}

export function shouldHoldGatewayRequest(input: {
  kind: "worker" | "controller"
  sequence: number
  holdControllers: boolean
  holdWorkers: boolean
}) {
  if (input.kind === "controller") return input.holdControllers
  return input.holdWorkers && input.sequence > 0
}

export async function waitForControllerRelease(input: { path: string; timeoutMS: number; pollMS: number }) {
  const deadline = Date.now() + input.timeoutMS
  while (!(await Bun.file(input.path).exists())) {
    if (Date.now() >= deadline) throw new Error("Controller release timed out")
    await Bun.sleep(input.pollMS)
  }
}

export async function proxyGatewayRequest(
  input: Request,
  options: {
    key: string
    upstream: string
    sequence: number
    onRequest: (request: ReturnType<typeof createGatewayRequest>) => void | Promise<void>
    beforeUpstream?: (request: ReturnType<typeof createGatewayRequest>) => void | Promise<void>
    onRawResponse?: (response: {
      sequence: number
      status: number
      content: string
      sha256: string
    }) => void | Promise<void>
    onResponse: (response: {
      sequence: number
      status: number
      usageComplete: boolean
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
    endpoint: route.endpoint,
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
  await options.onRawResponse?.({
    sequence: request.sequence,
    status: upstream.status,
    content,
    sha256: createHash("sha256").update(content).digest("hex"),
  })
  const usage = upstream.ok ? tryParseGatewayUsage(content) : undefined
  await options.onResponse({
    sequence: request.sequence,
    status: upstream.status,
    usageComplete: !!usage,
    ...usage,
  })
  const headers = new Headers(upstream.headers)
  ;["content-length", "set-cookie", "transfer-encoding"].forEach((name) => headers.delete(name))
  return new Response(content, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers,
  })
}

function tryParseGatewayUsage(content: string) {
  try {
    return parseGatewayUsage(content)
  } catch {
    return undefined
  }
}
