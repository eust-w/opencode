import { describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { createModelMetadataSnapshot, loadPreflight, parsePreflight } from "../src/preflight"

const base = {
  schemaVersion: 1,
  protocol: "auto-drive-swe-evo-v1.3",
  scope: "canary",
  capturedAt: "2026-08-30T02:00:00.000Z",
  expiresAt: "2026-08-30T14:00:00.000Z",
  models: [
    {
      model: "d-robotics/qwen3.8-max",
      catalogModelID: "qwen3.8-max",
      modelVersion: "qwen3.8-max",
      credentialPresent: true,
      billing: "sponsored",
      trajectoryCapacity: 1,
      probe: { path: "probes/google.json", sha256: "a".repeat(64) },
    },
  ],
  modelMetadata: { path: "metadata/models.json", sha256: "b".repeat(64) },
  runtime: {
    disableExternalSkills: true,
    disableClaudeCodeSkills: true,
    disableModelsFetch: true,
  },
} as const

describe("experiment preflight gate", () => {
  test("requires fresh metered model capacity and isolated runtime flags", () => {
    expect(parsePreflight(base, { scope: "canary", now: new Date("2026-08-30T03:00:00.000Z") })).toMatchObject({
      scope: "canary",
      models: [{ modelVersion: "qwen3.8-max" }],
    })
    expect(() =>
      parsePreflight(
        { ...base, models: [{ ...base.models[0], catalogModelID: undefined }] },
        { scope: "canary", now: new Date("2026-08-30T03:00:00.000Z") },
      ),
    ).toThrow()
    expect(() =>
      parsePreflight(
        { ...base, models: [{ ...base.models[0], billing: "free" }] },
        { scope: "canary", now: new Date("2026-08-30T03:00:00.000Z") },
      ),
    ).toThrow("metered billing")
    expect(() =>
      parsePreflight(
        { ...base, models: [{ ...base.models[0], trajectoryCapacity: 0 }] },
        { scope: "canary", now: new Date("2026-08-30T03:00:00.000Z") },
      ),
    ).toThrow("capacity")
    expect(() => parsePreflight(base, { scope: "canary", now: new Date("2026-08-31T03:00:00.000Z") })).toThrow(
      "expired",
    )
    expect(() =>
      parsePreflight(
        { ...base, runtime: { ...base.runtime, disableExternalSkills: false } },
        { scope: "canary", now: new Date("2026-08-30T03:00:00.000Z") },
      ),
    ).toThrow()
  })

  test("creates a minimal cache with explicit logical-to-catalog resolutions", () => {
    const result = createModelMetadataSnapshot({
      "d-robotics": {
        id: "d-robotics",
        models: {
          "qwen3.8-max": { id: "qwen3.8-max" },
          "deepseek-v4-pro": { id: "deepseek-v4-pro" },
          "glm-5.3": { id: "glm-5.3" },
          other: {},
        },
      },
    })
    expect(Object.keys(result.providers["d-robotics"].models)).toEqual([
      "qwen3.8-max",
      "deepseek-v4-pro",
      "glm-5.3",
    ])
    expect(result.resolutions).toContainEqual({
      model: "d-robotics/deepseek-v4-pro",
      catalogModelID: "deepseek-v4-pro",
    })
  })

  test("verifies model metadata and provider probe files", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "autodrive-preflight-"))
    try {
      await Promise.all([
        mkdir(path.join(directory, "metadata"), { recursive: true }),
        mkdir(path.join(directory, "probes"), { recursive: true }),
      ])
      const metadata = '{"d-robotics":{"models":{"qwen3.8-max":{"id":"qwen3.8-max"}}}}\n'
      const probe = '{"billing":"sponsored","modelVersion":"qwen3.8-max","trajectoryCapacity":1}\n'
      const digest = (content: string) => new Bun.CryptoHasher("sha256").update(content).digest("hex")
      await Promise.all([
        Bun.write(path.join(directory, base.modelMetadata.path), metadata),
        Bun.write(path.join(directory, base.models[0].probe.path), probe),
      ])
      const receipt = {
        ...base,
        modelMetadata: { ...base.modelMetadata, sha256: digest(metadata) },
        models: [{ ...base.models[0], probe: { ...base.models[0].probe, sha256: digest(probe) } }],
      }
      const receiptPath = path.join(directory, "receipt.json")
      const content = JSON.stringify(receipt, null, 2) + "\n"
      await Bun.write(receiptPath, content)
      await expect(
        loadPreflight(receiptPath, { scope: "canary", now: new Date("2026-08-30T03:00:00.000Z") }),
      ).resolves.toMatchObject({ sha256: digest(content), receipt: { scope: "canary" } })

      await Bun.write(path.join(directory, base.models[0].probe.path), '{"billing":"free"}\n')
      await expect(
        loadPreflight(receiptPath, { scope: "canary", now: new Date("2026-08-30T03:00:00.000Z") }),
      ).rejects.toThrow("Provider probe artifact hash mismatch")

      const freeProbe = '{"billing":"free","modelVersion":"qwen3.8-max","trajectoryCapacity":1}\n'
      await Bun.write(path.join(directory, base.models[0].probe.path), freeProbe)
      await Bun.write(
        receiptPath,
        JSON.stringify({
          ...receipt,
          models: [{ ...receipt.models[0], probe: { ...receipt.models[0].probe, sha256: digest(freeProbe) } }],
        }),
      )
      await expect(
        loadPreflight(receiptPath, { scope: "canary", now: new Date("2026-08-30T03:00:00.000Z") }),
      ).rejects.toThrow("does not verify metered billing")

      const missingModelMetadata = '{"d-robotics":{"models":{}}}\n'
      await Bun.write(path.join(directory, base.modelMetadata.path), missingModelMetadata)
      await Bun.write(path.join(directory, base.models[0].probe.path), probe)
      await Bun.write(
        receiptPath,
        JSON.stringify({
          ...receipt,
          modelMetadata: { ...receipt.modelMetadata, sha256: digest(missingModelMetadata) },
        }),
      )
      await expect(
        loadPreflight(receiptPath, { scope: "canary", now: new Date("2026-08-30T03:00:00.000Z") }),
      ).rejects.toThrow("does not contain catalog model")
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})
