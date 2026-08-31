# Post-boundary execution environment

Captured: 2026-08-31 (Asia/Shanghai)

- Source commit: `295bd606f7`
- Source archive: `/root/autodrive-source-295bd606f7.tar.gz`
- Source archive SHA-256: `f88c8e28322fd295bc2480f20e9c7e2d76a22d3814b11db69dfa77d8c4d677a1`
- Isolated workspace: `/root/autodrive-workspace-295bd606f7`
- Shared pinned Bun runtime: `/root/autodrive-runtime-v114/bin/bun` (`1.4.0`)
- Boundary campaign workspace remains unchanged at `/root/autodrive-workspace-v114-b10ed952e1`.

The Git archive intentionally contains no `.git` directory. A normal root install therefore completed the dependency and project postinstall work but returned exit 1 when the Husky `prepare` lifecycle reported `.git can't be found`. A second `bun install --frozen-lockfile --ignore-scripts` checked all 2,439 installs across 2,711 packages with no changes and exited 0. This establishes that the remaining failure was the repository-hook lifecycle, not an unresolved package dependency. From `packages/autodrive-eval`, the isolated snapshot then passed 149 tests with 560 assertions and `bun typecheck`.

This environment is prepared for the prospectively sealed boundary augmentation, independent model-panel labeling, offline boundary ablation, and formal execution. No provider request or experiment observation was produced while preparing it.
