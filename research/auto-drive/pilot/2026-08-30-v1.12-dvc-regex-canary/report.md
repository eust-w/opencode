# AutoDrive v1.12 DVC Regex Canary

## Classification

Accepted paid pilot trajectory and pilot ledger row for the frozen integrated regex baseline. Its one boundary is a candidate for later human annotation, but it is not counted in the frozen 180-boundary corpus yet. This single run is not a policy-effectiveness claim or a formal 384-run matrix result.

## Result

The real `deepseek-v4-pro` worker executed one six-step segment on SWE-EVO task `iterative__dvc_2.21.1_2.21.2`. The persisted heuristic decision at the first safe boundary was `stop` with reason `No continuation cues found`, so AutoDrive admitted no generated queue input and the task ended without manual continuation.

No code patch was produced at the boundary or at the end. The task remained unresolved with fix rate 0. The isolated official grader reported 2,158 passed, 383 failed, 14 skipped, 9 xfailed, 2 xpassed, and 1 error in 395.80 seconds. The target fail-to-pass test `tests/func/api/test_params.py::test_params_show_untracked_target` remained failing while all eight pass-to-pass tests passed.

## Heuristic false negative

The stop is an observed limitation of the frozen regex policy, not a message-selection, persistence, or integration failure. The final assistant message was selected correctly and completed six milliseconds before the decision event. Its first sentence was `Maximum steps for this agent have been reached`, followed by explicit remaining tasks and recommended next steps.

The message contained 2,222 characters, while the heuristic evaluated only its trailing 1,500 characters. The opening maximum-steps cue at offset 0 was therefore absent from the evaluated tail. The tail retained `## Remaining tasks` and `## Recommended next steps`, but the frozen section patterns do not accept those Markdown-prefixed headings. Running the exact frozen implementation reproduced both outcomes: the isolated maximum-steps sentence yields `continue`, while the full persisted message yields `stop`. This boundary is consequently marked as a heuristic false-negative candidate pending the frozen human annotation process.

## Usage and cost

- 6 worker requests: 20,366 prompt tokens and 919 completion tokens.
- No controller request was issued for the regex policy.
- Total cost was USD 0.0517143 and end-to-end latency was 435,441 ms, including isolated grading.
- All six provider requests settled with HTTP 200 and complete usage. The gateway held and released worker requests 1 through 5 and recorded zero proxy errors.

## Interpretation

This run establishes a concrete mechanism-level contrast for the planned ablation: a simple tail regex can stop a task with explicit safe remaining work because surface-form and truncation choices jointly hide the continuation cue. It does not show that every additional continuation would be useful, nor does it establish that supervisor continuation improves task success. Those questions require the matched blind, oracle, and supervisor trajectories plus task-level statistics.

The sanitized artifact excludes Session databases and workspace snapshots. The remote exact-secret scan and local secret-prefix scan both found zero matches. The export archive contains 71 entries, is 421,693 bytes, and has SHA-256 `921fc9e755928f08e90edc01c4eeb050bc0e72835535eb3be5b3157ae9f9ee2b`.
