# AutoDrive verification report

Date: 2026-08-30
Branch: `auto-drive-engine`

## Passing gates

- Core AutoDrive, projector, runner, coordinator, and configuration: 147 tests passed; `bun typecheck` passed.
- Server Session API and provider retry policy: 82 tests passed with the package's 30-second explicit test budget; `bun typecheck` passed.
- Generated Client contracts: code generation produced no diff; 16 tests passed; `bun typecheck` passed.
- App Session projection and settings controllers: 95 tests passed; app and E2E typechecks passed; the production Vite build passed.
- Chromium regression: current layout, legacy layout, and `/autodrive <task>` all passed (3/3).
- Evaluation package: 32 tests and 153 assertions passed; `bun typecheck` passed and targeted Oxlint completed with 0 errors and 18 pre-existing warnings.
- Host-executor dry-run: one frozen run envelope was accepted at USD 0, four content-addressed artifacts were re-hashed, provider credentials were stripped from the child process, and neither the formal trajectory index nor formal ledger was created.
- Remote GPU executor: `root-2` passed an eight-device CUDA smoke test, hardened NVIDIA container enumeration, the evaluator's 32 tests and typecheck, and the zero-cost executor dry-run. The node retained zero running containers and zero GPU use at handoff.
- SWE-EVO container compatibility: the immutable `conan-io__conan_2.0.14_2.0.15` image resolved to `sha256:7f6bbb676a0ee2ed040dea51fed25f6848ab4534263f78d3d377d61bf47339d0`; its clean `/testbed` checkout matched frozen base commit `4614b3abbff15627b3fabdd98bee419721f423ce` under no-network, read-only, capability-dropped isolation.
- Protocol validation: 48 pinned SWE-EVO tasks, 384 planned trajectories, 0 completed, USD 0 spent, USD 800 remaining, and no indexed secret.
- Paper: two 11-page PDFs passed text, font, metadata, and page-by-page visual inspection. The deterministic arXiv source archive compiled after clean extraction in a network-disabled, digest-locked TeX image.
- `git diff --check` and a branch-diff secret-pattern scan passed. Client generation and all builds left the worktree clean.

The first Server run used Bun's default 5-second test timeout. Two multi-route read tests completed at approximately 5.0 seconds and timed out; the AutoDrive API test passed in that run. Re-running the same Server file with its explicit 30-second package budget passed all 82 tests. No source or test was changed in response.

## Open quality gate

`bun audit` still exits 1 with 237 repository-wide findings: 4 critical, 78 high, 125 moderate, and 30 low. Representative affected dependency families include Astro, `fast-xml-parser`, Seroval, `tar`, and Undici. These are existing monorepo resolutions outside the AutoDrive change boundary.

The new `@opencode-ai/autodrive-eval` package references only existing catalog dependencies (`zod`, `@tsconfig/bun`, `@types/bun`, and `@typescript/native-preview`). Its lockfile diff adds the workspace package mapping and does not introduce a new third-party version resolution. Therefore, this work does not claim a clean dependency audit, and the artifact checklist keeps that gate open. Remediation should be a separately scoped dependency-upgrade effort because several advisories require coordinated major-version changes across unrelated workspaces.

## Empirical and publication gates

The remote nodes contained no provider credentials, and both timed out reaching the OpenAI API. The 384 paid trajectories, 180 two-person labels, kappa freeze, derived statistics, result tables, real author metadata, license choice, and final upload approval remain incomplete. The PDFs intentionally retain visible `PENDING` result macros. No arXiv upload, push, or pull request was performed.
