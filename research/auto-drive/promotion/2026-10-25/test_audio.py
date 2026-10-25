import importlib.util
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


class AudioTests(unittest.TestCase):
    def setUp(self):
        self.assertIsNotNone(importlib.util.find_spec("audio"), "audio implementation is required")
        import audio
        self.audio = audio
        self.manifest = {"language": "zh-CN", "scenes": [
            {"id": "one", "lines": ["第一句。", "第二句。"]},
            {"id": "two", "lines": ["结尾。"]},
        ]}

    def test_preserves_frozen_text(self):
        self.assertEqual(self.audio.validate_manifest(self.manifest), self.manifest)

    def test_rejects_empty_and_duplicate_scene_ids(self):
        for scenes in [[], [{"id": "", "lines": ["句子"]}], [
            {"id": "same", "lines": ["甲"]}, {"id": "same", "lines": ["乙"]}
        ]]:
            with self.subTest(scenes=scenes), self.assertRaises(ValueError):
                self.audio.validate_manifest({"language": "zh-CN", "scenes": scenes})

    def test_rejects_non_chinese_manifest_and_empty_or_multiline_text(self):
        for text in ["", "  ", "两行\n字幕", 42]:
            with self.subTest(text=text), self.assertRaises(ValueError):
                self.audio.validate_manifest({"language": "zh-CN", "scenes": [{"id": "a", "lines": [text]}]})
        with self.assertRaises(ValueError):
            self.audio.validate_manifest({"language": "en", "scenes": self.manifest["scenes"]})

    def test_measured_sample_counts_create_contiguous_scenes(self):
        timeline = self.audio.build_timeline(self.manifest, [24000, 48000, 12000], 24000,
                                            line_pause=0.1, scene_pause=0.3, lead_in=0.25, tail=0.5)
        self.assertEqual(timeline["duration"], 4.65)
        self.assertEqual(timeline["sample_rate"], 24000)
        self.assertEqual(timeline["scenes"][0], {"id": "one", "start": 0.0, "end": 3.65, "lines": [
            {"text": "第一句。", "start": 0.25, "end": 1.25},
            {"text": "第二句。", "start": 1.35, "end": 3.35},
        ]})
        self.assertEqual(timeline["scenes"][1]["start"], timeline["scenes"][0]["end"])
        self.assertEqual(timeline["scenes"][-1]["end"], timeline["duration"])

    def test_rejects_missing_invalid_samples_and_invalid_pauses(self):
        for counts in [[24000], [24000, 0, 12000], [24000, -1, 12000], [24000, 2.5, 12000]]:
            with self.subTest(counts=counts), self.assertRaises(ValueError):
                self.audio.build_timeline(self.manifest, counts, 24000)
        for kwargs in [{"line_pause": -1}, {"scene_pause": float("nan")}, {"tail": float("inf")}]:
            with self.subTest(kwargs=kwargs), self.assertRaises(ValueError):
                self.audio.build_timeline(self.manifest, [24000, 48000, 12000], 24000, **kwargs)
        with self.assertRaises(ValueError):
            self.audio.build_timeline(self.manifest, [24000, 48000, 12000], 0)

    def test_srt_rounding_carries_seconds_without_drift(self):
        self.assertEqual(self.audio.srt_timestamp(59.9996), "00:01:00,000")
        self.assertEqual(self.audio.srt_timestamp(3600.001), "01:00:00,001")
        timeline = self.audio.build_timeline(self.manifest, [24000, 48000, 12000], 24000,
                                            line_pause=0.1, scene_pause=0.3, lead_in=0.25, tail=0.5)
        self.assertEqual(self.audio.to_srt(timeline),
                         "1\n00:00:00,250 --> 00:00:01,250\n第一句。\n\n"
                         "2\n00:00:01,350 --> 00:00:03,350\n第二句。\n\n"
                         "3\n00:00:03,650 --> 00:00:04,150\n结尾。\n")

    def test_sample_output_does_not_target_completed_evidence(self):
        self.assertTrue(hasattr(self.audio, "output_directory"), "sample output isolation is required")
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            evidence = root / "audio-provenance.json"
            evidence.write_text("complete evidence")
            self.assertEqual(self.audio.output_directory(root, None), root)
            self.assertEqual(self.audio.output_directory(root, 1), root / "audio-sample")
            self.assertEqual(evidence.read_text(), "complete evidence")

    def test_limit_requires_a_positive_integer(self):
        for limit in ["0", "-1"]:
            with self.subTest(limit=limit):
                result = subprocess.run([sys.executable, str(Path(__file__).with_name("audio.py")), "--limit", limit],
                                        capture_output=True, text=True)
                self.assertEqual(result.returncode, 2)
                self.assertIn("positive integer", result.stderr)

    def test_unreviewed_voice_is_rejected_before_synthesis(self):
        result = subprocess.run([sys.executable, str(Path(__file__).with_name("audio.py")), "--voice", "zm_010"],
                                capture_output=True, text=True)
        self.assertEqual(result.returncode, 2)
        self.assertIn("invalid choice", result.stderr)


if __name__ == "__main__":
    unittest.main()
