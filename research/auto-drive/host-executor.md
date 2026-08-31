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
    "category": "pilot | primary | cross-model | boundary",
    "maxCostUSD": 1.25,
    "remainingUSD": 798.75
  }
}
```

The executable writes exactly one trajectory schema-v3 JSON object to standard output. Diagnostic text belongs on standard error and must not contain credentials. Exit code `75` means a predefined zero-cost infrastructure failure and permits one identical retry. Every other nonzero exit is final. Model timeout, loop, provider failure, grader failure, and budget exhaustion must be returned as classified trajectory outcomes rather than disguised as retryable infrastructure.

If the evaluator process stops after writing an attempt-one receipt, it never silently starts attempt one again. Boundary and formal recovery require an explicit `--resume-infrastructure` invocation for exactly one run. The evaluator admits attempt two only when the receipt matches a predefined setup failure, contains zero requests, responses, tokens, and observed spend, references hash-valid artifacts, has no ledger row, and has no attempt-two receipt. Retry artifacts use a separate `-attempt-2` raw, gateway, patch, and grader namespace so the first receipt remains verifiable. Attempt two is terminal and can never advance to attempt three.

## Environment

Real execution receives the artifact root, sealed preflight path and SHA-256, frozen protocol version, pinned model-metadata path, and isolation flags. Provider credentials may exist in the host process, but they must not enter task containers, artifacts, stdout, stderr, LaTeX, PDFs, or archives.

`verify-executor` is a distinct non-empirical mode. It constructs an allowlisted child environment containing no provider credential or gateway key-file path, passes `AUTODRIVE_EVAL_MODE=dry-run`, sets the cost ceiling to zero, and enforces a 30-second timeout. All references must remain below `dry-run/`, all usage counters must be zero, and the returned model version must be `dry-run-contract-v1`.

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

The paid canary accepts exactly one frozen primary-model run, uses one process, consumes only the remaining USD 50 pilot allocation, and writes to `canary/trajectories.jsonl` plus `canary/ledger.jsonl` under the external artifact root. The non-primary pilot instead uses the hash-sealed SWE-bench Verified manifest, verifies its pinned image digest, and writes only below `pilot/`. The 96-run boundary source plan requires a boundary-scope receipt, reserves at most USD 102/96 per run, and writes only below `boundary/`. None of these paths can write the formal index. Formal execution continues to enforce at most two concurrent tasks and the preregistered per-run primary/cross-model ceilings.

## Acceptance sequence

1. `verify-executor` succeeds with zero cost and no formal output.
2. A non-primary pilot completes with matching billing, request hashes, trace, grader output, and container isolation evidence.
3. A fresh v1.14 full-scope receipt resolves the three D-Robotics workers and fixed controller, and proves the required account budget, rate limits, trajectory capacity, and concurrency.
4. Two human annotators reach the preregistered agreement threshold and freeze the boundary test set. The v2 annotation seal content-addresses the development and test JSONL files plus every annotation input, verifies the 54/126 grouped split, exact 60/60/60 class balance, three distinct identities, and Cohen's kappa of at least 0.75.
5. Only then may the formal runner append trajectories. The accepted v1.13 canaries remain historical mechanism evidence and cannot satisfy a v1.14 formal gate.

The formal runner dispatches at most two IDs per evaluator process. Every pair reloads the full-scope preflight and the frozen annotation seal, while accepted rows and cost entries remain append-only. Restart skips accepted IDs and stops on any unresolved failure receipt; it never converts an incomplete attempt into a fresh attempt one.
