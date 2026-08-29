import { describe, expect, test } from "bun:test"
import { Schema } from "effect"
import { Config } from "@opencode-ai/core/config"

const decode = Schema.decodeUnknownSync(Config.Info)

describe("Config auto_drive", () => {
  test("accepts the tri-state controller settings", () => {
    expect(
      JSON.parse(
        JSON.stringify(
          decode({
            auto_drive: {
              enabled: true,
              policy: "supervisor",
              prompt: "Continue the verified next step.",
              max_runs: 5,
              supervisor_model: { providerID: "google", id: "gemini-3.7-flash" },
              memory: true,
              contextual: true,
              project_playbook: ".opencode/auto-drive.md",
            },
          }).auto_drive,
        ),
      ),
    ).toEqual({
      enabled: true,
      policy: "supervisor",
      prompt: "Continue the verified next step.",
      max_runs: 5,
      supervisor_model: { providerID: "google", id: "gemini-3.7-flash" },
      memory: true,
      contextual: true,
      project_playbook: ".opencode/auto-drive.md",
    })
  })

  test("retains legacy supervisor booleans", () => {
    expect(decode({ auto_drive: { supervisor: false } }).auto_drive).toEqual({ supervisor: false })
  })

  test("rejects max_runs outside the safe range", () => {
    expect(() => decode({ auto_drive: { max_runs: 0 } })).toThrow()
    expect(() => decode({ auto_drive: { max_runs: 21 } })).toThrow()
    expect(() => decode({ auto_drive: { max_runs: 1.5 } })).toThrow()
  })

  test("rejects unknown policies", () => {
    expect(() => decode({ auto_drive: { policy: "always" } })).toThrow()
  })
})
