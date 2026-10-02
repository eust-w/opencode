import { expect, test } from "bun:test"
import { mkdtemp, mkdir, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { protocol } from "../src/protocol"
import { AblationVariant } from "../src/ablation"

test("real ablation CLI preserves malformed responses and refuses a paid retry", async () => {
  const fixture = await createFixture()
  const requests: unknown[] = []
  const raw = "not valid JSON from the local test server\n"
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      if (new URL(request.url).pathname === "/key/info")
        return Response.json({ info: { spend: requests.length * 0.01 } })
      requests.push(await request.json())
      return new Response(raw, { status: 200 })
    },
  })
  try {
    const result = await run(fixture, server.url.toString())
    expect(result.exitCode).not.toBe(0)
    expect(result.stderr).not.toContain("before initialization")
    expect(requests, result.stderr).toHaveLength(2)
    expect(requests[0]).toMatchObject({ temperature: 0, max_tokens: 1024, stream: false })
    expect(await Bun.file(path.join(fixture.output, "responses/boundary-0.supervisor-only.json")).text()).toBe(raw)
    expect(await Bun.file(path.join(fixture.output, "failures/boundary-0.supervisor-only.json")).json()).toMatchObject({
      kind: "provider-invalid-output",
      terminal: true,
      retryAllowed: false,
      httpStatus: 200,
    })
    const checkpoint = JSON.parse((await Bun.file(path.join(fixture.output, "spend-checkpoints.jsonl")).text()).trim())
    expect(checkpoint.observedSpendDeltaUSD).toBe(0.02)
    expect(checkpoint.failed).toBe(2)
    expect(await Bun.file(path.join(fixture.output, "manifest.json")).exists()).toBeFalse()
    const resumed = await run(fixture, server.url.toString())
    expect(resumed.exitCode).not.toBe(0)
    expect(resumed.stderr).toContain("terminal failed attempts")
    expect(requests).toHaveLength(2)
  } finally {
    server.stop(true)
    await rm(fixture.root, { recursive: true, force: true })
  }
}, 30_000)

test("real ablation CLI preserves unsuccessful HTTP bodies without retrying", async () => {
  const fixture = await createFixture()
  const requests: string[] = []
  const raw = '{"error":"synthetic quota exhaustion"}'
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      if (new URL(request.url).pathname === "/key/info") return Response.json({ info: { spend: 0 } })
      requests.push(await request.text())
      return new Response(raw, { status: 429 })
    },
  })
  try {
    const result = await run(fixture, server.url.toString())
    expect(result.exitCode).not.toBe(0)
    expect(requests).toHaveLength(2)
    expect(await Bun.file(path.join(fixture.output, "responses/boundary-0.goal.json")).text()).toBe(raw)
    expect(await Bun.file(path.join(fixture.output, "failures/boundary-0.goal.json")).json()).toMatchObject({
      kind: "provider-http-error",
      terminal: true,
      retryAllowed: false,
      httpStatus: 429,
    })
  } finally {
    server.stop(true)
    await rm(fixture.root, { recursive: true, force: true })
  }
}, 30_000)

test("real ablation CLI resumes validated records and completes only the missing pair", async () => {
  const fixture = await createFixture()
  const requests: unknown[] = []
  const raw = JSON.stringify({
    model: "synthetic-test-version",
    choices: [{ message: { content: '{"action":"stop","reason":"Synthetic fixture complete"}' } }],
    usage: { prompt_tokens: 2, completion_tokens: 1 },
  })
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      if (new URL(request.url).pathname === "/key/info")
        return Response.json({ info: { spend: requests.length * 0.01 } })
      requests.push(await request.json())
      return new Response(raw)
    },
  })
  try {
    await seedRecords(fixture)
    const result = await run(fixture, server.url.toString())
    expect(result.exitCode, result.stderr).toBe(0)
    expect(requests).toHaveLength(2)
    expect(await Bun.file(path.join(fixture.output, "manifest.json")).json()).toMatchObject({
      predictions: 630,
      controllerCalls: 504,
      costUSD: 0.02,
    })
    expect(await Bun.file(path.join(fixture.output, "records/boundary-0.goal.json")).json()).toMatchObject({
      prediction: "stop",
      modelVersion: "synthetic-test-version",
      promptTokens: 2,
      completionTokens: 1,
    })
  } finally {
    server.stop(true)
    await rm(fixture.root, { recursive: true, force: true })
  }
}, 30_000)

test("real ablation CLI refuses to replay an admitted request with unknown outcome", async () => {
  const fixture = await createFixture()
  const requests: string[] = []
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      if (new URL(request.url).pathname === "/key/info") return Response.json({ info: { spend: 0 } })
      requests.push(await request.text())
      return new Response("unexpected request")
    },
  })
  try {
    await mkdir(path.join(fixture.output, "requests"))
    await Bun.write(path.join(fixture.output, "requests/boundary-0.goal.json"), "{}")
    const result = await run(fixture, server.url.toString())
    expect(result.exitCode).not.toBe(0)
    expect(result.stderr).toContain("unresolved provider outcome; reconcile without replay")
    expect(requests).toHaveLength(0)
  } finally {
    server.stop(true)
    await rm(fixture.root, { recursive: true, force: true })
  }
})

async function seedRecords(fixture: Awaited<ReturnType<typeof createFixture>>) {
  await Promise.all(
    ["requests", "responses", "records"].map((directory) => mkdir(path.join(fixture.output, directory))),
  )
  await Promise.all(
    Array.from({ length: 126 }, (_, index) =>
      AblationVariant.options.map(async (variant) => {
        if (index === 0 && (variant === "supervisor-only" || variant === "goal")) return
        const id = `boundary-${index}.${variant}`
        const request = `requests/${id}.json`
        const response = `responses/${id}.json`
        if (variant !== "regex") {
          await Promise.all([
            Bun.write(path.join(fixture.output, request), "{}"),
            Bun.write(path.join(fixture.output, response), "{}"),
          ])
        }
        await Bun.write(
          path.join(fixture.output, "records", `${id}.json`),
          JSON.stringify({
            schemaVersion: 1,
            protocol: protocol.version,
            boundaryID: `boundary-${index}`,
            variant,
            prediction: "defer",
            recordedAt: new Date().toISOString(),
            model: "synthetic-local-fixture",
            modelVersion: "synthetic-fixture-version",
            promptTokens: 0,
            completionTokens: 0,
            ...(variant === "regex"
              ? {}
              : {
                  request: { path: request, sha256: digest("{}") },
                  response: { path: response, sha256: digest("{}") },
                }),
          }),
        )
      }),
    ).flat(),
  )
}

async function createFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "autodrive-ablation-cli-test-"))
  const output = path.join(root, "artifacts")
  const testPath = path.join(root, "test.jsonl")
  const preflightPath = path.join(root, "preflight.json")
  const modelID = protocol.models.controller.split("/")[1]
  const metadata = JSON.stringify({
    [protocol.models.controller.split("/")[0]]: {
      models: {
        [modelID]: {
          id: modelID,
          name: "Local synthetic fixture only",
          release_date: "2026-01-01",
          attachment: false,
          reasoning: false,
          temperature: true,
          tool_call: false,
          limit: { context: 16384, output: 1024 },
        },
      },
    },
  })
  const probe = JSON.stringify({
    billing: "sponsored",
    modelVersion: "synthetic-test-version",
    trajectoryCapacity: 504,
  })
  await Promise.all([
    mkdir(output),
    Bun.write(path.join(root, "key"), "local-synthetic-credential"),
    Bun.write(path.join(root, "metadata.json"), metadata),
    Bun.write(path.join(root, "probe.json"), probe),
    Bun.write(
      testPath,
      Array.from({ length: 126 }, (_, index) =>
        JSON.stringify({
          id: `boundary-${index}`,
          baseTrajectoryID: `trajectory-${index}`,
          taskID: `synthetic-task-${index}`,
          boundaryIndex: 0,
          initialGoal: "Fix the synthetic parser",
          workerOutput: "The parser still needs a fix.",
          trajectorySummary: "No patch yet.",
          patch: "",
          continuationCount: 0,
          memory: "Inspect parser next.",
        }),
      ).join("\n") + "\n",
    ),
    Bun.write(
      preflightPath,
      JSON.stringify({
        schemaVersion: 1,
        protocol: protocol.version,
        scope: "ablation",
        capturedAt: new Date(Date.now() - 60_000).toISOString(),
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        models: [
          {
            model: protocol.models.controller,
            catalogModelID: modelID,
            modelVersion: "synthetic-test-version",
            credentialPresent: true,
            billing: "sponsored",
            trajectoryCapacity: 504,
            probe: { path: "probe.json", sha256: digest(probe) },
          },
        ],
        modelMetadata: { path: "metadata.json", sha256: digest(metadata) },
        runtime: { disableExternalSkills: true, disableClaudeCodeSkills: true, disableModelsFetch: true },
      }),
    ),
  ])
  return { root, output, testPath, preflightPath }
}

async function run(fixture: Awaited<ReturnType<typeof createFixture>>, gateway: string) {
  const child = Bun.spawn(
    [
      process.execPath,
      path.join(import.meta.dir, "../scripts/ablation-runner.ts"),
      "--test",
      fixture.testPath,
      "--output",
      fixture.output,
      "--preflight",
      fixture.preflightPath,
    ],
    {
      cwd: path.join(import.meta.dir, ".."),
      env: {
        ...process.env,
        AUTODRIVE_GATEWAY_BASE_URL: gateway.replace(/\/$/, "") + "/v1",
        AUTODRIVE_GATEWAY_KEY_FILE: path.join(fixture.root, "key"),
        AUTODRIVE_EVAL_BUDGET_LEDGER: path.join(fixture.root, "ledger.jsonl"),
        AUTODRIVE_ABLATION_MAX_COST_USD: "1",
        AUTODRIVE_ABLATION_PER_CALL_CEILING_USD: "0.02",
        AUTODRIVE_BOUNDARY_FIXED_COST_USD: "0",
      },
      stdout: "pipe",
      stderr: "pipe",
    },
  )
  const [exitCode, stderr] = await Promise.all([child.exited, new Response(child.stderr).text()])
  return { exitCode, stderr }
}

function digest(content: string) {
  return new Bun.CryptoHasher("sha256").update(content).digest("hex")
}
