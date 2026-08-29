# Reproducing AutoDrive

## 1. Verify the implementation

Use the repository's package-local test and typecheck commands. The critical suites cover the controller, Session projector and runner, Protocol/Server endpoint, generated client, app state, and Chromium regression flow.

## 2. Verify the frozen protocol

```bash
cd packages/autodrive-eval
bun test
bun typecheck
bun run validate
```

Expected before paid runs: 48 tasks, 384 planned trajectories, status `pending`, completed 0, spent USD 0, and remaining USD 800.

## 3. Prepare a host executor

The evaluator sends one JSON object on stdin containing the immutable run specification, attempt number, and per-run cost ceiling. The executable returns one validated trajectory JSON object on stdout. Exit 75 is reserved for a zero-cost infrastructure failure. All other nonzero exits are final outcomes.

Provider credentials stay in the host executor. The task container receives only repository files, task metadata, and test commands. The executor must record the resolved model version, normalized request hash, image digest, code commit, and raw trace hash.

## 4. Pilot and execute

Run a non-primary pilot inside the USD 50 category before selecting any frozen task. Once isolation, trace completeness, grading, and billing agree, execute explicit run IDs. `--all` is supported but should be used only after the pilot and annotation freeze.

```bash
cd packages/autodrive-eval
bun run run-eval -- --execute --executor /absolute/path/to/host-executor --run-id adr_...
```

The harness permits at most two concurrent tasks and one identical retry for a predefined, zero-cost infrastructure failure.

## 5. Analyze and build

```bash
cd packages/autodrive-eval
bun run analyze
cd ../../research/auto-drive/paper
bash build.sh
```

Analysis refuses an empty result set. The final snapshot must contain 384 accepted IDs, a reconciled cost ledger, frozen labels with kappa at least 0.75, and generated result macros. Build both PDFs from the same source and inspect every rendered page before packaging.
