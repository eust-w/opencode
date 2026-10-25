import unittest
import json
from pathlib import Path
import subprocess
import sys
import tempfile

import verify


class MediaContractTests(unittest.TestCase):
    def test_loudness_allows_trailing_ffmpeg_progress(self):
        log = '[Parsed_loudnorm_0] \n{"input_i": "-16.63", "input_tp": "-1.46"}\n[out#0/null] audio:34856KiB\n'
        self.assertEqual(verify.parse_loudness(log)["input_i"], "-16.63")

    def test_failed_check_cannot_leave_previous_success(self):
        with tempfile.TemporaryDirectory() as directory:
            report = Path(directory) / "verification.json"
            report.write_text(json.dumps({"status": "technical_checks_passed"}))
            result = subprocess.run([sys.executable, str(Path(verify.__file__)), "--output", directory],
                                    capture_output=True, text=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertNotEqual(json.loads(report.read_text())["status"], "technical_checks_passed")

    def probe(self):
        return {"streams": [
            {"codec_type": "video", "codec_name": "h264", "width": 1920, "height": 1080,
             "pix_fmt": "yuv420p", "avg_frame_rate": "30/1", "duration": "90.0"},
            {"codec_type": "audio", "codec_name": "aac", "sample_rate": "48000",
             "duration": "90.0"}], "format": {"duration": "90.0"}}

    def test_accepts_intended_delivery(self):
        self.assertEqual(verify.validate_probe(self.probe(), "landscape", 90)["width"], 1920)

    def test_rejects_silent_export_without_audio_stream(self):
        probe = self.probe()
        probe["streams"].pop()
        with self.assertRaisesRegex(ValueError, "audio"):
            verify.validate_probe(probe, "landscape", 90)

    def test_rejects_wrong_orientation(self):
        with self.assertRaisesRegex(ValueError, "dimensions"):
            verify.validate_probe(self.probe(), "portrait", 90)

    def test_rejects_truncated_export(self):
        with self.assertRaisesRegex(ValueError, "duration"):
            verify.validate_probe(self.probe(), "landscape", 97)

    def test_rejects_unsupported_codec(self):
        probe = self.probe()
        probe["streams"][0]["codec_name"] = "hevc"
        with self.assertRaisesRegex(ValueError, "H.264"):
            verify.validate_probe(probe, "landscape", 90)


if __name__ == "__main__":
    unittest.main()
