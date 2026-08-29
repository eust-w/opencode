# PDF quality audit

Date: 2026-08-30

## Reproducible build

- TeX image: `opencode-autodrive-texlive@sha256:9d0f4661034103159dd1a82dfc9818ebbb83ced84a4bfc4378dbe681df1c75f8`
- Build network: disabled
- Engine: pdfTeX 3.141592653-2.6-1.40.29, TeX Live 2026
- Anonymous PDF SHA-256: `38cd377db46c17ead22d11cc20e5a9ef872ad4df93be52f7f6d19bc8b024c03c`
- Placeholder-author PDF SHA-256: `b416e4e836003fad685e22f5adb4a97d2498a8de4568ff9b99fa234a779edf05`
- Deterministic arXiv source archive SHA-256: `0590684e1fca7ab1b30570ac4c55137e204512902f87102ae8e30eef217ec2ac`

## Structural and textual checks

- Both outputs are 11-page, US Letter, unencrypted PDF 1.7 files with no JavaScript.
- Text extraction succeeds for every page: 60,874 characters in the anonymous version and 61,164 in the placeholder-author version.
- Title, references, appendix, and full 48-task manifest are extractable.
- The anonymous file contains `Anonymous Author(s)` and no author placeholder. The signed-wrapper draft contains `Author Name Placeholder` and `author@example.invalid`.
- Each PDF contains 34 visible `PENDING` tokens and zero unresolved `??` references. Pending result macros are intentional publication gates, not empirical claims.

## Fonts and logs

- Every used font can be extracted from the PDF with a non-empty embedded program.
- All fonts are subset Type 1 fonts; no Type 3 fonts are present.
- LaTeX reports no undefined references, undefined citations, BibTeX warnings, or overfull horizontal boxes.
- It reports one sub-2-point overfull vertical box on page 10. Page 10 was inspected at rendered resolution and contains no clipping or overlap.

## Visual audit

Every page of both current PDFs was rendered at 120 DPI. All anonymous pages and the changed placeholder-author pages 1 and 8 were inspected after the pilot disclosure was added; the remaining signed-wrapper body pages were unchanged from the prior full audit. Titles, line numbers, tables, equations, references, appendix headings, red pending values, and the 48-row task manifest are legible. No inspected page contains clipping, unintended overlap, missing glyphs, or content outside the page boundary.

## arXiv source archive

- The archive contains only `arxiv.tex`, `main.tex`, `appendix.tex`, `references.bib`, and the two generated TeX fragments.
- It contains no PDF, raw trace, build cache, absolute local path, or secret-shaped string.
- Two consecutive packaging runs produced the same SHA-256.
- A clean extraction compiled to the same 11-page placeholder-author PDF inside the digest-locked, network-disabled TeX image.
