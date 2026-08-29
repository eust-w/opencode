# Cost ledger

`ledger.jsonl` is created only by the guarded evaluator after a real provider attempt. Each row records run ID, category, USD amount, and token counts. The file is append-only and contains no credentials. Category caps are pilot 50, primary 360, cross-model 288, and boundary 102 USD; the total cap is 800 USD.

The executor dry-run is forced to zero cost and never writes a ledger row. A paid canary is accounted as `pilot` in the external artifact root's isolated `canary/ledger.jsonl`; it cannot be appended to this formal ledger.
