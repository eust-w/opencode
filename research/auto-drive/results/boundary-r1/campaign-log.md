# Boundary source campaign r1

Date: 2026-08-31  
Protocol: `auto-drive-swe-evo-v1.14`  
External artifact root: `/root/autodrive-artifacts/2026-08-31-v1.14-boundary-r1`

## Frozen execution identity

This block records the runner-v4 checkpoint. Later source changes are hash-locked recovery lineages described below; they do not change the frozen model, task, prompt, budget, or statistical settings.

- Evaluation source commit: `e0d2e2b913`
- Source archive SHA-256: `3f07ca0f200b18a6fedde0cd42012ef760a3ef075b96f1a1c554c1f3a3779ee1`
- Runner SHA-256: `b08a5b20620f34853d91ba05fe8ee89787ce1966f87c744373d40237104d23b9`
- OpenCode commit: `8b628aaff56b41efa3ca45742ca6f6a2343edd2e`
- OpenCode Linux AMD64 binary SHA-256: `7beb749667e3da93632b7b8fa1211c98ce36492f93364ca33b7057183635e29c`
- Boundary preflight receipt SHA-256: `3e4c8a84eda216c10ea88c699d236fa8bd9804e10a7415f95cc77e9923dcdb12`
- Execution is sequential, below the frozen maximum of two concurrent tasks.

## Checkpoint after 25 dispositions

| Disposition                         | Rows | Boundary ledger USD |
| ----------------------------------- | ---: | ------------------: |
| Accepted empirical trajectory       |   21 |           6.2680243 |
| Excluded charged evaluation failure |    3 |           0.7847301 |
| Excluded charged budget overrun     |    1 |           1.2186096 |
| Total                               |   25 |           8.2713640 |

The boundary preflight cost is USD 0.0900565, so total campaign spend at this checkpoint is USD 8.3614205. No excluded run has an accepted trajectory row. The 21 accepted trajectories cover 13 tasks, contain 1,964,965 prompt and 111,980 completion tokens, and have zero first-boundary or final task resolutions. They contain 17 automatic continuations, five redundant turns, zero manual continuations, and zero unsafe continuations. These are acquisition facts, not a policy comparison.

## Exclusion evidence

- `adr_fa5e568143fc77fc5333`: attempt one, frozen test-patch conflict after 32 complete responses; USD 0.413868.
- `adr_b4f6b34e814ed8b91d54`: attempt one was a zero-provider setup failure. The single allowed attempt two exposed a retry gateway artifact-namespace mismatch after seven requests. Six responses were terminal HTTP 200 with complete usage; the held controller request ended in one proxy error. Stable spend delta is USD 0.0906303. The reconciliation receipt is `failures/adr_b4f6b34e814ed8b91d54/reconciled-attempt-2.json`, SHA-256 `3de508eb03ff78bb3c3bd710ba907ec2e05b37ec6fd7db674ef48c695a90d5c5`.
- `adr_3426026923082ccbb24f`: attempt one, frozen test-patch conflict after 14 complete responses; USD 0.2802318.
- `adr_a56ba46d9f168054e1e0`: attempt one, 40 sealed HTTP 200 usage-complete responses plus three unsealed local retry rejections. The immutable evidence contains 496,162 prompt and 14,355 completion tokens. Four stable spend samples isolate USD 1.2186096, above the frozen USD 1.0625 run ceiling. The run is sealed as `excluded-charged-budget-overrun`, has no trajectory row, and cannot be retried. Its reconciliation receipt SHA-256 is `895dfc0cf8d31a2719fb603ecc31103dd671f324eeb6b9341009f4401a6435f0`.

The earlier attempt-one receipt SHA-256 for `adr_b4f6b34e814ed8b91d54` remains `fac69b3cd006310a2e821958f0d8ae1cdbbae51b6d89d3a904c553f8485835bc`. Its attempt two is terminal and cannot be retried again.

## Resumption gate

Commit `e0d2e2b913` fixes the settlement predicate, adds prospective per-run spend rejection, reconstructs the historical overrun from immutable evidence, and enforces the category cap during exclusion settlement. The evaluation package passed 122/122 tests, 458 assertions, and type checking locally and on the experiment host. A zero-provider dry-run executor contract also passed from the exact extracted source archive. Runner v4 refuses to start unless the source archive hash matches and the historical overrun exclusion is already present. It passed those gates and resumed at `2026-08-31T03:39:29Z`. Run `adr_a1936920fd08b60d0a73` for `iterative__dvc_0.35.3_0.35.4` completed and was accepted at `2026-08-31T03:54:42Z`: first-boundary and final Fix Rate are both zero, three continuations were admitted, one turn is redundant, usage is complete at 257,712 prompt and 9,848 completion tokens, and settled cost is USD 0.8560248. The runner then started `adr_338bd04e6e4e225c9e73`; this checkpoint does not claim that new run has completed or entered the ledger.

## Checkpoint after 30 dispositions

Snapshot time: `2026-08-31T13:21:51Z`

| Disposition                         | Rows | Boundary ledger USD |
| ----------------------------------- | ---: | ------------------: |
| Accepted empirical trajectory       |   24 |           6.6891676 |
| Excluded charged evaluation failure |    4 |           1.4986374 |
| Excluded charged budget overrun     |    2 |           2.4717564 |
| Total                               |   30 |          10.6595614 |

Including the USD 0.0900565 boundary preflight, campaign spend at this checkpoint is USD 10.7496179. The 24 accepted trajectories cover 15 tasks and contain 2,094,303 prompt and 124,969 completion tokens. They contain 18 automatic continuations, six redundant turns, zero manual continuations, and zero unsafe continuations. First-boundary and final task resolutions remain zero. These are acquisition facts, not a policy comparison, and accepted means artifact-valid rather than task-resolved.

The official image for `iterative__dvc_0.89.0_0.90.0` had an image-build-time tracked change to `setup.py` while its `HEAD` still matched the frozen base commit. Commit `f2cbb23f32` added an explicit tracked reset after verifying that exact `HEAD`, without deleting untracked startup artifacts. A no-network run against image `xingyaoww/sweb.eval.x86_64.iterative_s_dvc-3493` changed `beforeTracked=["setup.py"]` to `afterTracked=[]`, retained the expected base commit, and imported DVC 0.89.0. The exact extracted source passed 123 tests, 463 assertions, and type checking locally and remotely.

The immutable attempt-one failure receipt for `adr_e46155c850e8ff98cdc5` has SHA-256 `35d0b51cab2e20ef528e3ebb7c7157d98d9fac3b1eb175aadb3d8c4fa575d8dc` and records zero requests, responses, tokens, spend delta, trajectory rows, and ledger rows. Commit `22391753d2` restricted retry admission to the exact `(startup-baseline, Task image has tracked startup changes)` pair while retaining every zero-cost evidence gate. Its only attempt two crossed the clean-baseline gate, made 28 completely settled requests, and then conflicted with the frozen test patch. The terminal receipt SHA-256 is `09ccf1d6ea1ab56ccebc7c91fe81fc141d221ef597d55375e949fdd4bfe6d554`; it records 343,835 prompt tokens, 12,446 completion tokens, and USD 0.7139073. The run is sealed as an attempt-two charged evaluation exclusion and cannot be retried.

Commit `b10ed952e1` makes pending exclusion recovery prefer a charged attempt-two receipt over the earlier zero-cost attempt-one receipt. The evaluation package passes 125 tests, 467 assertions, and type checking locally and from the exact remote archive. Runner v8 locks source archive SHA-256 `1bea8f5525dfba361293c8fb0f4264d606fb461a7692d3f32e8c34cac41fbce8`, runner SHA-256 `e1ffe07057d059fb44f37f79ee914ddf91d1560dab48e8aeb692b5169939a439`, and the terminal retry receipt hash. It reconciled the exclusion without invoking the executor, accepted `adr_0158ae8c675f3da4026d` at final Fix Rate zero, and then started `adr_5cb28f11d1b0468f6929`. This checkpoint does not claim a disposition for that in-progress run.

## Candidate pipeline preview

The 21 accepted trajectories produce 38 blinded boundary candidates after complete trajectory artifact, patch, request, and Session transcript verification. They cover 21 base trajectories and 13 tasks. Continuation counts zero through three contribute 21, 8, 5, and 4 candidates respectively. The preview SHA-256 is `1b9b20e0a80c51be8b382418f1697cee662a75d3529f54fee5e198ec0f8ad87f`. These examples are unlabelled previews, not the frozen 180-example boundary dataset, and no macro-F1 or ablation result can yet be computed.

## Checkpoint after 38 dispositions

Snapshot time: `2026-08-31T14:22:56Z`

| Disposition                         | Rows | Boundary ledger USD |
| ----------------------------------- | ---: | ------------------: |
| Accepted empirical trajectory       |   30 |           8.0768995 |
| Excluded charged evaluation failure |    6 |           2.2996083 |
| Excluded charged budget overrun     |    2 |           2.4717564 |
| Total                               |   38 |          12.8482642 |

The 30 accepted rows contain 2,600,185 prompt tokens, 154,460 completion tokens, 21 continuations, seven redundant turns, and zero first-boundary or final resolutions. These remain acquisition facts rather than policy-effect estimates.

Run `adr_c97a34de41f747996bb3` completed its Session, first-boundary grader, seven successful usage-complete requests, and initial gateway settlement. A redundant cumulative-spend sample then raised the exact `TimeoutError: The operation timed out.` before trajectory admission. The immutable attempt-one receipt SHA-256 is `021fc3fdc2004bcea420d2d42394346a21292be95f02e0c4e92ee7ab3453705d`; it records USD 0.1005699 and no trajectory or ledger row. Recovery commit `58d0f71eb8` passed 133 tests, 489 assertions, and type checking locally and from source archive SHA-256 `a282fdcafa0b2939724cf091ec52c927af2c61a40d7da61b4ae4b653045ff6f9`. The strict reconciliation receipt SHA-256 is `43097cad3c4779ad91d1b07c6c307a97d3cf6a198cd4c570393a7619fe9f3aee`; the exclusion SHA-256 is `b6cf572cf4f3c6208036e48b034e225165ead28efe6e2b0327c4bb316ff88593`. Reconciliation made no provider call and preserved the original source workspace.

Runner v8 resumed the unchanged execution archive at `2026-08-31T14:22:55Z`. A separately deployed bounded finalizer waits for that runner, refuses any campaign below 96 dispositions, and only then writes the artifact-verified final `annotations/candidates.jsonl`.
