#!/usr/bin/env bash

set -euo pipefail
umask 077

runner_pid=${AUTODRIVE_BOUNDARY_RUNNER_PID:?AUTODRIVE_BOUNDARY_RUNNER_PID is required}
artifact=${AUTODRIVE_EVAL_ARTIFACT_ROOT:?AUTODRIVE_EVAL_ARTIFACT_ROOT is required}
log="$artifact/orchestration/post-boundary-watch-r1.log"
results="$artifact/boundary/trajectories.jsonl"
exclusions="$artifact/boundary/exclusions"
candidates=${AUTODRIVE_BOUNDARY_CANDIDATES:?AUTODRIVE_BOUNDARY_CANDIDATES is required}

mkdir -p "$artifact/orchestration"
chmod 700 "$artifact/orchestration"
exec >>"$log" 2>&1
echo "$(date -u +%FT%TZ) watcher-start runnerPID=$runner_pid"

while kill -0 "$runner_pid" 2>/dev/null; do
  sleep 60
done

accepted=$(wc -l < "$results" | tr -d ' ')
excluded=$(find "$exclusions" -maxdepth 1 -type f -name '*.json' | wc -l | tr -d ' ')
if [ $((accepted + excluded)) -ne 96 ]; then
  echo "$(date -u +%FT%TZ) watcher-stop reason=incomplete-source accepted=$accepted excluded=$excluded"
  exit 2
fi

for _attempt in $(seq 1 120); do
  if [ -s "$candidates" ]; then
    echo "$(date -u +%FT%TZ) watcher-handoff accepted=$accepted excluded=$excluded candidates=$(wc -l < "$candidates" | tr -d ' ')"
    bash "$AUTODRIVE_WORKSPACE/research/auto-drive/execution/run-post-boundary-r1.sh"
    echo "$(date -u +%FT%TZ) watcher-complete"
    exit 0
  fi
  sleep 60
done

echo "$(date -u +%FT%TZ) watcher-stop reason=finalizer-timeout"
exit 3
