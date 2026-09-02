# Cost ledger

`ledger.jsonl` is created only by the guarded evaluator after a real provider attempt. Each row records run ID, category, USD amount, and token counts. The file is append-only and contains no credentials. The prospective 2026-09-02 amendment keeps the source-acquisition subcap at USD 102, raises the post-source boundary category cap to USD 180, and leaves pilot 50, primary 360, cross-model 288, and the hard total of USD 800 unchanged. Formal reservations include the immutable boundary and prior-cost ledgers so the hard total applies across stages.

The executor dry-run is forced to zero cost and never writes a ledger row. A paid canary is accounted as `pilot` in the external artifact root's isolated `canary/ledger.jsonl`; it cannot be appended to this formal ledger.
