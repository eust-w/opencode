import { describe, expect, test } from "bun:test"
import { SessionAutoDrive } from "@opencode-ai/core/session/auto-drive-state"

describe("SessionAutoDrive.resolve", () => {
  test("uses safe built-in defaults", () => {
    expect(SessionAutoDrive.resolve()).toEqual(SessionAutoDrive.defaultState)
    expect(SessionAutoDrive.resolve().settings).toMatchObject({
      enabled: false,
      policy: "supervisor",
      maxRuns: 5,
      contextual: false,
      memory: true,
    })
  })

  test("maps legacy supervisor configuration", () => {
    expect(SessionAutoDrive.resolve({ enabled: true, supervisor: false }).settings).toMatchObject({
      enabled: true,
      policy: "heuristic",
    })
  })

  test("applies Session settings over project configuration", () => {
    const session = SessionAutoDrive.State.make({
      settings: {
        enabled: true,
        policy: "supervisor",
        maxRuns: 3,
        contextual: true,
        memory: false,
      },
      status: { continuationCount: 2, chainID: "chain-session", action: "continue" },
    })

    expect(SessionAutoDrive.resolve({ enabled: false, policy: "heuristic", max_runs: 9 }, session)).toEqual(session)
  })
})
