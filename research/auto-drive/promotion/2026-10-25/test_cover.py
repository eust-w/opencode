"""Original 4:3 cover contracts; run from this promotion directory."""

import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

from PIL import Image


ROOT = Path(__file__).parent


class CoverTests(unittest.TestCase):
    def module(self):
        self.assertTrue((ROOT / "cover.py").is_file(), "cover implementation is missing")
        spec = importlib.util.spec_from_file_location("promo_cover", ROOT / "cover.py")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module

    def test_cover_is_native_4x3_rgb_with_named_text_bounds(self):
        image, report = self.module().compose()
        self.assertEqual(image.size, (1600, 1200))
        self.assertEqual(image.mode, "RGB")
        self.assertEqual(report["size"], [1600, 1200])
        self.assertTrue(report["texts"])
        self.assertEqual(len({item["name"] for item in report["texts"]}), len(report["texts"]))

    def test_all_informative_text_survives_the_16x9_center_crop(self):
        _, report = self.module().compose()
        self.assertEqual(report["safe_box"], [80, 150, 1520, 1050])
        self.assertEqual(report["center_crop_16x9"], [0, 150, 1600, 1050])
        for item in report["texts"]:
            x0, y0, x1, y1 = item["bounds"]
            self.assertTrue(80 <= x0 < x1 <= 1520, item)
            self.assertTrue(150 <= y0 < y1 <= 1050, item)

    def test_cover_preserves_the_approved_wording(self):
        _, report = self.module().compose()
        self.assertEqual({item["text"] for item in report["texts"]}, {
            "OPEN SOURCE / RESEARCH", "AutoDrive", "回合边界续推控制",
            "CONTINUE", "继续", "STOP", "停止", "DEFER", "交给用户",
            "AI 编程，总要你说「继续」？", "机制示意 · 研究预览 · 合成配音",
        })

    def test_text_regions_do_not_overlap(self):
        _, report = self.module().compose()
        for index, first in enumerate(report["texts"]):
            a = first["bounds"]
            for second in report["texts"][index + 1:]:
                b = second["bounds"]
                self.assertFalse(a[0] < b[2] and a[2] > b[0] and a[1] < b[3] and a[3] > b[1], (first, second))

    def test_cli_saves_the_jpeg_and_matching_layout_report(self):
        module = self.module()
        with tempfile.TemporaryDirectory() as directory:
            result = subprocess.run([sys.executable, str(ROOT / "cover.py"), "--output", directory], capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            with Image.open(Path(directory) / "cover-bilibili-4x3.jpg") as image:
                self.assertEqual(image.size, (1600, 1200))
                self.assertEqual(image.mode, "RGB")
                self.assertEqual(image.format, "JPEG")
            report = json.loads((Path(directory) / "cover-bilibili-4x3-layout.json").read_text())
            self.assertEqual(report, module.compose()[1])

    def test_cli_refuses_existing_outputs_without_modifying_them(self):
        self.module()
        for filename in ("cover-bilibili-4x3.jpg", "cover-bilibili-4x3-layout.json"):
            with self.subTest(filename=filename), tempfile.TemporaryDirectory() as directory:
                target = Path(directory) / filename
                target.write_bytes(b"preserve existing artifact")
                result = subprocess.run([sys.executable, str(ROOT / "cover.py"), "--output", directory], capture_output=True, text=True)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn("refusing to overwrite", result.stderr)
                self.assertEqual(target.read_bytes(), b"preserve existing artifact")
                self.assertEqual(list(Path(directory).iterdir()), [target])


if __name__ == "__main__":
    unittest.main()
