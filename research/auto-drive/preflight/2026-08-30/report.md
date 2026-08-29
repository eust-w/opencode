# AutoDrive execution readiness

Date: 2026-08-30 (Asia/Shanghai)  
Protocol: `auto-drive-swe-evo-v1.2`  
Status: **BLOCKED before provider dispatch**

## Implemented acceptance gates

- Trajectory schema v2 records every worker and controller request in a contiguous ordered manifest.
- Each normalized request is canonicalized and its SHA-256 is recomputed by the host harness.
- Model metadata, preflight receipt, and raw trace files are read and re-hashed before either the result or cost ledger entry is appended.
- Run ID, task image/base commit, strategy, repeat, logical model, exact resolved model version, and preflight metadata hash must match the frozen plan.
- The executor is forced to set `OPENCODE_DISABLE_EXTERNAL_SKILLS=1`, `OPENCODE_DISABLE_CLAUDE_CODE_SKILLS=1`, `OPENCODE_DISABLE_MODELS_FETCH=1`, and a pinned `OPENCODE_MODELS_PATH`.

## Current host readiness

| Gate                         | Observation                                                            | Result  |
| ---------------------------- | ---------------------------------------------------------------------- | ------- |
| Google credential            | No Google key in the current environment or OpenCode auth store        | Blocked |
| Google billing/quota         | Sealed pilot evidence identifies the 20-request free tier              | Blocked |
| Anthropic credential         | No direct credential in the current environment or OpenCode auth store | Blocked |
| OpenAI credential            | No direct credential in the current environment or OpenCode auth store | Blocked |
| Model metadata               | Required entries resolved and reduced to a 5,050-byte snapshot         | Passed  |
| External discovery isolation | Forced by the host harness                                             | Passed  |
| Host-executor dry-run        | Contract artifacts accepted at USD 0; formal outputs remained absent   | Passed  |
| Paid six-step canary         | Not dispatched because credential/quota gates failed                   | Not run |

The metadata snapshot SHA-256 is `103c8aa7b7f6544c5d6c6d4165b9b1cd3d40ecad7579625db2e9c624be2d15a7`. It resolves the frozen logical Anthropic name `anthropic/claude-sonnet-4.6` to the current catalog key `claude-sonnet-4-6` without silently changing the preregistered worker name.

The dry-run validates only the process, isolation, and artifact envelope. It uses the explicit synthetic version `dry-run-contract-v1` and is not trajectory or ablation evidence.

This directory intentionally contains no passing paid preflight receipt. A receipt may be created only after provider-specific paid probes record exact model versions and enough trajectory capacity. Until then, both the paid canary and the 384-run matrix remain disabled.
