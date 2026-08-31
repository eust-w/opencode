#!/usr/bin/env bash

set -uo pipefail
umask 077

batch_size=2
workspace=${AUTODRIVE_WORKSPACE:?AUTODRIVE_WORKSPACE is required}
runtime=${AUTODRIVE_RUNTIME:?AUTODRIVE_RUNTIME is required}
artifact=${AUTODRIVE_EVAL_ARTIFACT_ROOT:?AUTODRIVE_EVAL_ARTIFACT_ROOT is required}
preflight=${AUTODRIVE_EVAL_PREFLIGHT_PATH:?AUTODRIVE_EVAL_PREFLIGHT_PATH is required}
annotations=${AUTODRIVE_ANNOTATIONS_ROOT:?AUTODRIVE_ANNOTATIONS_ROOT is required}
source_archive=${AUTODRIVE_SOURCE_ARCHIVE:?AUTODRIVE_SOURCE_ARCHIVE is required}
source_sha256=${AUTODRIVE_SOURCE_SHA256:?AUTODRIVE_SOURCE_SHA256 is required}
plan="$workspace/research/auto-drive/protocol/run-plan.jsonl"
results="$artifact/formal/trajectories.jsonl"
ledger="$artifact/formal/ledger.jsonl"
log="$artifact/orchestration/formal-runner-r1.log"

mkdir -p "$artifact/orchestration" "$artifact/formal"
chmod 700 "$artifact/orchestration" "$artifact/formal"
exec >>"$log" 2>&1
export PATH="$runtime/bin:$PATH"

result_count() {
  RESULTS_PATH="$results" bun -e 'const file=Bun.file(Bun.env.RESULTS_PATH); if(!(await file.exists())){console.log(0);process.exit(0)} console.log((await file.text()).trim().split(String.fromCharCode(10)).filter(Boolean).length)'
}

ledger_total() {
  LEDGER_PATH="$ledger" bun -e 'const file=Bun.file(Bun.env.LEDGER_PATH); if(!(await file.exists())){console.log(0);process.exit(0)} const rows=(await file.text()).trim().split(String.fromCharCode(10)).filter(Boolean).map(JSON.parse); console.log(rows.reduce((sum,row)=>sum+Number(row.amountUSD),0))'
}

completed() {
  local run_id=$1
  [ -f "$results" ] && grep -q "\"runID\":\"$run_id\"" "$results"
}

require_clean_failure_state() {
  local run_id=$1
  if [ -f "$artifact/failures/$run_id/attempt-1.json" ]; then
    echo "$(date -u +%FT%TZ) runner-stop reason=pending-failure-receipt runID=$run_id"
    exit 5
  fi
}

run_batch() {
  if [ "$#" -eq 0 ]; then
    return
  fi
  local args=()
  local run_id
  for run_id in "$@"; do
    require_clean_failure_state "$run_id"
    args+=(--run-id "$run_id")
  done
  echo "$(date -u +%FT%TZ) batch-start runs=$* accepted=$(result_count) ledgerUSD=$(ledger_total)"
  cd "$workspace/packages/autodrive-eval" || exit 4
  if ! bun src/cli.ts run --execute \
    --executor scripts/gateway-host-executor.ts \
    --preflight "$preflight" \
    --artifact-root "$artifact" \
    --annotations "$annotations" \
    --results "$results" \
    --ledger "$ledger" \
    "${args[@]}"; then
    echo "$(date -u +%FT%TZ) runner-stop reason=batch-failed runs=$* accepted=$(result_count) ledgerUSD=$(ledger_total)"
    exit 6
  fi
  echo "$(date -u +%FT%TZ) batch-accepted runs=$* accepted=$(result_count) ledgerUSD=$(ledger_total)"
}

actual_source_sha256=$(sha256sum "$source_archive" | awk '{print $1}')
if [ "$actual_source_sha256" != "$source_sha256" ]; then
  echo "$(date -u +%FT%TZ) runner-stop reason=source-hash expected=$source_sha256 actual=$actual_source_sha256"
  exit 2
fi
if [ ! -f "$plan" ] || [ "$(wc -l < "$plan" | tr -d ' ')" -ne 384 ]; then
  echo "$(date -u +%FT%TZ) runner-stop reason=formal-plan"
  exit 3
fi

echo "$(date -u +%FT%TZ) runner-start sourceSHA256=$source_sha256 batchSize=$batch_size accepted=$(result_count) ledgerUSD=$(ledger_total)"
batch=()
while IFS= read -r run_id; do
  if completed "$run_id"; then
    continue
  fi
  batch+=("$run_id")
  if [ "${#batch[@]}" -eq "$batch_size" ]; then
    run_batch "${batch[@]}"
    batch=()
  fi
done < <(bun -e 'for(const line of (await Bun.file(Bun.argv[1]).text()).trim().split(String.fromCharCode(10))) console.log(JSON.parse(line).id)' "$plan")
run_batch "${batch[@]}"

accepted=$(result_count)
if [ "$accepted" -ne 384 ]; then
  echo "$(date -u +%FT%TZ) runner-stop reason=incomplete accepted=$accepted ledgerUSD=$(ledger_total)"
  exit 7
fi
echo "$(date -u +%FT%TZ) runner-complete accepted=384 ledgerUSD=$(ledger_total)"
