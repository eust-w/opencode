# AutoDrive v1.12 Gateway Canary Preflight

Captured: 2026-08-30 08:30:17 Asia/Shanghai

Scope: canary only

Protocol: `auto-drive-swe-evo-v1.12`

## Decision

The gateway is accepted for one primary-worker trajectory at a time with a USD 5 per-run cap. All four frozen models were present in the live catalog. The credential was unblocked at capture; after the two compatibility probes, cumulative spend settled at USD 0.0235005. The provider exposed no account budget, RPM, TPM, or parallel-request limit, so this receipt does not authorize the full 384-run matrix or concurrent paid dispatch.

The fresh worker Responses probe used temperature zero, low reasoning effort, and the frozen 4,096 output cap. It returned HTTP 200, status `completed`, reasoning and message output items, and complete 8-input / 11-output usage.

The fresh controller Chat Completions probe used the production `AutoDrive.buildSupervisorPrompt`, temperature zero, no tools, and the 1,024 output cap. It returned HTTP 200 with complete 434-prompt / 334-completion usage. The production parser decoded the response as `continue` with a non-empty reason and next prompt.

Protocol v1.12 completes the preregistered four-policy executor. A no-provider-cost remote smoke test also started the exact isolated grader container, reset the pinned DVC commit, applied the hidden test patch, reproduced the expected target-test failure, and removed the container. The exact v1.12 binary is `0.0.0-autodrive.6c1b51f8` with SHA-256 `bd08ad01e1333778540867643414289ff6a457c244a9c590cb2143a241cf8990`.
