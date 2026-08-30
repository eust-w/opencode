# PDF quality audit

Date: 2026-08-30

## Reproducible build

- TeX image: `opencode-autodrive-texlive-locked@sha256:73c0d3f3b9d78663d7f549a8d1d113f153aa16b244338b6942e978a74baa70cd`
- Build network: disabled
- Engine: pdfTeX 3.141592653-2.6-1.40.29, TeX Live 2026
- Anonymous PDF SHA-256: `e5bef17d705b2af614821a8c7b577d8d1ccc75d946d157df90c845cc938ad0ca`
- Placeholder-author PDF SHA-256: `f9fe9439409c9d3f2d1da6f6b73003bd0fb6a8c44d37094fbf0ed3b136f69936`
- Deterministic arXiv source archive SHA-256: `f319b1552d9f80e7c114dd1fa516e9ae3fee1044930621b0edd49f77cfe1b651`

## Structural and textual checks

- The anonymous output is 11 pages and the placeholder-author output is 12 pages. Both are US Letter, unencrypted PDF 1.7 files.
- `pdfplumber` extracted 58,621 characters from the anonymous version and 59,497 from the placeholder-author version.
- Title, references, appendix, full 48-task manifest, v1.14 protocol text, the v1.13 canary values, and the 16.839-second historical timeout disclosure are extractable.
- No extracted stale Gemini, Claude Sonnet, or GPT-5.4 model name remains. The D-Robotics DeepSeek/Qwen matrix and DEFER-on-failure request contract are extractable.
- The anonymous file contains the anonymous marker and no author placeholder. The placeholder-author file contains the placeholder and invalid example email only.
- Each PDF contains 25 visible `Pending` result values and zero unresolved `??` references. Pending macros are intentional publication gates, not empirical claims.

## Fonts and logs

- Both files use 12 distinct font resources; every resource has an embedded font program.
- All font resources are subset Type 1 fonts; no Type 3 font is present.
- Final LaTeX logs report no undefined references, undefined citations, BibTeX warnings, overfull boxes, or overfull vertical boxes.
- The only final warning is the ACM `balance` package noting that `\\balance` was called in the second column.

## Visual audit

All 11 anonymous pages and all 12 placeholder-author pages were rendered at 110 DPI and inspected in complete-document contact sheets. Titles, author modes, line numbers, tables, equations, references, appendix headings, red pending values, request contract, and the 48-row task manifest are legible. No page contains clipping, unintended overlap, missing glyphs, or content outside the page boundary.

## arXiv source archive

- The archive contains only `arxiv.tex`, `main.tex`, `appendix.tex`, `references.bib`, and three generated TeX fragments, including the historical v1.13 canary table.
- It contains no PDF, raw trace, build cache, absolute local path, host address, or secret-shaped string.
- Two consecutive packaging runs produced the same SHA-256.
- A clean extraction compiled to a 12-page placeholder-author PDF inside the digest-locked, network-disabled TeX image with no overfull boxes or unresolved references.
