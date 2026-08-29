# AutoDrive v1.10 Controller-Release Canary

## Classification

Excluded engineering canary. It is not an accepted trajectory, boundary-corpus example, policy ablation record, or ledger row.

## Result

The first-request gate passed: every worker request used `deepseek-v4-pro`, temperature zero, low reasoning effort, and the frozen 4,096 output cap. DeepSeek completed six worker responses with complete 20,286-input / 957-output usage. The executor captured an empty first-boundary patch, wrote `release-6`, and the proxy held the real `qwen3.8-max` controller request at sequence 6.

The controller was never sent upstream. Although `release-6` was visible inside the proxy container, the proxy timed out after 60 seconds and recorded `proxy-error`. Therefore there is no controller response, decision, continuation, grade, accepted trajectory, accepted boundary, or accepted ledger row. Metered spend rose from USD 4.1813027 at proxy start to a stable USD 4.2203636, an observed delta of USD 0.0390609 attributable to the six completed worker responses.

## Root cause and disposition

The proxy constructed one `BunFile` before the release path existed and repeatedly called `exists()` on that same object. A zero-provider-cost Bun 1.4.0 reproduction returned `false` before creation, `false` on the same object after creation, and `true` on a freshly constructed `BunFile`. The mount and release contents were correct.

Protocol v1.11 reconstructs the file handle on every poll and adds a delayed-file regression test. Because this v1.10 run was charged, all deterministic run IDs are regenerated and the v1.10 ID is never reused.

After the interrupted parent left the two experiment containers running, their exact names and dedicated network were inspected and force-removed. No matching resource remained. The sanitized archive excludes Session databases and snapshots, contains zero secret-prefix matches, and has SHA-256 `3ae237b440de64345b483047a81d5b3347e8f24a0b71f4ba6a9aa592d634b9ac`.
