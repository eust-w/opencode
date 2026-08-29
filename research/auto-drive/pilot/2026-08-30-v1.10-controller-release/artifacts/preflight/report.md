# AutoDrive v1.10 Gateway Canary Preflight

Captured: 2026-08-30 07:27:10 Asia/Shanghai

Scope: canary only

Protocol: `auto-drive-swe-evo-v1.10`

## Decision

The gateway is accepted for one DeepSeek primary-worker / Qwen supervisor canary with a USD 5 per-run cap. The primary, both replication candidates, and controller were present in the live catalog. The credential was unblocked at capture, with cumulative spend USD 4.1587427. The provider exposed no account budget, RPM, TPM, or parallel-request limit, so this receipt does not authorize the full 384-run matrix.

The fresh worker Responses probe used temperature zero, low reasoning effort, and the frozen 4,096 output cap. It returned HTTP 200, status `completed`, reasoning and message output items, and complete 8-input / 11-output usage.

The fresh controller Chat Completions probe used the production `AutoDrive.buildSupervisorPrompt`, temperature zero, no tools, and the 1,024 output cap. It returned HTTP 200 with complete 434-prompt / 321-completion usage. The production parser decoded the response as `continue` with a non-empty reason and next prompt.

The real-context qualification selecting the worker matrix remains auditable under `research/auto-drive/pilot/2026-08-30-terminal-context-qualification`. Protocol v1.10 changes only gateway worker output normalization; no v1.9 run ID is eligible for reuse.
