import { describe, expect, test } from "bun:test"
import { buildTaskPrompt, gradePytest, parsePytestLog, parseTaskInput } from "../src/host-executor"

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
