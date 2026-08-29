# Excluded v1.4 usage-accounting canary

Date: 2026-08-30 (Asia/Shanghai)

Protocol: `auto-drive-swe-evo-v1.4`

Task: `iterative__dvc_2.21.1_2.21.2`

Historical run ID: `adr_c29c17757086c4d7b772`

## Outcome

The Responses worker transport successfully completed five metered tool turns, whereas the excluded v1.3 Chat transport failed before its first tool execution. The sixth upstream response was successful at the HTTP layer but did not satisfy the proxy's strict terminal usage parser. The proxy returned HTTP 502, causing the session's bounded provider retry policy to issue two additional identical requests. The run was interrupted before a fourth attempt, and the exact task and proxy containers plus their private network were removed.

No controller request, boundary decision, grader result, accepted trajectory, or accepted ledger row was produced. This canary is excluded from end-to-end and boundary results, and the v1.4 run ID is not retried.

## Preserved evidence

- Normalized worker requests: 8
- Responses with complete HTTP 200 usage records: 5
- Complete recorded usage: 19,083 prompt tokens and 578 completion tokens
- Proxy usage-parse failures: 3
- Controller requests: 0
- Accepted experimental trajectories: 0
- Accepted ledger rows: 0
- Containers and experiment network remaining after cleanup: 0

The account-spend observation increased from USD 2.6865133 before dispatch to USD 2.8478437 after cleanup, a delta of USD 0.1613304. Because gateway billing can settle asynchronously, this is retained as an observed account delta rather than asserted as exact request-level attribution.

## Protocol consequence

Version 1.5 preserves raw upstream responses before accounting, forwards successful upstream bodies unchanged even when usage extraction is incomplete, and records `usageComplete=false`. An accepted trajectory still requires complete usage for every successful provider response; incomplete accounting remains a failed canary rather than silently assigning zero tokens.
