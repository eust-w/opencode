# AutoDrive verification report

Date: 2026-08-30
Branch: `auto-drive-engine`
Frozen formal protocol: `auto-drive-swe-evo-v1.14`

## Refreshed v1.14 gates

- Supervisor failure abstention was developed test-first. Malformed JSON, provider failure, timeout/empty response, and unavailable model or Session converge on persisted `defer`; heuristic policy behavior is unchanged.
- Core AutoDrive, state, controller, projector, runner, and configuration: 132 tests across six files and 367 assertions passed; `bun typecheck` passed.
- The r6 model-readiness fix adds a first-Location-resolution regression and an explicit built-in-plugin bootstrap barrier. Location plus plugin coverage passed 232/232 tests with 397 assertions; Core and OpenCode package typechecks passed. The complete Core run passed 1129/1130 tests; one unrelated PTY event test hit its fixed five-second timeout and then passed 7/7 when rerun alone.
- The r7 credential-projection fix was developed from an exact red regression using the executor's V1 configuration shape. The 22 complete Config and Location tests passed with 96 assertions, all 13 host-executor tests passed with 38 assertions, and both Core and evaluation package typechecks passed. The rebuilt Linux AMD64 binary has SHA-256 `3cdc37c0...3128f`.
- Evaluation package: 84 tests across 14 files and 338 assertions passed; `bun typecheck` passed. The tests also cover the frozen non-primary pilot, read-only config preparation, decoded-response relay normalization, the disjoint 96-run boundary source plan and capacity gate, blinded extraction, independent annotation identities, Cohen's kappa, balanced adjudication, and grouped 54/126 freezing.
- The regenerated v1.14 matrix contains 384 unique IDs over 48 tasks: 288 DeepSeek V4 Pro rows, 48 Qwen 3.7 Max rows, and 48 DeepSeek V4 Flash rows. Every row uses the Qwen 3.8 Max controller. A second generation was byte-identical.
- The documented v1.14 zero-cost host-executor command accepted run `adr_ccb456e5c84417810dc3`, wrote exactly four content-addressed artifacts below `dry-run/`, and produced no empirical result or ledger cost.
- Protocol validation reports 0/384 completed formal trajectories, USD 0 formal spend, USD 800 remaining, and no secret in indexed formal artifacts. The four accepted v1.13 canaries remain separate historical pilot evidence with total spend USD 1.3743051.
- Targeted Oxlint completed with 0 errors and 37 warnings in pre-existing code outside the new assertions and fallback change.
- `git diff --check`, branch-diff secret-pattern scanning, arXiv archive scope scanning, and archive-content secret/host-path scanning passed.
- Both PDFs compile in the network-disabled, digest-locked TeX image. Each PDF is 12 pages; all 24 rendered pages passed visual review, all 15 Type 1 font resources are embedded, and final logs contain no overfull boxes, undefined references, or undefined citations.
- The arXiv source archive contains only the wrappers, shared TeX/BibTeX sources, and three generated TeX fragments. Two packaging runs produced the same SHA-256, and a clean extraction compiled to a 12-page PDF with the same locked image and no network.

## Previously verified and unaffected gates

The v1.14 amendment did not change the public HTTP API, generated Client, UI, or browser flows. Their existing same-branch evidence remains applicable: Server Session API and provider-retry tests, Client codegen/typecheck, app unit/build/typecheck, and the three Chromium AutoDrive regressions had passed before this amendment. No generated Client file was edited because this change does not alter public Protocol or Server `HttpApi`.

The host-executor dry-run, remote CUDA/container smoke tests, and immutable SWE-EVO image/base-commit checks also remain valid infrastructure qualification. They do not establish provider capacity or a completed experimental trajectory.

The non-primary pilot is frozen as SWE-bench Verified `psf__requests-1142`. Its dataset revision, Parquet digest, image creation-era harness commit, task-input hash, official `pytest -rA` command, and AMD64 image digest are sealed. `pilot:plan` resolves deterministic run `adr_019266f8a9f62aea9d4b` without provider access. r4 found the missing bootstrap `.gitignore`, r5 found stale gzip relay metadata, r6 found the built-in-plugin readiness race, and the prospectively authorized r7 found that V1 `options.apiKey` did not reach the V2 runner credential field. r7 created Session `ses_facee9984ffeFbq437WQPWzyPP` and promoted its prompt, then failed Location model resolution before provider dispatch. All four attempts recorded unchanged key spend of USD 1.9453748 and last activity, no ledger row, and no accepted trajectory. Fixes `55cc676f72`, `5efa37aa89`, `6f141c3e00`, and `8e4359a39a` cover the four infrastructure defects.

The post-r6 Linux AMD64 smoke used the frozen task image, configuration, and model metadata with the rebuilt binary SHA-256 `a2d1a8fe...01647`. It created a Session, durably admitted a prompt, resolved `openai/deepseek-v4-pro`, and reached the expected HTTP transport error because no local proxy was started. Gateway spend and last activity remained unchanged. The smoke is zero-provider implementation evidence, not a pilot retry or empirical result; its receipt is stored under the external r6 artifact root.

The post-r7 Linux AMD64 smoke used r7's byte-identical executor config and model metadata with rebuilt binary SHA-256 `3cdc37c0...3128f`. A Docker-internal network had no proxy, gateway key, external route, or published host port. The public projection exposed both frozen models, Session `ses_face27d43ffe06shH02PolEJ8x` admitted and promoted its prompt, the worker resolved, and execution reached the expected HTTP transport failure. The Session retained zero cost and tokens, and gateway spend and last activity remained unchanged. The external r7 root stores the failure and smoke receipts; neither is a retry or empirical result.

Boundary extraction replayed the historical v1.13 supervisor canary and produced two deterministic, patch-verified blinded examples with no reasoning metadata or supervisor decision leakage. This is a pipeline smoke test only; it does not satisfy the v1.14 corpus gate. The new freeze path requires 180 IDs, two distinct annotators, a distinct adjudicator, kappa at least 0.75, exact 60/60/60 labels, and grouped 54/126 output.

The v1.14 boundary source plan is now frozen as 96 supervisor-only trajectories: 48 tasks with two repeats. All IDs are unique and disjoint from the 384 formal rows. Its paid command requires a fresh boundary-scope receipt proving capacity 96 for both logical worker and controller, enforces concurrency two and a USD 102/96 per-run ceiling, and writes only below external `boundary/`. No source trajectory has been executed.

## Open quality gate

`bun audit --json` still exits 1 with 237 repository-wide advisories across 43 affected packages: 4 critical, 78 high, 125 moderate, and 30 low. These are existing monorepo dependency resolutions outside the AutoDrive change boundary. The new evaluation package uses existing catalog resolutions and does not claim a clean dependency audit. Remediation remains a separately scoped dependency-upgrade effort.

## Empirical and publication gates

Formal dispatch is disabled. The available v1.13 gateway receipts and canaries prove serial mechanism execution, but they do not authorize or demonstrate capacity for the 384-row v1.14 matrix. A fresh v1.14 receipt must cover the exact worker/controller models, request and token limits, account budget, rate limits, and required concurrency before paid dispatch.

The non-primary pilot still has no accepted trajectory. The authorized r7 attempt is consumed and non-retryable, so another pilot execution requires a new prospective protocol-deviation authorization and fresh artifact root. The 96 boundary source trajectories, 180 v1.14 boundary examples, two independent annotation files, adjudication, Cohen's kappa freeze, 384 provenance-complete formal trajectories, derived statistics/tables/figures, and error adjudication remain incomplete. Each PDF intentionally retains 25 visible `Pending` result values. Real author metadata, author order, license choice, final PDF approval, push, pull request, and arXiv upload also remain unauthorized and incomplete.
