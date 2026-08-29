# Accepted v1.6 DVC provider-failure canary

Date: 2026-08-30 (Asia/Shanghai)

Protocol: `auto-drive-swe-evo-v1.6`

Run: `adr_e70cd0fbb67c31ceaa7c`

Task: `iterative__dvc_2.21.1_2.21.2`

Worker and controller model: `d-robotics/qwen3.8-max`

Strategy: `supervisor`

## Accepted outcome

The paid canary produced a schema-v3 trajectory that passed request, preflight, model-metadata, environment, trace, and artifact-hash verification. It is a failed task outcome rather than an infrastructure rerun:

- Status: `failed`
- Failure: `retryable-provider`
- Resolved: false
- Fix Rate: 0
- First-boundary Fix Rate: 0
- Automatic continuations: 0
- Worker requests: 6
- Controller requests: 0
- Observed token lower bound: 27,788 prompt and 897 completion tokens
- Usage complete: false
- Settled account cost: USD 0.59344
- End-to-end latency: 509,541 ms

Five Responses streams completed with token usage. The sixth returned HTTP 200 but ended after 157,223 bytes of reasoning deltas without a terminal response or usage. The executor detected five seconds of idle state without a pending controller or AutoDrive action, classified the provider failure, captured an empty patch, and ran the frozen SWE-EVO verifier.

The verifier reported 2,156 passed, 385 failed, 14 skipped, 9 xfailed, 2 xpassed, and 1 collection/runtime error over the full suite. The benchmark's frozen FAIL_TO_PASS/PASS_TO_PASS rule gave `resolved=false, fixRate=0`; the aggregate pytest counts are diagnostic and are not substituted for the official task grade.

## Integrity

- Remote secret scan: passed over 30 files
- Local exact-key scan: passed
- Local trajectory artifact verification: passed
- Remaining experiment containers and networks: 0
- Remote export archive SHA-256: `3041af3249fb8c7b10b792b840d98f4f362aa5771aa00d10ffbff8b7df728121`

The runtime database and disposable Git snapshot were excluded from the checked-in copy. The accepted trajectory, ledger, normalized requests, raw provider responses, proxy trace, task trace, patch, grader log, and sealed preflight are retained under `artifacts/`.

## Interpretation

This pilot does not estimate AutoDrive's treatment effect because the worker failed before the first controller boundary. It is evidence that gateway/provider compatibility is a material threat to the planned model matrix. Bulk qwen execution remains paused until a canary reaches a real controller boundary or the protocol explicitly treats this provider behavior as a primary failure mode.
