# Excluded v1.5 idle provider-failure canary

Date: 2026-08-30 (Asia/Shanghai)

Protocol: `auto-drive-swe-evo-v1.5`

Task: `iterative__dvc_2.21.1_2.21.2`

Historical run ID: `adr_ae1cbd3af1e31796b8c7`

## Outcome

Five worker Responses turns completed with full usage. The sixth returned HTTP 200 and 157,530 bytes of reasoning deltas, but the stream ended without `response.completed`, `[DONE]`, or usage. Version 1.5 preserved and forwarded the raw body, correctly avoiding the v1.4 proxy-induced retries. OpenCode then ended the Session idle without an AutoDrive decision. Because the v1.5 executor recognized only explicit `stop | defer`, it would have waited until the 45-minute deadline and was interrupted after the idle condition was independently verified.

Before cleanup, the current task patch, Session messages, and server logs were saved. The patch was empty. The exact task and proxy containers plus private network were then removed. No controller request, boundary decision, grader result, accepted trajectory, or accepted ledger row was produced, and this run ID is not retried.

## Preserved evidence

- Worker requests: 6
- Responses with complete usage: 5
- Observed complete usage: 24,794 prompt tokens and 935 completion tokens
- Incomplete response bytes: 157,530
- Captured patch bytes: 0
- Controller requests: 0
- Accepted trajectories: 0
- Accepted ledger rows: 0
- Containers and experiment networks remaining after cleanup: 0

The account-spend observation increased from USD 2.8478437 to USD 2.9993197, a delta of USD 0.151476. Possible settlement lag makes this an account-level observation, not exact request attribution.

## Protocol consequence

Version 1.6 adds a five-second idle-without-decision boundary, provider-failure classification, partial-patch grading, and a schema field distinguishing complete usage from observed-token lower bounds. This implements the preregistered rule that provider errors are failed outcomes rather than infrastructure reruns.
