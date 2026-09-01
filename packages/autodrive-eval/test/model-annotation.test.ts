import { describe, expect, test } from "bun:test"
import path from "node:path"
import {
  buildModelAnnotationPrompt,
  buildModelAnnotationRequest,
  canRetryModelAnnotation,
  modelAnnotationArtifactName,
  parseModelAnnotationResponse,
  parseModelAnnotation,
  renderModelAnnotationCSV,
} from "../src/model-annotation"

const candidate = {
  id: "adb_1234567890abcdef1234",
  baseTrajectoryID: "adr_1234567890abcdef1234",
  taskID: "owner__repo_1_2",
  boundaryIndex: 0,
  initialGoal: "Fix the parser and run its tests",
  workerOutput: "I located the parser but reached the maximum steps.",
  trajectorySummary: "Read parser.ts; no patch; tests not run.",
  patch: "",
  continuationCount: 0,
  memory: "Inspect parser.ts next.",
}

describe("disclosed model annotation", () => {
  test("ships a bounded resumable host annotator without embedding credentials", async () => {
    const script = await Bun.file(path.join(import.meta.dir, "../scripts/model-annotator.ts")).text()
    expect(script).toContain('scope: "annotation"')
    expect(script).toContain("AUTODRIVE_ANNOTATION_MAX_COST_USD")
    expect(script).toContain("AUTODRIVE_EVAL_BUDGET_LEDGER")
    expect(script).toContain("AUTODRIVE_GATEWAY_KEY_FILE")
    expect(script).toContain("concurrency = 2")
    expect(script).toContain("requestTimeoutMS = 180_000")
    expect(script).toContain("Promise.allSettled(batch.map")
    expect(script).toContain("bounded-model-annotation-recovery")
    expect(script.indexOf("const CampaignReceipt")).toBeLessThan(
      script.indexOf("const campaign = await loadOrCreateReceipt"),
    )
    expect(script.indexOf("const AnnotationRecord")).toBeLessThan(
      script.indexOf("const campaign = await loadOrCreateReceipt"),
    )
    expect(script).not.toMatch(/sk-[A-Za-z0-9_-]{20,}/)
  })

  test("renders a blinded tri-state prompt without a supervisor prediction", () => {
    const prompt = buildModelAnnotationPrompt(candidate)
    expect(prompt).toContain("CONTINUE")
    expect(prompt).toContain("STOP")
    expect(prompt).toContain("DEFER")
    expect(prompt).toContain("Fix the parser")
    expect(prompt).not.toContain("supervisorDecision")
    expect(prompt).not.toContain("gold label")
  })

  test("parses strict JSON labels and rejects unsafe incomplete outputs", () => {
    expect(
      parseModelAnnotation(
        'preface {"label":"continue","confidence":"high","reason":"Tests remain unrun.","next_action":"Implement and test the parser."}',
      ),
    ).toEqual({
      label: "continue",
      confidence: "high",
      reason: "Tests remain unrun.",
      nextAction: "Implement and test the parser.",
    })
    expect(() =>
      parseModelAnnotation('{"label":"defer","confidence":"low","reason":"Missing input","next_action":null}'),
    ).toThrow("next_action")
  })

  test("renders identity-bound CSV rows with recorded timestamps", () => {
    const csv = renderModelAnnotationCSV("model-annotator-a", [
      {
        candidate,
        annotation: {
          label: "continue",
          confidence: "high",
          reason: "Tests remain unrun.",
          nextAction: "Implement, then test.",
        },
        recordedAt: "2026-08-31T00:00:00.000Z",
      },
    ])
    expect(csv).toContain("boundary_id,annotator_id,label")
    expect(csv).toContain("adb_1234567890abcdef1234,model-annotator-a,continue")
  })

  test("pins the gateway request and captures complete response usage", () => {
    expect(buildModelAnnotationRequest("qwen3.7-max", "label this boundary")).toEqual({
      model: "qwen3.7-max",
      messages: [{ role: "user", content: "label this boundary" }],
      temperature: 0,
      max_tokens: 1024,
      stream: false,
    })
    expect(
      parseModelAnnotationResponse({
        model: "qwen3.7-max-20260831",
        choices: [{ message: { content: '{"label":"stop"}' } }],
        usage: { prompt_tokens: 100, completion_tokens: 20 },
      }),
    ).toEqual({
      content: '{"label":"stop"}',
      modelVersion: "qwen3.7-max-20260831",
      promptTokens: 100,
      completionTokens: 20,
    })
    expect(() => parseModelAnnotationResponse({ choices: [] })).toThrow("complete usage")
  })

  test("names one bounded retry without overwriting the first request", () => {
    expect(modelAnnotationArtifactName(candidate.id, 1)).toBe(`${candidate.id}.json`)
    expect(modelAnnotationArtifactName(candidate.id, 2)).toBe(`${candidate.id}-attempt-2.json`)
    expect(() => modelAnnotationArtifactName("not-a-boundary", 1)).toThrow("candidate ID")
  })

  test("retries only transport failures", () => {
    expect(canRetryModelAnnotation(new DOMException("timed out", "TimeoutError"))).toBeTrue()
    expect(canRetryModelAnnotation(new TypeError("network closed"))).toBeTrue()
    expect(canRetryModelAnnotation(new Error("invalid model JSON"))).toBeFalse()
  })
})
