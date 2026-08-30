# AutoDrive Preregistration v1.14

Frozen: 2026-08-30 (Asia/Shanghai)

## Provider-resolution amendment (v1.1)

Before any paid trajectory was accepted, the executable model inventory showed that Gemini 3.7 Flash is exposed as `google/gemini-3.7-flash`; the v1 identifier `opencode/gemini-3.7-flash` did not resolve to that model. Version 1.1 changes only the provider prefix for the primary worker and controller, and consequently regenerates deterministic run IDs. The dataset, task selection, policies, prompts, sampling parameters, run count, metrics, statistics, and budget remain unchanged. No result was observed before this amendment.

## Artifact-integrity amendment (v1.2)

The rejected v1.1 engineering pilot showed that a single declared request hash was insufficient for an end-to-end trajectory containing multiple worker and controller calls. Before any paid trajectory was accepted, version 1.2 upgraded the result contract to an ordered request manifest and requires the host harness to recompute every normalized request, model-metadata, preflight-receipt, and raw-trace SHA-256 before admitting either the result or its ledger entry. A fresh paid-capacity receipt with exact resolved model versions and disabled external skill/model discovery is mandatory. Because the protocol version is part of the deterministic run key, all 384 run IDs were regenerated. Experimental tasks, policies, prompts, sampling, outcomes, statistics, and budget are unchanged; rejected v1.1 pilot IDs remain historical evidence and are not rewritten.

## Gateway model-matrix amendment (v1.3)

Before any end-to-end trajectory was accepted, the user authorized the sponsored D-Robotics LiteLLM-compatible gateway for execution. Its sealed catalog does not expose the v1.2 Google, Anthropic, or OpenAI model IDs, so the matrix is changed transparently instead of relabeling gateway models as the originally planned workers. The primary worker and every supervisor call use `d-robotics/qwen3.8-max`; the two twelve-task replication workers use `d-robotics/deepseek-v4-pro` and `d-robotics/glm-5.3`. Gateway aliases and undisclosed upstream revisions are not treated as direct-provider model identities; this limitation must be reported in the paper.

The gateway key is classified as sponsored and metered because `/key/info` exposes cumulative spend but no provider-confirmed account budget. The host proxy therefore fails closed with a local spend cap, and a full 384-run receipt remains invalid until trajectory capacity is independently confirmed. The proxy is the frozen generation-parameter boundary: it materializes omitted worker defaults as `temperature=0,max_tokens=32000`, requires controller requests to use `temperature=0,max_tokens=1024`, replaces task-side credentials, and hashes the exact normalized outbound body. The dataset, four policies, task selection, repeat counts, six-step segment limit, five-continuation limit, statistics, and USD 800 overall budget remain unchanged. Because the protocol version and model IDs are part of the deterministic run key, all 384 run IDs are regenerated; all v1.2 engineering canaries remain excluded from results.

## Responses transport amendment (v1.4)

The first v1.3 end-to-end gateway canary received HTTP 200 for one charged worker request but the gateway's streamed Chat Completions tool-call delta omitted the tool-call ID or name required by the worker runtime. The runtime rejected the stream before executing a tool or modifying the checkout. No v1.3 trajectory, task outcome, boundary decision, or ledger row was accepted. The request manifest and raw proxy trace are retained as an excluded transport-qualification artifact; the same v1.3 configuration is not retried.

Before any experimental trajectory was accepted, a direct gateway probe established that the OpenAI Responses endpoint returns a complete structured function call with a call ID, function name, and arguments. Version 1.4 therefore sends worker traffic through OpenAI Responses while leaving the tool-free supervisor on Chat Completions. The proxy freezes endpoint-specific fields as `temperature=0,max_output_tokens=32000` for Responses workers and `temperature=0,max_tokens=1024` for Chat supervisors, and parses both Responses `input_tokens/output_tokens` and Chat `prompt_tokens/completion_tokens` usage. The models, prompts, policies, dataset, task selection, sampling, limits, statistics, and budget are unchanged. All 384 deterministic run IDs are regenerated because transport is part of the frozen executable protocol.

## Response-accounting amendment (v1.5)

The first v1.4 end-to-end canary completed five Responses tool turns, then received a successful upstream response whose terminal usage fields did not satisfy the proxy's strict accounting parser. The proxy converted this accounting defect to HTTP 502, which triggered two bounded session retries before the run was interrupted. No controller request, boundary, grade, accepted trajectory, or ledger row was produced. The request and proxy manifests, complete usage for the first five responses, observed account-spend delta, and exact cleanup are retained as an excluded canary; its v1.4 run ID is not retried.

Before any experimental trajectory was accepted, version 1.5 separated provider transport from accounting validation. Every upstream body is now saved with its SHA-256 before parsing. A successful upstream body is forwarded unchanged even when usage extraction is incomplete, and the proxy records `usageComplete=false` rather than manufacturing a retryable HTTP error. Acceptance still requires complete usage for every successful worker and controller response; missing usage cannot be replaced by zero. Models, requests, prompts, policies, dataset, sampling, step limits, statistics, and budget are unchanged. All 384 deterministic run IDs are regenerated.

## Bounded provider-failure amendment (v1.6)

The first v1.5 canary confirmed that response preservation prevents proxy-induced retries. Its sixth worker response ended after 157,530 bytes of reasoning deltas without `response.completed` or usage. The Session became idle with no AutoDrive decision, exposing that the host executor waited only for explicit `stop | defer`. The task checkout was preserved before interruption; its patch was empty. No controller, boundary grade, accepted trajectory, or ledger row existed, and the v1.5 run ID is not retried.

Version 1.6 implements the preregistered rule that provider errors count as task failures. If a Session remains idle for five seconds after at least one successful provider response, has no pending controller, and has no terminal AutoDrive action, the executor emits a finite provider-failure outcome. A truncated or usage-incomplete stream is `retryable-provider`; other terminal provider defects are `non-retryable-provider`. Trajectory schema v3 adds `usageComplete`; failed trajectories retain observed-token lower bounds and settled account cost instead of inventing missing tokens, and the verifier still grades the captured partial patch. This does not grant a rerun. Models, requests, prompts, policies, dataset, sampling, limits, statistics, and budget are unchanged. All 384 run IDs are regenerated.

## Worker reasoning amendment (v1.7)

The accepted v1.6 DVC canary is retained as a negative pilot trajectory. Five tool-bearing worker responses completed, but the sixth forced tool-free response exhausted the gateway stream in reasoning deltas without a terminal response or usage. The executor correctly recorded a `retryable-provider` task failure, an empty patch, zero Fix Rate, observed-token lower bounds, and settled cost. It never reached an AutoDrive controller boundary, so it is not evidence for or against a continuation policy and is excluded from treatment-effect estimates.

Before launching the main matrix, bounded direct Responses probes showed that the same gateway model completed the tool-free request when the standard OpenAI reasoning effort was explicitly set to `low`. Version 1.7 therefore pins `reasoningEffort=low` on every worker request while leaving the controller request unchanged. The normalized gateway body must contain `reasoning: {"effort":"low"}` before a v1.7 paid canary may continue. This is a new protocol and not a same-configuration rerun of the v1.6 failure. Dataset, prompts, four policies, task selection, sampling temperature, output limits, statistics, and budget are unchanged; all 384 run IDs are regenerated.

## V2 request-routing amendment (v1.8)

The v1.7 compatibility canary failed its explicit first-request gate: the normalized worker body did not contain `reasoning`. The host was interrupted and the run is excluded. Process teardown allowed the already-running worker to finish five complete tool responses and issue a sixth request before its containers were removed; all six normalized requests omitted the field, the captured patch was empty, complete observed usage was 23,976 input and 1,088 output tokens, and the metered spend delta was USD 0.1617816. No controller boundary, trajectory, grade, or ledger row was accepted.

Root-cause inspection showed that the V2 native runner materializes model-level request bodies, while v1.7 placed the option in the agent-level request body. Version 1.8 moves the exact standard OpenAI body `reasoning: {"effort":"low"}` to the worker model request and leaves the controller model body empty. A first-request normalized-body check remains mandatory. Because the v1.7 ID was charged, version 1.8 regenerates all run IDs rather than reusing it. Experimental outcomes, dataset, prompts, policies, limits, statistics, and budget remain unchanged.

## Worker compatibility amendment (v1.9)

The accepted v1.8 DVC canary verified that the normalized first and sixth worker requests contained `reasoning: {"effort":"low"}`. Nevertheless, `qwen3.8-max` again ended its sixth tool-free response after 165,222 bytes of reasoning deltas without a terminal event or complete usage. The executor recorded a failed provider outcome, zero Fix Rate, an empty patch, and USD 0.1333632 cost; no controller boundary was reached.

Before the main matrix, a paid compatibility ablation replayed that exact sixth-turn input at temperature zero, low reasoning effort, no tools, and 4,096 maximum output tokens. `deepseek-v4-pro`, `qwen3.7-max`, and `deepseek-v4-flash` returned `response.completed`; `qwen3.8-max` again lacked a terminal event, GLM 5.2 returned `response.failed`, and GLM 5.3 and Kimi K3 returned HTTP 400. Exact first-turn tool probes then confirmed that each of the three completing candidates returned a valid `bash` function call with call ID and serialized arguments.

Version 1.9 therefore uses `deepseek-v4-pro` as the 48-task primary worker, `qwen3.7-max` as a different-family twelve-task replication, and `deepseek-v4-flash` as a twelve-task scale/variant replication. The supervisor remains `qwen3.8-max` so worker-model comparisons keep one controller. Worker output is capped at the qualified 4,096 tokens. The second replication cannot be presented as independent family generalization. The 384-run structure, dataset, tasks, prompts, policies, statistics, and overall budget remain unchanged; all run IDs are regenerated.

## Gateway output-normalization amendment (v1.10)

The first v1.9 request failed its explicit normalized-body gate because the gateway proxy still materialized the historical 32,000-token worker allowance instead of the 4,096-token limit frozen by the compatibility amendment. The run was interrupted and excluded. Before teardown, DeepSeek completed all six worker responses with complete lower-bound usage of 19,145 input and 845 output tokens, and the executor produced the first held supervisor request at sequence 6. The controller was not released to a completed response, and no controller decision, grade, trajectory, boundary example, or ledger row was accepted.

Version 1.10 changes only the gateway worker normalizer from 32,000 to 4,096 output tokens so it matches the already frozen protocol and model-request contract. The worker/controller model matrix, prompts, four policies, task selection, temperature, low reasoning effort, six-step segment limit, five-continuation limit, statistics, and budget remain unchanged. Because the charged v1.9 run ID is historical evidence, every deterministic run ID is regenerated and no v1.9 ID is reused.

## Controller-release amendment (v1.11)

The first v1.10 request passed its normalized-body gate. DeepSeek completed six worker responses with complete usage of 20,286 input and 957 output tokens, the executor captured the first boundary, and the real supervisor request was held at sequence 6. Although the executor wrote `release-6` and the file was visible inside the proxy container, the controller was never sent upstream: Bun 1.4.0 cached the initially missing state on the single `BunFile` used by the polling loop, which timed out after 60 seconds. No controller response, decision, continuation, grade, trajectory, boundary example, or ledger row was accepted.

A zero-provider-cost reproduction observed `false` before creation, `false` from the same `BunFile` after creation, and `true` from a fresh `BunFile`. Version 1.11 reconstructs the file handle on every release poll and adds a delayed-creation regression test. No policy logic, model, prompt, task, generation parameter, run limit, statistic, or budget changes. Because v1.10 worker calls were charged, every run ID is regenerated and no v1.10 ID is reused.

## Four-policy executor amendment (v1.12)

The first accepted v1.11 paid pilot exercised the complete supervisor path on one DVC task. It persisted one `continue` decision and automatically resumed the worker, but produced no patch and remained unresolved. A second supervisor response completed after the frozen controller deadline and was correctly ignored in favor of the timeout fallback. This trajectory is retained only as mechanism and error-analysis evidence; it is not admitted to the formal four-policy matrix.

That pilot also confirmed that the host executor still rejected the three preregistered non-supervisor strategies. Version 1.12 implements the already frozen policy definitions before any comparative result is accepted. `regex` uses the Session heuristic with contextual goal and memory disabled. The proxy temporarily gates post-initial regex worker requests so the executor can seal an exact patch at an automatically continued boundary before the next worker response changes the checkout. `blind` and `oracle` run with Session AutoDrive disabled and admit the same static queue prompt at a safe idle boundary; blind continues until the five-continuation cap, while oracle continues only when the official external task verifier reports unresolved. Oracle grading runs in a separate no-network task-image container and memoizes identical patch hashes, so validation cannot mutate the worker checkout. Every strategy records the first-boundary prefix, and the executor waits for one terminal proxy event per sealed provider request before acceptance.

The supervisor prompt, regex rules, static baseline prompt, models, task inputs, temperature, output limits, six-step segment size, five-continuation cap, metrics, statistics, and budget are unchanged. The amendment completes missing executor coverage and strengthens artifact isolation; it is not selected based on a favorable pilot outcome. All v1.12 deterministic run IDs are regenerated, and the v1.11 pilot remains outside comparative estimates.

## Overlapping test-patch amendment (v1.13)

The first v1.12 regex pilot is retained as a negative pilot trajectory: the frozen tail heuristic stopped at an unresolved boundary because the opening maximum-step cue fell outside its 1,500-character tail and Markdown-prefixed remaining-work headings did not match. It is not admitted to the formal comparative matrix.

The first v1.12 blind canary reached six boundaries, injected the frozen static continuation exactly five times, and produced a 1,495-byte final patch after the third continuation. All 28 worker responses settled with complete usage of 355,997 prompt and 7,345 completion tokens and zero proxy errors. The first-boundary empty patch was graded unresolved. Final grading then stopped before tests because the model patch already contained every hunk of the frozen test patch; mechanically applying the same test patch a second time failed. The run produced no accepted trajectory or ledger row. Its reconciled metered cost is USD 0.3887664, and it remains an excluded engineering canary rather than a same-ID retry.

Version 1.13 changes only isolated grader preparation. After applying a model patch, the grader first checks whether the frozen test patch applies forward. If not, it requires the complete patch to pass `git apply --reverse --check`, records `already-applied`, and proceeds without duplicating it. If neither direction validates, grading fails closed as a real patch conflict. A no-network reproduction using the exact v1.12 blind patch observed forward conflict, successful reverse validation, and both the target fail-to-pass test and a related pass-to-pass test passing. Worker/controller policies, prompts, models, task inputs, request parameters, continuation limits, outcome definitions, statistics, and budget are unchanged. Because the charged v1.12 blind ID is historical evidence, all deterministic v1.13 run IDs are regenerated.

## Supervisor failure-abstention amendment (v1.14)

The accepted v1.13 four-policy canary remains a historical, descriptive pilot outside the formal 384-run matrix. In its supervisor trajectory, the first controller response correctly continued unfinished work. A second semantically valid `continue` response completed 16.839 seconds after release, beyond the frozen 15-second controller deadline; the v1.13 runtime therefore used its deterministic regex fallback and persisted `stop`. This exposed a mismatch between the three-state safety contract and the failure path: controller uncertainty was converted into a binary heuristic guess instead of explicit abstention.

Before any formal matrix row was accepted, version 1.14 changes only supervisor failure handling. Controller timeout, model or Session resolution failure, provider error, an empty response, and malformed JSON now persist `defer` and return control to the user without automatic continuation. The controller deadline remains 15 seconds. The worker/controller model matrix, prompts, temperature, token limits, six-step segment size, five-continuation cap, task selection, outcomes, statistics, concurrency, and budget are unchanged. The v1.13 canary is not reinterpreted or promoted into formal results. Because the protocol version is part of the deterministic run key, all 384 v1.14 run IDs are regenerated; a fresh full-capacity v1.14 preflight remains mandatory before dispatch.

## Pre-provider pilot qualification deviation (v1.14-r6)

On 2026-08-30, the user explicitly authorized one additional non-primary pilot attempt after reviewing the r4 and r5 evidence. Both attempts stopped before provider admission, recorded zero provider requests, left cumulative gateway spend unchanged at USD 1.9453748, and produced no ledger row or accepted trajectory. r4 exposed a missing bootstrap `.gitignore` on the read-only OpenCode config mount; r5 exposed stale gzip response metadata after Bun decoded the relayed body. The corresponding fixes pass unit, type, and real host-proxy-internal-task Docker contract checks.

This deviation permits exactly one fresh r6 artifact root for the same deterministic pilot run, task image and commit, primary worker, controller, policy, prompts, temperature, output limits, six-step segment size, five-continuation cap, 45-minute timeout, and USD 5 per-run ceiling. It does not change the 384 formal run IDs, boundary source plan, metrics, statistics, concurrency, category caps, or USD 800 total budget. r4 and r5 remain excluded infrastructure-qualification evidence. r6 is not retryable under this deviation, regardless of whether it reaches provider admission; any additional attempt requires a separate, prospective authorization.

The authorized r6 attempt started once and crossed the r4/r5 qualification gates, but stopped before its first provider request. The V2 Session runner resolved `openai/deepseek-v4-pro` before the asynchronous built-in plugin bootstrap had committed the configured provider into the Location catalog. The attempt recorded zero proxy events, unchanged cumulative spend of USD 1.9453748, no ledger row, and no accepted trajectory. It remains non-retryable under this deviation. Commit `6f141c3e00` adds an explicit built-in-plugin readiness barrier plus a first-resolution regression test; a Linux AMD64 diagnostic in the frozen task image reached prompt admission and the intentionally absent local proxy, proving model resolution without contacting the gateway. That diagnostic is implementation evidence only and is not an r6 retry.

## Post-fix pilot qualification deviation (v1.14-r7)

After reviewing the r6 evidence and the zero-provider Linux regression, the user explicitly classified r6 as a zero-cost pre-provider qualification failure and prospectively authorized exactly one additional pilot attempt from a fresh r7 artifact root based on fix commit `6f141c3e00`. This authorization does not reinterpret or retry r6: r4, r5, and r6 remain excluded qualification evidence with no accepted trajectory or ledger row.

The r7 attempt keeps the deterministic pilot run ID, SWE-bench Verified task and image, primary worker, controller, supervisor policy, prompts, temperature, reasoning effort, token limits, six-step segment size, five-continuation cap, 45-minute timeout, and USD 5 per-run ceiling unchanged. It does not modify the 384 formal run IDs, boundary source plan, outcomes, statistics, concurrency, category caps, or USD 800 total budget. r7 may start once and is not retryable under this deviation regardless of outcome; any further attempt requires another separate, prospective authorization.

The authorized r7 attempt started exactly once from commit `2ab828e64f` with Linux AMD64 binary SHA-256 `6a19d758...97cf`. It validated both frozen models through the public provider projection, created Session `ses_facee9984ffeFbq437WQPWzyPP`, and durably admitted and promoted the prompt. Location model resolution then rejected `openai/deepseek-v4-pro` before any provider request. The executor's V1 config had decoded and migrated, but `options.apiKey` was lowered only into an Authorization header while the V2 catalog availability gate required its private runner credential field or an active integration connection. The attempt recorded zero gateway requests, zero proxy events, unchanged cumulative spend of USD 1.9453748 and unchanged gateway activity, no ledger row, and no accepted trajectory. It is consumed and non-retryable under this deviation.

Commit `8e4359a39a` projects the legacy key into the V2 runner credential field while retaining the protocol-specific authorization header; the runner removes the private field before building the outbound HTTP body. A test-first regression using the r7 configuration shape failed with the same `ModelUnavailableError` before the fix and passed afterward. A Linux AMD64 diagnostic then mounted r7's exact config and model metadata on a Docker-internal network without a proxy, gateway key, or published host port. It exposed both frozen models, created a Session, promoted a prompt, resolved the worker, and reached only the expected HTTP transport failure. Gateway spend and activity remained unchanged. This is offline implementation evidence, not an r7 retry or empirical result.

## Legacy-credential pilot qualification deviation (v1.14-r8)

After reviewing the r7 failure and its zero-provider Linux regression, the user explicitly classified r7 as a zero-cost pre-provider qualification failure and prospectively authorized exactly one additional pilot attempt from a fresh r8 artifact root based on fix commit `8e4359a39a`. This authorization does not reinterpret or retry r7: r4 through r7 remain excluded qualification evidence with no accepted trajectory or ledger row.

The r8 attempt keeps the deterministic pilot run ID, SWE-bench Verified task and image, primary worker, controller, supervisor policy, prompts, temperature, reasoning effort, token limits, six-step segment size, five-continuation cap, 45-minute timeout, and USD 5 per-run ceiling unchanged. It does not modify the 384 formal run IDs, boundary source plan, outcomes, statistics, concurrency, category caps, or USD 800 total budget. r8 may start once and is not retryable under this deviation regardless of outcome; any further attempt requires another separate, prospective authorization.

The authorized r8 attempt started exactly once from commit `c1404ea448` with Linux AMD64 binary SHA-256 `3d0170df...fa98`. It validated both frozen models and completed 18 worker plus three controller requests. Three safe boundaries produced durable decisions `continue`, `continue`, and `defer`; both generated continuation inputs were admitted and promoted exactly once. The first-boundary verifier retained all five P2P tests but failed the single F2P test. Final grading then stopped before tests because the model patch and frozen test patch both modified `test_requests.py`, making both forward and reverse applicability checks fail. The fail-closed classification is an excluded charged evaluation failure, not an accepted pilot trajectory, provider failure, or infrastructure retry.

Twenty captured HTTP 200 responses have complete local usage of 123,052 prompt and 4,856 completion tokens. The final controller timed out at the Session boundary and its terminal body was not captured because the subsequent grader exception cleaned up the proxy while that upstream request remained outstanding. Eight later account reads were stable at cumulative spend USD 2.1923892 and last activity `2026-08-30T14:55:55.140000+00:00`, yielding an observed account-window delta of USD 0.2470144 from the r8 baseline. That delta is retained as a conservative account-level observation rather than complete request-level attribution. r8 produced no accepted trajectory or ledger row, changes no formal result or formal budget value, is consumed and non-retryable, and remains mechanism/error-analysis evidence only.

Post-r8 implementation hardening in commit `13f6ea79f7` moves failure evidence capture ahead of task, proxy, and network cleanup. Once an executor has started, an error preserves its original stage and message, retains the existing five-minute upper bound while waiting for every sealed gateway request to reach a terminal proxy event, rereads complete usage, performs bounded settled-spend sampling, and validates a strict machine receipt at `failures/<run>/attempt-<n>.json`. The receipt schema fixes both trajectory acceptance and ledger admission to `false`; a settlement timeout is recorded inside the receipt and cannot replace the original grader failure. Pre-provider errors with zero requests skip both settlement and spend polling. The model/test-patch conflict remains fail-closed.

The hardening used no provider request and is not an r8 replay, protocol result, or authorization for a new run. Its focused host-executor suite passes 18 tests with 100% function and 99.69% line coverage; the complete evaluation package passes 89 tests and 351 assertions plus type checking. Any future paid execution still requires a separate prospective authorization and fresh artifact root.

## Claim boundary

AutoDrive targets **premature conversational handoff** by a coding agent: the worker ends a provider turn while safe, in-scope, actionable work toward the admitted user goal remains. The claimed mechanism combines safe turn-boundary evaluation, a `continue | stop | defer` decision, and durable exactly-once continuation admission. It does not claim the first supervisor, memory mechanism, agent termination rule, abstention method, or loop bound.

Adjacent work bounds the claim. Magentic-One uses an orchestrator to plan, track progress, re-plan, and direct specialized agents. Agentic Abstention studies when an agent should refrain from acting. Evidence-Carrying Termination requires evidence-linked certificates before declaring completion. Infinite Agentic Loops studies and statically detects unbounded feedback paths. AutoDrive instead tests whether a session-scoped boundary controller can safely resume a single coding worker after an otherwise terminal turn.

## Research questions

- **RQ1 Frequency:** How often does a worker reach a premature handoff boundary before its task is complete?
- **RQ2 Utility:** Does boundary continuation improve resolved rate or partial Fix Rate and reduce manual continuation prompts?
- **RQ3 Components:** What do the supervisor, initial goal, trajectory summary, and within-session memory contribute to boundary decisions?
- **RQ4 Safety and cost:** What unsafe continuations, redundant turns, token/cost, latency, and recovery trade-offs result?

The paper is completed whether results are positive, null, or negative. Significance is not a delivery condition.

## Dataset and task freeze

The primary benchmark is all 48 SWE-EVO tasks at the exact upstream commit and Arrow digest in `swe-evo-48.json`. SWE-Bench Pro is excluded from primary conclusions because the official OpenAI audit reported substantial broken-task rates. The twelve cross-model tasks are frozen in package code and cover all seven repositories while sampling low and high values of the upstream PR and FAIL_TO_PASS complexity proxies.

The separately budgeted non-primary pilot is frozen in `pilot-swe-bench-verified.json`. It uses SWE-bench Verified task `psf__requests-1142`, which is outside the SWE-EVO manifest, and pins the dataset revision and Parquet SHA-256, the official harness commit current when the public image was built, the task-input SHA-256, and the AMD64 image digest. Its deterministic v1.14 run uses the primary worker and complete supervisor policy. Pilot output is isolated below `pilot/` and is never admitted to the 384-row matrix or an RQ estimate.

## Policies

1. `oracle`: after a worker boundary, an external task verifier injects the same static continuation instruction only if the task is incomplete.
2. `blind`: always inject the static continuation instruction until the limit.
3. `regex`: use the current deterministic heuristic with safety-first `defer` rules.
4. `supervisor`: use the complete three-state supervisor controller.

The off result is the first-boundary prefix of each paid trajectory. It is never an additional model run.

## Run matrix

- Primary: 48 tasks × 4 policies × one run = 192 trajectories.
- Primary repeats: 12 tasks × 4 policies × two additional repeats = 96 trajectories.
- Cross-model: 12 tasks × 4 policies × 2 models × one run = 96 trajectories.
- Total: 384 paid end-to-end trajectories.

The primary worker is `d-robotics/deepseek-v4-pro`. Replication workers are `d-robotics/qwen3.7-max` and `d-robotics/deepseek-v4-flash`. Every supervisor call uses `d-robotics/qwen3.8-max`. The qwen result is a different-family generalization replication; the DeepSeek Flash result is only a same-family scale/variant replication. Neither substitutes for the 48-task primary estimate.

Every run uses the pinned task image and base commit, temperature zero, worker reasoning effort `low`, the endpoint-specific request record in `model-requests.json`, six worker steps per segment, at most five automatic continuations, at most 45 minutes, and no more than two concurrent tasks. The resolved provider/model version and normalized request body must be saved before a record is accepted.

## Boundary corpus and ablations

The frozen corpus target is 180 real boundaries: 60 `CONTINUE`, 60 `STOP`, and 60 `DEFER`. It is grouped by base trajectory into an exact 54-item development set and a 126-item frozen test set. Two annotators label independently using `annotations/guidelines.md`; disagreements are adjudicated by a distinct identity only after independent labels are sealed. Freeze requires Cohen's kappa at least 0.75. If the threshold is missed, the guide may be clarified and all affected examples re-annotated before one final freeze; the frozen test set is not prompt-tuned.

Candidate acquisition uses a separately frozen source plan of 96 supervisor-only trajectories: all 48 SWE-EVO tasks with repeats 0 and 1. Its deterministic IDs include `boundary-corpus` in the run key and are disjoint from all 384 formal IDs. Source rows require a fresh `boundary`-scope capacity receipt, run at concurrency at most two, reserve at most USD 102/96 each, and are stored only below the external artifact root's `boundary/` directory. They cannot enter RQ2 outcomes or the formal ledger. The source plan is dispatched in its frozen order; all accepted source trajectories remain in the released sampling frame, including trajectories that yield no usable boundary.

Candidate extraction accepts only artifact-verified source trajectories. It binds each boundary to the canonical controller request, final Session transcript, request sequence, and captured patch hash; removes hidden reasoning and the supervisor's actual decision; and assigns a deterministic `adb_...` identifier. The identity-bound CSV records label, confidence, reason, actionable next step or missing decision, and timestamp. Freeze rejects incomplete 180-ID coverage, reused annotator identities, unbalanced adjudication, or cross-split base trajectories. A replay over the historical v1.13 supervisor canary extracted two boundaries and detected no reasoning metadata leakage; those items are pipeline qualification only and cannot enter the v1.14 corpus.

Boundary ablations are evaluated cumulatively: regex; supervisor only; plus initial goal; plus trajectory summary; plus within-session memory. They report three-class macro-F1 and classwise F1, with STOP and DEFER unsafe-continuation rates shown separately.

## Failures and reruns

Fault scenarios are frozen in `fault-injection.json`. A run can be repeated once only when the executor classifies a predefined infrastructure failure, emits exit code 75, and reports zero provider cost. Model timeout, loop, context exhaustion, budget exhaustion, and provider errors are task outcomes, not rerun reasons. Any charged infrastructure failure pauses execution for ledger reconciliation.

## Outcomes

Primary task outcomes:

- resolved rate from the official task verifier;
- Fix Rate using upstream FAIL_TO_PASS and PASS_TO_PASS semantics;
- manual continuation count;
- redundant worker turns;
- prompt/completion tokens, USD cost, and wall-clock latency;
- recovery success in injected crash scenarios.

Boundary outcomes:

- three-class macro-F1 and classwise F1;
- STOP unsafe-continuation rate;
- DEFER unsafe-continuation rate;
- continuation precision/recall;
- decision latency and controller tokens/cost.

## Statistical analysis

- Resolved outcomes use an exact two-sided McNemar test on paired tasks.
- Continuous and rate differences use a task-level paired bootstrap with 10,000 resamples and percentile 95% confidence intervals.
- The family of preregistered policy comparisons is corrected with Holm's method.
- Cross-model twelve-task analyses are descriptive replications with paired intervals, not substitutes for the 48-task primary result.
- Missing, timed-out, looped, and budget-exhausted trajectories count as failures; they are not silently dropped.

## Budget and stopping

Hard total: USD 800. Category caps are pilot 50, primary 360, cross-model 288, and boundary evaluation/recovery reruns 102. The harness reserves at most USD 1.25 for each primary trajectory and USD 3.00 for each cross-model trajectory before dispatch. Execution stops before a reservation would exceed either its category cap or the total cap.

The experiment stops at 384 accepted trajectories or earlier on the hard budget, an artifact-integrity violation, secret detection, unresolved model identity, or failure of the host/container isolation contract. Early stopping based on favorable or unfavorable results is prohibited.

## Sources frozen for rationale

- SWE-EVO: https://arxiv.org/abs/2512.18470 and https://github.com/SWE-EVO/SWE-EVO
- Magentic-One: https://www.microsoft.com/en-us/research/publication/magentic-one-a-generalist-multi-agent-system-for-solving-complex-tasks/
- Agentic Abstention: https://arxiv.org/abs/2606.28733
- Evidence-Carrying Termination: https://arxiv.org/abs/2608.23623
- Infinite Agentic Loops: https://arxiv.org/abs/2607.01641
- OpenAI coding-evaluation audit: https://openai.com/index/separating-signal-from-noise-coding-evaluations/
