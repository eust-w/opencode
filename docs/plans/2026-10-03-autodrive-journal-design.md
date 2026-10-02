# AutoDrive: prospective journal-strength evidence design

Date: 2026-10-03. **DRAFT — not executed, not a sealed paid-run manifest.** This supplements, rather than replaces, frozen v1.14. Author approval of a final manuscript, venue, identities, and upload remains separate. No positive-result or journal-acceptance guarantee is made.

## Decision and contribution

The current evidence supports an implemented system and descriptive pilot cases, not a completed empirical journal article. The candidate contribution is a **defer-aware, crash-reconcilable continuation admission design and a measured account of when its benefits justify its costs**. Supervisor, memory, premature termination, and bounded loops are not claimed as firsts.

Three paths were considered:

1. Expand prose around the existing canary: inexpensive but cannot support general claims; reject as a journal-results strategy.
2. Finish v1.14 and narrow the paper to imposed-horizon continuation: valid even with null results, but does not identify equal-compute benefit or natural prevalence.
3. Preserve v1.14, then add independently frozen, hypothesis-driven studies that remove its main confounds: recommended for the requested journal-level ambition. It costs additional research effort; feasibility must be reconciled against actual settled spend before any dispatch.

TSE and TOSEM are provisional software-engineering targets, not claims of template compliance. The journal-specific format and submission obligations must be checked in the chosen publisher's current interface. The scientific design below is our recommendation, not an invented publisher rule. Community guidance emphasizes claims tied to observations, appropriate assumptions, and transparent limitations; it does not mandate an arbitrary number of tasks. [ACM SIGSOFT empirical standards](https://www2.sigsoft.org/EmpiricalStandards/docs/standards?standard=EngineeringResearch)

## Claim-to-evidence contract

| Candidate claim | Evidence needed | Insufficient substitute |
| --- | --- | --- |
| Premature handoff occurs naturally | Unbalanced, outcome-blind native-boundary sample; explicit boundary causes; external reference | Forced sixth-step summaries or class-balanced examples |
| Control improves utility at fixed resources | Paired tasks under matched total resource ceilings; static and native controls | Supervisor versus its shorter prefix alone |
| Defer preserves user authority | Permission-conditioned reference plus actual blocked/admitted action traces | Same-model agreement or zero-initialized counters |
| Memory improves end-to-end outcomes | Whole-session memory-off randomization on held-out tasks | Deleting memory from already generated histories |
| Admission survives process crashes | Named failpoints, real process death/restart, durable identity audit | Ordinary completed task or an in-process exception |
| Results generalize | Prespecified held-out tasks/repository sensitivity and independent replication | More repetitions of the same 12 tasks |
| Human effort is saved | Directly observed human interventions/time with appropriate consent and study design | Number of automatic continuation messages |

Human-effort claims can be omitted if a participant study is infeasible. A paper can be rigorous without claiming every possible benefit. Novelty and relevance require a contribution beyond engineering feature count even after these tests pass.

## Study A: natural boundaries and authority decisions

Sampling unit: a previously unobserved task/run first terminal boundary from a native worker with no artificial final-step summary instruction. Include all planned task dispositions, including runs with no boundary before resource exhaustion. Select tasks and eligibility before controller outcomes or labels are seen.

Record boundary cause as separate observable categories: worker terminal output; imposed segment cap; context/token budget; provider timeout/error; permission block; user interrupt; and task verifier success. Preserve simultaneous causes rather than forcing every event into a natural-handoff class. Natural prevalence has the eligible native-terminal denominator; the planned-run denominator and no-terminal count are also mandatory. Estimate neither from a balanced challenge set.

Use two qualified independent human raters and separate adjudication for the primary reference. Record expertise, compensation, consent where relevant, and conflicts, without making up identities. Present goal, relevant tool results, patch/test state, permissions, and terminal output; mask policy, costs, later success, prior controller memory, and model identity when possible. Record both label and evidence sufficiency. Treat insufficient evidence as a reported disposition, not discardable inconvenience.

Calibration uses separate development tasks; then freeze the rubric and prompts. Seal independent labels before κ and adjudication. Report agreement, per-class disagreements, missingness, and rater uncertainty. Do not use high κ as a correctness certificate. Model-panel labels from v1.14 remain a secondary sensitivity resource with controller/judge overlap disclosed; they cannot be renamed human validation.

The authority-risk challenge set is separately constructed with explicit permission provenance and reversible local actions. Its balanced class rate is not a population prevalence. Report label-conditioned false continuation, abstention coverage, and their uncertainty. A no-DEFER comparator must run only in a sandbox with no real external side effects.

## Study B: matched-resource end-to-end utility

Primary experimental unit: a task, paired across policies. Hold worker revision, tools, sandbox, permissions, initial prompt, acceptance tests, and initial repository state fixed. Randomize dispatch order within task/model blocks and record seed/order; interleave policies to reduce time-of-provider confounding. Record model epoch and apply an outcome-blind rule for alias drift. Temperature zero is not assumed deterministic.

Core controls:

| Policy | Question answered | Required fairness control |
| --- | --- | --- |
| Native worker, no continuation intervention | Is the interface imposing the failure? | Same total available provider-turn, token, money, and time ceilings |
| Static continuation | Is benefit explained by more opportunity to work? | Same total envelope; no hidden verifier feedback |
| Regex | Does model supervision outperform simple deployed cues? | Production implementation hash and shared action contract |
| Decision-only supervisor | Does prompt elaboration, rather than action choice, explain benefit? | Same CONTINUE/STOP/DEFER; fixed continuation text |
| Full AutoDrive | Total effect of the proposed policy | Worker plus controller usage charged to the total |
| Close published controller | Increment beyond known supervisory methods | Pinned implementation or explicitly named adaptation |

The off prefix remains a useful within-trace diagnostic, not the resource-matched primary baseline. A native policy can stop early; equal *available* resources need not yield equal actual consumption. Report realized consumption and success/resource frontiers at preselected resource levels. Do not condition on realized tokens to create a post-treatment matched sample.

[SCATE](https://arxiv.org/abs/2607.08983) is the closest identified comparator because it supervises coding-agent test generation adaptively. Choose either a faithful reproduction in its supported domain, or a separately named repair-domain adaptation. An adaptation must freeze changed observations, rewards, actions, training budget, and development data. It cannot use hidden final grader labels as deployable feedback or be represented as the original authors' system. An oracle using hidden benchmark tests remains an explicitly privileged diagnostic and includes verifier resource costs.

An evidence-checking completion controller can be a secondary comparator if evidence is available from normal tools rather than hidden tests. A whole Magentic-One comparison measures a multi-agent system difference unless its worker/tool/compute envelope is matched. Avoid accumulating many weak controls at the expense of powered primary comparisons.

Boundary-origin sensitivity uses explicit six-step, longer-segment, and native conditions under an unchanged *total* worker budget. Choose the segment lengths and total allowance prospectively. A three-way design must not confuse an increased segment length with increased total compute. Preserve measured termination causes in all cells.

## Study C: mechanisms and faults

Fixed-history information ablations compare identical evidence packets with: last output only; + goal; goal + memory; goal + summary; and full minus each claimed information source. Only include summary in a full system if that system actually deploys it; v1.14 does not. Distinguish text length, information content, and source identity. Include prompt token counts and failure/latency coverage.

Whole-session ablations disable memory or contextual continuation from the beginning of a run, paired by task. This estimates downstream intervention effects on trajectories, not just classifier decisions on states produced by another policy. No label or development example may cross task holdouts through another repetition of the same task. Freeze task-level splits; repository holdout, when feasible, is a stronger separate external-validity test.

Fault campaign: execute actual runtime processes against an isolated durable database and deterministic local provider. Inject process termination after committed decision/before admission, and after committed admission/before promotion. Add duplicate wake, concurrent resume, user steer and queue preemption, timeout, malformed JSON, retryable and terminal provider failures, and restart at the maximum continuation count. Record kill point reached, exit status, database bytes/hash, event/input identity, recovery restart, all provider requests, promotions, chain counters, and authority decisions. A crash that misses its failpoint is an invalid injection and remains a disposition, not a successful recovery.

Unit and integration tests establish specific implementation behaviors. A fault campaign reports trial counts and all violated invariants, not merely a single rate. The exactly-once claim concerns durable **admission** under unique-ID/atomic-identity assumptions; arbitrary provider/tool side effects after a crash are outside that claim. No destructive faults are injected into the user's live development sessions or provider account.

## Inference, sample size, and incomplete outcomes

Choose one smallest practically meaningful utility effect and a prespecified acceptable safety-risk threshold before collection. They are research decisions to justify, not values to choose after seeing results. Use the offline design diagnostic in `reports/design-sensitivity-2026-10-03.md` to inspect power over hypothetical discordance rates; it is not a fitted estimate and does not change v1.14.

Use task-paired outcomes for policy comparisons. Operational success requires completed execution and passing external tests; separately report raw patch success, partial fix, and unavailable grades. Define the confirmatory family, adjustment, CI method, seed, and resampling unit before dispatch. Extra repeats improve within-task precision, not the number of distinct tasks. Report repository-specific counts, leave-one-repository-out sensitivity, and equal-repository descriptive aggregates; seven uneven repositories do not justify an unqualified repository-population estimate.

Every planned ID receives exactly one final disposition: completed; model/controller failure; budget/timeout failure; charged harness failure with grade available; charged harness failure without grade; zero-charge infrastructure failure/retry; or undispatched. Preserve all attempts, charges, receipts, and reasons. Primary operational success follows the frozen failure rules. Distinguish unavailable *graded* success and report worst-case bounds rather than inventing a score. State whether budget exhaustion prevented the planned estimand; a smaller convenience sample must be labeled exploratory. No retries on unfavorable model outcomes.

Report absolute differences, paired intervals, raw/adjusted p-values, and actual costs. A nonsignificant difference is not equivalence. Zero observed risk is not zero risk: show a bound and the independence assumption. Timing results include controller waiting and verifier/cleanup times separately; wall-clock and provider latency are different measurements.

## Artifacts and independent audit

Create a distinct extension namespace, version, design hash, dataset hashes, task IDs, model requests, and budget ledger before execution. Do not regenerate v1.14 identities. Keep immutable raw and append-only cost evidence outside worktrees and secrets outside task containers. Bind all derived artifacts to input hashes, analysis commit, environment lock, and explicit failure dispositions.

The final package needs a claim-to-file inventory, task/policy paired CSV, confusion counts, raw/adjusted tests, exact denominators, generated figures/tables, exclusions, ledger reconciliation, annotation provenance, model versions, and independent recomputation notes. Never use an LLM reviewer or a second pass through the same generator as proof of independent human replication. A separate operator/environment should reproduce admission invariants and a prespecified subset if such a claim is made.

## Execution order and stop gates

1. Finish current offline analysis/runner repairs and tests; preserve the historical study and dated errata.
2. Authenticate the changed remote artifact host through a trusted fingerprint source. Until then, no credential use, artifact collection, or paid restart against that host.
3. Collect a read-only artifact/ledger inventory, reconcile every old attempt and model epoch, determine whether the existing freeze can finish. Report incomplete results honestly if not.
4. Complete v1.14 only under its existing authorization and constraints. No fallback panel, new artifact-root retry, or model substitution merely to obtain a desired result.
5. Seal a feasible subset of this extension: tasks, sample size, comparator, independent raters, budget, order, and analysis. If the remaining USD 800 is insufficient, stop paid work and expose the shortfall; the journal ambition itself does not remove the cap.
6. Execute, verify and independently audit the sealed extension, including negative outcomes. Then write the result-based abstract, discussion, and conclusion.
7. Verify the selected journal's current format, disclosures and submission rules; resolve authorship, license and final PDF before any upload.

No work item above is marked complete merely because the source code or manuscript section exists. The final decision is whether the evidence supports a worthwhile, clearly bounded finding, not whether all comparisons favor AutoDrive.
