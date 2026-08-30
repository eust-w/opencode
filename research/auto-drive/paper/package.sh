#!/usr/bin/env bash
set -euo pipefail

paper_dir="$(cd "$(dirname "$0")" && pwd)"
staging_dir="$(mktemp -d "${TMPDIR:-/tmp}/autodrive-arxiv.XXXXXX")"
trap 'rm -rf "$staging_dir"' EXIT

mkdir -p "$staging_dir/generated" "$paper_dir/output"
install -m 0644 "$paper_dir/arxiv.tex" "$staging_dir/arxiv.tex"
install -m 0644 "$paper_dir/main.tex" "$staging_dir/main.tex"
install -m 0644 "$paper_dir/appendix.tex" "$staging_dir/appendix.tex"
install -m 0644 "$paper_dir/references.bib" "$staging_dir/references.bib"
install -m 0644 "$paper_dir/generated/results.tex" "$staging_dir/generated/results.tex"
install -m 0644 "$paper_dir/generated/canary-v1.13.tex" "$staging_dir/generated/canary-v1.13.tex"
install -m 0644 "$paper_dir/generated/task-manifest.tex" "$staging_dir/generated/task-manifest.tex"

TZ=UTC find "$staging_dir" -exec touch -t 202608300000 {} +
COPYFILE_DISABLE=1 tar -C "$staging_dir" -cf - . | gzip -n > "$paper_dir/output/autodrive-arxiv-source.tar.gz"
echo "Built output/autodrive-arxiv-source.tar.gz"
