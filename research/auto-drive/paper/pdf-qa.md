# PDF quality audit

Date: 2026-08-31

## Reproducible build

- TeX image: `opencode-autodrive-texlive-locked@sha256:73c0d3f3b9d78663d7f549a8d1d113f153aa16b244338b6942e978a74baa70cd`
- Build network: disabled
- Engine: pdfTeX 3.141592653-2.6-1.40.29, TeX Live 2026
- Anonymous PDF SHA-256: `5f4df6473ae437b618e993b99338a53f120aeb840741260a4b3f9e42da3276ec`
- Placeholder-author PDF SHA-256: `319be8587a16e138b1a2d8610c2e9aa793ffa52c82332529fc6b6c477f6f79dc`
- Deterministic arXiv source archive SHA-256: `dfea621f7da7c8647b972426358fb8d6273ba67c67a0575149834e818b14528f`

## Structural and textual checks

- Both outputs are 12-page US Letter, unencrypted PDF 1.7 files.
- PyPDF extracted 64,192 characters from the anonymous version and 64,224 from the placeholder-author version.
- Title, references, appendix, full 48-task manifest, v1.14 protocol text, v1.13 canary values, the accepted negative r9 pilot disclosure, and the schema-v4 startup-baseline gate are extractable.
- No extracted stale Gemini, Claude Sonnet, or GPT-5.4 model name remains. The D-Robotics DeepSeek/Qwen matrix and DEFER-on-failure request contract are extractable.
- The anonymous file contains only the anonymous marker. The placeholder-author file contains only placeholder name, institution, and country metadata; no email is asserted.
- Each PDF contains 25 visible `Pending` result values and zero unresolved `??` references. Pending macros are intentional publication gates, not empirical claims.

## Fonts and logs

- Both files use 12 distinct font resources; every resource has an embedded font program.
- All font resources are subset Type 1 fonts; no Type 3 font is present.
- Final logs contain no overfull box, undefined reference, undefined citation, BibTeX warning, or fatal diagnostic.

## Visual audit

All 12 anonymous pages and all 12 placeholder-author pages were rendered at 110 DPI and inspected page by page. Titles, author modes, tables, equations, references, appendix headings, red pending values, request contract, and the 48-row task manifest are legible. No page contains clipping, unintended overlap, missing glyphs, or content outside the page boundary.

## arXiv source archive

- The archive contains only `arxiv.tex`, `main.tex`, `appendix.tex`, `references.bib`, and three generated TeX fragments, including the historical v1.13 canary table.
- It contains no PDF, raw trace, build cache, absolute local path, host address, or secret-shaped string.
- Two consecutive packaging runs produced the same SHA-256.
- A clean extraction compiled to a 12-page placeholder-author PDF inside the digest-locked, network-disabled TeX image with no overfull boxes or unresolved references.
