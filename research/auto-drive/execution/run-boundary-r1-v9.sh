#!/usr/bin/env bash

set -uo pipefail
umask 077

workspace=/root/autodrive-workspace-5121011501
runtime=/root/autodrive-runtime-v114
artifact=/root/autodrive-artifacts/2026-08-31-v1.14-boundary-r1
source_archive="$runtime/autodrive-source-5121011501.tar.gz"
source_sha256=56bd70642eb1c21cdbdf319e2a007e1d5efd69cc56a3ee597a9a397164a6ab6f
preflight="$artifact/preflight/receipt.json"
ledger="$artifact/boundary/ledger.jsonl"
results="$artifact/boundary/trajectories.jsonl"
exclusions="$artifact/boundary/exclusions"
log="$artifact/orchestration/runner-v9.log"
plan="$workspace/research/auto-drive/protocol/boundary-run-plan.jsonl"
overrun_run=adr_a56ba46d9f168054e1e0
retry_run=adr_e46155c850e8ff98cdc5
retry_receipt="$artifact/failures/$retry_run/attempt-2.json"
retry_receipt_sha256=09ccf1d6ea1ab56ccebc7c91fe81fc141d221ef597d55375e949fdd4bfe6d554
scanner_run=adr_bef8a5550d51cfbf9333
scanner_receipt="$artifact/failures/$scanner_run/attempt-1.json"
scanner_receipt_sha256=0a6c48bf89e6322d2efa64050b468f80a8a8453a3b67b16d83b26c32950dbffc
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

if [ ! -f "$exclusions/$overrun_run.json" ] || [ "$(jq -r .classification "$exclusions/$overrun_run.json")" != excluded-charged-budget-overrun ]; then
  echo "$(date -u +%FT%TZ) runner-stop reason=missing-budget-overrun-reconciliation runID=$overrun_run"
  exit 7
fi

actual_retry_receipt_sha256=$(sha256sum "$retry_receipt" | awk '{print $1}')
if [ "$actual_retry_receipt_sha256" != "$retry_receipt_sha256" ]; then
  echo "$(date -u +%FT%TZ) runner-stop reason=retry-receipt-hash runID=$retry_run expected=$retry_receipt_sha256 actual=$actual_retry_receipt_sha256"
  exit 8
fi

cd "$workspace/packages/autodrive-eval" || exit 4
echo "$(date -u +%FT%TZ) exclusion-reconcile-start runID=$retry_run receiptSHA256=$retry_receipt_sha256"
if ! bun src/cli.ts boundary-run --execute --executor scripts/gateway-host-executor.ts --preflight "$preflight" --artifact-root "$artifact" --run-id "$retry_run"; then
  echo "$(date -u +%FT%TZ) runner-stop reason=exclusion-reconciliation runID=$retry_run"
  exit 9
fi
if [ ! -f "$exclusions/$retry_run.json" ] || [ "$(jq -r .classification "$exclusions/$retry_run.json")" != excluded-charged-evaluation-failure ]; then
  echo "$(date -u +%FT%TZ) runner-stop reason=missing-retry-exclusion runID=$retry_run"
  exit 10
fi

actual_scanner_receipt_sha256=$(sha256sum "$scanner_receipt" | awk '{print $1}')
if [ "$actual_scanner_receipt_sha256" != "$scanner_receipt_sha256" ]; then
  echo "$(date -u +%FT%TZ) runner-stop reason=scanner-receipt-hash runID=$scanner_run expected=$scanner_receipt_sha256 actual=$actual_scanner_receipt_sha256"
  exit 11
fi
echo "$(date -u +%FT%TZ) exclusion-reconcile-start runID=$scanner_run receiptSHA256=$scanner_receipt_sha256"
if ! bun src/cli.ts boundary-reconcile-grader-scanner --artifact-root "$artifact" --run-id "$scanner_run"; then
  echo "$(date -u +%FT%TZ) runner-stop reason=scanner-exclusion-reconciliation runID=$scanner_run"
  exit 12
fi
if [ ! -f "$exclusions/$scanner_run.json" ] || [ "$(jq -r .classification "$exclusions/$scanner_run.json")" != excluded-charged-evaluation-failure ]; then
  echo "$(date -u +%FT%TZ) runner-stop reason=missing-scanner-exclusion runID=$scanner_run"
  exit 13
fi

echo "$(date -u +%FT%TZ) runner-resume commit=5121011501 sourceSHA256=$source_sha256 reconciledRuns=$retry_run,$scanner_run concurrency=1 accepted=$(result_count) excluded=$(exclusion_count) ledgerUSD=$(ledger_total)"

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

  echo "$(date -u +%FT%TZ) run-start runID=$run_id accepted=$(result_count) excluded=$(exclusion_count) ledgerUSD=$spent"
  cd "$workspace/packages/autodrive-eval" || exit 4
  if ! bun src/cli.ts boundary-run --execute --executor scripts/gateway-host-executor.ts --preflight "$preflight" --artifact-root "$artifact" --run-id "$run_id"; then
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
