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

## OpenSSH scanner false positive and runner v9

At `2026-08-31T17:07:39Z`, runner v8 stopped fail-closed after 58 dispositions. Run `adr_bef8a5550d51cfbf9333` had seven HTTP 200, usage-complete responses and USD 0.1528962 settled spend, but its first-boundary grader output triggered `Artifact contains a possible secret` before grader admission. The immutable attempt-one receipt SHA-256 is `0a6c48bf89e6322d2efa64050b468f80a8a8453a3b67b16d83b26c32950dbffc`; it records 30,949 prompt and 2,994 completion tokens and asserts that neither a trajectory nor a ledger row was accepted.

An exact zero-network replay used frozen image `xingyaoww/sweb.eval.x86_64.iterative_s_dvc-6566`, base commit `31479f02ab42eb985c1dac7af3e619112e41a439`, the frozen test patch, and `pytest --continue-on-collection-errors -rA`. Its 13,226,331-byte log has SHA-256 `52ffaf1e2d5f59dd44952afd79f3fd851123d712796a461da475b474a60c2da5`; all 28 scanner matches were standard Paramiko/OpenSSH security-key algorithm names. Commit `5121011501` exempts only the four exact OpenSSH tokens and retains rejection tests for synthetic provider-shaped keys.

The strict zero-provider reconciliation preserved the original receipt, wrote reconciled receipt SHA-256 `066998f9f71fadfc6e34c14c872e28f75f597f5cfe61b98c5d7ef38b13e620c5`, wrote exclusion SHA-256 `0e72337b2a1b7d7f4dc7aff04bfaf81de28903b3c6e6000f29508304f7ca6115`, and appended the USD 0.1528962 charge exactly once. The run is non-empirical and cannot be reconstructed, graded, or retried. The package passed 160 tests, 604 assertions, and type checking locally and from source archive SHA-256 `56bd70642eb1c21cdbdf319e2a007e1d5efd69cc56a3ee597a9a397164a6ab6f`; the full reproduced grader log also passed the corrected scanner remotely.

Runner v9 SHA-256 `123a4e4fb0651c462095e8e8c1a36053cf35495f7f7201384ed69b2b80c0f1b7` resumed at `2026-08-31T18:29:15Z` from 45 accepted trajectories and 14 charged exclusions with boundary-ledger spend USD 20.2538554. It immediately started the next frozen run, `adr_0b4a455a3b87de610a98`, at concurrency one. Fresh bounded finalizer and source-to-paper watcher processes started at `2026-08-31T18:30:15Z`; they still refuse downstream execution until all 96 initial dispositions and the final candidate artifact exist.

At `2026-08-31T19:03:23Z`, the campaign reached 48 accepted trajectories and 15 charged exclusions. Runner v9 then stopped at its preregistered operational disk gate with 38,348,256 KiB available; it did not start or interrupt another empirical run. A process-CWD audit showed that only source workspace `5121011501` was live. Thirteen stale AutoDrive extraction workspaces were removed; each remains reconstructible from committed, hash-fixed source archives. Thirty-one completed-task SWE-EVO image caches with zero container references were also removed. No current container, result, exclusion, ledger, request, response, grader log, source archive, secret file, or unrelated image was touched. Available space increased to 96 GiB.

The byte-identical runner v9, finalizer, and watcher relaunched at `2026-08-31T19:05:13Z`. Idempotent reconciliation retained one row for every prior disposition, and dispatch advanced directly to the next frozen run, `adr_876eddd44f8f72380ca7`, without rerunning a completed or excluded row.

At `2026-08-31T20:49:41Z`, runner v9 reached 57 accepted trajectories and 16 charged exclusions with boundary-ledger spend USD 24.5136757, then again stopped between rows because unrelated image creation had reduced persistent free space to 37,692,644 KiB. Five newly completed AutoDrive task-image caches with zero container references were removed, but shared layers and unrelated active containers left the filesystem below the unchanged 50 GiB gate. The authorized second host had only 36 GiB free and no Docker daemon, so it was rejected without moving artifacts or starting a run.

Commit `7c69498cf2` adds a validated proxy-egress network selector while retaining Docker `bridge` as the default and rejecting `host`, `none`, and malformed values. The exact source archive SHA-256 is `6b4f4df55cfb080e216eba08d5e193ff7f17494b3fe7afd71b781eafb96c4102`; 161 tests, 610 assertions, and type checking passed locally and from its extracted remote workspace. A dedicated Docker 29.1.3 daemon uses `overlay2` at memory-backed `/dev/shm/autodrive-docker2-data`, leaving every empirical artifact on persistent storage. Zero-provider smokes verified custom internal networking, loopback-only publication through `autodrive-egress`, task image repository digest `sha256:ed87cfc058358d86faf1c6c0d0828328285bc24f7218a1060bba37d37ed9dd96`, and frozen base commit `22ce95e78b4db2f21d5940cbd8ee656e7e565d15`.

Runner v10 SHA-256 `b580e2356d66aa231625ca7a053da5d6285830c1d715ae1696397145dabac972` retained the 50 GiB gate against the isolated data root and resumed at `2026-08-31T21:28:53Z`. The next frozen run, `adr_d1b256a818b85d892ee4`, started with its task and proxy containers visible only to the isolated daemon; the system daemon had no AutoDrive container. Finalizer and watcher were rearmed with the same isolated Docker endpoint for later augmentation and formal execution.

At `2026-08-31T22:44:32Z`, run `adr_b3d88e11dc363b8e221f` reached the frozen 45-minute deadline while the final offline grader was running. The parent killed the executor before failure-receipt capture and cleanup because both deadlines were identical. The three orphaned run-specific containers were inspected and stopped; no model process or provider work remained. Exact individual spend logs matched all 14 sealed successful usage-complete responses, 69,311 prompt tokens, 4,365 completion tokens, the frozen worker/controller model multiplicities, and USD 0.2213475. No trajectory was written and the run was not retried.

Commits `6e4e3c04d9` and `8b90c2f545` add a two-minute parent-only cleanup grace plus strict per-request deadline reconciliation. The final package passed 165 tests, 627 assertions, and type checking locally and from source archive SHA-256 `b2a4108c66a6a3955315dd33286322917869a6f0c1f3d33d9947eb331dc929e5`. Sanitized spend settlement SHA-256 is `8b3fa2946e299ad3e0ff76f7f6426cf54d67c4d33968a31b85f62513350fa332`; reconciled receipt SHA-256 is `67996df4f1c2fc605e5b45bd0b95e6f7225be39a597dd28bd6995970bbcd01ab`; exclusion SHA-256 is `325d7f011b8d2da0f4bde24d22193cb281eca56c88094d40fc29cb710eb70841`. The boundary ledger now has 77 unique dispositions, comprising 60 accepted trajectories and 17 charged exclusions, at USD 25.5393439.

Runner v11 SHA-256 `555914ff9cc90e0628c4ebee1c2ae6c235aec195450dcff44d37fd127125d860` verified the new source archive, isolated Docker storage/network, reconciled receipt, exclusion hash, classification, and exact cost before resuming at `2026-08-31T23:31:48Z`. It skipped all 77 existing dispositions and started the next frozen row, `adr_5a7c9d4106a8ba289afb`, at concurrency one. Fresh finalizer and watcher processes remain gated on exactly 96 initial dispositions and a nonempty candidate artifact.

## Initial frame completion and augmentation accounting stop

The initial 96-run frame completed with 78 accepted trajectories, 16 charged evaluation exclusions, and two charged budget-overrun exclusions. Deterministic controller-to-boundary matching excluded only one unsupervised trailing boundary from each of five terminal non-retryable provider failures while retaining strict matching for every controller request. Commit `c5f5d62de9` passed 167 tests, 636 assertions, and type checking locally and from source archive SHA-256 `963d88f9139b77429952195e5ce1fe56e97857008025fcc0ac67d46507db277f`. The resulting 160-row candidate file is byte-reproducible with SHA-256 `2bc07bde9a75dc1dcacb9c183853a6e85d3b0153b20963187f427a119d9b6a53`, has 160 unique candidate IDs across 77 accepted source trajectories, and contains no excluded source. Because 160 is below the sealed 180-row threshold, all 48 label-blind repeat-2 augmentation runs became mandatory.

The augmentation preflight cost USD 0.010197 and has receipt SHA-256 `cbe79b0a6ca131ba6d2b6415ef799551944b41c065001216754fb3cba682634d`. The first ten augmentation dispositions yielded nine accepted trajectories and one charged exclusion. The boundary ledger then contained 107 unique rows totaling USD 36.5696005, including the preflight. The next two runs wrote immutable charged failure receipts but no trajectory, exclusion, or ledger row. Run `adr_1a0c281da53aaafeb105` exceeded the ceiling at USD 1.2251574. Run `adr_fd3da4286dbd995723da` failed the final test-patch conflict gate after 35 successful usage-complete requests and settled at USD 1.1264694, also above the USD 1.0625 ceiling. The runner stopped before accounting either receipt.

The accounting-only correction reclassifies only a completely settled, artifact-verified evaluation failure whose cost is numerically above the frozen ceiling. It writes a content-addressed reconciled receipt referencing the immutable original receipt and artifacts, then admits the ordinary budget-overrun exclusion and ledger row. It makes no provider call and cannot admit an empirical trajectory or retry either run. The corrected package passes 168 tests, 639 assertions, and type checking locally.

## Concurrent sibling settlement stop

Augmentation resumed from 12 dispositions using source archive SHA-256 `1ea3316a3e134025fdfa8bc2f1783452f4ac1c1a72861762a496d5887f84f6dc`. At 26 dispositions the batch containing `adr_2cab721e805568cff0de` and `adr_bc8a1041081dc31dc624` started. The latter failed the final test-patch conflict gate, settled 21 usage-complete requests at USD 1.180092, was reconciled as a budget overrun, and stopped the batch parent at 27 dispositions. The former was already inside its final offline grader. It made no provider request after `2026-09-01T06:12:37.684Z`, completed cleanup without intervention, and wrote failure receipt SHA-256 `b0d3ea518c10d48556d0f46c4b21629dc945ca370441d491ce751bfc58829283` at `2026-09-01T06:24:25.764Z`. Its 13 requests were successful and usage-complete; settled spend was USD 1.180092. No empirical trajectory or ledger row was written.

The prospective runner correction waits for all already-active workers after the first rejection and stops further queue admission. The accounting correction classifies a fully settled post-session sampling timeout above the frozen ceiling as a budget overrun. Both changes are provider-free recovery mechanics and do not alter a task outcome or rerun either trajectory. The package passes 170 tests, 643 assertions, type checking, and diff validation locally.

At augmentation disposition 37, `adr_a49e64dc40fe1921a271` was accepted at USD 0.2408742 while its sibling `adr_87ea47391c53fbb96d16` completed the final grader and failed the frozen test-patch conflict gate. The latter sealed 27 successful usage-complete responses and three additional locally rejected proxy-error events, settled at USD 1.3354494, and wrote failure receipt SHA-256 `1dd3051938c02900f9b10b9126d314f2b6c9b4b73e1c8ac518770f1e2118c2e4`. The runner correctly waited for both siblings, then stopped before writing the overrun exclusion because the reconciliation guard incorrectly required zero unsealed proxy errors. No container or provider process remained, and no trajectory, exclusion, or ledger row was admitted for this run.

The corrected guard retains equality between sealed requests and successful usage-complete responses while ignoring only surplus unsealed proxy-error events, matching the already frozen request-manifest accounting rule. The package remains at 170 tests and 643 assertions with type checking and diff validation passing locally. Recovery is deterministic, makes no provider call, and cannot retry or admit the failed trajectory.

## Reference-panel transport stop

The completed initial and label-blind augmentation frames contain 110 accepted trajectories, 34 charged exclusions, 145 source/preflight ledger rows, and 205 blinded boundaries from 109 source trajectories. The expanded live-verified metadata snapshot covers `deepseek-v4-flash`, `deepseek-v4-pro`, `qwen3.7-max`, and `qwen3.8-max`. The three-model annotation preflight added one ledger row at USD 0.015903, bringing the ledger to 146 rows and USD 66.098887; its receipt SHA-256 is `b1b0c82cf52e6700aeb7672a7729444cf1583e75ab2f8f85e623e52e2eb98303`.

Source commit `306bf3fc51` fixed a pre-provider schema initialization error and passed 170 tests, 645 assertions, and type checking locally and remotely. Its rebuilt remote source archive has SHA-256 `f8dc3cfba3cbd37e106e40093bf3758df9c0007cebf197e23778cb320e9f638d`. The resumed panel then completed candidate `adb_3fa48a61983ae37117b2` with 4,551 prompt tokens, 779 completion tokens, and 11,865 ms latency. Its sibling request for `adb_5e294b74812c5511e8c6` crossed the 60-second client deadline and left no response or label. The process stopped before a checkpoint or annotation ledger row; the stable account delta for the two-request window is USD 0.0826560. Formal execution remains 0/384.

The prospective recovery preserves the orphaned request, records it in a content-addressed failure receipt, permits only one byte-identical `-attempt-2` request under a 180-second client deadline, settles both active batch members, and includes every attempt in the original campaign cost. It cannot manufacture a response, relabel an example, change the panel rubric, or exceed the existing USD 20 campaign and USD 102 category ceilings.
