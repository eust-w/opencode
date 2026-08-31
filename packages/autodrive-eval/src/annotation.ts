import { createHash } from "node:crypto"
import { z } from "zod"
import { protocol } from "./protocol"
import type { BoundaryLabel } from "./statistics"

const labels = ["continue", "stop", "defer"] as const
const Label = z.enum(labels)
const annotationHeader = "boundary_id,annotator_id,label,confidence,reason,next_action,timestamp"

export const BoundaryCandidate = z.object({
  id: z.string().min(1),
  baseTrajectoryID: z.string().min(1),
  taskID: z.string().min(1),
  boundaryIndex: z.number().int().nonnegative(),
  initialGoal: z.string().min(1),
  workerOutput: z.string().min(1),
  trajectorySummary: z.string().min(1),
  patch: z.string(),
  continuationCount: z.number().int().nonnegative(),
  memory: z.string(),
})
export type BoundaryCandidate = z.infer<typeof BoundaryCandidate>

const LabeledBoundaryCandidate = BoundaryCandidate.extend({ label: Label })

export const AnnotationSeal = z
  .object({
    schemaVersion: z.literal(3),
    protocol: z.literal(protocol.version),
    referenceStandard: z.enum(["independent-human-panel", "independent-model-panel"]),
    frozenAt: z.iso.datetime(),
    kappa: z.number().min(0.75).max(1),
    agreements: z.number().int().min(0).max(180),
    counts: z.object({ continue: z.literal(60), stop: z.literal(60), defer: z.literal(60) }).strict(),
    development: z.literal(54),
    test: z.literal(126),
    corpusSHA256: z.string().regex(/^[a-f0-9]{64}$/),
    inputs: z
      .object({
        candidatesSHA256: z.string().regex(/^[a-f0-9]{64}$/),
        firstSHA256: z.string().regex(/^[a-f0-9]{64}$/),
        secondSHA256: z.string().regex(/^[a-f0-9]{64}$/),
        adjudicatedSHA256: z.string().regex(/^[a-f0-9]{64}$/),
      })
      .strict(),
    annotators: z.array(z.string().min(1)).length(3),
  })
  .strict()
export type AnnotationSeal = z.infer<typeof AnnotationSeal>

export function validateFrozenAnnotationCorpus(input: {
  seal: unknown
  developmentContent: string
  testContent: string
}) {
  const seal = AnnotationSeal.parse(input.seal)
  if (new Set(seal.annotators).size !== seal.annotators.length)
    throw new Error("Frozen annotation corpus requires independent annotator identities")
  const corpusSHA256 = createHash("sha256")
    .update(input.developmentContent)
    .update("\0")
    .update(input.testContent)
    .digest("hex")
  if (corpusSHA256 !== seal.corpusSHA256) throw new Error("Frozen annotation corpus hash mismatch")
  const development = parseLabeledJSONL(input.developmentContent)
  const frozen = parseLabeledJSONL(input.testContent)
  if (development.length !== seal.development || frozen.length !== seal.test)
    throw new Error("Frozen annotation corpus split sizes do not match its seal")
  const boundaries = [...development, ...frozen]
  if (new Set(boundaries.map((boundary) => boundary.id)).size !== boundaries.length)
    throw new Error("Frozen annotation corpus contains duplicate boundary IDs")
  const developmentGroups = new Set(development.map((boundary) => boundary.baseTrajectoryID))
  if (frozen.some((boundary) => developmentGroups.has(boundary.baseTrajectoryID)))
    throw new Error("Frozen annotation corpus leaks a base trajectory across splits")
  const counts = Object.fromEntries(
    labels.map((label) => [label, boundaries.filter((boundary) => boundary.label === label).length]),
  ) as Record<BoundaryLabel, number>
  if (JSON.stringify(counts) !== JSON.stringify(seal.counts))
    throw new Error("Frozen annotation corpus label counts do not match its seal")
  return { examples: boundaries.length, development: development.length, test: frozen.length, counts, seal }
}

export interface Boundary {
  readonly id: string
  readonly baseTrajectoryID: string
  readonly label: BoundaryLabel
}

export function selectBalancedAnnotations(input: {
  candidates: readonly unknown[]
  first: string
  second: string
  adjudicated: string
  seed: string
}) {
  const candidates = z.array(BoundaryCandidate).parse(input.candidates)
  if (new Set(candidates.map((candidate) => candidate.id)).size !== candidates.length)
    throw new Error("Boundary candidate IDs must be unique")
  const ids = new Set(candidates.map((candidate) => candidate.id))
  const first = parseAnnotationFile(input.first, ids)
  const second = parseAnnotationFile(input.second, ids)
  const adjudicated = parseAnnotationFile(input.adjudicated, ids)
  if (new Set([first.annotator, second.annotator, adjudicated.annotator]).size !== 3)
    throw new Error("Annotation files require independent annotator identities")
  const selected = labels.flatMap((label) => {
    const matching = candidates
      .filter((candidate) => adjudicated.labels.get(candidate.id) === label)
      .map((candidate) => ({
        candidate,
        rank: createHash("sha256").update(`${input.seed}\0${candidate.id}`).digest("hex"),
      }))
      .sort((left, right) => left.rank.localeCompare(right.rank))
    if (matching.length < 60) throw new Error(`Adjudicated boundary frame contains fewer than 60 ${label} examples`)
    return matching.slice(0, 60).map((item) => item.candidate)
  })
  const selectedIDs = new Set(selected.map((candidate) => candidate.id))
  const subset = (source: ReturnType<typeof parseAnnotationFile>) =>
    [
      annotationHeader,
      ...candidates
        .filter((candidate) => selectedIDs.has(candidate.id))
        .map((candidate) =>
          [
            candidate.id,
            source.annotator,
            source.labels.get(candidate.id)!,
            source.confidence.get(candidate.id)!,
            source.reasons.get(candidate.id)!,
            source.nextActions.get(candidate.id)!,
            source.timestamps.get(candidate.id)!,
          ]
            .map(csvField)
            .join(","),
        ),
    ].join("\n")
  return {
    candidates: selected,
    first: subset(first),
    second: subset(second),
    adjudicated: subset(adjudicated),
    screened: candidates.length,
    counts: { continue: 60, stop: 60, defer: 60 } as const,
  }
}

export function splitBoundaries<T extends Boundary>(
  boundaries: readonly T[],
  options: { readonly developmentSize: number; readonly seed: string },
) {
  const counts = Object.fromEntries(
    (["continue", "stop", "defer"] as const).map((label) => [
      label,
      boundaries.filter((boundary) => boundary.label === label).length,
    ]),
  )
  if (Object.values(counts).some((count) => count !== 60))
    throw new Error("Boundary pool must contain exactly 60 examples per label")
  if (new Set(boundaries.map((boundary) => boundary.id)).size !== boundaries.length)
    throw new Error("Boundary IDs must be unique")

  const groups = Array.from(Map.groupBy(boundaries, (boundary) => boundary.baseTrajectoryID).entries())
    .map(([id, items]) => ({
      id,
      items,
      rank: createHash("sha256").update(`${options.seed}\0${id}`).digest("hex"),
    }))
    .sort((a, b) => a.rank.localeCompare(b.rank))
  const choices = new Map<number, number[]>([[0, []]])
  for (const [index, group] of groups.entries()) {
    for (const [size, selected] of Array.from(choices.entries()).sort((a, b) => b[0] - a[0])) {
      const next = size + group.items.length
      if (next > options.developmentSize || choices.has(next)) continue
      choices.set(next, [...selected, index])
    }
  }
  const selected = choices.get(options.developmentSize)
  if (!selected) throw new Error(`Cannot form a grouped development split of ${options.developmentSize} examples`)
  const developmentGroups = new Set(selected.map((index) => groups[index]!.id))
  return {
    development: boundaries.filter((boundary) => developmentGroups.has(boundary.baseTrajectoryID)),
    frozen: boundaries.filter((boundary) => !developmentGroups.has(boundary.baseTrajectoryID)),
  }
}

export function freezeAnnotations(input: {
  candidates: readonly unknown[]
  first: string
  second: string
  adjudicated: string
  developmentSize: number
  seed: string
  minimumKappa: number
}) {
  const candidates = z.array(BoundaryCandidate).length(180).parse(input.candidates)
  if (new Set(candidates.map((candidate) => candidate.id)).size !== candidates.length)
    throw new Error("Boundary candidate IDs must be unique")
  const ids = new Set(candidates.map((candidate) => candidate.id))
  const first = parseAnnotationFile(input.first, ids)
  const second = parseAnnotationFile(input.second, ids)
  const adjudicated = parseAnnotationFile(input.adjudicated, ids)
  if (new Set([first.annotator, second.annotator, adjudicated.annotator]).size !== 3)
    throw new Error("Annotation files require independent annotator identities")
  const agreements = candidates.filter(
    (candidate) => first.labels.get(candidate.id) === second.labels.get(candidate.id),
  ).length
  const kappa = cohenKappa(
    candidates.map((candidate) => first.labels.get(candidate.id)!),
    candidates.map((candidate) => second.labels.get(candidate.id)!),
  )
  if (kappa < input.minimumKappa)
    throw new Error(`Cohen's kappa ${kappa.toFixed(4)} is below ${input.minimumKappa.toFixed(4)}`)
  const boundaries = candidates.map((candidate) => ({
    ...candidate,
    label: adjudicated.labels.get(candidate.id)!,
  }))
  const split = splitBoundaries(boundaries, { developmentSize: input.developmentSize, seed: input.seed })
  const counts = Object.fromEntries(
    labels.map((label) => [label, boundaries.filter((boundary) => boundary.label === label).length]),
  ) as Record<BoundaryLabel, number>
  const sealInput = JSON.stringify({
    candidates,
    first: annotationEntries(first, candidates),
    second: annotationEntries(second, candidates),
    adjudicated: annotationEntries(adjudicated, candidates),
    minimumKappa: input.minimumKappa,
    kappa,
    seed: input.seed,
    development: split.development.map((boundary) => boundary.id),
    frozen: split.frozen.map((boundary) => boundary.id),
  })
  return {
    kappa,
    agreements,
    counts,
    annotators: [first.annotator, second.annotator, adjudicated.annotator],
    development: split.development,
    frozen: split.frozen,
    seal: { sha256: createHash("sha256").update(sealInput).digest("hex") },
  }
}

function parseLabeledJSONL(content: string) {
  return content
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => LabeledBoundaryCandidate.parse(JSON.parse(line)))
}

export function renderLabelTemplate(input: readonly unknown[], annotator: string) {
  if (!/^[A-Za-z0-9._-]+$/.test(annotator)) throw new Error("Annotator ID contains unsupported characters")
  const candidates = z.array(BoundaryCandidate).parse(input)
  return [
    annotationHeader,
    ...candidates.map((candidate) => [candidate.id, annotator, "", "", "", "", ""].map(csvField).join(",")),
  ].join("\n")
}

export function renderBoundaryPacket(input: readonly unknown[]) {
  return (
    z
      .array(BoundaryCandidate)
      .parse(input)
      .map((candidate) => JSON.stringify(candidate))
      .join("\n") + "\n"
  )
}

export function extractSupervisorBoundaries(input: unknown) {
  const parsed = z
    .object({
      runID: z.string().regex(/^adr_[a-f0-9]{20}$/),
      taskID: z.string().min(1),
      messages: z.array(
        z
          .object({
            type: z.enum(["user", "assistant"]),
            text: z.string().optional(),
            content: z.array(z.unknown()).optional(),
          })
          .loose(),
      ),
      controllers: z.array(
        z.object({
          requestSHA256: z.string().regex(/^[a-f0-9]{64}$/),
          workerResponses: z.number().int().positive(),
          body: z.object({
            messages: z.array(z.object({ role: z.string(), content: z.string() }).loose()).min(1),
          }),
        }),
      ),
      patches: z.array(z.string()),
    })
    .parse(input)
  if (parsed.controllers.length !== parsed.patches.length)
    throw new Error("Every supervisor boundary requires one captured patch")
  const initialGoal = parsed.messages.find((message) => message.type === "user")?.text
  if (!initialGoal) throw new Error("Boundary trajectory is missing its initial user goal")
  const assistants = parsed.messages.filter((message) => message.type === "assistant")
  return parsed.controllers.map((controller, boundaryIndex) => {
    if (controller.workerResponses > assistants.length)
      throw new Error("Supervisor boundary references unavailable worker responses")
    const prompt = controller.body.messages.find((message) => message.role === "user")?.content
    if (!prompt) throw new Error("Supervisor request is missing its user prompt")
    const workerOutput = promptTag(prompt, "WorkerLastOutput")
    const memory = promptTag(prompt, "AutoDriveMemory")
    const trajectorySummary = assistants
      .slice(0, controller.workerResponses)
      .flatMap((message) => (message.content ?? []).flatMap(renderVisiblePart))
      .join("\n")
      .slice(-16_000)
    return BoundaryCandidate.parse({
      id: `adb_${createHash("sha256")
        .update(`${parsed.runID}\0${boundaryIndex}\0${controller.requestSHA256}`)
        .digest("hex")
        .slice(0, 20)}`,
      baseTrajectoryID: parsed.runID,
      taskID: parsed.taskID,
      boundaryIndex,
      initialGoal,
      workerOutput,
      trajectorySummary: trajectorySummary || "(No visible tool or assistant text activity)",
      patch: parsed.patches[boundaryIndex]!,
      continuationCount: boundaryIndex,
      memory: memory.startsWith("(No accumulated") ? "" : memory,
    })
  })
}

function promptTag(prompt: string, tag: string) {
  const value = prompt.match(new RegExp(`<${tag}>\\s*([\\s\\S]*?)\\s*</${tag}>`))?.[1]?.trim()
  if (!value) throw new Error(`Supervisor request is missing ${tag}`)
  return value
}

function renderVisiblePart(input: unknown) {
  const part = z
    .object({
      type: z.string(),
      text: z.string().optional(),
      name: z.string().optional(),
      state: z
        .object({
          status: z.string().optional(),
          input: z.unknown().optional(),
          content: z.array(z.object({ type: z.string(), text: z.string().optional() }).loose()).optional(),
        })
        .loose()
        .optional(),
    })
    .loose()
    .parse(input)
  if (part.type === "reasoning") return []
  if (part.type === "text" && part.text) return [`[assistant] ${part.text}`]
  if (part.type !== "tool" || !part.name) return []
  const output = (part.state?.content ?? [])
    .filter((item) => item.type === "text" && item.text)
    .map((item) => item.text)
    .join("\n")
  return [
    `[tool:${part.name} ${part.state?.status ?? "unknown"}]${
      part.state?.input === undefined ? "" : ` input=${JSON.stringify(part.state.input)}`
    }${output ? `\n${output}` : ""}`,
  ]
}

function parseAnnotationFile(content: string, candidateIDs: ReadonlySet<string>) {
  const rows = parseCSV(content)
  if (rows[0]?.join(",") !== annotationHeader) throw new Error(`Annotation CSV header must be ${annotationHeader}`)
  const parsed = rows.slice(1).map((row) => {
    if (row.length !== 7) throw new Error("Annotation CSV rows must contain seven fields")
    const record = {
      id: row[0]!,
      annotator: row[1]!,
      label: Label.parse(row[2]),
      confidence: z.enum(["high", "medium", "low"]).parse(row[3]),
      reason: z.string().min(1).parse(row[4]),
      nextAction: row[5]!,
      timestamp: z.iso.datetime().parse(row[6]),
    }
    if (record.label !== "stop" && !record.nextAction.trim())
      throw new Error("CONTINUE and DEFER labels require a next action or missing decision")
    return record
  })
  if (parsed.length !== candidateIDs.size) throw new Error("Annotation CSV does not cover every boundary")
  if (new Set(parsed.map((row) => row.id)).size !== parsed.length)
    throw new Error("Annotation CSV contains duplicate boundary IDs")
  if (parsed.some((row) => !candidateIDs.has(row.id))) throw new Error("Annotation CSV contains an unknown boundary ID")
  const annotators = new Set(parsed.map((row) => row.annotator))
  if (annotators.size !== 1 || !parsed[0]?.annotator) throw new Error("Annotation CSV must use one annotator ID")
  return {
    annotator: parsed[0].annotator,
    labels: new Map(parsed.map((row) => [row.id, row.label])),
    reasons: new Map(parsed.map((row) => [row.id, row.reason])),
    confidence: new Map(parsed.map((row) => [row.id, row.confidence])),
    nextActions: new Map(parsed.map((row) => [row.id, row.nextAction])),
    timestamps: new Map(parsed.map((row) => [row.id, row.timestamp])),
  }
}

function cohenKappa(first: readonly BoundaryLabel[], second: readonly BoundaryLabel[]) {
  const observed = first.filter((label, index) => label === second[index]).length / first.length
  const expected = labels.reduce(
    (sum, label) =>
      sum +
      (first.filter((item) => item === label).length / first.length) *
        (second.filter((item) => item === label).length / second.length),
    0,
  )
  if (expected === 1) return observed === 1 ? 1 : 0
  return (observed - expected) / (1 - expected)
}

function annotationEntries(
  annotations: ReturnType<typeof parseAnnotationFile>,
  candidates: readonly BoundaryCandidate[],
) {
  return candidates.map((candidate) => ({
    id: candidate.id,
    annotator: annotations.annotator,
    label: annotations.labels.get(candidate.id),
    confidence: annotations.confidence.get(candidate.id),
    reason: annotations.reasons.get(candidate.id),
    nextAction: annotations.nextActions.get(candidate.id),
    timestamp: annotations.timestamps.get(candidate.id),
  }))
}

function csvField(value: string) {
  if (!/[",\r\n]/.test(value)) return value
  return `"${value.replaceAll('"', '""')}"`
}

function parseCSV(content: string) {
  const rows: string[][] = []
  const row: string[] = []
  let field = ""
  let quoted = false
  for (let index = 0; index < content.length; index++) {
    const character = content[index]!
    if (character === '"') {
      if (quoted && content[index + 1] === '"') {
        field += '"'
        index++
        continue
      }
      quoted = !quoted
      continue
    }
    if (character === "," && !quoted) {
      row.push(field)
      field = ""
      continue
    }
    if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && content[index + 1] === "\n") index++
      row.push(field)
      if (row.some((value) => value.length)) rows.push([...row])
      row.length = 0
      field = ""
      continue
    }
    field += character
  }
  if (quoted) throw new Error("Annotation CSV contains an unterminated quoted field")
  row.push(field)
  if (row.some((value) => value.length)) rows.push(row)
  return rows
}
