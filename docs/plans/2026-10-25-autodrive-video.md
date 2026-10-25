# AutoDrive Chinese Video Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Produce and verify a voiced Chinese AutoDrive explainer in two aspect ratios, then publish on the six user-selected platforms using confirmed accounts.

**Architecture:** A checked narration manifest feeds sentence-level audio synthesis and a measured timeline. An original motion-graphics renderer composes scene visuals and subtitles from that timeline and exports through FFmpeg. Publishing state is recorded separately from file export success.

**Tech Stack:** Python/Pillow or bundled Node canvas, a license-verified open TTS model, FFmpeg/FFprobe, GitHub CLI, and browser UI for account-bound publication.

---

## Task 1: Freeze facts and narration

Create `research/auto-drive/promotion/2026-10-25/narration.json` with scenes and sentence-sized spoken strings. Check every mechanism claim against the current source and every research-status claim against the current readiness report. Never insert benchmark values as decoration. Create a claims map with source paths.

## Task 2: Produce audio with measured timings

Create `audio.py` and `test_audio.py` in the promotion directory. First test manifest validation, contiguous timing and SRT formatting; observe a failing test before implementing. Verify model/voice license and record source/hash. Generate one real sentence at a time, measure PCM durations, concatenate with short pauses, and write a timeline and SRT. Output is `output/narration.wav`, `output/timeline.json`, and `output/subtitles.zh.srt`. No Apple system-voice redistribution assumption, paid APIs or personal voice imitation.

## Task 3: Render two native layouts

Create `render.py` and `test_render.py`. Test scene selection, bounds and subtitle wrapping before implementation. Render original typography, three-state decision cards, queue admission and user-priority animation. Include a persistent mechanism-illustration label and a final research-preview disclosure. Generate covers and representative contact sheets as well as both MP4s. Burn captions directly into the renderer if the installed FFmpeg has no subtitle filter.

## Task 4: Verify and package

Run Python tests from the promotion directory. Inspect FFprobe JSON and decode all frames/audio with FFmpeg. Measure integrated loudness and peak, inspect contact sheets and sampled full-resolution frames, and check actual Chinese narration. Record file SHA-256 and source references in `verification.json` / `README.md`. Upload completed media as new GitHub Release assets after secret scans; do not overwrite the historical old ZIP or the research PDFs.

## Task 5: Adapt and publish

Create `platform-copy.md` with six distinct, factual descriptions, synthetic-voice disclosure, project link and appropriate tags. Check current platform upload requirements in primary documentation/UI. Identify account nicknames in the browser and obtain the missing account selection. Upload only after video QA. Record each platform's exact status and public URL; login, unavailable accounts, unsupported upload or moderation remain blockers, not success.

## Task 6: Preserve and hand off

Commit only production sources, captions, plans, copy and public-safe verification artifacts with conventional commits. Keep model files, local account screenshots, credentials, raw caches and large videos out of source history. Push to `origin/auto-drive-engine`, verify the remote commit, and give the user the actual two videos and platform-by-platform publication status.
