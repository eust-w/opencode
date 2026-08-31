#!/usr/bin/env bash
set -euo pipefail

paper_dir="$(cd "$(dirname "$0")" && pwd)"
image="opencode-autodrive-texlive-locked:2026-08-31"
expected_digest="sha256:0d7318da40803ad67f4ee8baac619d6192fc7b7314e4b9de0ccb1cc64b39995c"

actual_digest="$(docker image inspect "$image" --format '{{.Id}}')"
if [[ "$actual_digest" != "$expected_digest" ]]; then
  echo "TeX image mismatch: expected $expected_digest, found $actual_digest" >&2
  exit 1
fi

mkdir -p "$paper_dir/tmp/build/anonymous" "$paper_dir/tmp/build/arxiv" "$paper_dir/output/pdf"

docker run --rm --network none \
  --user "$(id -u):$(id -g)" \
  --env HOME=/tmp \
  --volume "$paper_dir:/work" \
  --workdir /work \
  "$image" \
  sh -lc 'latexmk -g -pdf -interaction=nonstopmode -halt-on-error -file-line-error -outdir=tmp/build/anonymous anonymous.tex && latexmk -g -pdf -interaction=nonstopmode -halt-on-error -file-line-error -outdir=tmp/build/arxiv arxiv.tex'

install -m 0644 "$paper_dir/tmp/build/anonymous/anonymous.pdf" "$paper_dir/output/pdf/autodrive-anonymous.pdf"
install -m 0644 "$paper_dir/tmp/build/arxiv/arxiv.pdf" "$paper_dir/output/pdf/autodrive-arxiv-placeholder.pdf"

echo "Built output/pdf/autodrive-anonymous.pdf"
echo "Built output/pdf/autodrive-arxiv-placeholder.pdf"
