import path from "node:path"
import { z } from "zod"
import type { Strategy } from "./protocol"

export const BASELINE_CONTINUATION_PROMPT = "Please proceed with the next step."

export function dockerPortPublish(containerPort: number) {
  return `127.0.0.1:0:${containerPort}`
}

export function hasExperimentModels(input: unknown, workerModel: string, controllerModel: string) {
  const result = z
    .object({
      providers: z.array(z.object({ id: z.string(), models: z.record(z.string(), z.unknown()) })),
    })
    .parse(input)
  const has = (providerID: string, modelID: string) =>
    result.providers.some((provider) => provider.id === providerID && modelID in provider.models)
  return has("openai", workerModel) && has("autodrive-controller", controllerModel)
}

export const TaskInput = z
  .object({
    schemaVersion: z.literal(1),
    instanceID: z.string().min(1),
    repo: z.string().regex(/^[^/]+\/[^/]+$/),
    baseCommit: z.string().regex(/^[a-f0-9]{40}$/),
    environmentSetupCommit: z.string().regex(/^[a-f0-9]{40}$/),
    image: z.string().min(1),
    problemStatement: z.string().min(1),
    testPatch: z.string().min(1),
    testCommand: z.string().min(1),
    logParser: z.literal("parse_log_pytest"),
    failToPass: z.array(z.string().min(1)).min(1),
    passToPass: z.array(z.string().min(1)),
    source: z.object({
      commit: z.string().regex(/^[a-f0-9]{40}$/),
      sha256: z.string().regex(/^[a-f0-9]{64}$/),
    }),
  })
  .strict()
export type TaskInput = z.infer<typeof TaskInput>

export function parseTaskInput(input: unknown) {
  return TaskInput.parse(input)
}

export function buildTaskPrompt(task: TaskInput) {
  return [
    "Fix the repository issue described below.",
    "Work directly in the current checkout. Inspect the code, implement the smallest correct fix, and run relevant existing tests when practical.",
    "Do not ask the user for input. Do not access the network. Do not commit changes.",
    "When the fix is complete, summarize what changed and the validation you performed.",
    "",
    task.problemStatement,
  ].join("\n")
}

export function buildAutoDriveUpdate(input: {
  strategy: Strategy
  maxContinuations: number
  controllerModel: string
}) {
  if (input.strategy === "regex")
    return {
      enabled: true,
      policy: "heuristic" as const,
      maxRuns: input.maxContinuations,
      contextual: false,
      memory: false,
    }
  if (input.strategy === "supervisor")
    return {
      enabled: true,
      policy: "supervisor" as const,
      maxRuns: input.maxContinuations,
      supervisorModel: { providerID: "autodrive-controller", id: input.controllerModel },
      contextual: true,
      memory: true,
    }
  return {
    enabled: false,
    policy: "supervisor" as const,
    maxRuns: input.maxContinuations,
    contextual: false,
    memory: false,
  }
}

export function decideExternalContinuation(input: {
  strategy: Strategy
  continuationCount: number
  maxContinuations: number
  resolved?: boolean
}):
  | { action: "continue"; reason: string; prompt: string }
  | { action: "stop"; reason: string }
  | undefined {
  if (input.strategy === "regex" || input.strategy === "supervisor") return undefined
  if (input.continuationCount >= input.maxContinuations)
    return { action: "stop" as const, reason: "Maximum continuation count reached" }
  if (input.strategy === "oracle" && input.resolved === undefined)
    throw new Error("Oracle continuation requires an external validator result")
  if (input.strategy === "oracle" && input.resolved)
    return { action: "stop" as const, reason: "External validator confirmed completion" }
  return {
    action: "continue" as const,
    reason:
      input.strategy === "blind"
        ? `Blind baseline continuation ${input.continuationCount + 1} of ${input.maxContinuations}`
        : "External validator found the task incomplete",
    prompt: BASELINE_CONTINUATION_PROMPT,
  }
}

export function buildExperimentConfig(input: {
  workerModel: string
  controllerModel: string
  segmentSteps: number
  temperature: number
}) {
  return {
    model: `openai/${input.workerModel}`,
    default_agent: "experiment",
    permission: permissions(),
    agent: {
      experiment: {
        mode: "primary",
        steps: input.segmentSteps,
        temperature: input.temperature,
        permission: permissions(),
      },
    },
    provider: {
      openai: provider(
        "http://autodrive-proxy:8080/worker/v1",
        input.workerModel,
        true,
        4_096,
        "@ai-sdk/openai",
        { reasoningEffort: "low" },
      ),
      "autodrive-controller": provider(
        "http://autodrive-proxy:8080/controller/v1",
        input.controllerModel,
        false,
        1_024,
        "@ai-sdk/openai-compatible",
        {},
      ),
    },
  }
}

export async function prepareExperimentConfig(
  directory: string,
  input: Parameters<typeof buildExperimentConfig>[0],
) {
  await Promise.all([
    Bun.write(path.join(directory, "opencode.json"), JSON.stringify(buildExperimentConfig(input), null, 2) + "\n"),
    Bun.write(
      path.join(directory, ".gitignore"),
      ["node_modules", "package.json", "package-lock.json", "bun.lock", ".gitignore"].join("\n") + "\n",
    ),
  ])
}

export function classifyIdleSession(input: {
  active: boolean
  pendingController: boolean
  action?: string
  idleMS: number
  successfulResponses: number
  usageComplete: boolean
}) {
  if (input.active || input.pendingController) return undefined
  if (input.action === "stop" || input.action === "defer") return "complete" as const
  if (input.idleMS < 5_000 || input.successfulResponses === 0) return undefined
  return input.usageComplete ? ("non-retryable-provider" as const) : ("retryable-provider" as const)
}

export function classifyTestPatch(input: { forwardApplies: boolean; reverseApplies: boolean }) {
  if (input.forwardApplies) return "apply" as const
  if (input.reverseApplies) return "already-applied" as const
  throw new Error("Model patch conflicts with the frozen test patch")
}

function permissions() {
  return { "*": "allow" as const, question: "deny" as const, external_directory: "deny" as const }
}

function provider(url: string, model: string, tools: boolean, output: number, pkg: string, options: object) {
  return {
    name: model,
    npm: pkg,
    env: [],
    options: { apiKey: "proxy-only-no-secret", baseURL: url },
    models: {
      [model]: {
        id: model,
        name: model,
        reasoning: Object.keys(options).length > 0,
        temperature: true,
        tool_call: tools,
        modalities: { input: ["text"], output: ["text"] },
        limit: { context: 131_072, output },
        options,
      },
    },
  }
}

const statuses = new Set(["PASSED", "FAILED", "SKIPPED", "ERROR", "XFAIL"])

export function parsePytestLog(content: string) {
  return Object.fromEntries(
    content
      .split("\n")
      .flatMap((line) => {
        const status = line.split(/\s+/, 1)[0]
        if (!statuses.has(status)) return []
        const normalized = status === "FAILED" ? line.replaceAll(" - ", " ") : line
        const fields = normalized.split(/\s+/)
        if (fields.length <= 1) return []
        return [[fields[1], fields[0]]]
      }),
  )
}

export function gradePytest(task: TaskInput, status: Record<string, string>) {
  const passed = (test: string) => status[test] === "PASSED" || status[test] === "XFAIL"
  const failToPassPassed = task.failToPass.filter(passed)
  const failToPassFailed = task.failToPass.filter((test) => !passed(test))
  const passToPassPassed = task.passToPass.filter(passed)
  const passToPassFailed = task.passToPass.filter((test) => !passed(test))
  const failToPassRate = failToPassPassed.length / task.failToPass.length
  const passToPassRate = task.passToPass.length ? passToPassPassed.length / task.passToPass.length : 1
  return {
    resolved: failToPassRate === 1 && passToPassRate === 1,
    fixRate: passToPassRate === 1 ? failToPassRate : 0,
    failToPassRate,
    passToPassRate,
    failToPassPassed,
    failToPassFailed,
    passToPassPassed,
    passToPassFailed,
  }
}
