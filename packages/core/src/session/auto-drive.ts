export * as AutoDrive from "./auto-drive"

import { Option, Schema } from "effect"

export const DEFAULT_MAX_RUNS = 5
export const DEFAULT_PROMPT = "Please proceed with the next step."
export const MEMORY_RELATIVE_PATH = ".opencode/auto-drive.md"

export interface Context {
  readonly initialGoal?: string
  readonly lastText: string
  readonly playbookMarkdown?: string
  readonly customPrompt?: string
  readonly contextual?: boolean
}

export const Action = Schema.Literals(["continue", "stop", "defer"])
export type Action = typeof Action.Type

export interface Decision {
  readonly action: Action
  readonly reason?: string
  readonly nextPrompt?: string
  readonly updateMemory?: string
}

const SupervisorOutput = Schema.Struct({
  action: Action.pipe(Schema.optional),
  continue: Schema.Boolean.pipe(Schema.optional),
  reason: Schema.String.pipe(Schema.optional),
  next_prompt: Schema.NullOr(Schema.String).pipe(Schema.optional),
  update_memory: Schema.NullOr(Schema.String).pipe(Schema.optional),
})

// Continuation detection patterns (evaluated on the trailing chunk / concluding text of the assistant message)
const CONTINUATION_PATTERNS = [
  // English questions asking to continue
  /(?:would you like|do you want|should I|shall I)(?:\s+me)?\s+to\s+(?:continue|proceed|move on|take the next step|start)/i,
  /let me know if you(?:'d| would)? like (?:me )?to (?:continue|proceed)/i,
  /please (?:reply|type|say|send)\s+["']?continue["']?/i,
  // English next steps statements
  /(?:^|\n)\s*(?:next steps?|upcoming steps?|remaining tasks?)[：:]/i,
  /(?:next|then|now),?\s+I (?:will|shall|can|am ready to) (?:proceed to|continue with|start|implement|create|update|add|test|fix|run)/i,
  /ready to (?:proceed with|continue with|start|move to) (?:the next step|the implementation|the next phase)/i,
  // Chinese questions asking to continue
  /(?:是否|要不要|需要|如需|请确认是否)(?:继续|进行下一步|执行下一步|推进|开始下一步)/i,
  /(?:回复|输入|发送)["'“‘]?(?:继续|下一步)["'”’]?/i,
  // Chinese next steps statements
  /(?:下一步|后续)(?:计划|步骤|工作|安排|任务|操作)[：:]/i,
  /(?:接下来|下一步|随后|紧接着)(?:我将|我们将|准备|会|需要|打算)(?:继续|开始|执行|实现|修改|创建|添加|测试|排查|编写|完善)/i,
  // Maximum steps reached notices
  /maximum(?: number of)? steps(?: allowed)?.*reached/i,
  /达到(?:最大)?步数限制/i,
]

// Patterns that indicate user decision / multiple choice is needed (should NOT blindly auto-continue)
const CHOICE_PROMPT_PATTERNS = [
  /(?:which (?:option|approach|alternative|one)|please choose|please select|let me know which)/i,
  /(?:请选择|你希望|你想要|哪种方案|哪个选项|请确认以下方案)/i,
]

const MISSING_INFORMATION_PATTERNS = [
  /(?:please provide|need|missing|require)(?:[^.\n]{0,80})(?:hostname|credential|token|secret|key|value|information|details|input)/i,
  /(?:请提供|需要补充|缺少|还需要)(?:[^。\n]{0,80})(?:主机名|凭据|令牌|密钥|信息|详情|输入|参数)/i,
]

const PERMISSION_EXPANSION_PATTERNS = [
  /(?:please |must |need to )?(?:grant|enable|provide)(?:[^.\n]{0,60})(?:admin|administrator|root|sudo|permission|access|credential)/i,
  /(?:授予|开启|提供|需要)(?:[^。\n]{0,60})(?:管理员|根权限|sudo|权限|访问权|凭据)/i,
]

const DESTRUCTIVE_ACTION_PATTERNS = [
  /(?:should I|may I|can I|do you want me to)(?:[^?\n]{0,100})(?:delete|drop|destroy|purge|overwrite|deploy|publish|push|send|purchase|trade)/i,
  /(?:是否|要不要|可以|需要我)(?:[^？\n]{0,100})(?:删除|清空|销毁|覆盖|部署|发布|推送|发送|购买|交易)/i,
]

// Completion patterns that indicate everything is finished
const COMPLETION_PATTERNS = [
  /(?:all tasks (?:are )?completed|everything is (?:done|complete)|all steps have been completed)/i,
  /(?:所有任务已全部完成|已完成全部工作|全部实施完毕|已顺利完成|任务全部完成)/i,
]

export const decideHeuristic = (context: Context): Decision => {
  if (!context.lastText || context.lastText.trim().length === 0) {
    return { action: "stop", reason: "No continuation cues found" }
  }

  const trimmed = context.lastText.trim()
  const tail = trimmed.length > 1500 ? trimmed.slice(-1500) : trimmed

  if (COMPLETION_PATTERNS.some((pattern) => pattern.test(tail))) {
    return { action: "stop", reason: "Verified completion detected" }
  }

  if (
    CHOICE_PROMPT_PATTERNS.some((pattern) => pattern.test(tail)) ||
    MISSING_INFORMATION_PATTERNS.some((pattern) => pattern.test(tail)) ||
    PERMISSION_EXPANSION_PATTERNS.some((pattern) => pattern.test(tail)) ||
    DESTRUCTIVE_ACTION_PATTERNS.some((pattern) => pattern.test(tail))
  ) {
    return { action: "defer", reason: "Human input or authorization required" }
  }

  if (CONTINUATION_PATTERNS.some((pattern) => pattern.test(tail))) {
    return {
      action: "continue",
      reason: "Heuristic continuation detected",
      nextPrompt: promptFor(context),
    }
  }

  return { action: "stop", reason: "No continuation cues found" }
}

export const detect = (text: string): boolean => decideHeuristic({ lastText: text }).action === "continue"

export const promptFor = (input: Context | string): string => {
  if (typeof input === "string") return input.trim().length > 0 ? input : DEFAULT_PROMPT
  if (input.customPrompt && input.customPrompt.trim().length > 0) return input.customPrompt
  if (input.contextual && input.initialGoal && input.initialGoal.trim().length > 0) {
    const snippet = input.initialGoal.trim().slice(0, 150).replace(/\n/g, " ")
    return `[Auto-Drive Directive] Focus on the initial task goal "${snippet}", align with current progress and planned next steps, and proceed autonomously.`
  }
  return DEFAULT_PROMPT
}

export const buildSupervisorPrompt = (context: Context): string => {
  const goal = context.initialGoal?.trim() || "(No explicit initial goal provided)"
  const memory = context.playbookMarkdown?.trim() || "(No accumulated strategy memory yet)"
  const lastExcerpt = context.lastText.trim().slice(-2000)

  return `You are the Auto-Drive Supervisor for an autonomous software engineering session.
A primary worker agent just completed its current turn.
Analyze whether the worker has remaining tasks, next steps, or unverified work, or if it should stop.

<InitialUserGoal>
${goal}
</InitialUserGoal>

<AutoDriveMemory>
${memory}
</AutoDriveMemory>

<WorkerLastOutput>
${lastExcerpt}
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

export const parseSupervisorDecision = (raw: string, context: Context): Decision => {
  const json = raw.match(/\{[\s\S]*\}/)?.[0]
  const unknown = json
    ? Option.getOrUndefined(Schema.decodeUnknownOption(Schema.UnknownFromJsonString)(json))
    : undefined
  const parsed = Option.getOrUndefined(Schema.decodeUnknownOption(SupervisorOutput)(unknown))
  const action = parsed?.action ?? (parsed?.continue === undefined ? undefined : parsed.continue ? "continue" : "stop")

  if (action) {
    return {
      action,
      reason: parsed?.reason,
      nextPrompt:
        action === "continue" && parsed?.next_prompt && parsed.next_prompt.trim().length > 0
          ? parsed.next_prompt
          : action === "continue"
            ? promptFor(context)
            : undefined,
      updateMemory: parsed?.update_memory && parsed.update_memory.trim().length > 0 ? parsed.update_memory : undefined,
    }
  }

  return decideHeuristic(context)
}

export const defaultPlaybookTemplate = (projectName?: string): string => {
  const name = projectName || "Project"
  return `# ${name} Auto-Drive Playbook & Memory

## 1. Core Principles & Engineering Standards
* Autonomously advance tasks while ensuring complete implementation and self-verification.
* Prioritize analyzing and resolving build or test errors independently.
* Maintain clean, concise commits and document significant architectural changes.

## 2. Active Roadmap & Task Checklist
- [ ] Initial planning and setup
- [ ] Core logic implementation
- [ ] Automated testing and verification

## 3. Learned Patterns & Project Conventions
- Follow repository code style, linting, and type conventions.
`
}
