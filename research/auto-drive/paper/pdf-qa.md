# PDF quality audit

Date: 2026-08-30

## Reproducible build

- TeX image: `opencode-autodrive-texlive-locked@sha256:73c0d3f3b9d78663d7f549a8d1d113f153aa16b244338b6942e978a74baa70cd`
- Build network: disabled
- Engine: pdfTeX 3.141592653-2.6-1.40.29, TeX Live 2026
- Anonymous PDF SHA-256: `dd71f424147ddfd77d5006f4978865144995b0574688fd3ac1a16f751b3f462c`
- Placeholder-author PDF SHA-256: `088dcec5ad078bc5d396e8826fdfdd90c9e475d6616e87796a2782a74de2d179`
- Deterministic arXiv source archive SHA-256: `af99ab402d878edb080d0aa9f9faf7a0921c872a0dabc5192dd97f40d9cd158f`
- The previously recorded local image digest had been pruned and could not be reproduced byte-for-byte. The replacement image was rebuilt from the same pinned Dockerfile and base, with provenance disabled, then locked by the immutable digest above. The source and output audit was repeated against that replacement.

## Structural and textual checks

- Both outputs are 11-page, US Letter, unencrypted PDF 1.7 files with no JavaScript.
- `pdfplumber` text extraction succeeds for every page: 57,568 characters in the anonymous version and 57,802 in the placeholder-author version.
- Title, references, appendix, full 48-task manifest, the v1.13 canary table values, and the 16.839-second timeout disclosure are extractable.
- The anonymous file contains `AnonymousAuthor(s)` after extraction and no author placeholder. The signed-wrapper draft contains the author placeholder and `author@example.invalid`.
- Each PDF contains 34 visible `PENDING` tokens and zero unresolved `??` references. Pending result macros are intentional publication gates, not empirical claims.

## Fonts and logs

- All 12 used fonts have non-empty embedded programs.
- All fonts are subset Type 1 fonts; no Type 3 fonts are present.
- Final LaTeX logs report no undefined references, undefined citations, BibTeX warnings, or overfull boxes.
- The only final warning is the ACM `balance` package noting that `\\balance` was called in the second column; pages 10 and 11 were rendered and contain no clipping or overlap.

## Visual audit

Every page of the current anonymous PDF was rendered at 96 DPI for a whole-document audit; pages 5 and 6 were additionally rendered at 144 DPI to inspect the new result disclosure and Table 4. Page 9 was re-rendered at 144 DPI after repairing the task identifier's `\\texttt` markup. The placeholder-author title page was rendered at 144 DPI, while its shared body is byte-generated from the same `main.tex`. Titles, line numbers, tables, equations, references, appendix headings, red pending values, and the 48-row task manifest are legible. No inspected page contains clipping, unintended overlap, missing glyphs, or content outside the page boundary.

## arXiv source archive

- The archive contains only `arxiv.tex`, `main.tex`, `appendix.tex`, `references.bib`, and three generated TeX fragments, including the v1.13 canary table.
- It contains no PDF, raw trace, build cache, absolute local path, host address, or secret-shaped string.
- Two consecutive packaging runs produced the same SHA-256.
- A clean extraction compiled to an equivalent 11-page placeholder-author PDF inside the digest-locked, network-disabled TeX image. The rebuild regenerates PDF creation and modification timestamps, so byte identity is not required; structural and extracted result checks passed.
