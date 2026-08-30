# AutoDrive v1.13 Regex Canary Preflight

Captured: 2026-08-30 10:46:44 Asia/Shanghai

Scope: canary only

Protocol: `auto-drive-swe-evo-v1.13`

## Decision

The gateway is accepted for exactly one serial primary-worker trajectory with a USD 5 local run cap. All four frozen catalog model IDs were present, and the credential was unblocked at capture. The cumulative metered spend after the two compatibility probes settled at USD 1.5889092. The provider exposed no account budget, RPM, TPM, or parallel-request limit, so this receipt does not authorize concurrent paid dispatch or the full 384-run matrix.

The fresh worker Responses probe used temperature zero, low reasoning effort, and the frozen 4,096 output cap. It returned HTTP 200, status `completed`, reasoning and message output items, and complete 8-input / 11-output usage.

The fresh controller Chat Completions probe used the production `AutoDrive.buildSupervisorPrompt`, temperature zero, no tools, and the 1,024 output cap. It returned HTTP 200 with complete 434-prompt / 332-completion usage. The production parser decoded the response as `continue` with a non-empty reason and next prompt. Regex continuation itself does not invoke this controller, but the probe preserves the two-model canary acceptance contract.

The exact source commit is `4647e5fba2533dee9396c6ab4a70a6a7733fde74`. Its binary is `0.0.0-autodrive.4647e5fb` with SHA-256 `3aeee9f58b978712cf15c12dab1f63fe174b87f3554db8c94990a759bddd0add`.
