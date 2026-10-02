# AutoDrive: adversarial methodology review for a journal submission

Review date: 2026-10-03. Reviewed source: `05697c9d9f8a2ce9c273f63d86fe72aa12942dd4`.

Scope: source-level scientific review of the manuscript, protocol, annotation instrument, executor, and analysis implementation. No remote labels, unsealed panels, credentials, or paid experiments were accessed. Line references below refer to this commit; subsequent repairs should cite their own commit and preserve this review. This is not a report of new empirical results or a prediction of editorial acceptance.

## Verdict and strongest defensible contribution

The current artifact supports an inspectable systems contribution: a session-scoped, three-action continuation interface with bounded execution, user-priority scheduling, and durable exactly-once **admission** across a decision/admission crash window. It also supplies a detailed, versioned experiment protocol. It does not yet establish a general coding-performance benefit, natural handoff prevalence, reduced human effort, or measured safety/recovery rates. Completing the existing matrix alone would not resolve several measurement and identification defects identified below.

The strongest honest narrower paper would study **reliable continuation admission under imposed agent turn limits**, explain its failure model, state and test safety/liveness invariants, and report externally graded task outcomes and operational costs with explicit missingness. This can be a useful reusable engineering abstraction. Supervisor prompting, a third abstention state, deterministic identifiers, and an event log are not individually sufficient novelty claims. The journal-level question is whether their integration yields a generalizable, demonstrated result that another agent system could reproduce.

## Priority findings

### P0-1: Several claimed outcome measures are not actually measured

Evidence:

- `packages/autodrive-eval/scripts/gateway-host-executor.ts:345` assigns `manualContinuationCount: 0` to every ordinary trajectory.
- The same file at lines 346–348 calls adjacent unchanged patch hashes `redundantTurns`, at line 354 assigns `recoverySucceeded: !drained.failure`, and at line 355 assigns `unsafeContinuationCount: 0`.
- `packages/autodrive-eval/src/artifact.ts:250–260` aggregates these fields as manual, redundancy, safety, and recovery outcomes.
- `packages/autodrive-eval/src/paper-results.ts:55` exports the ordinary-run aggregate as `RecoveryRate`.
- `paper/main.tex:278` defines redundancy using repository changes, Fix Rate, diagnostic evidence, and resolved uncertainty; lines 333–335 describe safety and injected-fault recovery outcomes. `paper/appendix.tex:92` explicitly requires multiple recovery invariants, not ordinary successful execution.

Consequence: an unattended run contains no human input by design; its zero manual count cannot estimate reduced interaction demand. Read-only diagnosis can produce an unchanged patch without being redundant. A no-fault trajectory that finishes is not a successful crash-recovery trial. A placeholder zero is not evidence that no unsafe continuation occurred. The current generator can eventually convert the recovery surrogate into a misleading empirical statement even after all formal rows pass provenance checks.

Required correction before reporting: mark unmeasured constructs unavailable; expose unchanged-patch transitions as a specifically named proxy; derive user-origin input counts only where such inputs were observed; require a separate fault-run dataset with failpoint, restart, invariant checks, and eligible denominator before exporting recovery. Keep observed intervention counts separate from any simulated “continuations a user would need.” The latter requires a prespecified counterfactual interaction protocol and cannot be obtained by relabeling automatic inputs.

### P0-2: RQ1 conflates forced segment termination with natural premature stopping

Evidence:

- `packages/core/src/session/runner/max-steps.ts:1–16` instructs the worker that maximum steps are reached, disables tools, and mandates a summary, remaining work, and recommended next actions.
- `packages/core/src/session/runner/llm.ts:211–229` removes tools and appends this cue at the final allowed step.
- `packages/autodrive-eval/src/protocol.ts:43–45,85–87` fixes six steps, five continuations, and a 45-minute bound.
- `paper/main.tex:124,294–296` asks how often trajectories contain premature handoffs and proposes interpreting concentration near step limits.

Consequence: at the cap, the interface creates the boundary and asks the worker to expose unfinished work. This is a legitimate stress test of continuation under an imposed limit, but it cannot identify the natural prevalence of model-chosen early handoffs. A classifier can exploit the injected maximum-step/remaining-work language. Off stops at one segment while continuation arms can receive up to six segments, so an off gain can be caused by extra permitted computation.

Immediate reporting correction: qualify the estimand as first-boundary actionability under the frozen six-step configuration. Report natural model stops, explicit runtime cap stops, provider failures, and user/permission blocks separately when trace evidence can identify them. Do not infer boundary type from the worker's wording alone when an injected cue is recorded.

New prospective study: retain v1.14 untouched; add a separately registered natural-stop cohort using the runtime's realistic deployment allowance and an uninterrupted worker baseline with matched total tool/model opportunity. Factor segment size and forced cue separately. A cue-removed replay is a sensitivity experiment, not a replacement for naturally collected boundaries.

### P0-3: The declared primary contrast is missing from the statistical implementation

Evidence:

- `paper/main.tex:284,300` declares supervisor minus its own off prefix as the primary estimand.
- `packages/autodrive-eval/src/formal-analysis.ts:51–65` computes paired inference only for oracle, blind, and regex versus supervisor. Lines 75–90 summarize supervisor prefixes without the paired supervisor/off test or interval.
- `packages/autodrive-eval/src/paper-results.ts:47` fills `SupervisorDelta` from the regex contrast. Lines 49,53–54 similarly use regex for manual, cost, and latency differences.

Consequence: the main text can present the wrong comparator. Off prefixes from different policies are different realized trajectories; pooling them as additional independent controls would also exaggerate sample size. The correct exact-prefix comparison is descriptive of giving that run more opportunity, not an estimate of policy intelligence at equal compute.

Required correction: implement the already stated own-prefix binary and partial-progress contrast with one pair per task in the primary repeat-zero stratum. Give every comparison a comparator-specific name in JSON, CSV, tables, and macros. Retain task pairing for distinct policy runs; call it matched-by-task, not identical-history counterfactual pairing. Define the multiple-testing family explicitly, including how the primary off contrast relates to secondary comparisons. Preserve the old analysis as a versioned artifact and identify the correction before formal analysis.

### P0-4: The replacement judge panel includes the evaluated controller

Evidence:

- `protocol/preregistration.md:251–261` replaces an availability-limited panel with Qwen 3.7 Max and Qwen 3.8 Max, and conditionally GLM 5.3 as adjudicator.
- `packages/autodrive-eval/src/protocol.ts:53–56` fixes Qwen 3.8 Max as the AutoDrive controller.
- `paper/main.tex:264` still names the initial Qwen/DeepSeek panel. Line 294 still says “frozen human label.”

Consequence: isolated model calls do not establish statistical or epistemic independence. Same-family judges may share mistakes, and the evaluated model also contributes to its own reference standard. High kappa can coexist with incorrect labels; it measures agreement, not correctness. Switching only when coverage becomes inadequate avoids selection on the observed agreement score, but does not remove model-family or missingness bias.

Immediate correction: describe the actual fallback and its trigger; use “separately prompted model judgments,” and never call these human gold. Label all resulting F1/safety rates as agreement with this model-based reference. Report same-controller inclusion prominently, not only as a generic threat.

Journal extension: use separately recruited expert annotators with a blinded, task-reconstructable evidence packet; establish their competence and adjudication process; preserve all independent labels. A sufficiently sampled human audit can quantify model-panel validity, but cannot retroactively turn the entire panel into expert gold. Reserve controller-disjoint and family-disjoint panels as sensitivity checks rather than selecting the panel with the best agreement.

### P0-5: Failure retention, exclusions, and all-or-nothing completeness conflict

Evidence:

- `protocol/preregistration.md:328,355` says timeouts, provider errors, missing, and budget-exhausted trajectories are outcomes retained as failures.
- `paper/main.tex:290,347,361` excludes charged budget overruns/harness failures from the empirical index. The executor calls a ceiling validator before trajectory finalization at `gateway-host-executor.ts:319–327`.
- `packages/autodrive-eval/src/formal-analysis.ts:27` requires exactly 384 accepted rows; `paper/appendix.tex:168,186` gates the analysis/publication pipeline on that count.
- `packages/autodrive-eval/src/budget.ts:1–11` sets category maxima summing to USD 878 while independently enforcing USD 800 globally. This is a valid set of overlapping ceilings, but cannot guarantee financing every category at its maximum.

Consequence: cost overruns and unavailable outcomes can be correlated with task difficulty or policy. Keeping their receipts is necessary but does not make accepted-only outcome estimates unbiased. If a charged formal run is unrepeatable and cannot enter the index, a requirement for all 384 accepted records can become impossible. A campaign halted by its legitimate budget rule must still be publishable as an incomplete, honestly bounded study.

Required correction: create a derived disposition table covering every planned identity: not dispatched, dispatched and evaluated, provider/model failure, budget termination, ungradable harness failure, or invalid provenance. Do not fabricate a grade for an ungradable run. Report policy-level dispatched denominators, completion/availability, conservative operational-success estimates, and best/worst bounds where outcomes are unknown. Keep conditional accepted-row analysis visibly secondary. Cost uses all charged events. Do not rewrite exclusion receipts or invent a same-ID rerun. A prospective analysis addendum should resolve the failure/exclusion ambiguity and define the budget-stop report; existing frozen confirmatory results remain a separate output.

## Substantial validity limitations

### P1-1: Run-disjoint splits are not task-disjoint

Evidence: `annotation.ts:72–74,202–223` partitions by `baseTrajectoryID`; candidates also carry `taskID` at line 13. `protocol.ts:120–165` samples repeated trajectories from the same 48 tasks. Formal and boundary run IDs differ, but the tasks recur.

A task can therefore contribute near-duplicate goals, repository state, and solution context to both development and test. No leakage of the identical trajectory is a useful guarantee, but it is not unseen-task generalization. Development prompt/regex iteration is explicitly allowed by `paper/appendix.tex:62`, so this distinction matters. Preserve the frozen split and name it accurately. Add prospectively held-out tasks/repositories for a journal generalization claim; do not reshuffle an already accessed test set and call it untouched. Report overlap by task and repository as well as by trajectory.

### P1-2: Available-label frequency is not an all-source prevalence estimate

Evidence: `annotation.ts:103–121` finds each available first boundary, filters out missing adjudications, and divides CONTINUE counts by the surviving labeled-first-boundary count. It also reports missing source trajectories, which is useful but does not adjust the estimate. `preregistration.md:249` restricts classifier selection to common judge coverage before class balancing.

Output truncation and coverage failure can depend on packet length, ambiguity, or class. Label-blind selection prevents explicit class cherry-picking; it does not make missingness random. In addition, later source boundaries are generated only after the deployed supervisor chose to continue, creating on-policy survivor selection. Later-boundary ablations do not estimate decisions on histories that blind or alternative controllers would have reached.

Report the first-boundary estimate explicitly conditional on extractable, adjudicated coverage, with all 96 source dispositions and candidate-level missingness. If C labeled first boundaries are CONTINUE, L are labeled, and N source runs were planned, C/N to (C+N-L)/N are transparent bounds for the *joint* event that a planned source yields a CONTINUE first boundary when unknown cases are unrestricted; they are not bounds on a differently conditioned natural-stop rate. For a new study, collect independently sampled natural first boundaries and prespecify censoring and missingness analyses.

### P1-3: Blinding and the permission construct are weaker than described

Evidence: `annotation.ts:374–393` copies within-session memory from prior controller requests into candidates. `model-annotation.ts:64–78` shows that memory, the worker output, a visible-trajectory tail, and the patch to judges. The candidate schema at `annotation.ts:10–21` has no explicit permission state. `paper/appendix.tex:56` claims a current-permission packet and withholding supervisor outputs.

The current boundary's decision is hidden, but prior controller-generated memory may encode previous judgments, plans, and permission interpretations. That can guide reference judgments toward the controller's own framing and particularly favor the memory condition. A patch and a 16,000-character visible-tail rendering are not necessarily enough to certify task completion or authority. The summary is a truncated trace representation (`annotation.ts:375–379`), not a separately validated abstractive summary.

Immediate correction: describe every visible source exactly and limit blinding to what is actually removed. Call the summary a derived visible-trace tail. Do not claim explicit permission provenance unless present. A new expert packet should include authenticated admitted scope and permission state, relevant test evidence, and boundary-time repository reconstruction; compare a controller-memory-free reference packet separately. Existing packets/labels remain unchanged.

### P1-4: Offline ablation is not deployed controller reliability or a causal memory effect

Evidence: `scripts/ablation-runner.ts:158` uses a 60-second request timeout, `src/ablation.ts:27–34` uses nonstreaming calls, and lines 58–59 reject invalid semantic responses. The deployed contract is 15 seconds with DEFER on failure (`protocol.ts:83–84`). `ablation.ts:68–83` compares parallel summary and memory additions, correctly avoiding a fictitious cumulative combination.

Identical information sources do not imply identical operational behavior. A late or malformed response may be dropped offline yet become a DEFER online. At a fixed boundary, removing memory tests information dependence on histories generated with memory-enabled supervision; it does not identify how disabling memory throughout a session would change histories, decisions, and task success. Packet length also changes compute and latency.

Report conditional semantic classification and operational decision yield separately, including every attempted call's timeout/invalid-output disposition and cost. For a new operational replay, reproduce the deployed deadline, parser, and failure action with sealed raw responses. For a causal component claim, prospectively randomize complete sessions to with/without memory (and goal/context as separate factors where justified), not only prompt fragments on selected histories. Fixed-boundary ablation remains useful and should retain its narrower interpretation.

### P1-5: Oracle and extra-compute controls answer different questions

Evidence: `gateway-host-executor.ts:432–456` grades oracle boundaries and injects a fixed prompt on unresolved states; `paper/main.tex:259` says other policies do not receive intermediate verifier labels. `paper/appendix.tex:150` allows controller-specific concrete prompts for regex/supervisor.

The oracle's choice to continue transmits at least a binary hidden-test failure signal. It is privileged feedback even if the gold implementation patch is never shown. Repeated grader execution also consumes wall time differently. Equal continuation caps do not equalize tokens, useful tool calls, controller cost, or task progress. Supervisor-versus-blind further changes both stopping decisions and continuation wording.

Keep oracle as a privileged-information diagnostic; do not label it a fair autonomous baseline or attainable upper bound. Audit that hidden tests/results never enter the worker checkout, memory, or tools for non-oracle arms. In a new matched-budget study, add a strong uninterrupted worker, a static continuation controller, and a decision-only supervisor using the same continuation text. Plot independently preregistered success/cost frontiers at several fixed resource budgets and separate verifier overhead. These additions require new run IDs and a prospective budget allocation.

### P1-6: Precision, clustering, repeat analysis, and multiplicity are incomplete

Evidence: primary comparisons in `formal-analysis.ts:99–125` use 48 task pairs; lines 66–74 summarize cross-model strata without paired intervals; line 81 pools all extra repeats across policies. `ablation.ts:86–112` produces point classification reports only. `statistics.ts:16–38` implements task-array bootstrap, not a nested/task/repository resampling routine. `paper/appendix.tex:31–39` gives DVC 26/48 tasks.

384 trajectories are not 384 independent tasks. Pooling repeat policies makes the repeated-run summary uninterpretable as treatment replication. Boundary items are clustered by task and trajectory; a naive item bootstrap would be too optimistic. Seven repositories are too few to promise precise repository-population inference. Holm adjustment currently covers three binary policy tests; the manuscript must distinguish confirmatory outcomes/families from descriptive intervals across numerous metrics and component conditions.

Before data access, specify one primary estimand, directional convention, comparison family, and task/repeat aggregation rule. Add paired task-clustered intervals for boundary metric differences, policy-separated repeat summaries, and repository leave-one-out or equal-repository-weight sensitivity. Use independent statistical recomputation. Perform prospective detectable-effect/power analysis over plausible discordance rates rather than choosing sample size after seeing significance. As a planning illustration, even zero errors among 60 independent DEFER cases has a one-sided 95% exact binomial upper bound about 4.9%; demonstrating below 1% with zero errors needs at least 299 independent cases. Correlated boundaries make that simple-binomial illustration optimistic. Neither number is an observed result or an instruction to spend beyond USD 800.

### P1-7: The annotation quality gate has a contradictory instruction

Evidence: `annotations/guidelines.md:50–56` permits clarifying rules and reannotating after kappa falls below 0.75, whereas `preregistration.md:306` and `paper/appendix.tex:60` prohibit prompt/panel tuning after observed disagreement and leave RQ3 unavailable.

Freeze cannot mean both “stop at the predeclared gate” and “iterate until reaching the threshold.” Publish a versioned execution erratum making the applicable frozen stop rule explicit. Development-only calibration must happen on a separate designated pool before test/reference evaluation. Do not reannotate the historical test corpus until agreement passes. Report agreement on the full common-coverage frame as well as the selected balanced corpus; adjudicated balancing changes marginal distributions and thus the interpretation of kappa.

### P1-8: Amendments and temporal drift require a study-history audit

Evidence: `preregistration.md:5–261` documents many request/model/output/fallback/accounting amendments; `main.tex:355` acknowledges gateway aliases. `protocol.ts:100–117` creates a deterministic policy-order plan rather than randomized policy blocks.

The record is unusually transparent, but a prospective amendment after an observed infrastructure event is not the same as a completely preregistered untouched study. Some exposed canaries involve main-benchmark tasks, and availability/model changes depend on observed outputs even if label distributions were not inspected. A month-long interruption also means an alias may resolve to a changed service when resumed. A normalized request hash identifies inputs; it does not prove immutable model weights.

Release an amendment timeline stating exactly which observations were available when each decision was made, which runs each version governs, and which labels/outcomes remained sealed. Keep contamination sensitivities already specified. On resumption, compare observable model metadata and transport behavior with the sealed snapshot; unknown identity stability must be disclosed as an epoch limitation. A new journal study should randomize/balance policy dispatch order within task/model/epoch blocks and prespecify epoch effects. Do not silently replace a frozen model or combine epochs as if exchangeability had been established.

## What may be claimed now, and what needs new evidence

| Claim | Present support | Required restriction or evidence |
|---|---|---|
| Three-action continuation API with persistent admission | Source design and targeted tests can support it | Cite concrete tests and threat/failure assumptions; tests do not prove arbitrary distributed execution |
| Exactly-once admission across a specified crash window | Mechanism is defined in `main.tex:193–206` | Do not extend to exactly-once provider/tool effects; report restart/failpoint evidence separately |
| Recovering from six-step interface handoff | Frozen experiment is designed to test it | Await real outcomes; qualify the artificial cap |
| Natural frequency of premature stopping | Not identified by the forced-limit cohort | Independent natural-stop sampling and explicit denominator |
| Better success at equal compute | Not identified by off-prefix comparison | Strong matched-compute controls and prospective resource design |
| Lower user burden | No human intervention protocol; count fixed to zero | Observe users or prespecify and label a simulator-based proxy |
| Safe continuation | Only future reference-relative errors under current design | Valid reference standard, uncertainty bounds, scoped adversarial cases, operational failures |
| Memory improves end-to-end autonomy | Offline selected-history ablation only | Session-level randomized component study |
| Generalization to new tasks/frameworks/models | One runtime, repeated task set, mutable aliases | Held-out tasks and a second runtime or explicitly narrow claims |
| Journal publication readiness | Not established | Complete verifiable results, construct-valid analysis, independent reproduction, venue-specific review |

## Prospective journal extension, without changing the old experiment

1. **Archive v1.14 as its own study.** Preserve its protocol, rows, failed attempts, exclusions, ceilings, selection rules, and non-results. Add a dated correction/deviation map and claim-to-evidence table. Do not turn subsequent repairs into claims about what was originally executed.
2. **Pre-register a causal question.** Prefer: at a fixed task resource budget, does boundary-sensitive continuation improve externally verified task success while limiting unjustified admissions, compared with static continuation and a stronger uninterrupted worker? Keep interface-imposed and model-chosen boundaries separate.
3. **Create held-out evaluation units.** Choose new tasks or a second well-specified task source and split by task, with repository holdout where feasible. Public benchmark contamination and task/image eligibility should have outcome-blind rules. Set sample size using a prespecified smallest practically meaningful effect and attainable budget; do not advertise 384 as a universal sufficiency threshold.
4. **Freeze controls and randomization.** Use a common initial task/harness envelope, explicit controller/prompt budgets, randomized blocked dispatch, a predeclared model-epoch policy, and paired unit definitions. Include static continuation, decision-only supervisor, full supervisor, and matched total-budget uninterrupted worker. Treat the oracle separately.
5. **Construct an external reference standard.** Independently annotate natural first boundaries and a separate authority-risk challenge set. Supply explicit permission provenance, withhold controller memory for the primary judgment, and use qualified human adjudication. Keep the old model-panel data as a disclosed sensitivity resource.
6. **Test mechanisms separately.** Fixed-history information ablations estimate classification dependence; randomized whole-session ablations estimate downstream component effects. Run real process-death recovery tests at deterministic storage failpoints, plus scheduling adversaries, and verify invariant traces.
7. **Predefine incomplete-study output.** Every planned and charged identity gets a disposition. Report operational success, graded success, unavailable grades, costs, bounds, and prespecified early-budget-stop consequences. Keep all inference reproducible from an immutable derived snapshot.
8. **Obtain independent replication.** A separate environment/operator should reproduce core admission/fault behavior and a prespecified task subset. A second runtime integration would test whether the claimed abstraction generalizes. Reproduction cannot be replaced by another pass through the same report generator.

This extension is a design proposal. It authorizes no new spending, model substitution, labels, or data mutation and cannot repair old causal identification retroactively.

## Concrete non-data repairs that can be implemented immediately

- Add the missing own-prefix paired contrast and comparator-specific result names, with meaningful regression tests using analytic fixtures.
- Require dedicated fault evidence before exporting a recovery macro; leave unsupported interaction/safety measures explicitly unavailable.
- Rename the unchanged-patch metric in derived reporting, preserving the historical raw field and its provenance.
- Emit task/policy/repeat/epoch coverage and disposition reports; add a documented incomplete-study report path distinct from the frozen complete-matrix analysis.
- Add task-overlap diagnostics to the annotation split audit without changing the frozen split.
- Document forced-boundary semantics, the actual model panel, controller/judge overlap, memory visibility, and the 60-second offline versus 15-second deployed distinction.
- Add a versioned annotation erratum for the low-kappa rule rather than rewriting the original protocol.
- Make the manuscript's current claims match the implemented measurements; reserve journal-extension outcomes for new preregistered evidence.

These fixes prevent avoidable invalid claims. They do not supply missing experiments, guarantee a favorable result, or make a top-journal acceptance claim defensible.
