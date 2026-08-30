# AutoDrive v1.13 DVC Supervisor Canary

## Classification

Accepted paid canary under `auto-drive-swe-evo-v1.13`. The trajectory and pilot ledger entry passed the frozen provenance and artifact verifier. It is eligible for the four-strategy canary ablation, but it has not been copied into the 384-row formal matrix results or formal cost ledger.

## Result

The worker produced no patch during its first six-step segment and explicitly left reproduction, implementation, and testing unfinished. At that safe boundary the real supervisor returned `continue`, supplied an actionable next prompt, and updated Session memory. The decision was persisted before the generated queue input was admitted; the input source retained the chain ID, decision, and continuation number. The worker resumed without manual input.

The second six-step segment made additional static-analysis progress but still produced no patch. The second supervisor request eventually returned a valid `continue`, but it completed 16,839 ms after release and exceeded the frozen 15-second controller deadline. AutoDrive therefore persisted the preregistered regex fallback `stop: No continuation cues found`; the late answer and memory update were not applied.

The frozen grader failed the single fail-to-pass test and passed all eight pass-to-pass tests. The first boundary and final result were both unresolved with Fix Rate 0. The admitted continuation is counted as one redundant turn because the consecutive boundary patches were identical and empty. No continuation was unsafe.

This single canary verifies the full control mechanism but not task-success improvement: persisted three-state supervision, chain-aware automatic queue admission, Session memory, and autonomous continuation all operated together. It also exposes a real latency-tail failure in which the supervisor's semantic decision was correct but missed the systems deadline. The timeout is an accepted negative result and is not eligible for an infrastructure rerun.

## Grader behavior

The frozen test patch applied normally before grading. Because both boundaries and the final model patch were byte-identical empty files, the executor reused the first-boundary grade instead of launching duplicate containers.

The frozen SWE-EVO grade is based on one F2P and eight P2P tests. The retained broad diagnostic suite reported 2,158 passed / 383 failed / 1 error. Those historical-image failures include dependency and environment incompatibilities and are non-gating; the run is not represented as a clean full-suite pass.

## Usage and integrity

All 14 provider requests returned HTTP 200 with complete usage. Twelve worker requests consumed 89,132 prompt and 4,487 completion tokens; two controller requests consumed 1,683 prompt and 875 completion tokens. The executor reconciled USD 0.2836797 from its immediate pre/post-run settled-spend reads. Delayed settlement of the fresh preflight probes added USD 0.0137445 between the preflight capture and the executor baseline; this amount is disclosed separately and not charged to the trajectory. End-to-end latency was 532,908 ms (about 8.88 minutes), dominated by the real grader.

The sanitized archive contains 77 tar entries and 47 files, is 582,466 bytes, and has SHA-256 `7a5808652cbeb569d2de72e9ffd4226e987059e004ea51413f3ba7030c1881e0`. Remote exact-key and credential-pattern scans and the local credential-pattern scan were clean. Session databases and workspace snapshots were excluded. The local verifier accepted the run ID, task, strategy, model versions, image and base commit, preflight receipt, canonical request hashes, trace, and model metadata. No matching experiment container remained after completion.
