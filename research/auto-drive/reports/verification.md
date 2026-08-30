# AutoDrive verification report

Date: 2026-08-30
Branch: `auto-drive-engine`
Frozen formal protocol: `auto-drive-swe-evo-v1.14`

## Refreshed v1.14 gates

- Supervisor failure abstention was developed test-first. Malformed JSON, provider failure, timeout/empty response, and unavailable model or Session converge on persisted `defer`; heuristic policy behavior is unchanged.
- Core AutoDrive, state, controller, projector, runner, and configuration: 132 tests across six files and 367 assertions passed; `bun typecheck` passed.
- Evaluation package: 63 tests across 13 files and 266 assertions passed; `bun typecheck` passed. The tests bind the executable protocol to `model-requests.json`, the 15-second controller deadline, `defer` failure action, and fault invariants.
- The regenerated v1.14 matrix contains 384 unique IDs over 48 tasks: 288 DeepSeek V4 Pro rows, 48 Qwen 3.7 Max rows, and 48 DeepSeek V4 Flash rows. Every row uses the Qwen 3.8 Max controller. A second generation was byte-identical.
- The documented v1.14 zero-cost host-executor command accepted run `adr_ccb456e5c84417810dc3`, wrote exactly four content-addressed artifacts below `dry-run/`, and produced no empirical result or ledger cost.
- Protocol validation reports 0/384 completed formal trajectories, USD 0 formal spend, USD 800 remaining, and no secret in indexed formal artifacts. The four accepted v1.13 canaries remain separate historical pilot evidence with total spend USD 1.3743051.
- Targeted Oxlint completed with 0 errors and 37 warnings in pre-existing code outside the new assertions and fallback change.
- `git diff --check`, branch-diff secret-pattern scanning, arXiv archive scope scanning, and archive-content secret/host-path scanning passed.
- Both PDFs compile in the network-disabled, digest-locked TeX image. The anonymous PDF is 11 pages and the placeholder-author PDF is 12 pages; all 23 rendered pages passed visual review, all 12 Type 1 font resources are embedded, and final logs contain no overfull boxes, undefined references, or undefined citations.
- The arXiv source archive contains only the wrappers, shared TeX/BibTeX sources, and three generated TeX fragments. Two packaging runs produced the same SHA-256, and a clean extraction compiled to a 12-page PDF with the same locked image and no network.

## Previously verified and unaffected gates

The v1.14 amendment did not change the public HTTP API, generated Client, UI, or browser flows. Their existing same-branch evidence remains applicable: Server Session API and provider-retry tests, Client codegen/typecheck, app unit/build/typecheck, and the three Chromium AutoDrive regressions had passed before this amendment. No generated Client file was edited because this change does not alter public Protocol or Server `HttpApi`.

The host-executor dry-run, remote CUDA/container smoke tests, and immutable SWE-EVO image/base-commit checks also remain valid infrastructure qualification. They do not establish provider capacity or a completed experimental trajectory.

## Open quality gate

`bun audit --json` still exits 1 with 237 repository-wide advisories across 43 affected packages: 4 critical, 78 high, 125 moderate, and 30 low. These are existing monorepo dependency resolutions outside the AutoDrive change boundary. The new evaluation package uses existing catalog resolutions and does not claim a clean dependency audit. Remediation remains a separately scoped dependency-upgrade effort.

## Empirical and publication gates

Formal dispatch is disabled. The available v1.13 gateway receipts and canaries prove serial mechanism execution, but they do not authorize or demonstrate capacity for the 384-row v1.14 matrix. A fresh v1.14 receipt must cover the exact worker/controller models, request and token limits, account budget, rate limits, and required concurrency before paid dispatch.

The non-primary pilot, 180 real boundary examples, two independent annotation files, Cohen's kappa freeze, 384 provenance-complete formal trajectories, derived statistics/tables/figures, and error adjudication remain incomplete. The PDFs intentionally retain 25 visible `Pending` result values. Real author metadata, author order, license choice, final PDF approval, push, pull request, and arXiv upload also remain unauthorized and incomplete.
