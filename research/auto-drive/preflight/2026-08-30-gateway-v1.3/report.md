# AutoDrive v1.3 Gateway Canary Preflight

Captured: 2026-08-30 04:50:01 Asia/Shanghai

Scope: canary only
Protocol: `auto-drive-swe-evo-v1.3`

## Decision

The D-Robotics gateway is accepted for exactly one primary-model canary or pilot trajectory. It is not accepted for the full 384-run matrix because the sponsored credential exposes cumulative spend but no provider-confirmed maximum budget or trajectory capacity.

The catalog resolves `d-robotics/qwen3.8-max`, `d-robotics/deepseek-v4-pro`, and `d-robotics/glm-5.3`. The primary canary receipt seals only `d-robotics/qwen3.8-max`; replication models require their own live probes before dispatch.

## Full-system gate

The V2 engineering canary used one real worker request and one real controller request. Both returned HTTP 200. The host proxy fixed worker generation at `temperature=0,max_tokens=32000`, fixed controller generation at `temperature=0,max_tokens=1024`, verified both normalized request hashes, observed 3,555 total tokens, and measured a spend delta of USD 0.048564. The Session persisted `auto-drive.decided=STOP` with no continuation. Secret scans passed.

This canary is engineering evidence only. Its synthetic task and placeholder run ID are excluded from the SWE-EVO result and cost ledgers.
