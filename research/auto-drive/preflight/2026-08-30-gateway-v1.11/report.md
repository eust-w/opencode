# AutoDrive v1.11 Gateway Canary Preflight

Captured: 2026-08-30 07:46:12 Asia/Shanghai

Scope: canary only

Protocol: `auto-drive-swe-evo-v1.11`

## Decision

The gateway is accepted for one DeepSeek primary-worker / Qwen supervisor canary with a USD 5 per-run cap. All four frozen models were present in the live catalog. The credential was unblocked at capture, with cumulative spend USD 4.2203636. The provider exposed no account budget, RPM, TPM, or parallel-request limit, so this receipt does not authorize the full 384-run matrix.

The fresh worker Responses probe used temperature zero, low reasoning effort, and the frozen 4,096 output cap. It returned HTTP 200, status `completed`, reasoning and message output items, and complete 8-input / 11-output usage.

The fresh controller Chat Completions probe used the production `AutoDrive.buildSupervisorPrompt`, temperature zero, no tools, and the 1,024 output cap. It returned HTTP 200 with complete 434-prompt / 230-completion usage. The production parser decoded the response as `continue` with a non-empty reason and next prompt.

Protocol v1.11 changes only the host-side controller-release polling implementation and adds a delayed-file regression test. Worker/controller prompts and provider requests remain unchanged; no v1.10 run ID is eligible for reuse.
