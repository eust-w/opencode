#!/usr/bin/env bash

set -uo pipefail
umask 077

batch_size=2
workspace=${AUTODRIVE_WORKSPACE:?AUTODRIVE_WORKSPACE is required}
runtime=${AUTODRIVE_RUNTIME:?AUTODRIVE_RUNTIME is required}
artifact=${AUTODRIVE_EVAL_ARTIFACT_ROOT:?AUTODRIVE_EVAL_ARTIFACT_ROOT is required}
preflight=${AUTODRIVE_BOUNDARY_AUGMENTATION_PREFLIGHT:?AUTODRIVE_BOUNDARY_AUGMENTATION_PREFLIGHT is required}
candidates=${AUTODRIVE_BOUNDARY_CANDIDATES:?AUTODRIVE_BOUNDARY_CANDIDATES is required}
source_archive=${AUTODRIVE_SOURCE_ARCHIVE:?AUTODRIVE_SOURCE_ARCHIVE is required}
source_sha256=${AUTODRIVE_SOURCE_SHA256:?AUTODRIVE_SOURCE_SHA256 is required}
plan="$workspace/research/auto-drive/protocol/boundary-augmentation-plan.jsonl"
results="$artifact/boundary/trajectories.jsonl"
ledger="$artifact/boundary/ledger.jsonl"
exclusions="$artifact/boundary/exclusions"
log="$artifact/orchestration/boundary-augmentation-r1.log"

mkdir -p "$artifact/orchestration" "$artifact/boundary"
chmod 700 "$artifact/orchestration" "$artifact/boundary"
exec >>"$log" 2>&1
export PATH="$runtime/bin:$PATH"

ledger_total() {
  LEDGER_PATH="$ledger" bun -e 'const file=Bun.file(Bun.env.LEDGER_PATH); if(!(await file.exists())){console.log(0);process.exit(0)} const rows=(await file.text()).trim().split(String.fromCharCode(10)).filter(Boolean).map(JSON.parse); console.log(rows.reduce((sum,row)=>sum+Number(row.amountUSD),0))'
}

completed() {
  local run_id=$1
  { [ -f "$results" ] && grep -q "\"runID\":\"$run_id\"" "$results"; } || [ -f "$exclusions/$run_id.json" ]
}

disposition_count() {
  local count=0
  local run_id
  while IFS= read -r run_id; do
    if completed "$run_id"; then
      count=$((count + 1))
    fi
  done < <(bun -e 'for(const line of (await Bun.file(Bun.argv[1]).text()).trim().split(String.fromCharCode(10))) console.log(JSON.parse(line).id)' "$plan")
  echo "$count"
}

run_batch() {
  if [ "$#" -eq 0 ]; then
    return
  fi
  local args=()
  local run_id
  for run_id in "$@"; do
    if [ -f "$artifact/failures/$run_id/attempt-1.json" ]; then
      echo "$(date -u +%FT%TZ) runner-stop reason=pending-failure-receipt runID=$run_id"
      exit 5
    fi
    args+=(--run-id "$run_id")
  done
  echo "$(date -u +%FT%TZ) batch-start runs=$* dispositions=$(disposition_count) ledgerUSD=$(ledger_total)"
  cd "$workspace/packages/autodrive-eval" || exit 4
  if ! bun src/cli.ts boundary-run --augmentation --execute \
    --executor scripts/gateway-host-executor.ts \
    --preflight "$preflight" \
    --artifact-root "$artifact" \
    "${args[@]}"; then
    echo "$(date -u +%FT%TZ) runner-stop reason=batch-failed runs=$* dispositions=$(disposition_count) ledgerUSD=$(ledger_total)"
    exit 6
  fi
  echo "$(date -u +%FT%TZ) batch-complete runs=$* dispositions=$(disposition_count) ledgerUSD=$(ledger_total)"
}

actual_source_sha256=$(sha256sum "$source_archive" | awk '{print $1}')
if [ "$actual_source_sha256" != "$source_sha256" ]; then
  echo "$(date -u +%FT%TZ) runner-stop reason=source-hash expected=$source_sha256 actual=$actual_source_sha256"
  exit 2
fi
if [ ! -f "$plan" ] || [ "$(wc -l < "$plan" | tr -d ' ')" -ne 48 ]; then
  echo "$(date -u +%FT%TZ) runner-stop reason=augmentation-plan"
  exit 3
fi
if [ ! -f "$candidates" ]; then
  echo "$(date -u +%FT%TZ) runner-stop reason=missing-final-candidates"
  exit 8
fi
candidate_count=$(wc -l < "$candidates" | tr -d ' ')
if [ "$candidate_count" -ge 180 ]; then
  echo "$(date -u +%FT%TZ) runner-not-needed candidates=$candidate_count"
  exit 0
fi

echo "$(date -u +%FT%TZ) runner-start trigger=initial-candidates-below-180 candidates=$candidate_count sourceSHA256=$source_sha256 batchSize=$batch_size dispositions=$(disposition_count) ledgerUSD=$(ledger_total)"
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

dispositions=$(disposition_count)
if [ "$dispositions" -ne 48 ]; then
  echo "$(date -u +%FT%TZ) runner-stop reason=incomplete dispositions=$dispositions ledgerUSD=$(ledger_total)"
  exit 7
fi
echo "$(date -u +%FT%TZ) runner-complete dispositions=48 ledgerUSD=$(ledger_total)"
