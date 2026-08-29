# AutoDrive v1.9 Gateway Canary Preflight

Captured: 2026-08-30 07:10:45 Asia/Shanghai

Scope: canary only

Protocol: `auto-drive-swe-evo-v1.9`

## Decision

The gateway is accepted for one DeepSeek primary-worker / qwen supervisor canary with a USD 5 per-run cap. The primary, both replication candidates, and controller remained present in the live catalog; the credential was unblocked at capture.

The fresh worker Responses probe used temperature zero, low reasoning effort, and the frozen 4,096 output cap. It returned HTTP 200, status `completed`, reasoning and message output items, and complete 12-input / 13-output usage.

The fresh controller Chat Completions probe used the production `AutoDrive.buildSupervisorPrompt`, temperature zero, and 1,024 output cap. It returned HTTP 200 with complete 376-prompt / 165-completion usage. The production parser decoded the response as `continue` with a non-empty reason. Canary preflight now requires both worker and controller model receipts; controller identity is no longer inferred from the worker.

The real-context qualification selecting the v1.9 matrix remains auditable under `research/auto-drive/pilot/2026-08-30-terminal-context-qualification`.
