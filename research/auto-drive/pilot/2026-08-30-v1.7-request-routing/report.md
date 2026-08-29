# AutoDrive v1.7 V2 Request-Routing Canary

## Classification

Excluded engineering canary. It is not an end-to-end trajectory, a boundary example, an ablation record, or a rerunnable infrastructure failure.

## Result

The mandatory first-request gate failed: the normalized OpenAI Responses body did not contain `reasoning`. Inspection of all six emitted worker requests confirmed the field was absent. The host run was interrupted, the task and proxy containers were removed, and the captured checkout patch was empty.

Process teardown allowed five already-running short tool responses to complete and a sixth request to be issued before removal. The five complete responses report 23,976 input and 1,088 output tokens. Metered gateway spend moved from USD 3.5973077 before the compatibility probe/run to USD 3.7590893 after settlement, an observed delta of USD 0.1617816. No controller request, AutoDrive decision, grade, accepted trajectory, or ledger row was created.

## Root cause and disposition

The V2 native runner materializes model-level request bodies. Protocol v1.7 placed `reasoningEffort` in the agent-level request body, so the local configuration test passed while the actual HTTP request omitted the option. Protocol v1.8 moves the exact OpenAI field `reasoning: {"effort":"low"}` into the worker model request and regenerates every run ID. The v1.7 run ID will not be reused.

The complete sanitized artifact set is stored under `artifacts/`; the remote export archive has SHA-256 `ba63639be1944f45ad78e2ee73b925d1f2a9184853c7f31bf84b6eea08bb31fc`.
