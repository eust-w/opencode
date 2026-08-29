# Results

`trajectories.jsonl` is append-only and does not exist until a real, provenance-complete trajectory is accepted. Every line uses trajectory schema v2 and includes the complete ordered worker/controller request manifest plus verified artifact references. `derived/` is generated from that index and contains `runs.csv`, `summary.json`, statistics, tables, and figures. Missing results mean `pending`, never zero effect or successful completion.

Dry-run executor records and paid-canary records are intentionally excluded. Dry-run files stay under the selected external artifact root's `dry-run/` directory; the single paid-canary trajectory and its pilot ledger stay under `canary/`. Neither location is consumed by formal analysis.
