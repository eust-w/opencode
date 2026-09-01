#!/usr/bin/env bash

set -euo pipefail
umask 077

workspace=${AUTODRIVE_WORKSPACE:?AUTODRIVE_WORKSPACE is required}
runtime=${AUTODRIVE_RUNTIME:?AUTODRIVE_RUNTIME is required}
artifact=${AUTODRIVE_EVAL_ARTIFACT_ROOT:?AUTODRIVE_EVAL_ARTIFACT_ROOT is required}
runner_pid=${AUTODRIVE_BOUNDARY_RUNNER_PID:?AUTODRIVE_BOUNDARY_RUNNER_PID is required}
results="$artifact/boundary/trajectories.jsonl"
exclusions="$artifact/boundary/exclusions"
output="$artifact/annotations/candidates.jsonl"
log="$artifact/orchestration/boundary-finalizer-r1.log"

mkdir -p "$artifact/annotations" "$artifact/orchestration"
chmod 700 "$artifact/annotations" "$artifact/orchestration"
exec >>"$log" 2>&1
export PATH="$runtime/bin:$PATH"

echo "$(date -u +%FT%TZ) finalizer-start runnerPID=$runner_pid"
for _poll in $(seq 1 1440); do
  if ! kill -0 "$runner_pid" 2>/dev/null; then
    break
  fi
  sleep 30
done
if kill -0 "$runner_pid" 2>/dev/null; then
  echo "$(date -u +%FT%TZ) finalizer-stop reason=runner-timeout"
  exit 2
fi

accepted=0
[ -f "$results" ] && accepted=$(wc -l < "$results" | tr -d ' ')
excluded=0
[ -d "$exclusions" ] && excluded=$(find "$exclusions" -maxdepth 1 -name '*.json' | wc -l | tr -d ' ')
completed=$((accepted + excluded))
if [ "$completed" -ne 96 ]; then
  echo "$(date -u +%FT%TZ) finalizer-stop reason=incomplete accepted=$accepted excluded=$excluded completed=$completed"
  exit 3
fi

cd "$workspace/packages/autodrive-eval" || exit 4
bun src/cli.ts annotations-extract \
  --results "$results" \
  --artifact-root "$artifact" \
  --output "$output"
boundaries=$(wc -l < "$output" | tr -d ' ')
sha256=$(sha256sum "$output" | awk '{print $1}')
echo "$(date -u +%FT%TZ) finalizer-complete accepted=$accepted excluded=$excluded boundaries=$boundaries candidatesSHA256=$sha256"
