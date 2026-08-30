# AutoDrive v1.13 DVC Regex Canary

## Classification

Accepted paid canary under `auto-drive-swe-evo-v1.13`. The trajectory and pilot ledger entry passed the frozen provenance and artifact verifier. It is eligible for the four-strategy canary ablation, but it has not been copied into the 384-row formal matrix results or formal cost ledger.

## Result

The regex policy stopped at the first safe boundary with `No continuation cues found`. The worker had exhausted its six-step segment after locating and reading the relevant API, but explicitly reported that it had not understood the bug, implemented the fix, or run the focused test. The captured first and final patches were both empty, so the final grade reused the first-boundary grade.

The frozen grader failed the single fail-to-pass test and passed all eight pass-to-pass tests. The first boundary and final result were therefore both unresolved with Fix Rate 0. The heuristic admitted zero continuations, issued no controller request, and recorded no unsafe or redundant continuation. On this task, the regex completion-language heuristic is a concrete false-stop counterexample: a textual handoff without a configured continuation cue was treated as completion even though the worker and executable tests both said work remained.

This is one canary and cannot estimate a population error rate. It does establish that the planned boundary classifier ablation measures a real mechanism rather than only synthetic examples.

## Grader behavior

The frozen test patch applied normally before grading. Because the first and final model patches were byte-identical empty files, the executor reused the same grade instead of launching a duplicate container.

The frozen SWE-EVO grade is based on one F2P and eight P2P tests. The retained broad diagnostic suite reported 2,158 passed / 383 failed / 1 error. Those historical-image failures include dependency and environment incompatibilities and are non-gating; the run is not represented as a clean full-suite pass.

## Usage and integrity

All six worker requests returned HTTP 200 with complete usage. They consumed 22,909 prompt tokens and 980 completion tokens. The executor reconciled USD 0.0483909 from its immediate pre/post-run settled-spend reads. The earlier preflight receipt was USD 0.0001845 below the implied execution baseline, consistent with delayed probe settlement; this drift is retained explicitly and not charged to the trajectory. End-to-end latency was 436,072 ms (about 7.27 minutes), nearly all of it from the real grader.

The sanitized archive contains 63 tar entries and 33 files, is 424,478 bytes, and has SHA-256 `0b703ab64ca90fb3ff85095bd3fff423801581a68d6158945ce8c52bcfc39d4d`. Remote exact-key and credential-pattern scans and the local credential-pattern scan were clean. Session databases and workspace snapshots were excluded. The local verifier accepted the run ID, task, strategy, model versions, image and base commit, preflight receipt, canonical request hashes, trace, and model metadata. No matching experiment container remained after completion.
