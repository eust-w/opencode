# AutoDrive v1.8 Gateway Canary Preflight

Captured: 2026-08-30 06:38:44 Asia/Shanghai

Scope: canary only

Protocol: `auto-drive-swe-evo-v1.8`

## Decision

The gateway is accepted for one primary-model compatibility canary with a USD 5 per-run cap. All frozen models remained present and the credential was unblocked at capture.

A fresh bounded OpenAI Responses probe with `reasoning: {"effort":"low"}` returned HTTP 200, terminal status `completed`, both reasoning and message output items, and complete usage of 100 input and 29 output tokens. Version 1.8 routes this exact field through the V2 worker model request. The task canary must prove its first normalized body contains the field before execution may continue.

The v1.7 routing canary remains excluded and auditable under `research/auto-drive/pilot/2026-08-30-v1.7-request-routing`. Its charged run ID is not reused.
