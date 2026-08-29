# Excluded v1.3 Chat transport canary

Date: 2026-08-30 (Asia/Shanghai)

Protocol: `auto-drive-swe-evo-v1.3`

Task: `iterative__dvc_2.21.1_2.21.2`

Historical run ID: `adr_7f0339648ba7afdd4efb`

## Outcome

The gateway returned HTTP 200 for one metered `qwen3.8-max` worker request. The streamed Chat Completions response contained a tool-call delta without the ID or name required by the AI SDK, so OpenCode rejected it before any tool execution, repository modification, controller request, or boundary decision.

This canary is excluded from end-to-end and boundary results. No trajectory or cost-ledger row was accepted, and the same v1.3 configuration is not retried. Version 1.4 changes only the worker transport to OpenAI Responses and regenerates all deterministic run IDs.

## Preserved evidence

- Normalized request SHA-256: `b06b37eab1273e9371c65c2afbaad29efd50850f0daea855cda10caa3c1269a2`
- Provider status: HTTP 200
- Reported usage: 2,898 prompt tokens and 149 completion tokens
- Request rows: 1
- Proxy trace rows: 2
- Worker tool executions: 0
- Controller requests: 0
- Accepted experimental trajectories: 0
- Accepted ledger rows: 0

The immediate account-spend observation increased from USD 2.5027573 to USD 2.6663893. Because gateway billing may settle asynchronously, the USD 0.163632 difference is retained as an observed account delta and is not asserted as the exact attributable cost of this request.
