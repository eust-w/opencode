# Offline ablation-runner integrity repair — 2026-10-03

## Scope and evidence boundary

This repair changes the host ablation runner and its execution-level regression tests. It does not change the frozen controller model, prompt constructors, five variants, 126-boundary test cardinality, 504 controller-call plan, request parameters, 60-second timeout, concurrency of two, or cost ceilings. No production gateway, credential, remote host, frozen reference labels, or paid experiment was accessed. The local synthetic fixtures below are software tests, not research results.

## Reproduced defects

1. `loadOrCreateReceipt()` executed before the `Receipt` schema initialized. A real CLI subprocess failed with `ReferenceError: Cannot access 'Receipt' before initialization`, before its first completion request.
2. Once schema initialization was fixed, regex record creation failed because `protocol.commit` does not exist. `modelVersion` was therefore undefined. Regex records now record the SHA-256 of the actual production `auto-drive.ts` source. The regex algorithm is unchanged.
3. Malformed JSON and unsuccessful HTTP responses were rejected before the response file was saved. The request file already existed with exclusive-create semantics, leaving a potentially charged attempt without raw-response evidence.
4. `Promise.all` rejected on the first failed call, before the other concurrent attempt and the spend checkpoint were settled.

The package TypeScript configuration includes `src` and `test`, not `scripts`; its earlier successful typecheck therefore did not establish runner correctness. The new tests execute the real script rather than asserting only on its text.

## Corrected behavior

- Schemas initialize before any top-level work.
- Raw response text is exclusively persisted before HTTP status, JSON, or decision validation. Successful records still hash-bind requests and responses.
- Invalid model output, unsuccessful HTTP responses, transport failures, and secret-rejected responses produce distinct immutable terminal failure records. All carry `terminal: true` and `retryAllowed: false`; malformed model answers are not infrastructure exclusions or synthetic DEFER predictions.
- Secret-rejected text is not copied into artifacts; only its digest and failure classification are retained. This is an explicit safety exception to raw-text retention.
- Both calls in a batch settle before the cumulative-spend checkpoint is recorded and the batch fails. A failed campaign does not produce a completed prediction manifest.
- A rerun checks terminal failure evidence and refuses further paid calls. An admitted request without a success record is an unresolved provider outcome and also fails closed; it is not replayed.
- Existing successful records resume through schema/hash validation. A local fixture with only two missing predictions sends exactly two requests and completes the 630-prediction manifest.

## Verification

Commands run from `packages/autodrive-eval`:

```sh
bun test test/ablation-runner.test.ts --timeout 30000
bun test --timeout 30000 --only-failures
bun typecheck
```

TDD evidence: the first real-CLI tests failed at the initializer error, then at the missing regex version, then at absent response files after two local requests. After repair, four focused tests passed (23 assertions). The complete package snapshot passed 195 tests, 1,186 assertions across 23 files. Package typecheck and the edited-file whitespace check passed. Formatting used the already available Prettier executable.

The loopback HTTP service supplies only synthetic completion/usage fixtures. Its synthetic 0.02-dollar cumulative-spend response tests checkpoint preservation; no money was spent.

## Remaining limits

- A terminal failed campaign deliberately requires a provider-free evidence/billing reconciliation and protocol-consistent disposition before any further experiment. Its checkpoint is not automatically treated as a completed ledger admission, zero cost, or permission for a fresh artifact root. Unknown response usage remains unknown.
- If spend discovery fails, per-attempt evidence remains durable, but a settled cost cannot be asserted. No automatic continuation follows that failure.
- A crash after exclusive request creation but before durable outcome recording remains ambiguous; this repair refuses replay instead of claiming exactly-once external provider execution.
- These tests do not validate real-provider availability, remote host identity, model quality, scientific validity of labels, or journal publication readiness.
