# Boundary source campaign r1

Date: 2026-08-31  
Protocol: `auto-drive-swe-evo-v1.14`  
External artifact root: `/root/autodrive-artifacts/2026-08-31-v1.14-boundary-r1`

## Frozen execution identity

- Evaluation source commit: `260e9c835c`
- Source archive SHA-256: `c80a19cbd0802f0ee8bfbc1eb1a133a31a6987f26f450633f961c7fce831e1ab`
- Runner SHA-256: `4dcba53d5a958cc5b377659a352c57fdb656a0e9600e5eadf0fecd7290c6e1d1`
- OpenCode commit: `8b628aaff56b41efa3ca45742ca6f6a2343edd2e`
- OpenCode Linux AMD64 binary SHA-256: `7beb749667e3da93632b7b8fa1211c98ce36492f93364ca33b7057183635e29c`
- Boundary preflight receipt SHA-256: `3e4c8a84eda216c10ea88c699d236fa8bd9804e10a7415f95cc77e9923dcdb12`
- Execution is sequential, below the frozen maximum of two concurrent tasks.

## Snapshot after row eight

| Disposition                         | Rows | Boundary ledger USD |
| ----------------------------------- | ---: | ------------------: |
| Accepted empirical trajectory       |    6 |           1.6284871 |
| Excluded charged evaluation failure |    2 |           0.5044983 |
| Total                               |    8 |           2.1329854 |

The boundary preflight cost is USD 0.0900565, so total campaign spend at this snapshot is USD 2.2230419. There is no accepted row for either excluded run.

## Exclusion evidence

- `adr_fa5e568143fc77fc5333`: attempt one, frozen test-patch conflict after 32 complete responses; USD 0.413868.
- `adr_b4f6b34e814ed8b91d54`: attempt one was a zero-provider setup failure. The single allowed attempt two exposed a retry gateway artifact-namespace mismatch after seven requests. Six responses were terminal HTTP 200 with complete usage; the held controller request ended in one proxy error. Stable spend delta is USD 0.0906303. The reconciliation receipt is `failures/adr_b4f6b34e814ed8b91d54/reconciled-attempt-2.json`, SHA-256 `3de508eb03ff78bb3c3bd710ba907ec2e05b37ec6fd7db674ef48c695a90d5c5`.

The attempt-one receipt SHA-256 remains `fac69b3cd006310a2e821958f0d8ae1cdbbae51b6d89d3a904c553f8485835bc`. Attempt two is terminal and cannot be retried again.

## Resumption

The namespace fix passed 117/117 evaluation tests, type checking, validation, formatting, targeted lint, diff checks, secret scanning, remote replay, and a zero-provider attempt-two namespace canary. Runner v3 resumed from frozen row eight, `adr_270c032aeb168dee0342`, at `2026-08-30T22:10:13Z`. That row was accepted at `2026-08-30T22:23:31Z`: it is unresolved with an empty patch, contains seven complete requests including one controller request, records 32,339 prompt and 4,928 completion tokens, and costs USD 0.1613832. The runner then entered frozen row nine, `adr_1eaf02988d68d35a96a3`. This log records acquisition integrity only; it is not an RQ or ablation result.

## Candidate pipeline preview

The six accepted trajectories produce nine blinded boundary candidates after complete trajectory artifact, patch, and Session transcript verification. They cover six base trajectories and four tasks; one trajectory contains four boundaries and the other five contain one each. The preview SHA-256 is `13b872b84126352226f53b01a261c44b43e59d12355eeccd3d4dcdb8bd6fcc37`. These examples are unlabelled previews, not the frozen 180-example boundary dataset.
