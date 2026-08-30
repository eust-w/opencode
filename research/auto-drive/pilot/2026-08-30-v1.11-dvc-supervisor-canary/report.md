# AutoDrive v1.11 DVC Supervisor Canary

## Classification

Accepted paid pilot trajectory and pilot ledger row. It is the first real end-to-end AutoDrive trajectory accepted by the frozen gateway harness. Its two boundaries are candidates for later human annotation, but neither is counted in the frozen 180-boundary corpus yet. This single run is not a policy-effectiveness claim or a formal 384-run matrix result.

## Result

The real `deepseek-v4-pro` worker executed two six-step segments on SWE-EVO task `iterative__dvc_2.21.1_2.21.2`. At the first safe boundary, the real `qwen3.8-max` supervisor returned `continue`, supplied an actionable next prompt, and updated Session memory. The decision was persisted before the generated queue input was admitted; the input source retained the chain ID, `continue` decision, and continuation number. The worker then resumed without manual input.

The second supervisor request exceeded the 15-second controller deadline. AutoDrive therefore persisted the frozen regex fallback `stop`; the upstream supervisor eventually returned `continue` after 72.927 seconds, but that late result was not applied. This is a genuine timeout/fallback observation, not a successful second supervisor decision.

No code patch was produced at either boundary or at the end. The task remained unresolved with fix rate 0. The first/final patch grader reported 2,156 passed, 385 failed, 14 skipped, 9 xfailed, 2 xpassed, and 1 error; the target fail-to-pass test `tests/func/api/test_params.py::test_params_show_untracked_target` remained failing while all eight pass-to-pass tests passed. The second segment attempted unavailable network-dependent environment setup and did not turn the safe continuation into a fix, so it is counted as one redundant turn.

## Usage and cost

- 12 worker requests: 80,103 prompt tokens and 3,066 completion tokens.
- 2 controller requests: 1,708 prompt tokens and 2,773 completion tokens.
- Total: 81,811 prompt tokens, 5,839 completion tokens, USD 0.3536985, and 505,033 ms end-to-end latency.
- All 14 provider responses returned HTTP 200 with complete usage; the proxy recorded two controller holds, two releases, and zero proxy errors.

## Interpretation

This run validates the claimed mechanism at one real boundary: location-scoped supervision, persisted three-state decision state, chain-aware automatic queue admission, Session memory, and automatic continuation all operated together. It does not validate task-success improvement. Instead it exposes two costs that the ablation must quantify: an unproductive extra segment under an unsuitable task environment, and a supervisor latency tail that triggered fallback despite a later `continue` answer.

The sanitized artifact excludes Session databases and workspace snapshots. The remote exact-secret scan and local secret-prefix scan both found zero matches. The export archive contains 77 entries, is 544,685 bytes, and has SHA-256 `8170f6456fd28bad09e38f6e9d492149d6a4cbf208f647e742120a9fb92a68f3`.
