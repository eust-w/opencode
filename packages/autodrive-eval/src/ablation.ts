import { z } from "zod"
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

export function buildAblationPrompt(input: unknown, variant: Exclude<AblationVariant, "regex">) {
  const candidate = BoundaryCandidate.parse(input)
  const goal = variant === "supervisor-only" ? "(Ablated)" : candidate.initialGoal
  const summary = variant === "summary" || variant === "memory" ? candidate.trajectorySummary : "(Ablated)"
  const memory = variant === "memory" ? candidate.memory || "(No accumulated strategy memory yet)" : "(Ablated)"
  return `You are the Auto-Drive Supervisor for an autonomous software engineering session.
A primary worker agent just completed its current turn.
Analyze whether the worker has remaining tasks, next steps, or unverified work, or if it should stop.

<InitialUserGoal>
${goal}
</InitialUserGoal>
<TrajectorySummary>
${summary}
</TrajectorySummary>
<AutoDriveMemory>
${memory}
</AutoDriveMemory>
<WorkerLastOutput>
${candidate.workerOutput.trim().slice(-2000)}
</WorkerLastOutput>

Decision Rules:
1. "action": "continue" only when the worker has an actionable, safe, in-scope next step towards the initial goal.
2. "action": "stop" when the user goal is completely achieved and verified, or no useful continuation is warranted.
3. "action": "defer" when continuing requires a subjective choice, missing information, expanded permissions, or a dangerous/external action.
4. "next_prompt": If continuing, provide a concise instruction for the exact next step. Otherwise return null.
5. "update_memory": Optional. Return a concise within-session progress or rule update; otherwise omit or return null.

Respond ONLY with a valid JSON object matching this schema:
{
  "action": "continue" | "stop" | "defer",
  "reason": string,
  "next_prompt": string | null,
  "update_memory": string | null
}`
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
