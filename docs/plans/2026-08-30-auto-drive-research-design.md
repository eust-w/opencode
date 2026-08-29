# AutoDrive Research Design

## Objective

AutoDrive studies premature conversational yielding in long-horizon coding agents: a worker reaches a safe turn boundary and returns control even though executable, verifiable work remains. The system places a durable controller at that boundary and chooses one of three actions:

- `continue`: admit one provenance-tagged queued prompt and resume execution.
- `stop`: end the current automatic chain because the goal is verified complete.
- `defer`: return control to the human because the next action requires a choice, new authority, or missing information.

The paper will not claim that supervisors, memory, termination checks, or agent loops are new. Its contribution is the turn-boundary problem formulation, a crash-recoverable control mechanism, a frozen benchmark protocol, and an empirical evaluation of completion, intervention, safety, and cost.

## Research Questions

1. How often and in what forms do long-horizon coding agents yield before verified completion?
2. Does turn-boundary continuation improve verified completion while reducing manual continuation prompts?
3. What do heuristics, initial-goal context, trajectory summaries, session memory, and durable admission contribute?
4. What false-continuation, looping, latency, cost, and recovery trade-offs does the controller introduce?

## System Contract

AutoDrive is opt-in and Session-scoped. Session settings override project configuration, which overrides built-in defaults. The built-in defaults are disabled, supervisor policy, five continuations, contextual prompting, and Session-local memory. A real user steer or queued prompt takes precedence and starts a new automatic chain.

Every automatic continuation has durable provenance. A decision records its chain, continuation index, reason, policy, model, usage, and target input ID before the input is admitted. Recovery reconciles a recorded `continue` decision with that same input ID, making admission idempotent across process interruption. Reaching the continuation bound defers to the user instead of silently stopping or restarting the bound.

Session memory is stored outside the worktree. `.opencode/auto-drive.md` may be read only when explicitly configured and is never overwritten by the controller.

## Frozen Evaluation

The end-to-end study uses all 48 SWE-EVO tasks with four policies: verifier-guided oracle continuation, blind continuation, the submitted regex heuristic, and the full tri-state supervisor. Gemini 3.7 Flash runs all tasks. A stratified 12-task subset is repeated with Claude Sonnet 4.6 and GPT-5.4, while the controller model remains Gemini 3.7 Flash. The same 12 tasks receive two additional Gemini repetitions, for 384 end-to-end trajectories.

Each run uses a pinned container and repository revision, temperature zero where supported, six worker steps per segment, no more than five continuations, a 45-minute timeout, and a recorded cost cap. A 180-example boundary dataset contains 60 examples per action, with 54 grouped development examples and 126 grouped held-out examples. Two independent annotators must reach Cohen's kappa of at least 0.75 before the protocol freezes.

Primary outcomes are executable task success, partial fix rate, manual continuations, macro-F1, false continuation on `stop` and `defer`, redundant turns, token usage, cost, latency, and crash recovery. Paired binary outcomes use exact McNemar tests; continuous paired outcomes use task-clustered bootstrap confidence intervals; ablation comparisons use Holm correction.

The experiment budget stops at USD 800: USD 50 for pilot work, USD 360 for the primary model, USD 288 for cross-model runs, and USD 102 for boundary evaluation and declared infrastructure reruns. Negative results remain reportable results.

## Deliverables

The artifact contains immutable manifests, JSONL trajectories, tabular results, an annotation guide, a cost ledger, analysis scripts, environment locks, and a reproduction guide. The English paper targets a 10--12 page ACM-style manuscript with a full appendix and both anonymous and identified builds. A Chinese research report accompanies it. Author metadata remains placeholder-only until separately approved, and no push, pull request, or arXiv upload is authorized by this design.
