import { describe, expect, test } from "bun:test"
import {
  createGatewayRequest,
  gatewayHeaders,
  gatewayRoute,
  parseGatewayCatalog,
  parseGatewayUsage,
  proxyGatewayRequest,
  requireCompleteGatewayUsage,
  requireGatewayBudget,
} from "../src/gateway"

describe("gateway experiment transport", () => {
  test("freezes only exact versioned model IDs present in the gateway catalog", () => {
    expect(
      parseGatewayCatalog({
        object: "list",
        data: [
          { id: "qwen3.8-max" },
          { id: "deepseek-v4-pro" },
          { id: "glm-5.3" },
          { id: "qwen-max@latest" },
        ],
      }),
    ).toEqual({
      primary: "qwen3.8-max",
      replication: ["deepseek-v4-pro", "glm-5.3"],
      controller: "qwen3.8-max",
    })

    expect(() => parseGatewayCatalog({ object: "list", data: [{ id: "qwen3.8-max" }] })).toThrow(
      "missing frozen models",
    )
  })

  test("separates worker and controller routes from the upstream path", () => {
    expect(gatewayRoute("/worker/v1/chat/completions")).toEqual({
      kind: "worker",
      endpoint: "chat",
      upstreamPath: "/v1/chat/completions",
    })
    expect(gatewayRoute("/controller/v1/responses")).toEqual({
      kind: "controller",
      endpoint: "responses",
      upstreamPath: "/v1/responses",
    })
    expect(() => gatewayRoute("/v1/chat/completions")).toThrow("Gateway route must identify")
  })

  test("records the canonical provider request without credentials", () => {
    const request = createGatewayRequest({
      sequence: 0,
      kind: "worker",
      endpoint: "chat",
      body: {
        temperature: 0,
        model: "qwen3.8-max",
        max_tokens: 32_000,
        messages: [{ content: "Fix the task", role: "user" }],
      },
    })
    expect(request).toMatchObject({
      sequence: 0,
      kind: "worker",
      provider: "d-robotics-gateway",
      modelID: "qwen3.8-max",
      modelVersion: "qwen3.8-max",
      temperature: 0,
      maxOutputTokens: 32_000,
    })
    expect(request.normalized).toBe(
      '{"max_tokens":32000,"messages":[{"content":"Fix the task","role":"user"}],"model":"qwen3.8-max","temperature":0}',
    )
    expect(request.requestSHA256).toMatch(/^[a-f0-9]{64}$/)
    expect(() =>
      createGatewayRequest({
        sequence: 0,
        kind: "worker",
        endpoint: "chat",
        body: { model: "qwen3.8-max", temperature: 0.2 },
      }),
    ).toThrow("temperature zero")
  })

  test("materializes omitted worker generation limits at the provider boundary", () => {
    const request = createGatewayRequest({
      sequence: 1,
      kind: "worker",
      endpoint: "chat",
      body: {
        model: "qwen3.8-max",
        messages: [{ content: "Fix the task", role: "user" }],
      },
    })

    expect(request.temperature).toBe(0)
    expect(request.normalized).toBe(
      '{"max_tokens":32000,"messages":[{"content":"Fix the task","role":"user"}],"model":"qwen3.8-max","temperature":0}',
    )
  })

  test("freezes controller requests to the smaller output allowance", () => {
    expect(
      createGatewayRequest({
        sequence: 2,
        kind: "controller",
        endpoint: "chat",
        body: {
          model: "qwen3.8-max",
          max_tokens: 1_024,
          messages: [{ content: "Decide", role: "user" }],
          temperature: 0,
        },
      }),
    ).toMatchObject({ maxOutputTokens: 1_024, temperature: 0 })
    expect(() =>
      createGatewayRequest({
        sequence: 2,
        kind: "controller",
        endpoint: "chat",
        body: { model: "qwen3.8-max", max_tokens: 32_000, temperature: 0 },
      }),
    ).toThrow("frozen output allowance")
  })

  test("preserves Responses output limits instead of rewriting them as chat limits", () => {
    const request = createGatewayRequest({
      sequence: 3,
      kind: "worker",
      endpoint: "responses",
      body: {
        input: [{ content: [{ text: "Fix the task", type: "input_text" }], role: "user" }],
        max_output_tokens: 32_000,
        model: "qwen3.8-max",
        temperature: 0,
      },
    })

    expect(request.normalized).toBe(
      '{"input":[{"content":[{"text":"Fix the task","type":"input_text"}],"role":"user"}],"max_output_tokens":32000,"model":"qwen3.8-max","temperature":0}',
    )
    expect(request.endpoint).toBe("responses")
  })

  test("replaces client credentials instead of forwarding them", () => {
    const headers = gatewayHeaders(
      new Headers({
        authorization: "Bearer task-secret",
        connection: "keep-alive",
        host: "127.0.0.1:8080",
        "x-api-key": "task-key",
        "x-session-id": "local-session",
        "content-type": "application/json",
      }),
      "host-key",
    )
    expect(headers.get("authorization")).toBe("Bearer host-key")
    expect(headers.has("x-api-key")).toBe(false)
    expect(headers.has("connection")).toBe(false)
    expect(headers.has("host")).toBe(false)
    expect(headers.has("x-session-id")).toBe(false)
    expect(headers.get("content-type")).toBe("application/json")
  })

  test("extracts model and token usage from streaming or JSON responses", () => {
    expect(
      parseGatewayUsage(
        'data: {"model":"qwen3.8-max","usage":{"prompt_tokens":10,"completion_tokens":3,"total_tokens":13}}\n\ndata: [DONE]\n\n',
      ),
    ).toEqual({ modelVersion: "qwen3.8-max", promptTokens: 10, completionTokens: 3 })
    expect(
      parseGatewayUsage(
        JSON.stringify({ model: "glm-5.3", usage: { prompt_tokens: 8, completion_tokens: 2, total_tokens: 10 } }),
      ),
    ).toEqual({ modelVersion: "glm-5.3", promptTokens: 8, completionTokens: 2 })
    expect(
      parseGatewayUsage(
        [
          'event: response.created\ndata: {"type":"response.created","response":{"model":"qwen3.8-max"}}',
          'event: response.completed\ndata: {"type":"response.completed","response":{"model":"qwen3.8-max","usage":{"input_tokens":12,"output_tokens":5,"total_tokens":17}}}',
        ].join("\n\n"),
      ),
    ).toEqual({ modelVersion: "qwen3.8-max", promptTokens: 12, completionTokens: 5 })
  })

  test("fails closed when the gateway spend cap is exhausted or unknown", () => {
    expect(requireGatewayBudget({ baselineSpend: 1, currentSpend: 1.25, maxSpendUSD: 5 })).toBe(4.75)
    expect(() => requireGatewayBudget({ baselineSpend: 1, currentSpend: 6, maxSpendUSD: 5 })).toThrow(
      "spend cap exhausted",
    )
    expect(() => requireGatewayBudget({ baselineSpend: 1, currentSpend: Number.NaN, maxSpendUSD: 5 })).toThrow(
      "spend is unavailable",
    )
  })

  test("rejects accepted trajectories with incomplete successful-response usage", () => {
    expect(() =>
      requireCompleteGatewayUsage([
        { type: "provider-response", status: 200, usageComplete: true },
        { type: "provider-response", status: 200, usageComplete: false },
      ]),
    ).toThrow("incomplete usage accounting")
    expect(() =>
      requireCompleteGatewayUsage([
        { type: "provider-response", status: 200, usageComplete: true },
        { type: "provider-response", status: 429, usageComplete: false },
      ]),
    ).not.toThrow()
  })

  test("proxies a real HTTP request while recording the exact outbound body", async () => {
    let receivedAuthorization = ""
    let receivedBody = ""
    const upstream = Bun.serve({
      port: 0,
      fetch: async (request) => {
        receivedAuthorization = request.headers.get("authorization") ?? ""
        receivedBody = await request.text()
        return Response.json({
          model: "qwen3.8-max",
          choices: [{ finish_reason: "stop", message: { role: "assistant", content: "OK" } }],
          usage: { prompt_tokens: 4, completion_tokens: 1, total_tokens: 5 },
        })
      },
    })
    const requests: unknown[] = []
    const responses: unknown[] = []
    try {
      const response = await proxyGatewayRequest(
        new Request("http://proxy/worker/v1/chat/completions", {
          method: "POST",
          headers: { authorization: "Bearer task-key", "content-type": "application/json" },
          body: JSON.stringify({
            messages: [{ role: "user", content: "OK" }],
            max_tokens: 32_000,
            model: "qwen3.8-max",
            temperature: 0,
          }),
        }),
        {
          key: "host-key",
          upstream: `http://127.0.0.1:${upstream.port}`,
          sequence: 0,
          onRequest: (request) => {
            requests.push(request)
          },
          onResponse: (response) => {
            responses.push(response)
          },
        },
      )
      expect(response.status).toBe(200)
      expect(await response.json()).toMatchObject({ model: "qwen3.8-max" })
      expect(receivedAuthorization).toBe("Bearer host-key")
      expect(receivedBody).toBe(
        '{"max_tokens":32000,"messages":[{"content":"OK","role":"user"}],"model":"qwen3.8-max","temperature":0}',
      )
      expect(requests).toHaveLength(1)
      expect(requests[0]).toMatchObject({ kind: "worker", sequence: 0, modelID: "qwen3.8-max" })
      expect(responses).toEqual([
        {
          sequence: 0,
          status: 200,
          usageComplete: true,
          modelVersion: "qwen3.8-max",
          promptTokens: 4,
          completionTokens: 1,
        },
      ])
    } finally {
      await upstream.stop(true)
    }
  })

  test("forwards a successful Responses stream when usage accounting is incomplete", async () => {
    const content = [
      'event: response.created\ndata: {"type":"response.created","response":{"model":"qwen3.8-max"}}',
      'event: response.completed\ndata: {"type":"response.completed","response":{"model":"qwen3.8-max","status":"completed"}}',
    ].join("\n\n")
    const upstream = Bun.serve({
      port: 0,
      fetch: () => new Response(content, { headers: { "content-type": "text/event-stream" } }),
    })
    const raw: unknown[] = []
    const responses: unknown[] = []
    try {
      const response = await proxyGatewayRequest(
        new Request("http://proxy/worker/v1/responses", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ input: [], model: "qwen3.8-max" }),
        }),
        {
          key: "host-key",
          upstream: `http://127.0.0.1:${upstream.port}`,
          sequence: 5,
          onRequest: () => {},
          onRawResponse: (value) => {
            raw.push(value)
          },
          onResponse: (value) => {
            responses.push(value)
          },
        },
      )

      expect(response.status).toBe(200)
      expect(await response.text()).toBe(content)
      expect(raw).toEqual([
        {
          sequence: 5,
          status: 200,
          content,
          sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        },
      ])
      expect(responses).toEqual([{ sequence: 5, status: 200, usageComplete: false }])
    } finally {
      await upstream.stop(true)
    }
  })

  test("can hold a controller request after sealing it and before provider transport", async () => {
    const events: string[] = []
    const upstream = Bun.serve({
      port: 0,
      fetch: () => {
        events.push("upstream")
        return Response.json({
          model: "qwen3.8-max",
          choices: [{ finish_reason: "stop", message: { role: "assistant", content: "{}" } }],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        })
      },
    })
    try {
      await proxyGatewayRequest(
        new Request("http://proxy/controller/v1/chat/completions", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ model: "qwen3.8-max", messages: [] }),
        }),
        {
          key: "host-key",
          upstream: `http://127.0.0.1:${upstream.port}`,
          sequence: 0,
          onRequest: () => {
            events.push("sealed")
          },
          beforeUpstream: () => {
            events.push("released")
          },
          onResponse: () => {
            events.push("response")
          },
        },
      )
      expect(events).toEqual(["sealed", "released", "upstream", "response"])
    } finally {
      await upstream.stop(true)
    }
  })
})
