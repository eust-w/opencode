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

Freeze the required model metadata and validate a sealed provider receipt before execution:

```bash
cd packages/autodrive-eval
bun run snapshot-models -- --source /path/to/models.json --output /artifact-root/metadata/models.json --resolutions /artifact-root/metadata/resolutions.json
bun run preflight -- --receipt /artifact-root/preflight/receipt.json --scope full
```

A passing full receipt must cover all three frozen workers with paid billing, exact model versions, sufficient trajectory capacity, verified probe hashes, and all external discovery flags disabled. A canary receipt cannot be used to append an official result.

## 3. Prepare a host executor

The evaluator sends one JSON object on stdin containing the immutable run specification, attempt number, and per-run cost ceiling. The executable returns one validated trajectory JSON object on stdout. Exit 75 is reserved for a zero-cost infrastructure failure. All other nonzero exits are final outcomes.

Provider credentials stay in the host executor. The task container receives only repository files, task metadata, and test commands. The executor must record every worker/controller request in order, with the exact resolved model version, canonical request artifact and hash, image digest, code commit, model-metadata hash, preflight hash, and raw trace hash.

Validate the process and artifact envelope without credentials or provider traffic:

```bash
cd packages/autodrive-eval
bun run verify-executor -- --executor "$PWD/scripts/dry-run-executor.ts" --artifact-root /tmp/autodrive-executor-contract --run-id adr_ccb456e5c84417810dc3
```

The expected status is `accepted` with `mode: dry-run` and `costUSD: 0`. The generated trajectory is deliberately marked as an infrastructure outcome with model version `dry-run-contract-v1`; it is not an experiment observation and is never appended to the formal result or cost files. See `research/auto-drive/host-executor.md` for the complete boundary.

## 4. Pilot and execute

Run a non-primary pilot inside the USD 50 category before selecting any frozen task. The four accepted v1.13 canaries validate historical mechanism execution but do not satisfy the v1.14 capacity or formal-result gates. If a new protocol canary is required for infrastructure qualification, execute exactly one paid canary against a sealed canary receipt:

```bash
cd packages/autodrive-eval
bun run canary -- --execute --executor /absolute/path/to/host-executor --preflight /artifact-root/preflight/canary.json --artifact-root /artifact-root --run-id adr_...
```

The canary command rejects `--all`, requires the frozen primary model, uses the pilot budget category, and writes only under `/artifact-root/canary/`. After the canary is independently accepted and the annotation set is frozen, formal execution may use explicit run IDs. `--all` remains supported by the formal runner but should be used only after those gates.

```bash
cd packages/autodrive-eval
bun run run-eval -- --execute --executor /absolute/path/to/host-executor --preflight /artifact-root/preflight/receipt.json --artifact-root /artifact-root --run-id adr_...
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
