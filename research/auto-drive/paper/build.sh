#!/usr/bin/env bash
set -euo pipefail

paper_dir="$(cd "$(dirname "$0")" && pwd)"
image="opencode-autodrive-texlive@sha256:9d0f4661034103159dd1a82dfc9818ebbb83ced84a4bfc4378dbe681df1c75f8"
expected_digest="sha256:9d0f4661034103159dd1a82dfc9818ebbb83ced84a4bfc4378dbe681df1c75f8"

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
