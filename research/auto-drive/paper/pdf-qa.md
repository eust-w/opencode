# PDF quality audit

Date: 2026-08-31

## Reproducible build

- TeX image: `opencode-autodrive-texlive-locked:2026-08-31`, immutable image ID `sha256:0d7318da40803ad67f4ee8baac619d6192fc7b7314e4b9de0ccb1cc64b39995c`
- Build network: disabled
- Engine: pdfTeX 3.141592653-2.6-1.40.29, TeX Live 2026
- Anonymous PDF SHA-256: `ade9ba720226a60f4adecc921e985a8c00bae596a21fb1cee9a7e42cd0981dfc`
- Placeholder-author PDF SHA-256: `0b2b32b6ec9bc7d10d9a403ee8c8876c09d4a754482d9091c4ebc23a67ac87ce`
- Deterministic arXiv source archive SHA-256: `cf214aefdcd942b8c567fc9b5deaf6b49e6ed34450a694c4e699e3ec20177a84`

## Structural and textual checks

- Both outputs are 13-page US Letter, unencrypted PDF 1.7 files.
- Poppler extracted 67,373 bytes from the anonymous version and 67,405 from the placeholder-author version.
- Title, references, appendix, full 48-task manifest, v1.14 protocol text, v1.13 canary values, the accepted negative r9 pilot disclosure, and the schema-v4 startup-baseline gate are extractable.
- No extracted stale Gemini, Claude Sonnet, or GPT-5.4 model name remains. The D-Robotics DeepSeek/Qwen matrix and DEFER-on-failure request contract are extractable.
- The anonymous file contains only the anonymous marker. The placeholder-author file contains only placeholder name, institution, and country metadata; no email is asserted.
- Each PDF contains 17 rendered result-placeholder macro occurrences and 34 case-insensitive extracted `Pending` occurrences when explanatory prose is included. Both contain zero unresolved `??` references. Pending macros are intentional publication gates, not empirical claims.

## Fonts and logs

- Both files use 15 font references resolving to 12 distinct embedded font programs.
- All font programs are subset Type 1 fonts; no Type 3 font is present.
- Final logs contain no undefined reference, undefined citation, BibTeX warning, or fatal diagnostic. Each log has one 1.424pt overfull vertical-box notice on the appendix transition; all affected pages were visually inspected and show no clipping, overlap, or text outside the page boundary.

## Visual audit

All 13 anonymous pages and all 13 placeholder-author pages were rendered at 120 DPI and inspected page by page. Titles, author modes, tables, equations, references, appendix headings, red pending values, request contract, the charged budget-overrun disclosure, and the 48-row task manifest are legible. No page contains clipping, unintended overlap, missing glyphs, or content outside the page boundary.

## arXiv source archive

- The archive contains only `arxiv.tex`, `main.tex`, `appendix.tex`, `references.bib`, and three generated TeX fragments, including the historical v1.13 canary table.
- It contains no PDF, raw trace, build cache, absolute local path, host address, or secret-shaped string.
- Two consecutive packaging runs produced the same SHA-256.
- A clean extraction compiled to a 13-page placeholder-author PDF inside the image-ID-locked, network-disabled TeX image. It reproduced the same single 1.424pt non-visible appendix notice and contained no unresolved references.
