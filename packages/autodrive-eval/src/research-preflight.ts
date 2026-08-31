import { z } from "zod"
import { type PreflightScope } from "./preflight"
import { protocol } from "./protocol"

export type ResearchPreflightScope = Exclude<PreflightScope, "canary" | "boundary">
export type ResearchProbeTransport = "chat" | "responses"

export function researchPreflightPlan(scope: ResearchPreflightScope) {
  if (scope === "boundary-augmentation")
    return [
      { model: protocol.models.primary, capacity: 48, transport: "responses" as const },
      { model: protocol.models.controller, capacity: 48, transport: "chat" as const },
    ]
  if (scope === "annotation")
    return [
      { model: protocol.models.primary, capacity: 480, transport: "chat" as const },
      { model: protocol.models.replication[0], capacity: 480, transport: "chat" as const },
      { model: protocol.models.replication[1], capacity: 480, transport: "chat" as const },
    ]
  if (scope === "ablation")
    return [{ model: protocol.models.controller, capacity: 504, transport: "chat" as const }]
  return [
    { model: protocol.models.primary, capacity: 384, transport: "responses" as const },
    { model: protocol.models.replication[0], capacity: 48, transport: "responses" as const },
    { model: protocol.models.replication[1], capacity: 48, transport: "responses" as const },
    { model: protocol.models.controller, capacity: 384, transport: "chat" as const },
  ]
}

export function buildResearchProbeRequest(model: string, transport: ResearchProbeTransport) {
  const modelID = model.slice(model.indexOf("/") + 1)
  if (transport === "chat")
    return {
      model: modelID,
      messages: [
        {
          role: "user",
          content:
            'Return only {"action":"stop","reason":"compatibility probe","next_prompt":null,"update_memory":null}.',
        },
      ],
      temperature: 0 as const,
      max_tokens: 1024 as const,
      stream: false as const,
    }
  return {
    model: modelID,
    input: [
      {
        role: "user",
        content: [{ type: "input_text", text: "Call the bash function once with the command pwd." }],
      },
    ],
    tools: [
      {
        type: "function",
        name: "bash",
        description: "Execute one harmless compatibility command.",
        parameters: {
          type: "object",
          properties: { command: { type: "string" } },
          required: ["command"],
          additionalProperties: false,
        },
      },
    ],
    tool_choice: "auto" as const,
    reasoning: { effort: "low" as const },
    max_output_tokens: 4096 as const,
    stream: false as const,
  }
}

export function parseResearchProbeResponse(transport: ResearchProbeTransport, input: unknown) {
  if (transport === "chat") {
    const parsed = z
      .object({
        model: z.string().min(1),
        choices: z.array(z.object({ message: z.object({ content: z.string().min(1) }).loose() }).loose()).min(1),
        usage: z.object({
          prompt_tokens: z.number().int().nonnegative(),
          completion_tokens: z.number().int().nonnegative(),
        }),
      })
      .loose()
      .parse(input)
    return {
      modelVersion: parsed.model,
      promptTokens: parsed.usage.prompt_tokens,
      completionTokens: parsed.usage.completion_tokens,
    }
  }
  const parsed = z
    .object({
      model: z.string().min(1),
      status: z.literal("completed"),
      output: z.array(z.object({ type: z.string(), name: z.string().optional() }).loose()).min(1),
      usage: z.object({ input_tokens: z.number().int().nonnegative(), output_tokens: z.number().int().nonnegative() }),
    })
    .loose()
    .safeParse(input)
  if (!parsed.success || !parsed.data.output.some((item) => item.type === "function_call" && item.name === "bash"))
    throw new Error("Responses compatibility probe requires terminal usage and one bash function call")
  return {
    modelVersion: parsed.data.model,
    promptTokens: parsed.data.usage.input_tokens,
    completionTokens: parsed.data.usage.output_tokens,
  }
}
