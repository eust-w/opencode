#!/usr/bin/env bash

set -euo pipefail
umask 077

workspace=${AUTODRIVE_WORKSPACE:?AUTODRIVE_WORKSPACE is required}
artifact=${AUTODRIVE_EVAL_ARTIFACT_ROOT:?AUTODRIVE_EVAL_ARTIFACT_ROOT is required}
key_file=${AUTODRIVE_GATEWAY_KEY_FILE:?AUTODRIVE_GATEWAY_KEY_FILE is required}
metadata=${AUTODRIVE_MODEL_METADATA_SOURCE:?AUTODRIVE_MODEL_METADATA_SOURCE is required}
preflight_max=${AUTODRIVE_PREFLIGHT_MAX_COST_USD:?AUTODRIVE_PREFLIGHT_MAX_COST_USD is required}
annotation_max=${AUTODRIVE_ANNOTATION_MAX_COST_USD:?AUTODRIVE_ANNOTATION_MAX_COST_USD is required}
annotation_call_max=${AUTODRIVE_ANNOTATION_PER_CALL_CEILING_USD:?AUTODRIVE_ANNOTATION_PER_CALL_CEILING_USD is required}
ablation_max=${AUTODRIVE_ABLATION_MAX_COST_USD:?AUTODRIVE_ABLATION_MAX_COST_USD is required}
ablation_call_max=${AUTODRIVE_ABLATION_PER_CALL_CEILING_USD:?AUTODRIVE_ABLATION_PER_CALL_CEILING_USD is required}
fixed_cost=${AUTODRIVE_BOUNDARY_FIXED_COST_USD:?AUTODRIVE_BOUNDARY_FIXED_COST_USD is required}
initial_candidates=${AUTODRIVE_BOUNDARY_CANDIDATES:?AUTODRIVE_BOUNDARY_CANDIDATES is required}
annotations="$artifact/annotations"
frame="$annotations/frame.jsonl"
selected="$annotations/selected"
frozen="$annotations/frozen"
ledger="$artifact/boundary/ledger.jsonl"
log="$artifact/orchestration/post-boundary-r1.log"

mkdir -p "$annotations" "$artifact/orchestration"
chmod 700 "$annotations" "$artifact/orchestration"
exec >>"$log" 2>&1

echo "$(date -u +%FT%TZ) pipeline-start"
cd "$workspace/packages/autodrive-eval"
export AUTODRIVE_GATEWAY_KEY_FILE="$key_file"
export AUTODRIVE_EVAL_BUDGET_LEDGER="$ledger"
export AUTODRIVE_BOUNDARY_FIXED_COST_USD="$fixed_cost"
export AUTODRIVE_PREFLIGHT_MAX_COST_USD="$preflight_max"

ensure_preflight() {
  local scope=$1
  local directory="$artifact/preflight/$scope-r1"
  if [ -f "$directory/receipt.json" ]; then
    bun src/cli.ts preflight --scope "$scope" --receipt "$directory/receipt.json" >/dev/null
  else
    bun scripts/research-preflight.ts --scope "$scope" --output "$directory" --metadata "$metadata" >&2
  fi
  echo "$directory/receipt.json"
}

candidate_count=$(wc -l < "$initial_candidates" | tr -d ' ')
if [ "$candidate_count" -lt 180 ]; then
  augmentation_preflight=$(ensure_preflight boundary-augmentation)
  export AUTODRIVE_BOUNDARY_AUGMENTATION_PREFLIGHT="$augmentation_preflight"
  bash "$workspace/research/auto-drive/execution/run-boundary-augmentation-r1.sh"
fi

bun src/cli.ts annotations-extract \
  --results "$artifact/boundary/trajectories.jsonl" \
  --artifact-root "$artifact" \
  --output "$frame"

annotation_preflight=$(ensure_preflight annotation)

run_judge() {
  local identity=$1
  local model=$2
  bun scripts/model-annotator.ts \
    --candidates "$frame" \
    --output "$annotations/$identity" \
    --annotator "$identity" \
    --model "$model" \
    --preflight "$annotation_preflight"
}

export AUTODRIVE_ANNOTATION_MAX_COST_USD="$annotation_max"
export AUTODRIVE_ANNOTATION_PER_CALL_CEILING_USD="$annotation_call_max"
run_judge model-qwen3.7-max d-robotics/qwen3.7-max
run_judge model-deepseek-v4-flash d-robotics/deepseek-v4-flash
run_judge model-deepseek-v4-pro-adjudicator d-robotics/deepseek-v4-pro
bun src/cli.ts boundary-frequency \
  --candidates "$frame" \
  --adjudicated "$annotations/model-deepseek-v4-pro-adjudicator/labels.csv" \
  --source-plan "$workspace/research/auto-drive/protocol/boundary-run-plan.jsonl" \
  --output "$artifact/boundary/frequency.json"

bun src/cli.ts annotations-select \
  --candidates "$frame" \
  --first "$annotations/model-qwen3.7-max/labels.csv" \
  --second "$annotations/model-deepseek-v4-flash/labels.csv" \
  --adjudicated "$annotations/model-deepseek-v4-pro-adjudicator/labels.csv" \
  --output "$selected"
bun src/cli.ts annotations-freeze \
  --method model-panel \
  --candidates "$selected/candidates.jsonl" \
  --first "$selected/first.csv" \
  --second "$selected/second.csv" \
  --adjudicated "$selected/adjudicated.csv" \
  --output "$frozen"

export AUTODRIVE_ABLATION_MAX_COST_USD="$ablation_max"
export AUTODRIVE_ABLATION_PER_CALL_CEILING_USD="$ablation_call_max"
ablation_preflight=$(ensure_preflight ablation)
bun scripts/ablation-runner.ts \
  --test "$frozen/test.jsonl" \
  --output "$artifact/ablation" \
  --preflight "$ablation_preflight"
bun src/cli.ts ablation-analyze \
  --test "$frozen/test.jsonl" \
  --predictions "$artifact/ablation/predictions.jsonl" \
  --output "$artifact/ablation/statistics.json"

export AUTODRIVE_ANNOTATIONS_ROOT="$frozen"
full_preflight=$(ensure_preflight full)
export AUTODRIVE_EVAL_PREFLIGHT_PATH="$full_preflight"
bash "$workspace/research/auto-drive/execution/run-formal-r1.sh"
bun src/cli.ts analyze \
  --results "$artifact/formal/trajectories.jsonl" \
  --output "$artifact/formal/derived"
bun src/cli.ts paper-results \
  --formal "$artifact/formal/derived/formal-statistics.json" \
  --ablation "$artifact/ablation/statistics.json" \
  --frequency "$artifact/boundary/frequency.json" \
  --summary "$artifact/formal/derived/summary.json" \
  --output "$workspace/research/auto-drive/paper/generated/results.tex"
echo "$(date -u +%FT%TZ) pipeline-complete"
