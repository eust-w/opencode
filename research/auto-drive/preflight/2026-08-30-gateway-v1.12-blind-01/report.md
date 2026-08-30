# AutoDrive v1.12 Blind Canary Preflight

Captured: 2026-08-30 08:53:06 Asia/Shanghai

Scope: canary only

Protocol: `auto-drive-swe-evo-v1.12`

## Decision

The gateway is accepted for exactly one serial primary-worker trajectory with a USD 5 local run cap. All four frozen catalog model IDs were present, and the credential was unblocked at capture. The cumulative metered spend after the two compatibility probes settled at USD 0.0970008. The provider exposed no account budget, RPM, TPM, or parallel-request limit, so this receipt does not authorize concurrent paid dispatch or the full 384-run matrix.

The fresh worker Responses probe used temperature zero, low reasoning effort, and the frozen 4,096 output cap. It returned HTTP 200, status `completed`, reasoning and message output items, and complete 8-input / 12-output usage.

The fresh controller Chat Completions probe used the production `AutoDrive.buildSupervisorPrompt`, temperature zero, no tools, and the 1,024 output cap. It returned HTTP 200 with complete 434-prompt / 304-completion usage. The production parser decoded the response as `continue` with a non-empty reason and next prompt. Although the blind run will not invoke the controller, this probe preserves the same two-model canary acceptance contract used by the frozen harness.

The exact source commit remains `6c1b51f859b72b3348dddaf60f44efddf5fae0df`. Its binary is `0.0.0-autodrive.6c1b51f8` with SHA-256 `bd08ad01e1333778540867643414289ff6a457c244a9c590cb2143a241cf8990`.
