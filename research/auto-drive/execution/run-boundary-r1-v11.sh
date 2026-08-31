#!/usr/bin/env bash

set -uo pipefail
umask 077

workspace=/root/autodrive-workspace-8b90c2f545
runtime=/root/autodrive-runtime-v114
artifact=/root/autodrive-artifacts/2026-08-31-v1.14-boundary-r1
source_archive="$runtime/autodrive-source-8b90c2f545.tar.gz"
source_sha256=b2a4108c66a6a3955315dd33286322917869a6f0c1f3d33d9947eb331dc929e5
preflight="$artifact/preflight/receipt.json"
ledger="$artifact/boundary/ledger.jsonl"
results="$artifact/boundary/trajectories.jsonl"
exclusions="$artifact/boundary/exclusions"
log="$artifact/orchestration/runner-v11.log"
plan="$workspace/research/auto-drive/protocol/boundary-run-plan.jsonl"
docker_storage=/dev/shm/autodrive-docker2-data
deadline_run=adr_b3d88e11dc363b8e221f
deadline_receipt="$artifact/failures/$deadline_run/reconciled-attempt-1.json"
deadline_receipt_sha256=67996df4f1c2fc605e5b45bd0b95e6f7225be39a597dd28bd6995970bbcd01ab
deadline_exclusion="$exclusions/$deadline_run.json"
deadline_exclusion_sha256=325d7f011b8d2da0f4bde24d22193cb281eca56c88094d40fc29cb710eb70841
preflight_cost=0.0900565
hard_budget=102
per_run_ceiling=1.0625

mkdir -p "$artifact/orchestration"
chmod 700 "$artifact/orchestration"
exec >>"$log" 2>&1

export PATH="$runtime/bin:$PATH"
export DOCKER_HOST=unix:///run/autodrive-docker2.sock
export AUTODRIVE_DOCKER_EGRESS_NETWORK=autodrive-egress
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

docker_info=$(docker info --format "{{.Driver}} {{.DockerRootDir}}")
if [ "$docker_info" != "overlay2 $docker_storage" ]; then
  echo "$(date -u +%FT%TZ) runner-stop reason=docker-storage expected=overlay2,$docker_storage actual=$docker_info"
  exit 14
fi
if [ "$(docker network inspect "$AUTODRIVE_DOCKER_EGRESS_NETWORK" --format '{{.Driver}} {{.Internal}}')" != "bridge false" ]; then
  echo "$(date -u +%FT%TZ) runner-stop reason=docker-egress-network network=$AUTODRIVE_DOCKER_EGRESS_NETWORK"
  exit 15
fi

if [ "$(sha256sum "$deadline_receipt" | awk '{print $1}')" != "$deadline_receipt_sha256" ]; then
  echo "$(date -u +%FT%TZ) runner-stop reason=deadline-receipt-hash runID=$deadline_run"
  exit 16
fi
if [ "$(sha256sum "$deadline_exclusion" | awk '{print $1}')" != "$deadline_exclusion_sha256" ] ||
  [ "$(jq -r .classification "$deadline_exclusion")" != excluded-charged-evaluation-failure ] ||
  [ "$(jq -r .costUSD "$deadline_exclusion")" != 0.2213475 ]; then
  echo "$(date -u +%FT%TZ) runner-stop reason=deadline-exclusion runID=$deadline_run"
  exit 17
fi

echo "$(date -u +%FT%TZ) runner-resume commit=8b90c2f545 sourceSHA256=$source_sha256 dockerStorage=$docker_storage reconciledRun=$deadline_run concurrency=1 accepted=$(result_count) excluded=$(exclusion_count) ledgerUSD=$(ledger_total)"

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

  available_kb=$(df --output=avail -k "$docker_storage" | tail -1 | tr -d ' ')
  if [ "$available_kb" -lt 52428800 ]; then
    echo "$(date -u +%FT%TZ) runner-stop reason=disk availableKB=$available_kb storage=$docker_storage"
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
