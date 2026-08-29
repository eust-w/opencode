# AutoDrive v1.9 Output-Limit Routing Canary

## Classification

Excluded engineering canary. It is not an accepted end-to-end trajectory, boundary example, ablation record, or ledger row.

## Result

The mandatory first-request gate failed because the normalized DeepSeek worker request used `max_output_tokens=32000`, while protocol v1.9 froze the worker limit at 4,096. The host process was interrupted as soon as the mismatch was observed. The exact task container, proxy container, and Docker network were removed and independently checked after teardown.

Before teardown completed, DeepSeek returned all six worker responses. They contain complete usage for 19,145 input and 845 output tokens. The executor then captured an empty boundary patch and emitted the first real controller request: sequence 6 used `qwen3.8-max`, was held at the proxy boundary, and has request SHA-256 `df6e5b9bd57da89449e1e67bfb157a844731f8c33a9fda94b58808226aae2d2a`. A release marker exists because the executor reached boundary capture, but the proxy was stopped before it recorded a release or controller response. Therefore there is no controller decision, continuation, grade, accepted boundary, accepted trajectory, or accepted ledger entry.

The gateway spend window moved from USD 4.1125655 to USD 4.1585582. Because that window also contains the v1.9 preflight probes, USD 0.0459927 is reported only as an upper bound, not as this canary's exact cost.

## Root cause and disposition

The protocol and request metadata froze 4,096 worker output tokens, but the gateway normalizer still hard-coded 32,000. Protocol v1.10 aligns the normalizer with the frozen limit and regenerates all run IDs. No v1.9 run ID will be reused.

The sanitized artifact set is stored under `artifacts/`. Remote exact-secret scanning and local secret-prefix scanning both found zero matches. The export archive has SHA-256 `d58dfc63e5c88e301f4292f5745a8707aa2d4c6c356582bfa7935e0592316f07`.
