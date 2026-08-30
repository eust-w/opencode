# AutoDrive v1.12 DVC Blind Grader Conflict

## Classification

Excluded charged infrastructure canary. It is not an accepted trajectory, formal ablation result, boundary-corpus example, or accepted ledger row. Its provider cost is nevertheless reconciled in this receipt and counted as pilot expenditure.

## Worker and continuation result

The real `deepseek-v4-pro` worker ran the frozen blind policy on SWE-EVO task `iterative__dvc_2.21.1_2.21.2`. The evaluator captured six safe idle boundaries, admitted the exact static queue prompt five times, and stopped at the frozen continuation cap. All 28 worker requests settled with HTTP 200, complete usage of 355,997 prompt and 7,345 completion tokens, and zero proxy errors. No controller request was issued.

The first two boundary patches were empty. The third boundary produced a 1,495-byte patch, and the next three boundaries did not change it. Four of the five extra segments are therefore classified as redundant by the frozen identical-patch rule. The first-boundary empty patch was graded unresolved with Fix Rate 0; its target fail-to-pass test failed and all eight pass-to-pass tests passed.

## Exclusion reason

The final patch changed `dvc/repo/params/show.py` and also contained every hunk of the frozen test patch in `tests/func/api/test_params.py`. The v1.12 grader applied the model patch, then mechanically attempted to apply the same test patch again. `git apply` failed at the already-present test hunk before final tests ran. The executor exited with code 1 and wrote neither a trajectory nor a canary ledger row.

This is an evaluation-infrastructure defect, not a provider, model-timeout, loop, or budget outcome. Because the run was charged USD 0.3887664, the frozen zero-cost retry rule forbids reusing its run ID. Protocol v1.13 adds forward and reverse patch checks: a test patch that cannot apply forward must pass a complete `git apply --reverse --check` to be treated as already applied; an actual partial conflict still fails closed. A no-network reproduction with this exact final patch observed the expected forward conflict, successful reverse validation, and both the target F2P test and related `test_params_show_targets` P2P test passing. The full final grade remains unknown until a v1.13 trajectory completes.

## Integrity

Provider spend rose from USD 0.0970008 to USD 0.4857672. The sanitized archive has SHA-256 `926194a03c2451bd8ab713832c3e6324e809ed1fd0af566073702a820d4b396a`, contains 112 tar entries, and is 858,245 bytes. The remote exact-key scan found no match. Session databases and workspace snapshots are excluded, and no matching experiment container or network remained after cleanup.
