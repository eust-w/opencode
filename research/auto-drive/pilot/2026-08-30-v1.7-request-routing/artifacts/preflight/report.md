# AutoDrive v1.7 Gateway Canary Preflight

Captured: 2026-08-30 06:25:24 Asia/Shanghai

Scope: canary only

Protocol: `auto-drive-swe-evo-v1.7`

## Decision

The gateway is accepted for one primary-model compatibility canary with a USD 5 per-run cap. All frozen models remained present and the credential was unblocked at capture.

A bounded OpenAI Responses probe with `reasoning: {"effort":"low"}` returned HTTP 200, terminal status `completed`, both reasoning and message output items, and complete usage of 100 input and 27 output tokens. The task canary must still prove that OpenCode materializes the same normalized reasoning field; absence of that field is an immediate abort condition.

The accepted v1.6 DVC negative pilot remains immutable and excluded from continuation-policy treatment estimates because it failed before any controller boundary. Version 1.7 is a new protocol with regenerated run IDs, not a rerun of the v1.6 configuration.
