# AutoDrive analysis and executable audit — 2026-10-03

Scope: local source review of the formal analysis, statistical helpers, paper-result renderer, annotation and ablation code, and orchestration. No remote artifacts, unsealed labels, credentials, or paid requests were inspected. Findings concern publication validity, not stylistic preferences. This report does not certify that the remote campaign completed.

## Ranked findings and disposition

### P1 — Ablation executable references schemas before initialization

Evidence: `packages/autodrive-eval/scripts/ablation-runner.ts:53` invokes `loadOrCreateReceipt()`, which uses `Receipt.parse` at lines 194 and 199. The `const Receipt` initializer is at line 316, after the complete top-level execution block. `Record.parse` has the same ordering issue (uses at lines 62 and 75; initializer at line 297). Both first and resumed campaigns encounter a temporal-dead-zone `ReferenceError` before this stage can complete. Package `tsconfig.json:8` includes only `src` and `test`; the existing runner test checks source strings rather than executing startup (`test/ablation.test.ts:26–34`). Passing package tests therefore did not exercise this path.

Required correction: move schema initialization above top-level execution or expose a guarded `main` invoked after schema setup. Add a provider-free subprocess startup test that reaches receipt creation/loading and regex-record handling with validated fixture inputs. A test that searches for schema names cannot catch this bug.

### P1 — Failed execution could count as a resolved primary outcome (corrected in analysis)

Evidence: `scripts/gateway-host-executor.ts:338–343` independently assigns `status` from `drained.failure` and `resolved` from final grading. `src/artifact.ts:125–128` checks the consistency of status and failure classification, but permits `status="failed", resolved=true`. The previous formal analyzer used `resolved` without execution status. Thus, a model-timeout/budget/loop run whose accumulated patch passed tests could enter the binary success numerator. The preregistration at `research/auto-drive/protocol/preregistration.md:355` says timed-out, looped, and budget-exhausted trajectories count as failures.

Correction: the analyzer now requires execution status and defines binary success as `status === "succeeded" && resolved`. Raw grader resolution remains available as `rawResolved` and `rawResolvedRate`; fix rate remains the raw grader fraction. `outcomeDefinition` records both semantics and is required by the paper renderer. A regression test with a complete matrix of failed executions and passing patches confirms zero operational successes, full denominators, preserved raw grader rates, and no mutation of inputs. Every failure classification maps to the failed status; this is not a change to stored artifacts or worker behavior.

### P1 — One invalid ablation response prevents evidence-preserving completion

Evidence: `scripts/ablation-runner.ts:153` creates an exclusive request artifact before dispatch; lines 163–166 parse the provider body before saving it. Invalid JSON, an invalid tri-state reply, or timeout leaves an immutable request but no accepted record. On resume, the same path attempts `writeFile(..., flag="wx")` and cannot progress. The batch uses `Promise.all` at line 103; any rejection skips subsequent settled-spend checkpoint logic. This fail-closed behavior avoids falsely scoring success, but the lost raw response and missing terminal disposition prevent the promised complete 126-by-five comparison.

Required correction: persist raw provider output and per-call disposition before parsing, settle both in-flight siblings and cost before exiting, and explicitly classify a protocol failure. If the frozen offline endpoint excludes invalid responses, disclose missing coverage and refuse a complete score. If a future amendment adopts deployed DEFER semantics, freeze that amendment before dispatch and separately report timeout/invalid rates. Regression tests: valid sibling plus malformed reply, timeout after a charged request, and restart with an orphaned exclusive request; no unapproved retry or invented prediction is allowed.

### P2 — The ablation input declaration and executable disagree

Evidence: `research/auto-drive/protocol/boundary-ablations.json:14–16` declares memory to include trajectory summary. `src/ablation.ts:75–83` adds summary only for the `summary` condition. `test/ablation.test.ts:36–48` calls conditions cumulative but explicitly expects memory to omit summary. Current manuscript prose has been corrected to describe parallel additions and flag this unresolved declaration.

Required correction: preserve historical protocol files and issue an explicit, versioned executable/declaration reconciliation before paid ablation dispatch. Keep the current memory condition unchanged unless a new prospective experiment is approved. An amended-condition manifest test should verify the actual included information sources against the declared condition; titles alone are insufficient.

### P2 — Standalone ablation and paper commands do not verify source provenance

Evidence: `scripts/ablation-runner.ts:29–43` validates 126 unique candidates and hashes the supplied file, without verifying the annotation seal. `src/cli.ts:564–578` accepts test/prediction files directly; `paperResults` at lines 601–623 reads aggregate JSON without linking all input hashes, protocol identity, candidate corpus, or execution manifests. A structurally complete result from a different corpus can therefore produce a plausible paper table. The formal execution path does validate a frozen annotation seal, but that does not protect independently invoked analysis/render commands.

Required correction: bind generation to a provenance receipt including protocol/source commit, frozen corpus seal, raw trajectory/prediction hashes, and analysis outputs. Recompute or verify those links at rendering. Regression test: two well-formed corpora with identical sizes but different hashes must not be interchangeable. The renderer now says only that summaries are structurally validated; it does not claim cryptographic validation.

## Corrections implemented in this audit

1. **Primary contrast and multiplicity:** formal analysis now computes the supervisor final-minus-own-first-boundary resolved and fix-rate contrasts, with paired task bootstrap intervals and exact McNemar. Holm correction includes the four binary comparisons: off, oracle, blind, regex. Extra repeats remain outside the primary repeat-zero inference (`src/formal-analysis.ts:97–133`). The paper's main delta now uses the off comparison, and regex remains separately named.
2. **Unsupported quantities:** paper generation no longer treats ordinary successful execution as injected-fault recovery, or the all-zero automated manual counter as a measured reduction. `ManualReduction` and `RecoveryRate` remain `Pending`. `gateway-host-executor.ts:345,354–355` still contains proxy/constant fields; their existence is not empirical evidence. The unchanged-patch count at lines 346–348 is likewise a proxy, not semantically redundant work.
3. **Completeness and numerical checks:** formal analysis rejects duplicate task identities within a stratum, invalid rates/counts/costs, incomplete model/strategy/repeat strata, and nonpositive bootstrap iterations. Paper rendering requires 384/288/96 totals, four primary 48-task summaries and the 48-prefix summary, five 126-item ablation summaries, consistent resolved counts/rates, ordered rate intervals, exactly 10,000 bootstrap samples, and consistent primary effect estimates.
4. **Frequency denominator:** the paper now exports labeled, planned, and missing first-boundary counts. `src/annotation.ts:102–121` computes a complete-case frequency among labeled first boundaries, not an unconditional frequency over every planned source run. The renderer validates this accounting and preserves the denominator for disclosure.
5. **Completion language:** generated result status is “Measured outcomes available”, not “Complete”. A successful renderer invocation cannot certify scientific readiness, human labels, operational fault tests, or provenance.
6. **Failure-aware outcome:** primary and replication resolved rates and paired comparisons now use completed-and-test-resolved success. Raw test resolution is retained separately. All five policy/prefix fix-rate macros use the measured grader fractions and are explicitly separate from the binary completion endpoint.

## Statistical limits retained

- The primary bootstrap samples paired task differences at repeat zero. This avoids treating the two additional repeats as independent tasks; it does not account for repository clustering. Repeated results are presently pooled descriptive summaries, so per-policy repeat stability still needs separate reporting.
- Cohen's kappa is computed on the balanced selected 180-item pool, after intersection of available annotation records. Full-frame agreement, missingness by panel, and the change induced by balancing should also be disclosed. Agreement between model panels is not human ground-truth accuracy.
- Classification helpers return zero for an absent STOP/DEFER denominator (`src/statistics.ts:106–110`). A properly sealed 60/60/60 corpus with only 54 development items retains each class in test, but a standalone 126-row input bypassing the seal could falsely display zero unsafe continuation for an absent class. Provenance enforcement or an explicit undefined-rate representation is required before accepting arbitrary analysis inputs.
- Generic statistical helpers do not independently validate every possible numeric input. The strengthened formal wrapper now guards its actual inference path. Claims about arbitrary helper inputs should not be inferred from that validation.

## Verification

TDD captured expected failures for the missing off comparison, unvalidated metrics, unsupported paper claims, incomplete summaries, mismatched effects, a non-frozen bootstrap count, terminal-failure success inflation, and incompatible endpoint semantics. Final package-local broad suite: **185 tests passed, 0 failed, 759 assertions** across 21 files. `bun typecheck` and `git diff --check` passed. No experimental measurements were generated by these tests; their fixture numbers are unit-test inputs only.

Files changed by this audit: `src/formal-analysis.ts`, `src/paper-results.ts`, `test/formal-analysis.test.ts`, `test/paper-results.test.ts`, and this report. Changes are local and uncommitted pending integration by the parent task. No protocol/model/task/budget setting or historical artifact was changed.
