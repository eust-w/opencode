# AutoDrive v1.13 DVC Blind Canary

## Classification

Accepted paid canary under `auto-drive-swe-evo-v1.13`. The trajectory and pilot ledger entry passed the frozen provenance and artifact verifier. It is eligible for the four-strategy canary ablation, but it has not been copied into the 384-row formal matrix results or formal cost ledger.

## Result

The first safe boundary had an empty patch and failed the single frozen fail-to-pass test, while all eight pass-to-pass tests passed. It was therefore unresolved with Fix Rate 0, which is the AutoDrive-off prefix result for this trajectory.

The blind policy admitted the exact static continuation prompt at five boundaries and stopped at the frozen continuation cap on the sixth boundary. The first four boundary patches were empty. Boundary 5 produced a 1,493-byte patch, and boundary 6 did not change it, so four of the five continuation segments are redundant under the frozen identical-patch rule. The final patch passed the one fail-to-pass and all eight pass-to-pass tests, producing `resolved=true` and Fix Rate 1.0. No continuation was classified unsafe, and no controller request was issued.

This canary is direct mechanism evidence: the same trajectory's first boundary is unresolved, while continued work eventually resolves the task. It is not evidence that blind continuation is generally safe or cost-effective; four redundant segments, the maximum five continuations, and the measured cost and latency are explicit penalties.

## v1.13 grader amendment

At the first-boundary grade, the frozen test patch applied normally. At the final grade, the model patch already contained every frozen test-patch hunk. The v1.13 executor observed a failed forward check and a complete successful reverse check, recorded `already-applied`, and skipped the duplicate application. This is the exact production path added after the charged v1.12 infrastructure canary failed.

The frozen SWE-EVO grade is based on one F2P and eight P2P tests. The grader also retained a broad repository-suite diagnostic run. That broader run ended nonzero in both prefixes because the historical image has extensive dependency and environment failures, including a `pygit2`/`scmrepo` incompatibility: 2,158 passed / 383 failed / 1 error at the first boundary and 2,159 passed / 382 failed / 1 error at the final boundary. These broad-suite counts are non-gating and are not presented as a clean full-suite pass.

## Usage and integrity

All 34 worker requests returned HTTP 200 with complete usage. They consumed 426,177 prompt tokens and 12,085 completion tokens. Provider spend rose from USD 0.5023197 to USD 0.9780093, exactly matching the trajectory and pilot ledger cost of USD 0.4756896. End-to-end latency was 1,040,552 ms (about 17.34 minutes).

The sanitized archive contains 120 tar entries and 90 files, is 1,531,551 bytes, and has SHA-256 `b3cf6aae64ae5501e4dc3236ff5ff00a9a043f878cd1c8d1cc2ee1839b7dcd39`. Remote exact-key and local credential-pattern scans were clean. Session databases and workspace snapshots were excluded. The local verifier accepted the run ID, task, strategy, model versions, image and base commit, preflight receipt, canonical request hashes, trace, and model metadata. No matching experiment container or process remained after completion.
