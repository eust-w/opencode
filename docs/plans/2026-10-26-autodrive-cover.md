# AutoDrive Cover Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Produce the approved original 4:3 cover without clipping informative text in either Bilibili aspect ratio.

**Architecture:** Add a standalone code-native cover composition using the existing renderer's Canvas and palette. Do not read or modify an existing raster, video, narration or frozen experiment result. Return text bounds for deterministic verification.

**Tech Stack:** Existing Python/Pillow environment, unittest, repository renderer.

---

### Task 1: Safe cover composition

**Files:** Create `research/auto-drive/promotion/2026-10-25/cover.py` and `tests/test_cover.py` beneath that promotion folder.

1. Write a failing test that `compose()` exists, returns a 1600x1200 RGB image and nonempty named text bounds, and places every text bound inside `(80, 150, 1520, 1050)`. Assert title, all three bilingual decisions, and disclosure are present in the returned metadata.
2. Run `.venv/bin/python -m unittest discover -s tests -p test_cover.py -v` from the promotion directory; record the expected missing-function failure.
3. Implement `compose()` with `Image.new`, the existing `Canvas`, palette and font helper. Arrange header near y=200, title near y=300, three cards near y=550..760, question near y=850 and disclosure near y=970. Keep copy unchanged and size text to fit its allocated bounds. Provide a CLI that saves a new `output/cover-bilibili-4x3.jpg` and bounds report, without overwriting existing assets.
4. Re-run the focused tests, then all promotion tests. Inspect the actual JPG and platform previews before publishing.
5. Review the scoped diff and dependency/security checks; commit only the plans and cover source/tests. Keep generated media and private publication proof ignored.

### Task 2: Platform delivery

Main agent owns browser actions. Restore the AutoDrive draft, upload the new cover, verify both ratios and final metadata, submit once and inspect the result. Independently upload the already approved landscape video to the confirmed YouTube channel with synthetic-content disclosure and not-made-for-kids settings; verify publication and playback. Preserve the unrelated Douyin draft and do not bypass the WeChat browser safety restriction.
