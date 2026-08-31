import { z } from "zod"
import { AutoDrive } from "@opencode-ai/core/session/auto-drive"
import { BoundaryCandidate } from "./annotation"
import { classificationReport, type BoundaryLabel } from "./statistics"

export const AblationVariant = z.enum(["regex", "supervisor-only", "goal", "summary", "memory"])
export type AblationVariant = z.infer<typeof AblationVariant>

const LabeledBoundary = BoundaryCandidate.extend({ label: z.enum(["continue", "stop", "defer"]) })
const Prediction = z.object({
  boundaryID: z.string().min(1),
  variant: AblationVariant,
  label: z.enum(["continue", "stop", "defer"]),
})

const Response = z
  .object({
    model: z.string().min(1),
    choices: z.array(z.object({ message: z.object({ content: z.string().min(1) }).loose() }).loose()).length(1),
    usage: z.object({
      prompt_tokens: z.number().int().nonnegative(),
      completion_tokens: z.number().int().nonnegative(),
    }),
  })
  .loose()

export function buildAblationRequest(model: string, prompt: string) {
  return {
    model,
    messages: [{ role: "user", content: prompt }],
    temperature: 0 as const,
    max_tokens: 1024 as const,
    stream: false as const,
  }
}

export function createAblationPrediction(input: unknown, variant: "regex") {
  const candidate = BoundaryCandidate.parse(input)
  return Prediction.parse({
    boundaryID: candidate.id,
    variant,
    label: AutoDrive.decideHeuristic({ lastText: candidate.workerOutput }).action,
  })
}

export function parseAblationResponse(
  input: unknown,
  variant: Exclude<AblationVariant, "regex">,
  response: unknown,
) {
  const candidate = BoundaryCandidate.parse(input)
  const parsed = Response.parse(response)
  const decision = AutoDrive.parseSupervisorDecision(parsed.choices[0]!.message.content, {
    initialGoal: variant === "supervisor-only" ? undefined : candidate.initialGoal,
    lastText: candidate.workerOutput,
    playbookMarkdown: variant === "memory" ? candidate.memory : undefined,
  })
  if (decision.action === "defer" && decision.reason?.startsWith("Supervisor response was invalid"))
    throw new Error("Ablation response does not contain a valid tri-state decision")
  return {
    prediction: Prediction.parse({ boundaryID: candidate.id, variant, label: decision.action }),
    modelVersion: parsed.model,
    promptTokens: parsed.usage.prompt_tokens,
    completionTokens: parsed.usage.completion_tokens,
  }
}

export function buildAblationPrompt(input: unknown, variant: Exclude<AblationVariant, "regex">) {
  const candidate = BoundaryCandidate.parse(input)
  const prompt = AutoDrive.buildSupervisorPrompt({
    initialGoal: variant === "supervisor-only" ? undefined : candidate.initialGoal,
    lastText: candidate.workerOutput,
    playbookMarkdown: variant === "memory" ? candidate.memory : undefined,
  })
  if (variant !== "summary") return prompt
  return prompt.replace(
    "<AutoDriveMemory>",
    `<TrajectorySummary>
${candidate.trajectorySummary}
</TrajectorySummary>

<AutoDriveMemory>`,
  )
}

export function analyzeBoundaryAblations(goldInput: readonly unknown[], predictionInput: readonly unknown[]) {
  const gold = z.array(LabeledBoundary).length(126).parse(goldInput)
  const predictions = z.array(Prediction).parse(predictionInput)
  if (new Set(gold.map((boundary) => boundary.id)).size !== gold.length)
    throw new Error("Frozen boundary test IDs are not unique")
  if (predictions.length !== gold.length * AblationVariant.options.length)
    throw new Error("Boundary ablation predictions are not complete")
  const keys = predictions.map((prediction) => `${prediction.boundaryID}\0${prediction.variant}`)
  if (new Set(keys).size !== keys.length) throw new Error("Boundary ablation predictions contain duplicates")
  const expected = new Map(gold.map((boundary) => [boundary.id, boundary.label]))
  if (predictions.some((prediction) => !expected.has(prediction.boundaryID)))
    throw new Error("Boundary ablation prediction references an unknown test item")
  const variants = Object.fromEntries(
    AblationVariant.options.map((variant) => {
      const selected = predictions.filter((prediction) => prediction.variant === variant)
      if (selected.length !== gold.length) throw new Error(`Boundary ablation ${variant} is incomplete`)
      const predicted = new Map(selected.map((prediction) => [prediction.boundaryID, prediction.label]))
      return [
        variant,
        classificationReport(
          gold.map((boundary) => boundary.label as BoundaryLabel),
          gold.map((boundary) => predicted.get(boundary.id)!),
        ),
      ]
    }),
  ) as Record<AblationVariant, ReturnType<typeof classificationReport>>
  return { examples: gold.length, variants }
}
