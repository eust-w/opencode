import { describe, expect, test } from "bun:test"
import {
  BASELINE_CONTINUATION_PROMPT,
  buildAutoDriveUpdate,
  buildExperimentConfig,
  buildTaskPrompt,
  classifyIdleSession,
  decideExternalContinuation,
  gradePytest,
  parsePytestLog,
  parseTaskInput,
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
    expect(config.agents.experiment.request.body).toEqual({ temperature: 0 })
    expect(config.providers.openai.models["qwen3.8-max"].request.body).toEqual({
      reasoning: { effort: "low" },
    })
    expect(config.providers.openai.models["qwen3.8-max"].limit.output).toBe(4_096)
    expect(config.providers.openai.api.package).toBe("@ai-sdk/openai")
    expect(config.providers.openai.api.url).toBe("http://autodrive-proxy:8080/worker/v1")
    expect(config.providers["autodrive-controller"].api.package).toBe("@ai-sdk/openai-compatible")
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
