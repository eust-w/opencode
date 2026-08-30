import { describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import {
  analyzeTrajectories,
  assertSecretFree,
  hashNormalizedRequest,
  parseTrajectory,
  verifyTrajectoryArtifacts,
} from "../src/artifact"

const base = {
  schemaVersion: 3,
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
  usageComplete: true,
  costUSD: 0.1,
  latencyMS: 60_000,
  recoverySucceeded: true,
  unsafeContinuationCount: 0,
  modelRequests: [
    {
      sequence: 0,
      kind: "worker",
      provider: "opencode",
      modelID: "gemini-3.7-flash",
      modelVersion: "gemini-3.7-flash-2026-08-01",
      requestSHA256: "a".repeat(64),
      normalizedRequest: {
        path: "requests/adr_0123456789abcdefabcd-000.json",
        sha256: "a".repeat(64),
      },
      temperature: 0,
      maxOutputTokens: 16_384,
    },
  ],
  environment: {
    image: "example/image",
    imageDigest: `sha256:${"b".repeat(64)}`,
    baseCommit: "c".repeat(40),
    opencodeCommit: "d".repeat(40),
    modelMetadata: {
      path: "metadata/models.json",
      sha256: "f".repeat(64),
    },
  },
  preflight: {
    path: "preflight/paid-canary.json",
    sha256: "0".repeat(64),
  },
  trace: {
    path: "raw/adr_0123456789abcdefabcd.jsonl",
    sha256: "e".repeat(64),
  },
} as const

describe("trajectory artifact contract", () => {
  test("requires startup-baseline provenance for current trajectories", () => {
    const current = {
      ...base,
      schemaVersion: 4,
      environment: {
        ...base.environment,
        startupBaseline: {
          head: base.environment.baseCommit,
          tree: "1".repeat(40),
          trackedClean: true,
          untrackedPathCount: 1,
          manifest: { path: "patches/startup-baseline.json", sha256: "2".repeat(64) },
          patch: { path: "patches/startup-baseline.diff", sha256: "3".repeat(64) },
        },
      },
    }

    expect(parseTrajectory(current)).toMatchObject({ schemaVersion: 4, environment: current.environment })
    expect(() => parseTrajectory({ ...current, environment: base.environment })).toThrow()
    expect(parseTrajectory(base).schemaVersion).toBe(3)
  })

  test("requires exact model, request, container and trace provenance", () => {
    expect(parseTrajectory(base)).toMatchObject({ resolved: true, modelRequests: [{ temperature: 0 }] })
    expect(() =>
      parseTrajectory({
        ...base,
        modelRequests: [{ ...base.modelRequests[0], modelVersion: "" }],
      }),
    ).toThrow()
    expect(() =>
      parseTrajectory({
        ...base,
        modelRequests: [{ ...base.modelRequests[0], normalizedRequest: undefined }],
      }),
    ).toThrow()
    expect(() =>
      parseTrajectory({
        ...base,
        modelRequests: [
          {
            ...base.modelRequests[0],
            normalizedRequest: { ...base.modelRequests[0].normalizedRequest, sha256: "1".repeat(64) },
          },
        ],
      }),
    ).toThrow("Normalized request hash must match")
    expect(() =>
      parseTrajectory({
        ...base,
        modelRequests: [base.modelRequests[0], { ...base.modelRequests[0] }],
      }),
    ).toThrow("contiguous")
    expect(() => parseTrajectory({ ...base, environment: { ...base.environment, imageDigest: "latest" } })).toThrow()
    expect(() => parseTrajectory({ ...base, environment: { ...base.environment, modelMetadata: undefined } })).toThrow()
    expect(() => parseTrajectory({ ...base, preflight: undefined })).toThrow()
    expect(() => parseTrajectory({ ...base, trace: { ...base.trace, path: "../../outside.jsonl" } })).toThrow()
  })

  test("retains observed usage bounds for failed provider trajectories", () => {
    expect(
      parseTrajectory({
        ...base,
        status: "failed",
        failure: "retryable-provider",
        usageComplete: false,
      }),
    ).toMatchObject({ status: "failed", usageComplete: false, promptTokens: 100, completionTokens: 25 })
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

  test("normalizes request JSON before hashing", () => {
    expect(hashNormalizedRequest({ b: 2, a: { d: 4, c: 3 } })).toBe(hashNormalizedRequest({ a: { c: 3, d: 4 }, b: 2 }))
    expect(() => hashNormalizedRequest({ unsupported: undefined })).toThrow("JSON-compatible")
  })

  test("recomputes every referenced artifact before accepting a trajectory", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "autodrive-artifact-"))
    try {
      const files = {
        request: '{"messages":[],"temperature":0}',
        metadata: '{"google":{"models":{}}}\n',
        preflight: '{"protocol":"auto-drive-swe-evo-v1.2"}\n',
        trace: '{"type":"step-finish"}\n',
        baselineManifest:
          JSON.stringify(
            {
              schemaVersion: 1,
              head: base.environment.baseCommit,
              tree: "1".repeat(40),
              trackedClean: true,
              untrackedPaths: ["build/cache.bin"],
              untrackedRoots: ["build/"],
            },
            null,
            2,
          ) + "\n",
        baselinePatch: "diff --git a/build/cache.bin b/build/cache.bin\n",
      }
      await Promise.all([
        mkdir(path.join(directory, "requests"), { recursive: true }),
        mkdir(path.join(directory, "metadata"), { recursive: true }),
        mkdir(path.join(directory, "preflight"), { recursive: true }),
        mkdir(path.join(directory, "raw"), { recursive: true }),
        mkdir(path.join(directory, "patches"), { recursive: true }),
      ])
      await Promise.all([
        Bun.write(path.join(directory, base.modelRequests[0].normalizedRequest.path), files.request),
        Bun.write(path.join(directory, base.environment.modelMetadata.path), files.metadata),
        Bun.write(path.join(directory, base.preflight.path), files.preflight),
        Bun.write(path.join(directory, base.trace.path), files.trace),
        Bun.write(path.join(directory, "patches/startup-baseline.json"), files.baselineManifest),
        Bun.write(path.join(directory, "patches/startup-baseline.diff"), files.baselinePatch),
      ])
      const digest = (content: string) => new Bun.CryptoHasher("sha256").update(content).digest("hex")
      const record = currentTrajectory({
        ...base,
        schemaVersion: 4,
        modelRequests: [
          {
            ...base.modelRequests[0],
            requestSHA256: digest(files.request),
            normalizedRequest: { ...base.modelRequests[0].normalizedRequest, sha256: digest(files.request) },
          },
        ],
        environment: {
          ...base.environment,
          modelMetadata: { ...base.environment.modelMetadata, sha256: digest(files.metadata) },
          startupBaseline: {
            head: base.environment.baseCommit,
            tree: "1".repeat(40),
            trackedClean: true,
            untrackedPathCount: 1,
            manifest: { path: "patches/startup-baseline.json", sha256: digest(files.baselineManifest) },
            patch: { path: "patches/startup-baseline.diff", sha256: digest(files.baselinePatch) },
          },
        },
        preflight: { ...base.preflight, sha256: digest(files.preflight) },
        trace: { ...base.trace, sha256: digest(files.trace) },
      })
      await expect(verifyTrajectoryArtifacts(record, directory)).resolves.toBeUndefined()
      const mismatchedManifest =
        JSON.stringify(
          {
            schemaVersion: 1,
            head: base.environment.baseCommit,
            tree: "4".repeat(40),
            trackedClean: true,
            untrackedPaths: ["build/cache.bin"],
            untrackedRoots: ["build/"],
          },
          null,
          2,
        ) + "\n"
      await Bun.write(path.join(directory, record.environment.startupBaseline.manifest.path), mismatchedManifest)
      const mismatched = currentTrajectory({
        ...record,
        environment: {
          ...record.environment,
          startupBaseline: {
            ...record.environment.startupBaseline,
            manifest: { ...record.environment.startupBaseline.manifest, sha256: digest(mismatchedManifest) },
          },
        },
      })
      await expect(verifyTrajectoryArtifacts(mismatched, directory)).rejects.toThrow("Startup baseline tree mismatch")
      await Bun.write(path.join(directory, record.environment.startupBaseline.manifest.path), files.baselineManifest)
      await Bun.write(path.join(directory, record.environment.startupBaseline.manifest.path), '{"tampered":true}\n')
      await expect(verifyTrajectoryArtifacts(record, directory)).rejects.toThrow(
        "Startup baseline manifest artifact hash mismatch",
      )
      await Bun.write(path.join(directory, record.environment.startupBaseline.manifest.path), files.baselineManifest)
      await Bun.write(path.join(directory, record.trace.path), '{"type":"tampered"}\n')
      await expect(verifyTrajectoryArtifacts(record, directory)).rejects.toThrow("Trace artifact hash mismatch")
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
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

function currentTrajectory(input: unknown) {
  const parsed = parseTrajectory(input)
  if (parsed.schemaVersion !== 4) throw new Error("Expected current trajectory")
  return parsed
}
