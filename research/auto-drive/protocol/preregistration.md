# AutoDrive Preregistration v1.2

Frozen: 2026-08-30 (Asia/Shanghai)

## Provider-resolution amendment (v1.1)

Before any paid trajectory was accepted, the executable model inventory showed that Gemini 3.7 Flash is exposed as `google/gemini-3.7-flash`; the v1 identifier `opencode/gemini-3.7-flash` did not resolve to that model. Version 1.1 changes only the provider prefix for the primary worker and controller, and consequently regenerates deterministic run IDs. The dataset, task selection, policies, prompts, sampling parameters, run count, metrics, statistics, and budget remain unchanged. No result was observed before this amendment.

## Artifact-integrity amendment (v1.2)

The rejected v1.1 engineering pilot showed that a single declared request hash was insufficient for an end-to-end trajectory containing multiple worker and controller calls. Before any paid trajectory was accepted, version 1.2 upgraded the result contract to an ordered request manifest and requires the host harness to recompute every normalized request, model-metadata, preflight-receipt, and raw-trace SHA-256 before admitting either the result or its ledger entry. A fresh paid-capacity receipt with exact resolved model versions and disabled external skill/model discovery is mandatory. Because the protocol version is part of the deterministic run key, all 384 run IDs were regenerated. Experimental tasks, policies, prompts, sampling, outcomes, statistics, and budget are unchanged; rejected v1.1 pilot IDs remain historical evidence and are not rewritten.

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

The primary worker is `google/gemini-3.7-flash`. Replication workers are `anthropic/claude-sonnet-4.6` and `openai/gpt-5.4`. Every supervisor call uses `google/gemini-3.7-flash`. Cross-model results are a generalization replication and not the primary estimate.

Every run uses the pinned task image and base commit, temperature zero, the exact request record in `model-requests.json`, six worker steps per segment, at most five automatic continuations, at most 45 minutes, and no more than two concurrent tasks. The resolved provider/model version and normalized request body must be saved before a record is accepted.

## Boundary corpus and ablations

The corpus contains 180 real boundaries: 60 `CONTINUE`, 60 `STOP`, and 60 `DEFER`. It is grouped by base trajectory into an exact 54-item development set and a 126-item frozen test set. Two annotators label independently using `annotations/guidelines.md`; disagreements are adjudicated only after independent labels are sealed. Freeze requires Cohen's kappa at least 0.75. If the threshold is missed, the guide may be clarified and all affected examples re-annotated before one final freeze; the frozen test set is not prompt-tuned.

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
