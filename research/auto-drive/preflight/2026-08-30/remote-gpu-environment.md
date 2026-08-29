# Remote GPU execution environment

- Captured: 2026-08-30 (Asia/Shanghai)
- OpenCode commit: `68639e024d7af3ed3d0353ebccfba662030c9540`
- Status: **infrastructure passed; provider dispatch remains blocked**

The two user-authorized endpoints are identified here only as `root-1` and `root-2`. Their addresses and login material are intentionally excluded from tracked research artifacts. The supplied password was entered only at an interactive SSH prompt and was not copied into the repository, containers, commands, environment snapshots, or experiment artifacts.

## Inventory

| Property | `root-1` | `root-2` |
| --- | --- | --- |
| Platform | Baidu Cloud BCC/KVM | Baidu Cloud BCC/KVM |
| OS / kernel | Ubuntu 24.04.1 LTS / `6.8.0-71-generic` | Ubuntu 24.04.1 LTS / `6.8.0-71-generic` |
| CPU | 180 vCPU, Intel Xeon Platinum 8558P | 180 vCPU, Intel Xeon Platinum 8558P |
| Memory | approximately 1.8 TiB | approximately 1.8 TiB |
| Root disk | 394 GiB, approximately 345 GiB available at inspection | 394 GiB, 348 GiB available after canaries |
| GPU | 8 x `NVxx`, 97,887 MiB each | 8 x `NVxx`, 97,887 MiB each |
| Driver / power limit | `610.43.02` / 600 W | `610.43.02` / 600 W |
| NUMA topology | four GPUs per CPU socket; no NVLink reported | four GPUs per CPU socket; no NVLink reported |
| Existing compute stack | no Docker, NVIDIA Container Toolkit, `nvcc`, or PyTorch | PyTorch `2.13.0+cu130`, CUDA `13.0` |
| Changes in this run | none | Docker and NVIDIA runtime setup described below |

All 16 GPUs were idle at discovery. `root-1` remained read-only and was not selected because it lacked the container and CUDA user-space stack. `root-2` passed an eight-device PyTorch allocation and arithmetic smoke test in approximately 2.55 seconds; the aggregate checksum was `183184818176.0`.

## Selected executor setup

On `root-2`, the run installed Docker `29.1.3` and NVIDIA Container Toolkit `1.20.0` with their normal package dependencies, configured the Docker NVIDIA runtime, and restarted Docker. The default runtime remains `runc`; the `nvidia` runtime is available only when requested. No full system upgrade, inbound port change, image pruning, or unrelated service mutation was performed.

The tracked-only evaluator snapshot was staged under `/srv/autodrive/snapshots/68639e024d7af3ed3d0353ebccfba662030c9540`. It excluded `.git`, dependency directories, provider credentials, and authentication files. Remote SHA-256 verification matched these local transfer archives:

- evaluator and research snapshot: `963ecff8162007ac4df9904df17338d485e55469ed2966572322e182934d2569`
- required tracked workspaces: `a8256f3287aafa6ef3a8f0d8e657b28d3a44e30fed15f43e62362db836b3207e`
- tracked dependency patches: `3b16edefec264b0099cf51c81bbca22aac181375b992183e6bfaebd2a7dd46ea`

A frozen filtered install completed in the digest-pinned Bun image after the required tracked workspaces and patches were staged. The validation container used `--network none`, a read-only source mount, a read-only root filesystem, `--cap-drop ALL`, `no-new-privileges`, and a temporary in-memory `/tmp`.

## Immutable container evidence

| Purpose | Immutable image | Observation |
| --- | --- | --- |
| GPU runtime | `ubuntu@sha256:33ceb71981b602c1a7443a53469e4dba065f7503eab3078a2d7a57a2ab987517` | `nvidia-smi -L` enumerated all eight GPUs under the hardened container flags |
| Evaluator | `oven/bun@sha256:5ff609364c049b54eb0ff560ec96319729a972078ef2c755d758f0c6ef89c2d6` | Bun `1.4.0`; 32 tests and 153 assertions passed; typecheck and protocol validation passed |
| SWE-EVO canary | `xingyaoww/sweb.eval.x86_64.conan-io_s_conan-15109@sha256:7f6bbb676a0ee2ed040dea51fed25f6848ab4534263f78d3d377d61bf47339d0` | 1,052,436,197 bytes; `amd64`; `/testbed`; Python `3.10.14` |

The SWE-EVO task was `conan-io__conan_2.0.14_2.0.15`. Under `--network none --read-only --cap-drop ALL --security-opt no-new-privileges`, `/testbed` was present, its worktree had zero modified paths, and its commit was exactly the frozen base `4614b3abbff15627b3fabdd98bee419721f423ce`. This is an environment compatibility canary, not a task attempt; no patch, model request, or hidden grader result was produced.

## Remote executor contract evidence

The hardened remote evaluator reported 48 pinned tasks, 384 planned trajectories, 0 completed trajectories, USD 0 spent, and USD 800 remaining. A zero-cost host-executor dry-run accepted run `adr_790a41b7e674b65c6fa7`, created four content-addressed artifacts under the external dry-run root, and created neither a formal result nor a formal ledger row.

| Dry-run artifact | SHA-256 |
| --- | --- |
| Preflight contract | `42df297ec70e5f69ac2352e5b0db3bafce0c5a88f44ae90ef82e24241bead9c0` |
| Raw trace | `79cd23d52495be35cf83dbf1859b963086c86eb733c7e9a447bdcb2e49f63150` |
| Normalized request | `7cab0df39ef949327ab26a5e131357970c7cf92667c45925e7f15bcabbfcb226` |
| Model metadata | `ac8d961efdf6e75abde92137be7b7ae59a781b31cc8a6a35929dfde8f099ef07` |

The staged snapshot and dry-run artifacts passed credential-pattern scans. The remote environment contained none of `GOOGLE_GENERATIVE_AI_API_KEY`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, or `OPENCODE_API_KEY`.

## Network and remaining gates

Outbound checks reached GitHub (HTTP 200), the GHCR registry (HTTP 401 at `/v2/`, proving reachability), Google API infrastructure (HTTP 404 at the unauthenticated root), and Anthropic API infrastructure (HTTP 403 at the unauthenticated root). Connections to the OpenAI API timed out after five seconds on both nodes. These status codes are reachability observations, not successful provider authentication.

The servers therefore establish sufficient container and GPU execution capacity, but they do not unblock the frozen paid study. The registered worker and controller models are provider-hosted, so local GPUs cannot replace paid provider credentials without changing the preregistered protocol. A billing-enabled Google preflight, a working provider host executor, OpenAI egress for the replication arm, and the frozen two-person boundary labels are still required.

At handoff, `root-2` had zero running containers and every GPU reported 0 MiB memory use and 0% utilization. Pulled images were intentionally retained for the next authorized stage; no image or package pruning was performed.
