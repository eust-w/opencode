# Offline design sensitivity — 2026-10-03

**Status: hypothetical design calculation, not experiment results.** No model calls, data labels, pilot fitting, or paid-plan changes are involved. The JSON contains all 72 grid points and the SHA-256 hashes of source, tests, and this generator; the CSV contains the numeric grid. Regeneration is deterministic for those files.

## Exact calculation

Let n be independent matched task pairs, q the probability that the two policies disagree on binary resolution, and p the probability that the treatment is the winner conditional on disagreement. Enumerate D ~ Binomial(n,q), W | D ~ Binomial(D,p), and sum P(D)P(W|D) over outcomes whose existing two-sided exact McNemar p-value is at most alpha. No Monte Carlo approximation is used. Expected resolution-rate difference is q(2p−1). The null p=.5 rows report type-I error, not power against an improvement.

The grid uses n ∈ {48,96,192}, q ∈ {.1,.25,.5}, p ∈ {.5,.65,.75,.85}, and alpha ∈ {.05,.0125}. Alpha=.0125 is a conservative sufficient threshold for one comparison in a four-comparison Holm family. It is **not exact joint Holm power**; computing that requires the joint dependence among comparisons.

## Illustrative slice (assumed q=.25, p=.75)

| Independent pairs | Alpha | Assumed difference | Exact rejection probability |
| ---: | ---: | ---: | ---: |
| 48 | 0.05 | 12.5 pp | 30.75% |
| 48 | 0.0125 | 12.5 pp | 13.61% |
| 96 | 0.05 | 12.5 pp | 63.38% |
| 96 | 0.0125 | 12.5 pp | 41.65% |
| 192 | 0.05 | 12.5 pp | 93.29% |
| 192 | 0.0125 | 12.5 pp | 82.42% |

Every entry above is conditional on hypothetical assumptions, not an observed effect or a sample-size commitment. The 384-trajectory matrix does not supply 384 independent tasks: the primary analysis has 48 task pairs, while repeated runs reuse tasks. The n=96/192 rows describe hypothetical independent-task extensions, not a reinterpretation of repeats or a change to the frozen protocol. Shared repositories and other task dependence can invalidate the independent-pair calculation; no power guarantee follows for the present benchmark.

## What hypothetical zero false continuations would establish

For zero events among n independent Bernoulli observations, the exact one-sided 95% upper bound is 1 − .05^(1/n). This is a prospective precision illustration only; zero events have not been established.

| Hypothetical independent observations | One-sided 95% upper bound |
| ---: | ---: |
| 42 | 6.884% |
| 126 | 2.350% |

The 42-row bound is a hypothetical precision illustration, not the expected or guaranteed class denominator. The grouped 54/126 split does not enforce 42 examples per class, even though the full 180-example corpus has 60 per class. Actual STOP- and DEFER-specific risk estimates must use the realized class counts. The 126-row bound is a pooled denominator, not a STOP- or DEFER-specific bound. Correlated boundaries from the same trajectory/task cannot automatically be counted as independent. Even observing zero errors would not establish zero risk. Runtime safety additionally requires permission/side-effect evidence and fault-injection tests; offline label agreement is a different estimand.

## Reproduction and verification

```sh
cd packages/autodrive-eval
bun test test/design-sensitivity.test.ts
bun typecheck
bun scripts/design-sensitivity.ts
```

Tests cover a hand-enumerable six-pair case, degenerate probabilities, near-endpoint numerical stability, probability mass, exchange symmetry, null rejection control across the grid, stricter-threshold monotonicity, exact zero-event tail inversion, and invalid inputs. The calculation reuses `src/statistics.ts` rather than redefining the inferential test.
