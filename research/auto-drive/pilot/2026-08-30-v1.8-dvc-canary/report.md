# AutoDrive v1.8 DVC Paid Canary

## Classification

Accepted negative paid canary. It is a valid provider-failure task outcome under protocol v1.8, but it contains no AutoDrive controller boundary and therefore is not continuation-policy or boundary-ablation evidence.

## Result

Run `adr_6288478d42f39e0215e1` used `d-robotics/qwen3.8-max` for both worker and supervisor on `iterative__dvc_2.21.1_2.21.2`. The first and sixth normalized worker requests both contained `reasoning: {"effort":"low"}`. Five tool-bearing responses completed with usage; the sixth forced tool-free response emitted 165,222 bytes of reasoning deltas without a terminal completion or complete usage.

The bounded executor classified the run as `retryable-provider`, captured an empty patch, and ran the official task grader. The outcome was unresolved with Fix Rate 0 and first-boundary Fix Rate 0. The grader reported 2,156 passed, 385 failed, 14 skipped, 9 xfailed, 2 xpassed, and 1 error in 391.02 seconds. No controller request or continuation was issued.

Observed complete-usage lower bounds were 20,791 prompt and 499 completion tokens. Settled cost was USD 0.1333632 and end-to-end latency was 499,420 ms. The CLI verified the frozen run, task image, base commit, model/preflight metadata, every normalized request and raw trace hash before accepting the trajectory and ledger row.

## Interpretation

Protocol v1.8 proves that the low-reasoning option reaches the real gateway request, but the qwen worker still cannot reliably terminate the long-context no-tool boundary. This is provider/model compatibility evidence, not an AutoDrive treatment result. The next qualification step replays the exact sixth-turn context with bounded output across all three frozen gateway workers before selecting a compatible primary worker or stopping the matrix.

The sanitized artifact set is stored under `artifacts/`; the remote export archive has SHA-256 `88530a500a07288f349d0f68b02bbbcb064aec0a79eb0a1c30f5896dfd843112`.
