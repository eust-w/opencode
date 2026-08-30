import { describe, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import {
  BASELINE_CONTINUATION_PROMPT,
  buildAutoDriveUpdate,
  buildExperimentConfig,
  buildTaskPrompt,
  captureGatewayFailureEvidence,
  classifyExecutorFailure,
  classifyTestPatch,
  classifyIdleSession,
  decideExternalContinuation,
  dockerPortPublish,
  gradePytest,
  hasExperimentModels,
  parsePytestLog,
  parseExecutorFailureReceipt,
  parseTaskInput,
  prepareExperimentConfig,
} from "../src/host-executor"

const task = {
  schemaVersion: 1,
  instanceID: "iterative__dvc_2.21.1_2.21.2",
  repo: "iterative/dvc",
  baseCommit: "a".repeat(40),
  environmentSetupCommit: "b".repeat(40),
  image: "xingyaoww/sweb.eval.x86_64.iterative_s_dvc-8166",
  problemStatement: "Fix the untracked params target.",
  testPatch: "diff --git a/tests/test_params.py b/tests/test_params.py\n+hidden marker\n",
  testCommand: "pytest --continue-on-collection-errors -rA",
  logParser: "parse_log_pytest",
  failToPass: ["tests/test_params.py::test_untracked"],
  passToPass: ["tests/test_params.py::test_one", "tests/test_params.py::test_two"],
  source: { commit: "c".repeat(40), sha256: "d".repeat(64) },
}

describe("SWE-EVO host executor", () => {
  test("requests an explicit random loopback port from Docker", () => {
    expect(dockerPortPublish(4_096)).toBe("127.0.0.1:0:4096")
  })

  test("validates worker and controller models from the current provider projection", () => {
    const providers = {
      providers: [
        { id: "openai", models: { "deepseek-v4-pro": {} } },
        { id: "autodrive-controller", models: { "qwen3.8-max": {} } },
      ],
    }
    expect(hasExperimentModels(providers, "deepseek-v4-pro", "qwen3.8-max")).toBe(true)
    expect(hasExperimentModels(providers, "missing", "qwen3.8-max")).toBe(false)
  })

  test("maps internal policies without leaking full-system context into the regex baseline", () => {
    expect(
      buildAutoDriveUpdate({
        strategy: "regex",
        maxContinuations: 5,
        controllerModel: "qwen3.8-max",
      }),
    ).toEqual({ enabled: true, policy: "heuristic", maxRuns: 5, contextual: false, memory: false })
    expect(
      buildAutoDriveUpdate({
        strategy: "supervisor",
        maxContinuations: 5,
        controllerModel: "qwen3.8-max",
      }),
    ).toEqual({
      enabled: true,
      policy: "supervisor",
      maxRuns: 5,
      supervisorModel: { providerID: "autodrive-controller", id: "qwen3.8-max" },
      contextual: true,
      memory: true,
    })
    expect(
      buildAutoDriveUpdate({
        strategy: "blind",
        maxContinuations: 5,
        controllerModel: "qwen3.8-max",
      }),
    ).toEqual({ enabled: false, policy: "supervisor", maxRuns: 5, contextual: false, memory: false })
  })

  test("continues blind baselines to the cap and oracle baselines only while unresolved", () => {
    expect(
      decideExternalContinuation({ strategy: "blind", continuationCount: 0, maxContinuations: 5 }),
    ).toEqual({
      action: "continue",
      reason: "Blind baseline continuation 1 of 5",
      prompt: BASELINE_CONTINUATION_PROMPT,
    })
    expect(
      decideExternalContinuation({ strategy: "blind", continuationCount: 5, maxContinuations: 5 }),
    ).toEqual({ action: "stop", reason: "Maximum continuation count reached" })
    expect(
      decideExternalContinuation({ strategy: "oracle", continuationCount: 2, maxContinuations: 5, resolved: true }),
    ).toEqual({ action: "stop", reason: "External validator confirmed completion" })
    expect(
      decideExternalContinuation({ strategy: "oracle", continuationCount: 2, maxContinuations: 5, resolved: false }),
    ).toEqual({
      action: "continue",
      reason: "External validator found the task incomplete",
      prompt: BASELINE_CONTINUATION_PROMPT,
    })
    expect(() =>
      decideExternalContinuation({ strategy: "oracle", continuationCount: 0, maxContinuations: 5 }),
    ).toThrow("Oracle continuation requires an external validator result")
    expect(
      decideExternalContinuation({ strategy: "regex", continuationCount: 0, maxContinuations: 5 }),
    ).toBeUndefined()
  })

  test("routes workers through OpenAI Responses while keeping the controller chat-compatible", () => {
    const config = buildExperimentConfig({
      controllerModel: "qwen3.8-max",
      segmentSteps: 6,
      temperature: 0,
      workerModel: "qwen3.8-max",
    })

    expect(config.model).toBe("openai/qwen3.8-max")
    expect(config.agent.experiment.temperature).toBe(0)
    expect(config.permission).toEqual({ "*": "allow", question: "deny", external_directory: "deny" })
    expect(config.provider.openai.models["qwen3.8-max"].options).toEqual({ reasoningEffort: "low" })
    expect(config.provider.openai.models["qwen3.8-max"].limit.output).toBe(4_096)
    expect(config.provider.openai.npm).toBe("@ai-sdk/openai")
    expect(config.provider.openai.options.baseURL).toBe("http://autodrive-proxy:8080/worker/v1")
    expect(config.provider["autodrive-controller"].npm).toBe("@ai-sdk/openai-compatible")
    expect(config).not.toHaveProperty("providers")
  })

  test("prepares every file required before the config directory becomes read-only", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "autodrive-config-"))
    try {
      await prepareExperimentConfig(directory, {
        controllerModel: "qwen3.8-max",
        segmentSteps: 6,
        temperature: 0,
        workerModel: "deepseek-v4-pro",
      })

      expect(await Bun.file(path.join(directory, "opencode.json")).json()).toMatchObject({
        model: "openai/deepseek-v4-pro",
      })
      expect(await Bun.file(path.join(directory, ".gitignore")).text()).toContain(".gitignore")
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  test("bounds idle sessions and classifies incomplete provider streams", () => {
    expect(
      classifyIdleSession({
        active: false,
        pendingController: false,
        idleMS: 4_999,
        successfulResponses: 6,
        usageComplete: false,
      }),
    ).toBeUndefined()
    expect(
      classifyIdleSession({
        active: false,
        pendingController: false,
        idleMS: 5_000,
        successfulResponses: 6,
        usageComplete: false,
      }),
    ).toBe("retryable-provider")
    expect(
      classifyIdleSession({
        active: false,
        pendingController: false,
        action: "stop",
        idleMS: 5_000,
        successfulResponses: 6,
        usageComplete: true,
      }),
    ).toBe("complete")
  })

  test("keeps the hidden test patch out of the worker prompt", () => {
    const parsed = parseTaskInput(task)
    const prompt = buildTaskPrompt(parsed)
    expect(prompt).toContain(task.problemStatement)
    expect(prompt).not.toContain(task.testPatch)
    expect(prompt).not.toContain("hidden marker")
  })

  test("applies missing test patches and accepts fully pre-applied test patches", () => {
    expect(classifyTestPatch({ forwardApplies: true, reverseApplies: false })).toBe("apply")
    expect(classifyTestPatch({ forwardApplies: false, reverseApplies: true })).toBe("already-applied")
    expect(() => classifyTestPatch({ forwardApplies: false, reverseApplies: false })).toThrow(
      "Model patch conflicts with the frozen test patch",
    )
  })

  test("settles outstanding gateway requests before capturing failure evidence", async () => {
    const calls: string[] = []
    let settled = false
    const evidence = await captureGatewayFailureEvidence({
      proxyStarted: true,
      baselineSpend: 1,
      readRequests: async () => {
        calls.push("requests")
        return [{ sequence: 0, kind: "controller" }]
      },
      waitForSettlement: async () => {
        calls.push("settle")
        settled = true
      },
      readEvents: async () => {
        calls.push("events")
        return settled
          ? [
              {
                type: "provider-response",
                sequence: 0,
                status: 200,
                usageComplete: true,
                promptTokens: 100,
                completionTokens: 20,
              },
            ]
          : []
      },
      readSettledSpend: async () => {
        calls.push("spend")
        return 1.25
      },
    })

    expect(calls).toEqual(["requests", "settle", "requests", "events", "spend"])
    expect(evidence).toEqual({
      settlement: { attempted: true, completed: true },
      requests: 1,
      responses: 1,
      non200Responses: 0,
      proxyErrors: 0,
      usageCompleteResponses: 1,
      promptTokens: 100,
      completionTokens: 20,
      baselineSpendUSD: 1,
      settledSpendUSD: 1.25,
      observedSpendDeltaUSD: 0.25,
    })
  })

  test("preserves bounded settlement failure evidence instead of throwing", async () => {
    const evidence = await captureGatewayFailureEvidence({
      proxyStarted: true,
      baselineSpend: 2,
      readRequests: async () => [{ sequence: 0, kind: "controller" }],
      waitForSettlement: async () => {
        throw new Error("settlement deadline")
      },
      readEvents: async () => [],
      readSettledSpend: async () => 2.1,
    })

    expect(evidence).toMatchObject({
      settlement: { attempted: true, completed: false, error: "settlement deadline" },
      requests: 1,
      responses: 0,
      settledSpendUSD: 2.1,
      observedSpendDeltaUSD: 0.1,
    })
  })

  test("does not wait or query settled spend for a pre-provider failure", async () => {
    let settlementCalls = 0
    let spendCalls = 0
    const evidence = await captureGatewayFailureEvidence({
      proxyStarted: true,
      baselineSpend: 2,
      readRequests: async () => [],
      waitForSettlement: async () => {
        settlementCalls++
      },
      readEvents: async () => [],
      readSettledSpend: async () => {
        spendCalls++
        return 2
      },
    })

    expect(settlementCalls).toBe(0)
    expect(spendCalls).toBe(0)
    expect(evidence).toMatchObject({
      settlement: { attempted: false, completed: true },
      requests: 0,
      responses: 0,
      baselineSpendUSD: 2,
    })
    expect(evidence).not.toHaveProperty("settledSpendUSD")
  })

  test("classifies grader conflicts without weakening the frozen patch gate", () => {
    expect(classifyExecutorFailure(new Error("Model patch conflicts with the frozen test patch"), "final-grader"))
      .toEqual({
        classification: "excluded-charged-evaluation-failure",
        stage: "final-grader-test-patch-conflict",
        code: "model-patch-conflicts-frozen-test-patch",
        name: "Error",
        message: "Model patch conflicts with the frozen test patch",
      })
    expect(classifyExecutorFailure(new Error("Gateway requests did not settle"), "gateway-settlement")).toEqual({
      classification: "executor-failure",
      stage: "gateway-settlement",
      code: "executor-error",
      name: "Error",
      message: "Gateway requests did not settle",
    })
  })

  test("requires failure receipts to remain machine-readable and unaccepted", () => {
    const receipt = {
      schemaVersion: 1,
      protocol: "auto-drive-swe-evo-v1.14",
      classification: "excluded-charged-evaluation-failure",
      stage: "final-grader-test-patch-conflict",
      code: "model-patch-conflicts-frozen-test-patch",
      runID: "adr_123",
      taskID: "psf__requests-1142",
      attempt: 1,
      startedAt: "2026-08-30T14:49:34.236Z",
      recordedAt: "2026-08-30T14:55:55.140Z",
      error: { name: "Error", message: "Model patch conflicts with the frozen test patch" },
      sessionID: "ses_123",
      gateway: {
        settlement: { attempted: true, completed: true },
        requests: 21,
        responses: 21,
        non200Responses: 0,
        proxyErrors: 0,
        usageCompleteResponses: 21,
        promptTokens: 123_000,
        completionTokens: 5_000,
        baselineSpendUSD: 1,
        settledSpendUSD: 1.25,
        observedSpendDeltaUSD: 0.25,
      },
      acceptance: { trajectoryAccepted: false, ledgerRowWritten: false },
      artifacts: [{ path: "raw/adr_123.jsonl", sha256: "a".repeat(64) }],
      recordingErrors: [],
    }

    const parsed = parseExecutorFailureReceipt(receipt)
    expect(parsed.classification).toBe("excluded-charged-evaluation-failure")
    expect(parsed.gateway.requests).toBe(21)
    expect(parsed.acceptance.trajectoryAccepted).toBe(false)
    expect(() =>
      parseExecutorFailureReceipt({
        ...receipt,
        acceptance: { trajectoryAccepted: true, ledgerRowWritten: false },
      }),
    ).toThrow()
  })

  test("rejects task records that contain a gold patch", () => {
    expect(() => parseTaskInput({ ...task, patch: "gold" })).toThrow()
    expect(() => parseTaskInput({ ...task, all_patch: "gold" })).toThrow()
  })

  test("matches the official pytest parser and SWE-EVO fix-rate rule", () => {
    const status = parsePytestLog(
      [
        "PASSED tests/test_params.py::test_untracked",
        "PASSED tests/test_params.py::test_one",
        "FAILED tests/test_params.py::test_two - AssertionError",
      ].join("\n"),
    )
    expect(status).toEqual({
      "tests/test_params.py::test_untracked": "PASSED",
      "tests/test_params.py::test_one": "PASSED",
      "tests/test_params.py::test_two": "FAILED",
    })
    expect(gradePytest(parseTaskInput(task), status)).toEqual({
      resolved: false,
      fixRate: 0,
      failToPassRate: 1,
      passToPassRate: 0.5,
      failToPassPassed: ["tests/test_params.py::test_untracked"],
      failToPassFailed: [],
      passToPassPassed: ["tests/test_params.py::test_one"],
      passToPassFailed: ["tests/test_params.py::test_two"],
    })
  })

  test("treats missing tests as failures and XFAIL as an official pass", () => {
    const status = parsePytestLog(
      ["XFAIL tests/test_params.py::test_untracked", "PASSED tests/test_params.py::test_one"].join("\n"),
    )
    expect(gradePytest(parseTaskInput(task), status)).toMatchObject({
      resolved: false,
      fixRate: 0,
      failToPassRate: 1,
      passToPassRate: 0.5,
      passToPassFailed: ["tests/test_params.py::test_two"],
    })
  })

  test("resolves only when every fail-to-pass and pass-to-pass test passes", () => {
    const status = parsePytestLog(
      [
        "PASSED tests/test_params.py::test_untracked",
        "PASSED tests/test_params.py::test_one",
        "PASSED tests/test_params.py::test_two",
      ].join("\n"),
    )
    expect(gradePytest(parseTaskInput(task), status)).toMatchObject({
      resolved: true,
      fixRate: 1,
      failToPassRate: 1,
      passToPassRate: 1,
    })
  })
})
