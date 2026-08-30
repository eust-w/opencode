# AutoDrive v1.12 Blind Canary Preflight

Captured: 2026-08-30 08:53:06 Asia/Shanghai

Scope: canary only

Protocol: `auto-drive-swe-evo-v1.12`

Accepted for exactly one serial primary-worker trajectory with a USD 5 local run cap. Fresh worker and controller compatibility probes returned HTTP 200 with complete usage; cumulative spend after probes was USD 0.0970008. No provider account budget, RPM, TPM, or parallel-request limit was exposed. Exact source commit: `6c1b51f859b72b3348dddaf60f44efddf5fae0df`.
