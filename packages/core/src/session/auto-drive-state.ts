export * as SessionAutoDrive from "./auto-drive-state"
export * from "@opencode-ai/schema/session-auto-drive"

import { SessionAutoDrive as Shared } from "@opencode-ai/schema/session-auto-drive"
import type { ConfigAutoDrive } from "../config/auto-drive"

export const defaultSettings = Shared.Settings.make({
  enabled: false,
  policy: "supervisor",
  maxRuns: 5,
  contextual: false,
  memory: true,
})

export const defaultState = Shared.State.make({
  settings: defaultSettings,
  status: { continuationCount: 0 },
})

export function resolve(config?: boolean | ConfigAutoDrive.Info, session?: Shared.State): Shared.State {
  if (session) return session
  if (config === undefined) return defaultState
  if (typeof config === "boolean") {
    return Shared.State.make({ ...defaultState, settings: { ...defaultSettings, enabled: config } })
  }
  return Shared.State.make({
    settings: {
      enabled: config.enabled ?? false,
      policy: config.policy ?? (config.supervisor === false ? "heuristic" : "supervisor"),
      maxRuns: config.max_runs ?? defaultSettings.maxRuns,
      supervisorModel: config.supervisor_model,
      contextual: config.contextual ?? defaultSettings.contextual,
      memory: config.memory ?? defaultSettings.memory,
      prompt: config.prompt,
      projectPlaybook: config.project_playbook,
    },
    status: { continuationCount: 0 },
  })
}
