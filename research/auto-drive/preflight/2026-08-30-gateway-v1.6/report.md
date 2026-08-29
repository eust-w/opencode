# AutoDrive v1.6 Gateway Canary Preflight

Captured: 2026-08-30 06:02:03 Asia/Shanghai

Scope: canary only

Protocol: `auto-drive-swe-evo-v1.6`

## Decision

The gateway is accepted for one primary-model canary with a USD 5 per-run cap. All frozen models remained present and the credential was unblocked at capture.

Version 1.6 does not retry the historical v1.5 ID. It adds a five-second idle-without-decision failure boundary, captures and grades any partial patch, and records incomplete usage as an explicit observed lower bound on failed trajectories. Provider errors remain failed task outcomes, not infrastructure reruns.

The v1.3 through v1.5 canaries remain excluded and auditable under `research/auto-drive/pilot`. No result has yet entered the frozen end-to-end or boundary data tables.
