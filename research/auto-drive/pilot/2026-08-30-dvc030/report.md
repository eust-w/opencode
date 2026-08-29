# AutoDrive DVC 0.30 pilot report

Date: 2026-08-30 (Asia/Shanghai)  
Protocol: `auto-drive-swe-evo-v1.1`  
Task: `iterative__dvc_0.30.0_0.30.1`

## Bottom line

This pilot produced **no valid controller-ablation observation**. No worker reached a normal text handoff boundary, so computing macro-F1 or comparing regex with the four supervisor context conditions would be invalid. The raw data instead identified two experiment-blocking preflight failures: a provider-incompatible maximum-step request and a free-tier request quota that cannot support the frozen 384-trajectory matrix.

These failures are retained as negative pilot evidence. They are not written to the frozen `results/trajectories.jsonl` because the exact normalized outbound request hash was not captured and no normal boundary was observed.

## Protocol deviation

The preregistration called for a non-primary pilot. This engineering preflight instead used one frozen SWE-EVO task because its official image was the smallest locally feasible image under the observed disk constraint. That choice is disclosed after the fact and cannot be treated as preregistered. The task is now tagged canary-contaminated: it receives no special prompt or hidden test access in later runs, remains in the originally specified all-48 analysis if the study proceeds, and must also be reported in a sensitivity analysis that excludes this task. No controller label or task fix was obtained from the preflight.

## Official grader baseline

The official SWE-EVO image was run at base commit `9175c45b1472070e02521380e4db8315d7c910c4`. The hidden test patch was mounted only into a disposable grader checkout. The worker container never received the patch or test labels.

| Outcome | Result |
|---|---:|
| FAIL_TO_PASS | 0 / 1 passed |
| PASS_TO_PASS | 12 / 12 passed |
| Resolved | No |
| Selected-test runtime | 4.46 s |

The failing test was `tests/test_stage.py::TestDefaultWorkingDirectory::test_ignored_in_checksum`. The complete grader output is in `raw/baseline-grader.log`.

## Observed execution data

The policy names below identify frozen run-plan slots. Because no run reached the first boundary, the continuation policy was never invoked and the rows are **not a policy-effect comparison**.

| Plan slot | Attempt | Provider steps | Normal boundary | Input tokens | Output + reasoning | Cost (USD) | Wall time | Terminal observation |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| Oracle | 1 | 4 | No | 52,436 | 550 | 0.043836975 | 498.104 s | Gemini rejected a request ending in a model turn |
| Blind | 1 | 0 | No | 0 | 0 | 0 | 20.245 s | `models.dev` metadata timeout before provider dispatch |
| Blind | 2 | 5 | No | 49,475 | 888 | 0.041958900 | 549.456 s | Same model-turn rejection at the forced final step |
| Regex | 1 | 0 | No | 0 | 0 | 0 | 124.064 s | Free-tier request quota exhausted |
| Supervisor | 0 | 0 | No | 0 | 0 | 0 | 0 | Not dispatched after the quota gate failed |

Charged pilot total: **$0.085795875**. Charged input tokens: **101,911**. Charged output plus reasoning tokens: **1,438**. Both charged attempts left the task checkout unchanged, so the official score remained 0/1 FAIL_TO_PASS and 12/12 PASS_TO_PASS.

## Failure 1: maximum-step request was invalid for Gemini

The six-step runner appended `MAX_STEPS_PROMPT` as an `assistant` message. Gemini's API rejects a request whose conversation ends in a model turn. The Oracle slot failed after four recorded provider steps; the Blind slot failed after five. This is systematic for a Gemini worker at the configured segment limit and would invalidate the main experiment if left unfixed.

The implementation now sends the unpersisted maximum-step directive as a `user` control turn, removes tools, and sets `toolChoice=none` on that final provider call in both V1 and V2 runners. A regression test asserts the request role and tool restrictions. The fix was made only after both failing traces were sealed; neither trace was rewritten or retried under the same frozen run slot.

## Failure 2: current key cannot fund the protocol

The provider reported `generate_content_free_tier_requests`, limit 20, for `gemini-3.7-flash`. Therefore the available key is a free-tier key, not the billable account assumed by the USD 800 protocol. The regex slot exhausted bounded retries before its first model step. The Supervisor slot was not dispatched.

The full 384-run matrix and the 180-boundary ablation must remain blocked until a billing-enabled Google credential passes a quota preflight. Anthropic and OpenAI direct credentials were also absent during this pilot, so the cross-model replication is not runnable from the current environment.

## What can and cannot be claimed

Can be claimed from this pilot:

- the official task baseline is unresolved with exactly one failing FAIL_TO_PASS test and all twelve PASS_TO_PASS tests passing;
- two charged worker attempts consumed the recorded tokens and cost without producing a normal boundary or code change;
- the old six-step terminal request is incompatible with Gemini 3.7 Flash;
- the current Google credential cannot support the preregistered matrix.

Cannot be claimed:

- any AutoDrive completion-rate improvement;
- any controller macro-F1 or unsafe-continuation rate;
- any difference among regex, supervisor-only, goal, summary, or memory ablations;
- publication-ready significance or confidence intervals.

## Acceptance gate for the next run

Before another frozen trajectory is dispatched, the executor must record the normalized outbound request SHA-256, confirm the exact model version, verify billing/quota headroom, seed and hash the model metadata cache, disable external skill discovery, and pass a one-task six-step canary that ends in a normal text boundary. Only then can the five controller variants be evaluated on a real boundary.
