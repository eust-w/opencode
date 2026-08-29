# AutoDrive v1.4 Gateway Canary Preflight

Captured: 2026-08-30 05:42:45 Asia/Shanghai

Scope: canary only

Protocol: `auto-drive-swe-evo-v1.4`

## Decision

The D-Robotics gateway remains accepted for exactly one primary-model canary trajectory. Live catalog checks resolved all three frozen model IDs, `/key/info` reported the credential as unblocked, and the local proxy retains a USD 5 fail-closed cap. This receipt does not authorize the full 384-run matrix.

The v1.4 worker transport is OpenAI Responses. A direct structured-tool probe returned HTTP 200 with `status=completed`, a function name, a call ID, and JSON arguments. The tool-free supervisor remains on Chat Completions. The DVC trajectory is accepted only if the task runtime independently validates both configured models, preserves every normalized request and response usage record, and passes artifact verification.

The model cache is identical to the hash-sealed v1.3 runtime-compatible cache. It is copied into this receipt directory so artifact verification remains self-contained and cannot escape the preflight root.

## Exclusion boundary

The charged v1.3 Chat transport failure remains an excluded engineering canary. It produced no tool execution, code change, controller decision, accepted trajectory, or accepted ledger row and is documented under `research/auto-drive/pilot/2026-08-30-v1.3-chat-transport`.
