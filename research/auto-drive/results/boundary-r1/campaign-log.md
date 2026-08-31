# Boundary source campaign r1

Date: 2026-08-31  
Protocol: `auto-drive-swe-evo-v1.14`  
External artifact root: `/root/autodrive-artifacts/2026-08-31-v1.14-boundary-r1`

## Frozen execution identity

- Evaluation source commit: `e0d2e2b913`
- Source archive SHA-256: `3f07ca0f200b18a6fedde0cd42012ef760a3ef075b96f1a1c554c1f3a3779ee1`
- Runner SHA-256: `b08a5b20620f34853d91ba05fe8ee89787ce1966f87c744373d40237104d23b9`
- OpenCode commit: `8b628aaff56b41efa3ca45742ca6f6a2343edd2e`
- OpenCode Linux AMD64 binary SHA-256: `7beb749667e3da93632b7b8fa1211c98ce36492f93364ca33b7057183635e29c`
- Boundary preflight receipt SHA-256: `3e4c8a84eda216c10ea88c699d236fa8bd9804e10a7415f95cc77e9923dcdb12`
- Execution is sequential, below the frozen maximum of two concurrent tasks.

## Checkpoint after 24 dispositions

| Disposition                         | Rows | Boundary ledger USD |
| ----------------------------------- | ---: | ------------------: |
| Accepted empirical trajectory       |   20 |           5.4119995 |
| Excluded charged evaluation failure |    3 |           0.7847301 |
| Excluded charged budget overrun     |    1 |           1.2186096 |
| Total                               |   24 |           7.4153392 |

The boundary preflight cost is USD 0.0900565, so total campaign spend at this checkpoint is USD 7.5053957. No excluded run has an accepted trajectory row. The 20 accepted trajectories cover 12 tasks, contain 1,707,253 prompt and 102,132 completion tokens, and have zero first-boundary or final task resolutions. These are acquisition facts, not a policy comparison.

## Exclusion evidence

- `adr_fa5e568143fc77fc5333`: attempt one, frozen test-patch conflict after 32 complete responses; USD 0.413868.
- `adr_b4f6b34e814ed8b91d54`: attempt one was a zero-provider setup failure. The single allowed attempt two exposed a retry gateway artifact-namespace mismatch after seven requests. Six responses were terminal HTTP 200 with complete usage; the held controller request ended in one proxy error. Stable spend delta is USD 0.0906303. The reconciliation receipt is `failures/adr_b4f6b34e814ed8b91d54/reconciled-attempt-2.json`, SHA-256 `3de508eb03ff78bb3c3bd710ba907ec2e05b37ec6fd7db674ef48c695a90d5c5`.
- `adr_3426026923082ccbb24f`: attempt one, frozen test-patch conflict after 14 complete responses; USD 0.2802318.
- `adr_a56ba46d9f168054e1e0`: attempt one, 40 sealed HTTP 200 usage-complete responses plus three unsealed local retry rejections. The immutable evidence contains 496,162 prompt and 14,355 completion tokens. Four stable spend samples isolate USD 1.2186096, above the frozen USD 1.0625 run ceiling. The run is sealed as `excluded-charged-budget-overrun`, has no trajectory row, and cannot be retried. Its reconciliation receipt SHA-256 is `895dfc0cf8d31a2719fb603ecc31103dd671f324eeb6b9341009f4401a6435f0`.

The earlier attempt-one receipt SHA-256 for `adr_b4f6b34e814ed8b91d54` remains `fac69b3cd006310a2e821958f0d8ae1cdbbae51b6d89d3a904c553f8485835bc`. Its attempt two is terminal and cannot be retried again.

## Resumption gate

Commit `e0d2e2b913` fixes the settlement predicate, adds prospective per-run spend rejection, reconstructs the historical overrun from immutable evidence, and enforces the category cap during exclusion settlement. The evaluation package passed 122/122 tests, 458 assertions, and type checking locally and on the experiment host. A zero-provider dry-run executor contract also passed from the exact extracted source archive. Runner v4 refuses to start unless the source archive hash matches and the historical overrun exclusion is already present. It passed those gates and resumed at `2026-08-31T03:39:29Z`; the next frozen run, `adr_a1936920fd08b60d0a73` for `iterative__dvc_0.35.3_0.35.4`, started at `2026-08-31T03:39:30Z`. This checkpoint does not claim that run has completed or entered the ledger.

## Candidate pipeline preview

The 20 accepted trajectories produce 34 blinded boundary candidates after complete trajectory artifact, patch, request, and Session transcript verification. They cover 20 base trajectories and 12 tasks. Continuation counts zero through three contribute 20, 7, 4, and 3 candidates respectively. The preview SHA-256 is `e2d66adb17f46427ded62c352ef3f13466efdaa863041a47f938516f36d23b0e`. These examples are unlabelled previews, not the frozen 180-example boundary dataset, and no macro-F1 or ablation result can yet be computed.
