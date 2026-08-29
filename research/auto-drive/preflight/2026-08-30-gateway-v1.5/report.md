# AutoDrive v1.5 Gateway Canary Preflight

Captured: 2026-08-30 05:52:45 Asia/Shanghai

Scope: canary only

Protocol: `auto-drive-swe-evo-v1.5`

## Decision

The D-Robotics gateway is accepted for one more primary-model engineering canary. Live catalog checks resolved all frozen model IDs, the credential remained unblocked, and the per-canary proxy spend cap is USD 5. The prior v1.4 request ID is not retried; v1.5 has regenerated run IDs.

The v1.5 proxy preserves each upstream body and SHA-256 before parsing, forwards successful responses unchanged, and records whether usage accounting is complete. Complete token usage remains mandatory for trajectory acceptance. This separates a provider body from proxy bookkeeping without weakening the result contract.

## Exclusion boundary

The v1.3 Chat transport and v1.4 usage-accounting canaries remain excluded from end-to-end and boundary results. Their request counts, observed account-spend deltas, failure causes, and cleanup receipts are preserved under `research/auto-drive/pilot`.
