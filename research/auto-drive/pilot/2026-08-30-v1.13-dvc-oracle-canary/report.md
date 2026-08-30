# AutoDrive v1.13 DVC Oracle Canary

## Classification

Accepted paid canary under `auto-drive-swe-evo-v1.13`. The trajectory and pilot ledger entry passed the frozen provenance and artifact verifier. It is eligible for the four-strategy canary ablation, but it has not been copied into the 384-row formal matrix results or formal cost ledger.

## Result

The first safe boundary had an empty patch and failed the single frozen fail-to-pass test, while all eight pass-to-pass tests passed. It was unresolved with Fix Rate 0.

The oracle policy invoked the frozen external grader for the first unique empty patch. Four later boundaries produced the identical empty patch, so the executor reused the grade by patch SHA instead of rerunning the grader. The policy admitted all five allowed continuations. Only the sixth and final boundary produced a 1,470-byte patch. A second unique grade passed the one fail-to-pass and all eight pass-to-pass tests, producing `resolved=true` and Fix Rate 1.0. No continuation was unsafe and no controller request was issued.

On this one task and attempt, oracle continuation did not stop earlier than blind continuation: both required the maximum five continuations and had four redundant segments. Oracle also consumed more worker tokens and had higher measured cost and latency. This is a useful negative canary outcome, not a claim that the oracle policy is generally worse; worker trajectories differ even at temperature zero, and the planned paired repetitions are required for inference.

## Grader behavior

At the first unique grade, the frozen test patch applied normally. At the final unique grade, the model patch already contained every frozen test-patch hunk, so the v1.13 executor recorded `already-applied` after a complete reverse check. First-boundary and final summary grades reused these already-computed results rather than launching additional containers.

The frozen SWE-EVO grade is based on one F2P and eight P2P tests. The retained broad diagnostic suite reported 2,158 passed / 383 failed / 1 error at the first boundary and 2,159 passed / 382 failed / 1 error at the final boundary. Those historical-image failures include dependency and environment incompatibilities and are non-gating; the run is not represented as a clean full-suite pass.

## Usage and integrity

All 36 worker requests returned HTTP 200 with complete usage. They consumed 490,042 prompt tokens and 15,633 completion tokens. Provider spend rose from USD 0.9990123 to USD 1.5655572, exactly matching the trajectory and pilot ledger cost of USD 0.5665449. End-to-end latency was 1,173,062 ms (about 19.55 minutes).

The sanitized archive contains 124 tar entries and 94 files, is 1,646,256 bytes, and has SHA-256 `bdcafd37bd0d78fd3b8ffb0b0f0bff46fd30da31b97fa0074cb9c14371d94876`. Remote exact-key and local credential-pattern scans were clean. Session databases and workspace snapshots were excluded. The local verifier accepted the run ID, task, strategy, model versions, image and base commit, preflight receipt, canonical request hashes, trace, and model metadata. No matching experiment container or process remained after completion.
