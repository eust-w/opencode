# Paper build

The two PDFs share one source:

- `anonymous.tex`: anonymous review draft.
- `arxiv.tex`: signed arXiv draft with placeholder author metadata.

Outcome macros live in `generated/results.tex` and remain visibly pending until the frozen analysis replaces them. Do not edit numerical table cells by hand.

The build uses the immutable TeX Live image digest recorded in `../environment.lock.json`:

```bash
docker build --pull=false -f Dockerfile.texlive -t opencode-autodrive-texlive:2026-08-30 .
bash build.sh
```

After each build, run `pdfinfo`, extract text for missing citations, render every page with Poppler, and visually inspect the rendered pages. `package.sh` creates an arXiv source archive only after the PDFs pass these checks. Upload is not part of either script.
