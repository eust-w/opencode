import { describe, expect, test } from "bun:test"
import { analyzeTrajectories, assertSecretFree, parseTrajectory } from "../src/artifact"

const base = {
  schemaVersion: 1,
  runID: "adr_0123456789abcdefabcd",
  taskID: "task-1",
  model: "opencode/gemini-3.7-flash",
  controllerModel: "opencode/gemini-3.7-flash",
  strategy: "supervisor",
  repeat: 0,
  attempt: 1,
  startedAt: "2026-08-30T00:00:00.000Z",
  endedAt: "2026-08-30T00:01:00.000Z",
  status: "succeeded",
  resolved: true,
  fixRate: 1,
  firstBoundaryResolved: false,
  firstBoundaryFixRate: 0.5,
  continuationCount: 1,
  manualContinuationCount: 0,
  redundantTurns: 0,
  promptTokens: 100,
  completionTokens: 25,
  costUSD: 0.1,
  latencyMS: 60_000,
  recoverySucceeded: true,
  unsafeContinuationCount: 0,
  modelRequest: {
    provider: "opencode",
    modelID: "gemini-3.7-flash",
    modelVersion: "gemini-3.7-flash-2026-08-01",
    requestSHA256: "a".repeat(64),
    temperature: 0,
    maxOutputTokens: 16_384,
  },
  environment: {
    image: "example/image",
    imageDigest: `sha256:${"b".repeat(64)}`,
    baseCommit: "c".repeat(40),
    opencodeCommit: "d".repeat(40),
  },
  trace: {
    path: "raw/adr_0123456789abcdefabcd.jsonl",
    sha256: "e".repeat(64),
  },
} as const

describe("trajectory artifact contract", () => {
  test("requires exact model, request, container and trace provenance", () => {
    expect(parseTrajectory(base)).toMatchObject({ resolved: true, modelRequest: { temperature: 0 } })
    expect(() => parseTrajectory({ ...base, modelRequest: { ...base.modelRequest, modelVersion: "" } })).toThrow()
    expect(() => parseTrajectory({ ...base, environment: { ...base.environment, imageDigest: "latest" } })).toThrow()
  })

  test("blocks common provider secrets from artifact output", () => {
    expect(() => assertSecretFree(JSON.stringify(base))).not.toThrow()
    expect(() =>
      assertSecretFree(JSON.stringify({ token: ["sk", "proj", "abcdefghijklmnopqrstuvwxyz"].join("-") })),
    ).toThrow("possible secret")
    expect(() =>
      assertSecretFree(JSON.stringify({ key: ["AI", "zaSyabcdefghijklmnopqrstuvwxyz123456"].join("") })),
    ).toThrow("possible secret")
  })

  test("derives off-policy prefixes without adding runs", () => {
    const records = [
      parseTrajectory(base),
      parseTrajectory({
        ...base,
        runID: "adr_fedcba9876543210abcd",
        strategy: "regex",
        resolved: false,
        fixRate: 0.25,
        firstBoundaryFixRate: 0.125,
        costUSD: 0.05,
      }),
    ]
    const analysis = analyzeTrajectories(records)
    expect(analysis.trajectories).toBe(2)
    expect(analysis.strategies.supervisor).toMatchObject({ resolvedRate: 1, meanFixRate: 1 })
    expect(analysis.strategies.regex).toMatchObject({ resolvedRate: 0, meanFixRate: 0.25 })
    expect(analysis.off).toMatchObject({ prefixes: 2, resolvedRate: 0, meanFixRate: 0.3125 })
  })
})
