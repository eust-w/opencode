import { describe, expect, test } from "bun:test"
import {
  buildResearchProbeRequest,
  parseResearchProbeResponse,
  researchPreflightPlan,
} from "../src/research-preflight"

describe("research preflight capture", () => {
  test("pins exact scope capacities and transports", () => {
    expect(researchPreflightPlan("boundary-augmentation")).toEqual([
      { model: "d-robotics/deepseek-v4-pro", capacity: 48, transport: "responses" },
      { model: "d-robotics/qwen3.8-max", capacity: 48, transport: "chat" },
    ])
    expect(researchPreflightPlan("annotation")).toHaveLength(5)
    expect(researchPreflightPlan("ablation")).toEqual([
      { model: "d-robotics/qwen3.8-max", capacity: 504, transport: "chat" },
    ])
    expect(researchPreflightPlan("full").map((item) => item.capacity)).toEqual([384, 48, 48, 384])
  })

  test("builds deterministic compatibility probes", () => {
    expect(buildResearchProbeRequest("qwen3.8-max", "chat")).toMatchObject({
      model: "qwen3.8-max",
      temperature: 0,
      max_tokens: 1024,
      stream: false,
    })
    expect(buildResearchProbeRequest("deepseek-v4-pro", "responses")).toMatchObject({
      model: "deepseek-v4-pro",
      max_output_tokens: 4096,
      reasoning: { effort: "low" },
      tools: [{ type: "function", name: "bash" }],
    })
  })

  test("requires terminal output and complete usage", () => {
    expect(
      parseResearchProbeResponse("chat", {
        model: "qwen3.8-max-version",
        choices: [{ message: { content: '{"action":"stop"}' } }],
        usage: { prompt_tokens: 10, completion_tokens: 4 },
      }),
    ).toEqual({ modelVersion: "qwen3.8-max-version", promptTokens: 10, completionTokens: 4 })
    expect(
      parseResearchProbeResponse("responses", {
        model: "deepseek-v4-pro-version",
        status: "completed",
        output: [{ type: "function_call", name: "bash", arguments: '{"command":"pwd"}' }],
        usage: { input_tokens: 12, output_tokens: 8 },
      }),
    ).toEqual({ modelVersion: "deepseek-v4-pro-version", promptTokens: 12, completionTokens: 8 })
    expect(() => parseResearchProbeResponse("responses", { status: "incomplete" })).toThrow("terminal")
  })

  test("ships an exact provider-free failed-preflight reconciliation", async () => {
    const script = await Bun.file(
      new URL("../scripts/reconcile-failed-research-preflight.ts", import.meta.url),
    ).text()
    expect(script).toContain('new URL("/spend/logs"')
    expect(script).toContain("failed-research-preflight-spend-reconciliation")
    expect(script).toContain("SpendRow.safeParse")
    expect(script).toContain('flag: "wx"')
    expect(script).not.toContain("/chat/completions")
    expect(script).not.toMatch(/sk-[A-Za-z0-9_-]{20,}/)
  })
})
