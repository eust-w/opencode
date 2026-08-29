# AutoDrive verification report

Date: 2026-08-30
Branch: `auto-drive-engine`

## Passing gates

- Core AutoDrive, projector, runner, coordinator, and configuration: 147 tests passed; `bun typecheck` passed.
- Server Session API and provider retry policy: 82 tests passed with the package's 30-second explicit test budget; `bun typecheck` passed.
- Generated Client contracts: code generation produced no diff; 16 tests passed; `bun typecheck` passed.
- App Session projection and settings controllers: 95 tests passed; app and E2E typechecks passed; the production Vite build passed.
- Chromium regression: current layout, legacy layout, and `/autodrive <task>` all passed (3/3).
- Evaluation package: 19 tests and 108 assertions passed; `bun typecheck` and formatting checks passed.
- Protocol validation: 48 pinned SWE-EVO tasks, 384 planned trajectories, 0 completed, USD 0 spent, USD 800 remaining, and no indexed secret.
- Paper: two 11-page PDFs passed text, font, metadata, and page-by-page visual inspection. The deterministic arXiv source archive compiled after clean extraction in a network-disabled, digest-locked TeX image.
- `git diff --check` and a branch-diff secret-pattern scan passed. Client generation and all builds left the worktree clean.

The first Server run used Bun's default 5-second test timeout. Two multi-route read tests completed at approximately 5.0 seconds and timed out; the AutoDrive API test passed in that run. Re-running the same Server file with its explicit 30-second package budget passed all 82 tests. No source or test was changed in response.

## Open quality gate

`bun audit` exits 1 with 237 repository-wide findings: 4 critical, 78 high, 125 moderate, and 30 low. Representative affected dependency families include Astro, `fast-xml-parser`, Seroval, `tar`, and Undici. These are existing monorepo resolutions outside the AutoDrive change boundary.

The new `@opencode-ai/autodrive-eval` package references only existing catalog dependencies (`zod`, `@tsconfig/bun`, `@types/bun`, and `@typescript/native-preview`). Its lockfile diff adds the workspace package mapping and does not introduce a new third-party version resolution. Therefore, this work does not claim a clean dependency audit, and the artifact checklist keeps that gate open. Remediation should be a separately scoped dependency-upgrade effort because several advisories require coordinated major-version changes across unrelated workspaces.

## Empirical and publication gates

The 384 paid trajectories, 180 two-person labels, kappa freeze, derived statistics, result tables, real author metadata, license choice, and final upload approval remain incomplete. The PDFs intentionally retain visible `PENDING` result macros. No arXiv upload, push, or pull request was performed.
