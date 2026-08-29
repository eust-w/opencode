# AutoDrive host-executor contract

## Purpose

The host executor is the only component allowed to see provider credentials. It turns one immutable frozen run into one trajectory plus content-addressed artifacts. The evaluator owns selection, timeouts, retry admission, budget reservation, provenance checks, and append-only indexing. The executor must not modify the frozen manifest, protocol, formal result index, or formal cost ledger.

## Process boundary

The evaluator launches one executable with a JSON object on standard input:

```json
{
  "run": {
    "id": "adr_...",
    "taskID": "owner__repo_from_to",
    "model": "provider/model",
    "controllerModel": "provider/model",
    "strategy": "oracle | blind | regex | supervisor",
    "repeat": 0,
    "temperature": 0,
    "segmentSteps": 6,
    "maxContinuations": 5,
    "timeoutMinutes": 45
  },
  "attempt": 1,
  "budget": {
    "category": "pilot | primary | cross-model",
    "maxCostUSD": 1.25,
    "remainingUSD": 798.75
  }
}
```

The executable writes exactly one trajectory schema-v2 JSON object to standard output. Diagnostic text belongs on standard error and must not contain credentials. Exit code `75` means a predefined zero-cost infrastructure failure and permits one identical retry. Every other nonzero exit is final. Model timeout, loop, provider failure, grader failure, and budget exhaustion must be returned as classified trajectory outcomes rather than disguised as retryable infrastructure.

## Environment

Real execution receives the artifact root, sealed preflight path and SHA-256, frozen protocol version, pinned model-metadata path, and isolation flags. Provider credentials may exist in the host process, but they must not enter task containers, artifacts, stdout, stderr, LaTeX, PDFs, or archives.

`verify-executor` is a distinct non-empirical mode. It passes `AUTODRIVE_EVAL_MODE=dry-run`, strips the known Google, Anthropic, OpenAI, and OpenCode provider keys from the child environment, sets the cost ceiling to zero, and enforces a 30-second timeout. All references must remain below `dry-run/`, all usage counters must be zero, and the returned model version must be `dry-run-contract-v1`.

## Required artifacts

For every real worker or controller call, the executor records the provider, logical model ID, exact resolved model version, request order, temperature, output limit, canonical provider request JSON, and SHA-256. The canonical request is the validated provider-native body after protocol lowering and before authentication or transport headers are added. It must contain only JSON-compatible values and must never contain keys, bearer tokens, signed URLs, cookies, or credential-bearing headers.

The trajectory also references:

- the immutable model-metadata snapshot and sealed preflight receipt;
- the task image name and immutable image digest;
- the SWE-EVO base commit and exact OpenCode commit;
- a raw JSONL trace with safe-boundary, controller-decision, continuation, provider, grader, recovery, token, cost, and latency events.

Every reference is relative to the supplied artifact root and is verified by recomputing its SHA-256 before acceptance.

## Isolation and accounting

The task container receives the repository checkout, task metadata, and declared test commands only. It must not receive host keychains, provider environment variables, model auth files, arbitrary home-directory mounts, or the formal result directories. User input and steering remain higher priority than AutoDrive continuation in system tests.

The paid canary accepts exactly one frozen primary-model run, uses one process, consumes only the remaining USD 50 pilot allocation, and writes to `canary/trajectories.jsonl` plus `canary/ledger.jsonl` under the external artifact root. It cannot write the formal index. Formal execution continues to enforce at most two concurrent tasks and the preregistered per-run primary/cross-model ceilings.

## Acceptance sequence

1. `verify-executor` succeeds with zero cost and no formal output.
2. A fresh paid canary preflight resolves the exact Google model version and capacity.
3. One paid canary completes with matching provider billing, request hashes, trace, grader output, and container isolation evidence.
4. Two human annotators reach the preregistered agreement threshold and freeze the boundary test set.
5. Only then may the full-scope receipt and formal runner append trajectories.
