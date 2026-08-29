# AutoDrive Turn-Boundary Research Implementation Plan

**Goal:** Build a safe, durable AutoDrive controller, evaluate it under a frozen multi-model protocol, and produce a reproducible arXiv-ready paper package.

**Architecture:** A Location-scoped controller evaluates each safe worker turn boundary and persists a tri-state decision before admitting an idempotent queued continuation. Session-owned settings, status, memory, provenance, and decisions are exposed through the V2 Protocol and projected into SQLite. A separate evaluation package treats immutable trajectories as the only source for statistics and paper figures.

**Tech Stack:** Bun, TypeScript, Effect, Drizzle/SQLite, SolidJS, Playwright, Python with uv for statistics, Docker for benchmark and TeX isolation, LaTeX/acmart for the paper.

---

## Batch 1: Durable Controller Foundation

1. Add failing unit tests for `continue`, `stop`, and `defer`, malformed supervisor output, completion, human-choice, permission-expansion, unsafe-action, and maximum-run decisions.
2. Refactor the pure controller into a Session module with schema-decoded supervisor output and a heuristic fallback.
3. Add failing schema and projection tests for Session settings, status, decisions, provenance, memory isolation, and configuration precedence.
4. Add versioned durable Session events and projections for settings and decisions.
5. Preserve input provenance from admission through queued promotion and visible user-message projection.
6. Reconcile decision and input IDs on runner wake, persist chain counts, and cover both crash windows with integration tests.
7. Restore the bounded scheduler retry policy and its five-retry regression test.
8. Run core and opencode scoped tests and type checks, review the diff, and commit each independently verified slice.

## Batch 2: Protocol and Product Controls

1. Add failing Protocol and handler tests for reading and replacing Session AutoDrive settings.
2. Add the V2 Session update endpoint and include AutoDrive state in Session information.
3. Regenerate the client from `packages/client` with `bun run generate`; never edit generated sources directly.
4. Add failing app tests for an unavailable V1 server, a new Session, an existing Session, and a failed state update.
5. Connect the composer and settings controls to the Session endpoint; keep task input intact if enablement fails.
6. Make `/autodrive <task>` enable the current/new V2 Session before submitting the task; return an explicit unsupported result for V1.
7. Run app unit/browser tests, Playwright coverage for the critical flow, builds, and package type checks.

## Batch 3: Evaluation Artifact

1. Create `packages/autodrive-eval` with a CLI that validates a frozen manifest before any paid call.
2. Implement policies for off-prefix scoring, oracle, blind, heuristic, and supervisor execution.
3. Enforce model, task, seed, step, continuation, timeout, concurrency, and cost limits before scheduling.
4. Write append-only run events and final normalized records without secrets; inject provider credentials only into the host process.
5. Implement the declared one-rerun infrastructure policy and distinguish infrastructure, provider, model, budget, timeout, and verifier outcomes.
6. Add boundary extraction, grouped split validation, blind annotation sheets, agreement calculation, and freeze hashes.
7. Implement deterministic fault scenarios for both crash windows, wake coalescing, user preemption, invalid supervisor output, retry behavior, and run limits.
8. Add Python analysis with exact McNemar, paired clustered bootstrap, Holm correction, plots, and generated LaTeX tables.
9. Verify the harness against recorded fixtures before permitting live calls.

## Batch 4: Pilot and Frozen Runs

1. Run four non-SWE-EVO pilot tasks and fix only predeclared harness or infrastructure defects.
2. Complete two independent boundary annotations, adjudicate disagreements, and freeze when kappa is at least 0.75.
3. Record model endpoints, request parameters, container digests, repository revisions, task IDs, and budget allocations in the frozen manifest.
4. Run at most two trajectories concurrently and stop scheduling before the USD 800 total cap.
5. Validate every completed record, perform only allowed infrastructure reruns, and retain failures without selective replacement.
6. Freeze raw outputs and generate the statistical result snapshot.

## Batch 5: Paper and Release Verification

1. Create the ACM-style LaTeX manuscript with numerical placeholders linked to generated tables.
2. Write the problem formulation, system design, experimental method, four RQ sections, error analysis, threats, related work, and conclusion.
3. Generate all numbers, tables, and figures from the frozen result snapshot; prohibit manually copied result values.
4. Produce the anonymous and placeholder-author builds, the full appendix, artifact checklist, reproduction guide, and Chinese report.
5. Build in a digest-pinned TeX Live container and verify references, fonts, figures, page layout, and arXiv source completeness.
6. Run package tests, builds, type checks, dependency audit, secret scan, artifact scan, and final diff review.
7. Do not push, open a pull request, or upload to arXiv without separate user authorization.
