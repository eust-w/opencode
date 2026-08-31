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

The 48 strict host-executor inputs are committed under `research/auto-drive/protocol/tasks/`. `validate` checks them against the frozen manifest and source digest. To independently rematerialize them, download the exact Arrow path recorded in `swe-evo-48.json`, verify SHA-256 `74e7c63160ada4ceba71d5d89a9bb7c9794f4574b384458d546eb65cdb730520`, then run:

```bash
python3 packages/autodrive-eval/scripts/materialize-swe-evo-task-inputs.py \
  --arrow /path/to/data-00000-of-00001.arrow \
  --manifest research/auto-drive/protocol/swe-evo-48.json \
  --output /tmp/materialized-swe-evo-tasks
diff -ru research/auto-drive/protocol/tasks /tmp/materialized-swe-evo-tasks
```

The materializer requires PyArrow, rejects a mismatched Arrow digest or manifest row, and never copies the gold implementation patch.

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

Inspect the frozen non-primary task without provider access:

```bash
cd packages/autodrive-eval
bun run pilot:plan
```

The plan must resolve SWE-bench Verified `psf__requests-1142`, dataset revision `c104f840`, the pinned harness commit, task-input SHA-256, and AMD64 image digest. Execute it inside the USD 50 category only after a fresh sealed canary-scope receipt exists:

```bash
cd packages/autodrive-eval
bun run pilot -- --execute --executor /absolute/path/to/host-executor --preflight /artifact-root/preflight/pilot.json --artifact-root /artifact-root
```

The command copies the manifest and task input into `/artifact-root/pilot/protocol/`, enforces the frozen image digest, and writes only `/artifact-root/pilot/{trajectories.jsonl,ledger.jsonl,receipt.json}` plus content-addressed raw artifacts. Its outcome never enters an RQ estimate. The four accepted v1.13 canaries validate historical mechanism execution but do not satisfy this v1.14 non-primary pilot gate.

If a new protocol canary is required for infrastructure qualification, execute exactly one paid canary against a sealed canary receipt:

```bash
cd packages/autodrive-eval
bun run canary -- --execute --executor /absolute/path/to/host-executor --preflight /artifact-root/preflight/canary.json --artifact-root /artifact-root --run-id adr_...
```

The canary command rejects `--all`, requires the frozen primary model, uses the pilot budget category, and writes only under `/artifact-root/canary/`.

## 5. Collect, extract, and freeze boundary annotations

Generate the deterministic source plan before any boundary outcome is observed:

```bash
cd packages/autodrive-eval
bun run boundary:plan -- --output /artifact-root/boundary/plan.jsonl
```

The output must contain 96 unique supervisor-only rows: every SWE-EVO task twice, with no run ID present in the formal 384-row plan. Paid collection requires a fresh `boundary`-scope receipt proving capacity for the primary worker and fixed controller. Dispatch explicit run IDs in frozen order and at most two concurrently; `--all` is available only after the operator has verified the pilot and capacity receipt:

```bash
bun run preflight -- --scope boundary --receipt /artifact-root/preflight/boundary.json
bun run boundary:run -- --execute --executor /absolute/path/to/host-executor --preflight /artifact-root/preflight/boundary.json --artifact-root /artifact-root --run-id adr_...
```

The runner reserves at most USD 102/96 per source trajectory and writes only `/artifact-root/boundary/{trajectories.jsonl,ledger.jsonl}` plus content-addressed artifacts. These rows are excluded from the formal result validator and every RQ2 estimate.

After all 96 dispositions, the bounded finalizer writes the complete initial candidate frame. The prospectively sealed, label-blind contingency runs only when that file contains fewer than 180 candidates. It then executes every row in the committed 48-run augmentation plan; it never stops early based on labels or yield:

```bash
bun run boundary:augmentation-plan -- --output /artifact-root/boundary/augmentation-plan.jsonl
bun run preflight -- --scope boundary-augmentation --receipt /artifact-root/preflight/boundary-augmentation.json
AUTODRIVE_WORKSPACE=/absolute/source \
AUTODRIVE_RUNTIME=/absolute/runtime \
AUTODRIVE_EVAL_ARTIFACT_ROOT=/artifact-root \
AUTODRIVE_BOUNDARY_AUGMENTATION_PREFLIGHT=/artifact-root/preflight/boundary-augmentation.json \
AUTODRIVE_BOUNDARY_CANDIDATES=/artifact-root/annotations/candidates.jsonl \
AUTODRIVE_SOURCE_ARCHIVE=/absolute/source.tar.gz \
AUTODRIVE_SOURCE_SHA256=<sha256> \
bash research/auto-drive/execution/run-boundary-augmentation-r1.sh
```

The original 96 rows alone define RQ1 frequency. Supplemental boundaries are source-marked and may enter only the balanced RQ3 classifier frame.

After source collection is idle, capture fresh paid compatibility receipts instead of hand-authoring capacity claims. The capture uses one harmless request per required model/transport, stores the raw terminal response and complete usage, self-validates the receipt, charges the shared boundary ledger, and expires after 48 hours:

```bash
AUTODRIVE_GATEWAY_KEY_FILE=/absolute/path/to/key \
AUTODRIVE_EVAL_BUDGET_LEDGER=/artifact-root/boundary/ledger.jsonl \
AUTODRIVE_BOUNDARY_FIXED_COST_USD=<initial-boundary-preflight-cost> \
AUTODRIVE_PREFLIGHT_MAX_COST_USD=2 \
bun run preflight:capture -- --scope annotation --output /artifact-root/preflight/annotation --metadata /absolute/path/to/frozen-models.json
```

Repeat for `boundary-augmentation` only if its trigger fires, and for `ablation` and `full` immediately before those stages. Do not run compatibility probes concurrently with an empirical trajectory because the gateway spend endpoint is account-cumulative.

Extract only from accepted, artifact-verifiable trajectories. The command checks the trajectory, request, trace, patch, model metadata, and preflight hashes; drops reasoning and prior supervisor decisions; and emits deterministic `adb_...` IDs:

```bash
cd packages/autodrive-eval
bun run annotations:extract -- --results /artifact-root/boundary/trajectories.jsonl --artifact-root /artifact-root --output /artifact-root/annotations/candidates.jsonl
bun run annotations:select -- --candidates /artifact-root/annotations/candidates.jsonl --labels /artifact-root/annotations/adjudicated-frame.csv --output /artifact-root/annotations/selected
bun run annotations:prepare -- --candidates /artifact-root/annotations/candidates.jsonl --output /artifact-root/annotations/annotator-a --annotator annotator-a
bun run annotations:prepare -- --candidates /artifact-root/annotations/candidates.jsonl --output /artifact-root/annotations/annotator-b --annotator annotator-b
```

`annotations:select` is used only after a larger frame is completely labeled. It deterministically selects 60 examples per adjudicated class and writes selection provenance; it must never be used to choose examples from predictions or outcomes. A disclosed, bounded model-annotation executor is available for sensitivity studies and annotation-pipeline qualification:

```bash
bun run preflight -- --scope annotation --receipt /artifact-root/preflight/annotation.json
AUTODRIVE_GATEWAY_KEY_FILE=/absolute/path/to/key \
AUTODRIVE_EVAL_BUDGET_LEDGER=/artifact-root/boundary/ledger.jsonl \
AUTODRIVE_BOUNDARY_FIXED_COST_USD=<all-boundary-preflight-cost> \
AUTODRIVE_ANNOTATION_MAX_COST_USD=20 \
AUTODRIVE_ANNOTATION_PER_CALL_CEILING_USD=0.10 \
bun run annotations:model -- --candidates /artifact-root/annotations/candidates.jsonl --output /artifact-root/annotations/model-a --annotator model-a --model d-robotics/deepseek-v4-pro --preflight /artifact-root/preflight/annotation.json
```

Model annotations are explicitly recorded as `independent-model-annotation` and are never represented as human judgments. Run the prospectively frozen identities in order: Qwen 3.7 Max and DeepSeek V4 Flash as the independent pair, then DeepSeek V4 Pro as the distinct adjudicator. Freeze their selected files with `--method model-panel`; the v3 seal records `independent-model-panel` and retains the unchanged kappa and class-balance gates.

Annotators edit only `labels.csv`. Required columns are `boundary_id,annotator_id,label,confidence,reason,next_action,timestamp`; `CONTINUE` and `DEFER` require a non-empty next action or missing decision. After both files are sealed and disagreements are adjudicated by a distinct identity:

```bash
bun run annotations:freeze -- --method model-panel --candidates /artifact-root/annotations/candidates.jsonl --first /artifact-root/annotations/annotator-a/labels.csv --second /artifact-root/annotations/annotator-b/labels.csv --adjudicated /artifact-root/annotations/adjudicated.csv --output /artifact-root/annotations/frozen
```

Freeze fails unless all 180 IDs are covered, kappa is at least 0.75, adjudicated counts are 60/60/60, and a base trajectory stays entirely within the 54-item development or 126-item test split. The two boundaries extracted from the historical v1.13 canary are a smoke test only and cannot enter this v1.14 corpus.

After the non-primary pilot is independently accepted, the annotation set is frozen, and a full-scope receipt passes, formal execution may use explicit run IDs. `--all` remains supported by the formal runner but should be used only after those gates.

```bash
cd packages/autodrive-eval
bun run run-eval -- --execute --executor /absolute/path/to/host-executor --preflight /artifact-root/preflight/receipt.json --annotations /artifact-root/annotations/frozen --artifact-root /artifact-root --run-id adr_...
```

The harness permits at most two concurrent tasks and one identical retry for a predefined, zero-cost infrastructure failure.

Run the five frozen boundary classifier variants only on the sealed 126-example test split. The regex row imports the production heuristic directly and incurs no provider call; the other four rows use the fixed controller, exactly 504 calls in total, and a dedicated scope receipt:

```bash
bun run preflight -- --scope ablation --receipt /artifact-root/preflight/ablation.json
AUTODRIVE_GATEWAY_KEY_FILE=/absolute/path/to/key \
AUTODRIVE_EVAL_BUDGET_LEDGER=/artifact-root/boundary/ledger.jsonl \
AUTODRIVE_BOUNDARY_FIXED_COST_USD=<all-boundary-preflight-cost> \
AUTODRIVE_ABLATION_MAX_COST_USD=40 \
AUTODRIVE_ABLATION_PER_CALL_CEILING_USD=0.08 \
bun run ablation:run -- --test /artifact-root/annotations/frozen/test.jsonl --output /artifact-root/ablation --preflight /artifact-root/preflight/ablation.json
```

The annotation and ablation executors reserve against the shared boundary ledger plus the explicitly reconciled sum of preflight charges, then append one idempotent campaign row after their manifest is sealed. They run at concurrency two, validate complete usage, checkpoint settled account spend, store hash-bound request/response records, and refuse to overwrite a partially issued call. The `summary` row is an offline information ablation built from the blinded trajectory summary; the `memory` row omits that summary and matches the deployed goal, memory, and last-output information sources.

## 6. Analyze and build

```bash
cd packages/autodrive-eval
bun run analyze
cd ../../research/auto-drive/paper
bash build.sh
```

Analysis refuses an empty result set. The final snapshot must contain 384 accepted IDs, a reconciled cost ledger, frozen labels with kappa at least 0.75, and generated result macros. Build both PDFs from the same source and inspect every rendered page before packaging.
