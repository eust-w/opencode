"""Renderer contract tests; run from this promotion directory."""

import importlib.util
import json
from pathlib import Path
import unittest


ROOT = Path(__file__).parent


class RendererTests(unittest.TestCase):
    def module(self):
        self.assertTrue((ROOT / "render.py").is_file(), "renderer implementation is missing")
        spec = importlib.util.spec_from_file_location("promo_render", ROOT / "render.py")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module

    def timeline(self):
        return {
            "duration": 4.0,
            "sample_rate": 24000,
            "scenes": [
                {"id": "hook", "start": 0.0, "end": 2.0,
                 "lines": [{"text": "一句话。", "start": 0.2, "end": 1.6}]},
                {"id": "intro", "start": 2.0, "end": 4.0,
                 "lines": [{"text": "第二句。", "start": 2.2, "end": 3.6}]},
            ],
        }

    def test_scene_selection_uses_half_open_boundaries_and_clamps_ends(self):
        renderer = self.module()
        timeline = self.timeline()
        self.assertEqual(renderer.select_scene(timeline, -1)[0], 0)
        self.assertEqual(renderer.select_scene(timeline, 1.99)[0], 0)
        self.assertEqual(renderer.select_scene(timeline, 2.0)[0], 1)
        self.assertEqual(renderer.select_scene(timeline, 10)[2], 1.0)

    def test_caption_respects_measured_sentence_intervals(self):
        renderer = self.module()
        scene = self.timeline()["scenes"][0]
        self.assertEqual(renderer.active_caption(scene, 0.1), "")
        self.assertEqual(renderer.active_caption(scene, 0.3), "一句话。")
        self.assertEqual(renderer.active_caption(scene, 1.6), "")

    def test_wrapping_preserves_chinese_punctuation_and_fits_width(self):
        renderer = self.module()
        font = renderer.font(46)
        text = "缺少信息、需要主观选择，或者涉及扩大权限，就暂缓，交给用户。"
        wrapped = renderer.wrap_text(text, font, 440)
        self.assertEqual("".join(wrapped), text)
        self.assertTrue(all(font.getlength(line) <= 440 for line in wrapped))
        self.assertTrue(all(not line.startswith(("，", "。", "、", "？", "！")) for line in wrapped))

    def test_wrapping_keeps_latin_project_name_whole(self):
        renderer = self.module()
        wrapped = renderer.wrap_text("这是基于 OpenCode 的续推控制原型。", renderer.font(46), 320)
        self.assertTrue(any("OpenCode" in line for line in wrapped), wrapped)

    def test_illustration_text_fits_its_panel_not_just_the_full_frame(self):
        renderer = self.module()
        manifest = json.loads((ROOT / "narration.json").read_text())
        for mode in ("landscape", "portrait"):
            engine = renderer.Renderer(manifest, renderer.preview_timeline(manifest), mode)
            x, y, x1, y1 = engine.layout["visual"]
            for scene in manifest["scenes"]:
                bounds = []
                engine.illustration(scene["id"], x1 - x, y1 - y, 2.0, 0.3, bounds)
                for name, box in bounds:
                    self.assertTrue(x <= box[0] < box[2] <= x1, (mode, scene["id"], name, box))
                    self.assertTrue(y <= box[1] < box[3] <= y1, (mode, scene["id"], name, box))

    def test_layer_includes_labelled_real_source_excerpt(self):
        renderer = self.module()
        manifest = json.loads((ROOT / "narration.json").read_text())
        engine = renderer.Renderer(manifest, renderer.preview_timeline(manifest), "portrait")
        x, y, x1, y1 = engine.layout["visual"]
        bounds = []
        engine.illustration("layer", x1 - x, y1 - y, 2.0, 0.3, bounds)
        self.assertEqual(sum(name == "source-excerpt" for name, _ in bounds), 3)

    def test_layout_boxes_are_native_and_non_overlapping(self):
        renderer = self.module()
        for mode in ("landscape", "portrait"):
            layout = renderer.layout(mode)
            width, height = layout["size"]
            for key in ("header", "title", "visual", "caption", "disclosure"):
                x0, y0, x1, y1 = layout[key]
                self.assertTrue(0 <= x0 < x1 <= width, (mode, key))
                self.assertTrue(0 <= y0 < y1 <= height, (mode, key))
            for first, second in (("title", "visual"), ("visual", "caption"), ("caption", "disclosure")):
                self.assertFalse(renderer.overlap(layout[first], layout[second]), (mode, first, second))
        self.assertEqual(renderer.layout("portrait")["size"], (1080, 1920))

    def test_portrait_critical_content_avoids_platform_overlay_zones(self):
        renderer = self.module()
        layout = renderer.layout("portrait")
        for key in ("title", "visual", "caption", "disclosure"):
            self.assertLessEqual(layout[key][2], 920, key)
        self.assertLessEqual(layout["caption"][3], 1590)
        self.assertLessEqual(layout["disclosure"][3], 1640)

    def test_invalid_timeline_rejected_before_encoding(self):
        renderer = self.module()
        manifest = {"scenes": [{"id": "hook", "lines": ["一句话。"]}, {"id": "intro", "lines": ["第二句。"]}]}
        renderer.validate_timeline(self.timeline(), manifest)
        invalid = self.timeline()
        invalid["scenes"][1]["start"] = 1.5
        with self.assertRaisesRegex(ValueError, "contiguous"):
            renderer.validate_timeline(invalid, manifest)

    def test_timeline_captions_must_match_frozen_manifest_exactly(self):
        renderer = self.module()
        manifest = {"scenes": [{"id": "hook", "lines": ["一句话。"]}, {"id": "intro", "lines": ["第二句。"]}]}
        invalid = self.timeline()
        invalid["scenes"][1]["lines"][0]["text"] = "过期的旧文案。"
        with self.assertRaisesRegex(ValueError, "caption text"):
            renderer.validate_timeline(invalid, manifest)

    def test_all_scene_frames_have_safe_text_bounds_and_actual_motion(self):
        renderer = self.module()
        manifest = json.loads((ROOT / "narration.json").read_text())
        timeline = renderer.preview_timeline(manifest)
        renderer.validate_timeline(timeline, manifest)
        for mode in ("landscape", "portrait"):
            engine = renderer.Renderer(manifest, timeline, mode)
            for scene in timeline["scenes"]:
                frame, bounds = engine.frame(scene["start"] + 2.0, audit=True)
                self.assertEqual(frame.size, renderer.layout(mode)["size"])
                for name, box in bounds:
                    self.assertTrue(0 <= box[0] < box[2] <= frame.width, (mode, scene["id"], name, box))
                    self.assertTrue(0 <= box[1] < box[3] <= frame.height, (mode, scene["id"], name, box))
            frame_a = engine.frame(timeline["scenes"][6]["start"] + 2.0)
            frame_b = engine.frame(timeline["scenes"][6]["start"] + 3.0)
            self.assertNotEqual(frame_a.tobytes(), frame_b.tobytes())


if __name__ == "__main__":
    unittest.main()
