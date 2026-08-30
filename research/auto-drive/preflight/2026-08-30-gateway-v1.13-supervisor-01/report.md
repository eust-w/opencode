# AutoDrive Gateway Preflight v1.13 Supervisor 01

## Decision

`ready` for one serial paid supervisor canary only. This receipt does not authorize concurrent trajectories or the full 384-run matrix.

## Evidence

The gateway catalog returned HTTP 200 and contained all four frozen catalog model IDs. The credential was unblocked at capture, the provider exposed no account budget, RPM, TPM, or parallel-request limit, and the local per-canary cap remains USD 5. Settled cumulative metered spend after both probes was USD 1.6374846.

The fresh worker Responses probe used temperature zero, low reasoning effort, and the frozen 4,096 output cap. It returned HTTP 200, status `completed`, reasoning and message output items, and complete 11-input / 10-output usage.

The fresh controller Chat Completions probe used the production `AutoDrive.buildSupervisorPrompt`, temperature zero, no tools, and the 1,024 output cap. It returned HTTP 200 with complete 386-prompt / 180-completion usage. The production parser decoded the response as `continue` with a non-empty reason and next prompt.

The source binary remains pinned to commit `4647e5fba2533dee9396c6ab4a70a6a7733fde74`, version `0.0.0-autodrive.4647e5fb`, SHA-256 `3aeee9f58b978712cf15c12dab1f63fe174b87f3554db8c94990a759bddd0add`. External and Claude Code skills and model metadata fetching remain disabled in the sealed runtime.
