#!/usr/bin/env bash

set -uo pipefail
umask 077

workspace=/root/autodrive-workspace-v114-f2cbb23f32
runtime=/root/autodrive-runtime-v114
artifact=/root/autodrive-artifacts/2026-08-31-v1.14-boundary-r1
source_archive="$runtime/autodrive-source-f2cbb23f32.tar.gz"
source_sha256=4023c37be567a89a6f6be8785645f492fa4def4c279ed4a4067988ddfd51ff17
preflight="$artifact/preflight/receipt.json"
ledger="$artifact/boundary/ledger.jsonl"
results="$artifact/boundary/trajectories.jsonl"
exclusions="$artifact/boundary/exclusions"
log="$artifact/orchestration/runner-v5.log"
plan="$workspace/research/auto-drive/protocol/boundary-run-plan.jsonl"
reconciled_run=adr_a56ba46d9f168054e1e0
retry_run=adr_e46155c850e8ff98cdc5
retry_receipt="$artifact/failures/$retry_run/attempt-1.json"
retry_receipt_sha256=35d0b51cab2e20ef528e3ebb7c7157d98d9fac3b1eb175aadb3d8c4fa575d8dc
preflight_cost=0.0900565
hard_budget=102
per_run_ceiling=1.0625

mkdir -p "$artifact/orchestration"
chmod 700 "$artifact/orchestration"
exec >>"$log" 2>&1

export PATH="$runtime/bin:$PATH"
export AUTODRIVE_GATEWAY_KEY_FILE=/root/autodrive-boundary-secrets/gateway-key
export AUTODRIVE_SOURCE_ROOT="$workspace"
export AUTODRIVE_OPENCODE_BINARY="$runtime/opencode"
export AUTODRIVE_OPENCODE_COMMIT=8b628aaff56b41efa3ca45742ca6f6a2343edd2e

ledger_total() {
  LEDGER_PATH="$ledger" bun -e 'const file=Bun.file(Bun.env.LEDGER_PATH); if(!(await file.exists())){console.log(0);process.exit(0)} const rows=(await file.text()).trim().split(String.fromCharCode(10)).filter(Boolean).map(JSON.parse); console.log(rows.reduce((sum,row)=>sum+Number(row.amountUSD),0))'
}

result_count() {
  RESULTS_PATH="$results" bun -e 'const file=Bun.file(Bun.env.RESULTS_PATH); if(!(await file.exists())){console.log(0);process.exit(0)} console.log((await file.text()).trim().split(String.fromCharCode(10)).filter(Boolean).length)'
}

exclusion_count() {
  EXCLUSIONS_PATH="$exclusions" bun -e 'const directory=Bun.env.EXCLUSIONS_PATH; const files=directory ? await Array.fromAsync(new Bun.Glob("*.json").scan({cwd:directory,onlyFiles:true})).catch(()=>[]) : []; console.log(files.length)'
}

actual_source_sha256=$(sha256sum "$source_archive" | awk '{print $1}')
if [ "$actual_source_sha256" != "$source_sha256" ]; then
  echo "$(date -u +%FT%TZ) runner-stop reason=source-hash expected=$source_sha256 actual=$actual_source_sha256"
  exit 1
fi

if [ ! -f "$exclusions/$reconciled_run.json" ] || [ "$(jq -r .classification "$exclusions/$reconciled_run.json")" != excluded-charged-budget-overrun ]; then
  echo "$(date -u +%FT%TZ) runner-stop reason=missing-budget-overrun-reconciliation runID=$reconciled_run"
  exit 7
fi

actual_retry_receipt_sha256=$(sha256sum "$retry_receipt" | awk '{print $1}')
if [ "$actual_retry_receipt_sha256" != "$retry_receipt_sha256" ]; then
  echo "$(date -u +%FT%TZ) runner-stop reason=retry-receipt-hash runID=$retry_run expected=$retry_receipt_sha256 actual=$actual_retry_receipt_sha256"
  exit 8
fi

echo "$(date -u +%FT%TZ) runner-resume commit=f2cbb23f32 sourceSHA256=$source_sha256 retryRun=$retry_run retryReceiptSHA256=$retry_receipt_sha256 concurrency=1 accepted=$(result_count) excluded=$(exclusion_count) ledgerUSD=$(ledger_total)"

while IFS= read -r run_id; do
  if { [ -f "$results" ] && grep -q "\"runID\":\"$run_id\"" "$results"; } || [ -f "$exclusions/$run_id.json" ]; then
    continue
  fi

  spent=$(ledger_total)
  remaining=$(PREFLIGHT_COST="$preflight_cost" HARD_BUDGET="$hard_budget" SPENT="$spent" bun -e 'console.log(Number(Bun.env.HARD_BUDGET)-Number(Bun.env.PREFLIGHT_COST)-Number(Bun.env.SPENT))')
  can_start=$(REMAINING="$remaining" CEILING="$per_run_ceiling" bun -e 'console.log(Number(Bun.env.REMAINING)>=Number(Bun.env.CEILING)?"yes":"no")')
  if [ "$can_start" != yes ]; then
    echo "$(date -u +%FT%TZ) runner-stop reason=budget remainingUSD=$remaining"
    exit 2
  fi

  available_kb=$(df --output=avail -k /var/lib/docker | tail -1 | tr -d ' ')
  if [ "$available_kb" -lt 52428800 ]; then
    echo "$(date -u +%FT%TZ) runner-stop reason=disk availableKB=$available_kb"
    exit 3
  fi

  retry_args=()
  if [ "$run_id" = "$retry_run" ]; then
    retry_args=(--resume-infrastructure)
  fi

  echo "$(date -u +%FT%TZ) run-start runID=$run_id accepted=$(result_count) excluded=$(exclusion_count) ledgerUSD=$spent retry=$([ ${#retry_args[@]} -eq 1 ] && echo yes || echo no)"
  cd "$workspace/packages/autodrive-eval" || exit 4
  if ! bun src/cli.ts boundary-run --execute "${retry_args[@]}" --executor scripts/gateway-host-executor.ts --preflight "$preflight" --artifact-root "$artifact" --run-id "$run_id"; then
    echo "$(date -u +%FT%TZ) runner-stop reason=run-failed runID=$run_id accepted=$(result_count) excluded=$(exclusion_count) ledgerUSD=$(ledger_total)"
    exit 5
  fi
  if [ -f "$results" ] && grep -q "\"runID\":\"$run_id\"" "$results"; then
    echo "$(date -u +%FT%TZ) run-accepted runID=$run_id accepted=$(result_count) excluded=$(exclusion_count) ledgerUSD=$(ledger_total)"
    continue
  fi
  if [ -f "$exclusions/$run_id.json" ]; then
    echo "$(date -u +%FT%TZ) run-excluded runID=$run_id accepted=$(result_count) excluded=$(exclusion_count) ledgerUSD=$(ledger_total)"
    continue
  fi
  echo "$(date -u +%FT%TZ) runner-stop reason=missing-settlement runID=$run_id"
  exit 6
done < <(bun -e 'for(const line of (await Bun.file(Bun.argv[1]).text()).trim().split(String.fromCharCode(10))) console.log(JSON.parse(line).id)' "$plan")

echo "$(date -u +%FT%TZ) runner-complete accepted=$(result_count) excluded=$(exclusion_count) ledgerUSD=$(ledger_total)"
