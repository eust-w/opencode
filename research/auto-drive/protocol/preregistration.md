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

## Failure-settlement pilot deviation (v1.14-r9)

After reviewing the r8 charged exclusion and the zero-provider exception-path hardening, the user explicitly authorized exactly one additional pilot attempt from a fresh r9 artifact root based on fix commit `13f6ea79f7`. This authorization does not reinterpret or retry r8: r8 remains an excluded charged evaluation failure with no accepted trajectory or ledger row.

The r9 attempt keeps the deterministic pilot run ID, SWE-bench Verified task and image, primary worker, controller, supervisor policy, prompts, temperature, reasoning effort, token limits, six-step segment size, five-continuation cap, 45-minute timeout, and USD 5 per-run ceiling unchanged. It does not modify the 384 formal run IDs, boundary source plan, outcomes, statistics, concurrency, category caps, or USD 800 total budget. r9 may start once and is not retryable under this deviation regardless of outcome; any further attempt requires another separate, prospective authorization.

The authorized r9 attempt started exactly once from commit `8b628aaff5`, which contains fix `13f6ea79f7`, with Linux AMD64 binary SHA-256 `7beb7496...29c`. It was accepted as a negative non-primary pilot. Session `ses_fac6ba93bffecxf5WKIO2AZcLu` completed six worker requests and one controller request, all with terminal HTTP 200 responses and complete local usage of 17,788 prompt and 2,226 completion tokens. The accepted ledger cost is USD 0.121062 and the trajectory latency is 85.512 seconds. The official grader retained all five P2P tests but failed the single F2P test, so both first-boundary and final outcomes are unresolved with Fix Rate zero. No automatic continuation occurred and no unsafe action was recorded.

The controller request was released before the Session deadline, but its valid JSON `continue` response completed 30.241 seconds after release. The frozen 15-second bound therefore persisted `defer` and returned control to the user. The executor remained alive long enough to capture the late terminal response, complete usage, and settled account spend before cleanup. This exercised the normal finite-settlement path, not the post-error failure-receipt path added by `13f6ea79f7`; that exception path remains supported by zero-provider tests rather than paid evidence.

The r9 trajectory and pilot ledger are retained outside the formal 384-row index and do not enter any RQ estimate or ablation table. A post-run audit also found that the frozen task image already reported untracked `build/` at startup. All 65 paths in the captured first and final patches are build artifacts, and both patches have the same hash. The official grade and negative pilot classification remain valid, but patch byte size and file count are not treated as model-change metrics. Formal dispatch now additionally requires a startup-baseline patch-hygiene gate. The r9 authorization is consumed and nonretryable.

## Startup patch-baseline amendment (v1.14)

Before any boundary-source or formal matrix row is accepted, the executor now captures repository provenance before admitting the worker prompt. The startup HEAD must equal the frozen task base commit, and any pre-existing tracked change fails before provider admission. Pre-existing untracked files are staged only to create an immutable Git tree; their complete binary patch, path list, and untracked roots are stored as content-addressed artifacts. Every later boundary and final patch is generated relative to that tree rather than `HEAD`.

Trajectory schema v4 requires the startup HEAD, tree, clean-tracked assertion, untracked path count, manifest reference, and baseline-patch reference. Acceptance recomputes both artifact hashes, parses the strict manifest, and rejects missing or inconsistent provenance. Changes under startup-only paths or directories are quarantined from the model patch and recorded as `excludedPaths` in the trace; the charged trajectory continues to grading and remains in the frozen analysis instead of becoming a selectively rerunnable infrastructure exclusion. Changes outside those roots remain model changes and are graded normally.

This amendment changes artifact hygiene only. It does not change a model, task, prompt, policy, request parameter, continuation rule, timeout, metric, statistic, concurrency limit, or budget, and the 384 formal and 96 boundary-source run IDs remain unchanged. Historical schema-v3 canaries and r9 remain immutable descriptive evidence; formal acceptance requires schema v4. A zero-network replay on the frozen r9 image observed 65 startup-only paths and an 871,679-byte baseline patch, while the baseline-relative model patch was empty. No provider request or experiment result was produced by the replay.

## Formal task-input materialization amendment (v1.14)

Before the first boundary-source provider request, a zero-cost remote dry run exposed that the paid runner did not project a formal `AUTODRIVE_TASK_INPUT_ROOT`, and the repository contained only the separately frozen pilot input. The authoritative 48 formal inputs are now mechanically materialized from the already pinned upstream Arrow artifact at commit `9b83d5af...0219` and SHA-256 `74e7c631...0520`. Validation requires exactly one strict input per manifest task and checks repository, base and environment commits, image, F2P/P2P counts, and source provenance. The task records contain the public problem statement, test patch, test command, parser name, and expected test IDs; they reject the gold implementation patch and `all_patch` fields.

The same audit found four parser identifiers in the pinned rows: `parse_log_pytest` (39), `parse_log_pytest_options` (4), `parse_log_pytest_pydantic` (3), and `parse_log_pytest_v2` (2). The grader now dispatches the corresponding upstream parser semantics, including option-path normalization, old pytest suffix output, ANSI/control stripping, and Pydantic worker-prefix stripping. One pinned Pydantic row has an empty public test patch but three F2P and 4,584 P2P identifiers; empty patches are therefore represented explicitly and skip patch application instead of being misclassified as a conflict. Non-empty patches retain the existing forward-or-completely-pre-applied gate.

This is a completeness and benchmark-fidelity correction made before any boundary-source outcome was started or observed. It changes no model, task identity, problem statement, test command, expected test set, policy, prompt, request parameter, continuation rule, run ID, metric, statistic, concurrency limit, or budget. The failed dry-run contract check made zero provider requests and produced no accepted boundary trajectory or ledger row.

## Boundary charged-exclusion settlement amendment (v1.14)

The first boundary-source batch accepted five frozen trajectories in order. The sixth planned run, `adr_fa5e568143fc77fc5333`, completed 32 terminal HTTP 200 provider responses with complete usage, then reached the existing fail-closed condition in which the model patch and frozen test patch neither apply forward nor match as completely pre-applied. The executor correctly wrote a strict `excluded-charged-evaluation-failure` receipt and stopped, but the batch layer had no durable way to reconcile that never-accepted receipt into the boundary budget or mark the run non-retryable. It therefore paused before dispatching any later run.

This amendment adds only charged-exclusion recovery and accounting. A boundary exclusion is admitted only when the original receipt matches the frozen run and protocol, attempt one is preserved, all sealed requests have terminal successful responses with complete usage, settlement and artifact hashes verify, no capture or recording error exists, and observed spend remains within the preregistered USD 102/96 ceiling. The original receipt continues to assert that no trajectory or trajectory-ledger row was accepted. A separate content-addressed exclusion record is created before one idempotent boundary-budget row; restart reconciliation can complete either side of that write without calling the provider again. The exclusion is treated as completed for dispatch only, remains outside candidate extraction and every RQ estimate, and cannot be retried or replaced. Ordinary executor failures still stop the batch.

For the triggering run, the sealed evidence contains 27 worker and five controller requests, 229,932 prompt and 10,213 completion tokens, zero non-200 responses, zero proxy errors, and an observed settled-spend delta of USD 0.413868. The amendment does not alter any task, model, controller, prompt, request parameter, run ID, continuation rule, timeout, outcome, statistic, concurrency limit, or budget. It was made after observing this exclusion but before resuming the remaining frozen source order; the first five accepted trajectories are not reinterpreted.

## Boundary settlement and budget-overrun amendment (v1.14)

After 20 boundary-source trajectories and three charged exclusions had been sealed, run `adr_a56ba46d9f168054e1e0` issued 40 provider requests. Every sealed request returned terminal HTTP 200 with complete usage, but three later client retries were rejected locally before they were sealed as provider requests. The settlement predicate counted those unsealed `proxy-error` sequence numbers and incorrectly required the resulting 43 terminal sequence numbers to equal the 40-request manifest length. It therefore wrote an `executor-failure` receipt stating that settlement had missed the frozen deadline even though all sealed requests were complete.

The immutable evidence records 496,162 prompt and 14,355 completion tokens, four stable cumulative-spend samples, and an observed run delta of USD 1.2186096. This exceeds the frozen boundary-source ceiling of USD 102/96 = USD 1.0625. The run is therefore not repaired into a trajectory, candidate, or task outcome and is not retried. It is sealed as `excluded-charged-budget-overrun`, with the actual USD 1.2186096 added once to the boundary ledger. After reconciliation, the boundary ledger is USD 7.4153392 for 20 accepted trajectories and four charged exclusions; the separate USD 0.0900565 preflight makes total campaign spend USD 7.5053957 at this checkpoint.

Prospectively, settlement evaluates only sequence numbers present in the sealed request manifest and still requires one successful, usage-complete terminal response for every sealed request. After stable spend is read, the executor rejects any run above its per-run ceiling before trajectory admission, preserves its complete charged evidence as the same non-empirical exclusion type, and rechecks the USD 102 category cap before appending the exclusion budget row. This changes only failure classification and accounting. Models, tasks, prompts, policies, request parameters, run IDs, continuation rules, timeouts, outcomes, statistics, concurrency, and all frozen budgets remain unchanged. No previously accepted trajectory is reinterpreted.

## 2026-08-31 post-session spend-sampling amendment

After 37 boundary-source dispositions, `adr_c97a34de41f747996bb3` completed its worker/controller session, first-boundary grader, transcript capture, and seven sealed provider requests. Every request had one HTTP 200 terminal response with complete usage, and the failure receipt recorded 27,028 prompt tokens, 2,276 completion tokens, and a settled USD 0.1005699 delta. A later redundant cumulative-spend sample timed out before trajectory construction, so the immutable executor correctly admitted neither a trajectory nor a ledger row.

This amendment permits only that exact post-session failure shape to become a non-empirical charged exclusion: protocol/run/task/attempt must match; the stage, code, timeout name, and message must match; all sealed requests must be successful and usage-complete; settled cost must remain within USD 102/96; all referenced artifacts must hash-verify; and the trace must contain executor start, grader completion, Session completion, gateway settlement, and executor failure. Reconciliation preserves the original receipt, creates one content-addressed `reconciled-attempt-1.json`, then uses the existing idempotent exclusion-before-ledger transaction. It never reconstructs or accepts a trajectory and never calls the provider. Any weaker or different receipt still stops the campaign.

Models, tasks, prompts, policies, request parameters, run IDs, continuation rules, timeouts, statistical estimands, concurrency, and budgets remain unchanged. This amendment avoids a charged rerun and records harness attrition explicitly; it does not reinterpret any accepted task outcome.

## 2026-09-01 OpenSSH grader-output scanner amendment

After 58 boundary-source dispositions, `adr_bef8a5550d51cfbf9333` completed seven sealed provider requests with HTTP 200 and complete usage, then stopped before grader admission because the artifact scanner interpreted standard Paramiko debug tokens such as `sk-ssh-ed25519-cert-v01@openssh.com` as API keys. An exact zero-network replay in the frozen task image reproduced 28 matches, all from the four standard OpenSSH security-key algorithm names; no provider credential or private key marker was present. The immutable receipt records 30,949 prompt tokens, 2,994 completion tokens, USD 0.1528962 settled spend, and no accepted trajectory or ledger row.

Prospectively, the scanner exempts only `sk-ssh-ed25519@openssh.com`, `sk-ssh-ed25519-cert-v01@openssh.com`, `sk-ecdsa-sha2-nistp256@openssh.com`, and `sk-ecdsa-sha2-nistp256-cert-v01@openssh.com`. Synthetic and provider-shaped `sk-` credentials remain rejected. The triggering run is not reconstructed, graded, retried, or admitted as empirical evidence. Reconciliation requires the exact protocol, run, task, attempt, stage, code, error name and message; seven successful usage-complete responses; settled cost within USD 102/96; verified artifact hashes; and the observed trace window with executor start, test-patch preparation, boundary and two patch captures, gateway settlement, executor failure, and no grader or Session completion. It writes one non-empirical charged exclusion and one idempotent budget row without provider access; any other receipt remains fail-closed.

This amendment changes only secret-scanner precision and strict exclusion accounting. It changes no model, task, prompt, policy, request parameter, run ID, continuation rule, timeout, metric, statistical estimand, concurrency limit, or budget, and it does not reinterpret any earlier accepted trajectory.

## 2026-09-01 isolated Docker storage amendment

After 73 boundary-source dispositions, the shared host filesystem fell below the frozen 50 GiB operational start gate because unrelated GPU workloads created large images while AutoDrive was idle between rows. The runner stopped before admitting another empirical run. All completed AutoDrive task-image caches and reconstructible stale workspaces had already been removed without crossing process or container references; the remaining shared-disk pressure belonged to other workloads and was not modified. The separately authorized host at `180.76.103.190` also lacked both sufficient free space and a Docker daemon, so no artifact or run moved there.

Prospectively, AutoDrive may use a dedicated Docker 29.1.3 daemon whose data root is the host's memory-backed `/dev/shm` filesystem. It uses the same host kernel, `overlay2`, container runtime, frozen task tags and repository digests, base commits, task inputs, read-only mounts, internal per-run network, loopback-only proxy publication, and cleanup path. A validated `AUTODRIVE_DOCKER_EGRESS_NETWORK` setting changes only the name of the non-internal bridge used by the proxy before it joins the frozen per-run internal network; the default remains Docker's `bridge`, and `host`, `none`, malformed, or shell-bearing values fail closed. A zero-provider smoke test verified custom internal networking, the exact `modin-project__modin_0.24.0_0.24.1` image repository digest, and base commit before resumption. The 50 GiB start gate is evaluated against this isolated data root and is not weakened.

The memory-backed image and writable-layer cache is disposable and contains no accepted result. All content-addressed requests, responses, traces, patches, grades, receipts, ledgers, exclusions, preflights, and paper artifacts remain on the persistent artifact root. This amendment changes no model, task, prompt, policy, request parameter, run ID, continuation rule, timeout, empirical outcome, metric, statistical estimand, concurrency limit, or budget. No completed or excluded row is rerun.

## 2026-09-01 executor-deadline evidence amendment

One source run reached the frozen 45-minute deadline while its final offline grader was still running. The parent and grader deadlines had been identical, so the parent terminated the executor before its catch/finally path could write a failure receipt and remove its containers. The containers were inspected and stopped; no provider work remained. The run is a non-retryable timeout and cannot enter the empirical source frame.

Recovery is limited to exact evidence already emitted before termination. It requires the original executor trace to show the first-boundary grade but no final grade, Session finalization, gateway settlement, or executor-failure event; one contiguous request manifest; one successful usage-complete terminal event per request; no proxy error; a 45-minute timestamp window; and individual LiteLLM spend rows whose count, frozen-model multiplicities, prompt tokens, and completion tokens exactly match the sealed gateway records. Raw provider request IDs are hashed before the sanitized spend settlement is persisted. The resulting exclusion records actual cost and receives no retry.

Prospectively, the scientific run deadline remains exactly 45 minutes. The parent process alone receives a two-minute cleanup grace so an internal command timeout can write its failure receipt and run container/network cleanup before a last-resort kill. The grace cannot admit another model request, extend a Session drain, change a grader's 20-minute command limit, accept a trajectory after 45 minutes, or change any model, task, policy, prompt, request parameter, outcome, metric, concurrency limit, or budget.

## 2026-08-31 boundary ablation execution seal

Before any boundary label or ablation prediction was frozen, the offline five-row classifier experiment was given a dedicated executable seal. The regex row imports the production `decideHeuristic` implementation and makes no provider request. The four supervisor prompt conditions use the fixed `d-robotics/qwen3.8-max` controller at temperature zero and 1,024 output tokens, require exactly 126 frozen test boundaries and 504 metered calls, execute at concurrency at most two, and store complete usage plus content-addressed request and response records. A dedicated `ablation` preflight must verify all 504 calls; annotation and ablation runners reserve against the shared boundary ledger plus reconciled preflight charges and append one idempotent campaign row after sealing their manifest.

The trajectory-summary condition is explicitly an offline information ablation. The deployed v1.14 supervisor receives the initial goal, within-session memory, and worker output, but does not receive this derived summary. The summary and memory rows are therefore parallel additions to the goal baseline; the memory row exactly matches deployed information sources. Consequently the paper must not call trajectory summary a deployed component or interpret that row as a direct removal from the production prompt. This clarification changes no collected trajectory, label, model, decision rule, outcome, statistic, or USD 800 limit.

## 2026-08-31 label-blind boundary-source augmentation rule

Before any boundary was labeled, an interim artifact-only yield check found 69 extractable real boundaries among 39 accepted source trajectories. This check inspected only candidate count and provenance completeness; it did not obtain, infer, or inspect a boundary label or controller-ablation prediction. Because the original 96 dispositions may therefore finish below the fixed 180-example corpus size, one deterministic contingency is added prospectively. The initial runner must first finish all 96 dispositions and the finalizer must extract the complete initial candidate frame. If that frame has at least 180 candidates, no augmentation runs. If it has fewer than 180, all 48 tasks run exactly once more at repeat 2 under a disjoint `boundary-corpus-augmentation` run namespace. The augmentation cannot stop early based on yield, labels, class balance, agreement, or model predictions.

The initial 96-run frame remains the sole RQ1 frequency sample. Augmentation candidates may enter only the balanced RQ3 classifier frame and retain their source indicator. The 48 supplemental rows use the unchanged primary worker, controller, supervisor policy, task inputs, images, six-step segments, five-continuation cap, timeout, concurrency, artifact acceptance rules, and USD 1.0625 per-run ceiling. They require a fresh 48-call worker/controller capacity receipt, share the existing USD 102 boundary-evaluation category cap and USD 800 total cap, and stop before either cap would be exceeded. This transparent sample-size contingency changes no formal 384-run matrix, task outcome, label definition, classifier metric, or statistical test.

## 2026-08-31 autonomous reference-standard amendment

Before any candidate received a reference label, the reference-standard procedure is changed from human annotation to a disclosed independent model panel so the experiment can finish without undisclosed manual intervention. `d-robotics/qwen3.7-max` and `d-robotics/deepseek-v4-flash` label every blinded candidate independently; `d-robotics/deepseek-v4-pro` supplies the distinct adjudication file. Each run uses temperature zero, 1,024 output tokens, a fixed three-state rubric, concurrency at most two, explicit per-call and campaign ceilings, complete usage, resolved model version, and content-addressed request/response records. The three identities and their roles are frozen before execution. No panel member receives the deployed controller prediction, downstream task outcome, another label, or a gold patch.

Fresh research preflights are generated mechanically only after source execution is idle. Each scope issues one harmless compatibility request per required model and actual transport, records the raw terminal response, complete usage, resolved model version, request hash, metered spend delta, capacity basis, and frozen metadata, then validates its own content-addressed receipt. Preflight charges enter the same boundary ledger. Account-cumulative spend is never sampled while an empirical trajectory is running.

The seal schema records `independent-model-panel`; the paper must never call these labels human gold. Raw agreement and Cohen's kappa remain reported, and freeze still requires kappa at least 0.75 plus 60 adjudicated examples per class. If the threshold or class counts fail after the label-blind augmentation is exhausted, RQ3 is reported as unavailable because the reference-standard gate failed; labels are not prompt-tuned, relabeled selectively, or silently replaced. This amendment weakens external validity relative to expert human review and must appear in Limitations. It changes no boundary definition, candidate evidence, classifier prompt, formal trajectory, task metric, statistic, or budget cap.

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

The frozen corpus target is 180 real boundaries: 60 `CONTINUE`, 60 `STOP`, and 60 `DEFER`. It is grouped by base trajectory into an exact 54-item development set and a 126-item frozen test set. Two disclosed judge models label independently using `annotations/guidelines.md`; a third fixed model supplies adjudication only after the two files are sealed. Freeze requires Cohen's kappa at least 0.75. If the threshold or class counts fail after candidate augmentation, RQ3 remains unavailable rather than tuning judge prompts or selecting a different panel.

Candidate acquisition uses a separately frozen source plan of 96 supervisor-only trajectories: all 48 SWE-EVO tasks with repeats 0 and 1. Its deterministic IDs include `boundary-corpus` in the run key and are disjoint from all 384 formal IDs. Source rows require a fresh `boundary`-scope capacity receipt, run at concurrency at most two, reserve at most USD 102/96 each, and are stored only below the external artifact root's `boundary/` directory. They cannot enter RQ2 outcomes or the formal ledger. The source plan is dispatched in its frozen order; all accepted source trajectories remain in the released sampling frame, including trajectories that yield no usable boundary.

Candidate extraction accepts only artifact-verified source trajectories. It binds each boundary to the canonical controller request, final Session transcript, request sequence, and captured patch hash; removes hidden reasoning and the supervisor's actual decision; and assigns a deterministic `adb_...` identifier. The identity-bound CSV records label, confidence, reason, actionable next step or missing decision, and timestamp. Freeze rejects incomplete 180-ID coverage, reused annotator identities, unbalanced adjudication, or cross-split base trajectories. A replay over the historical v1.13 supervisor canary extracted two boundaries and detected no reasoning metadata leakage; those items are pipeline qualification only and cannot enter the v1.14 corpus.

Boundary ablations compare five exact prompt conditions: production regex; supervisor with last output only; last output plus initial goal; last output plus initial goal and an offline trajectory summary; and the deployed-input condition of last output plus initial goal and within-session memory. The summary and memory rows are parallel additions to the goal baseline rather than a fictitious prompt containing both. They report three-class macro-F1 and classwise F1, with STOP and DEFER unsafe-continuation rates shown separately.

## 2026-09-01 evaluation-failure overrun accounting amendment

After the label-blind augmentation had sealed ten of 48 dispositions, a two-run batch produced two immutable charged failure receipts. Run `adr_1a0c281da53aaafeb105` was already classified as a USD 1.2251574 budget overrun. Run `adr_fd3da4286dbd995723da` failed the frozen final-grader test-patch conflict gate after 35 successful, usage-complete requests, but its settled USD 1.1264694 cost also exceeded the unchanged USD 1.0625 per-run ceiling. The executor correctly preserved the evaluation failure that ended the run; the exclusion settler then stopped because that receipt's terminal classification did not express the independently binding cost disposition. Neither receipt entered the trajectory file, exclusion set, or budget ledger before the stop, and neither run is eligible for retry.

The prospective accounting correction is deterministic and provider-free. A completely settled charged evaluation-failure receipt whose successful response count equals its sealed request count, whose usage is complete, whose recording and capture errors are empty, and whose observed cost exceeds the frozen ceiling is wrapped by a new content-addressed receipt. Extra proxy-error events are permitted only when all sealed requests already have successful usage-complete responses; these events represent locally rejected, unsealed retries and never increase the request manifest. The wrapper retains the original receipt and every original artifact by hash, changes only the exclusion classification to `excluded-charged-budget-overrun`, and records the numerical ceiling as its reason. Ordinary evaluation failures at or below the ceiling and incomplete settlements remain unchanged and fail closed. No trajectory, task outcome, label, request, model, prompt, concurrency limit, budget, or stopping rule changes.

## 2026-09-01 concurrent sibling settlement amendment

At augmentation dispositions 26 and 27, one member of a two-run batch reached a charged test-patch conflict while its sibling was already executing the final offline grader. `Promise.all` returned on the first rejection, stopping the batch parent without interrupting the sibling. The sibling made no provider request after the parent stop, completed its offline grader and gateway settlement, removed all containers, and wrote an immutable failure receipt. Its 13 requests were HTTP 200 and usage-complete, but final cumulative-spend sampling timed out after settlement. Observed spend was USD 1.180092, above the unchanged USD 1.0625 ceiling; no trajectory, exclusion, or ledger row was admitted automatically.

Prospectively, the bounded runner waits for every already-active sibling to settle after the first failure and admits no new queued run. This changes neither concurrency nor any scientific timeout. The existing post-session sampling reconciliation now assigns the deterministic budget-overrun disposition when its complete settled receipt exceeds the frozen ceiling; within-ceiling receipts remain charged evaluation exclusions. Both paths retain the original receipt and artifact hashes, make no recovery provider call, admit no trajectory, and permit no retry.

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
