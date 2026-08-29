# Results

`trajectories.jsonl` is append-only and does not exist until a real, provenance-complete trajectory is accepted. Every line uses trajectory schema v2 and includes the complete ordered worker/controller request manifest plus verified artifact references. `derived/` is generated from that index and contains `runs.csv`, `summary.json`, statistics, tables, and figures. Missing results mean `pending`, never zero effect or successful completion.
