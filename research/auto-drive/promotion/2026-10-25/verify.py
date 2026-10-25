"""Check exported media without inferring successful social publication."""

import argparse
from datetime import datetime, timezone
from fractions import Fraction
import hashlib
import json
from pathlib import Path
import subprocess


def parse_loudness(log):
    # FFmpeg may append muxing/progress diagnostics after the filter's JSON.
    return json.JSONDecoder().raw_decode(log[log.rfind("{"):])[0]


def validate_probe(probe, orientation, expected_duration):
    video = [stream for stream in probe["streams"] if stream["codec_type"] == "video"]
    audio = [stream for stream in probe["streams"] if stream["codec_type"] == "audio"]
    if len(video) != 1 or len(audio) != 1:
        raise ValueError("Exactly one video and one audio stream are required")
    video, audio = video[0], audio[0]
    if video["codec_name"] != "h264" or video["pix_fmt"] != "yuv420p":
        raise ValueError("Delivery requires H.264 yuv420p video")
    dimensions = {"landscape": (1920, 1080), "portrait": (1080, 1920)}
    if (video["width"], video["height"]) != dimensions[orientation]:
        raise ValueError("Incorrect delivery dimensions")
    if Fraction(video["avg_frame_rate"]) != 30:
        raise ValueError("Delivery requires 30 fps")
    if audio["codec_name"] != "aac" or int(audio["sample_rate"]) != 48000:
        raise ValueError("Delivery requires AAC audio at 48 kHz")
    duration = float(probe["format"]["duration"])
    if not 80 <= duration <= 110 or abs(duration - expected_duration) > 0.2:
        raise ValueError("Export duration does not match the measured 80–110 second timeline")
    if abs(float(video["duration"]) - float(audio["duration"])) > 0.2:
        raise ValueError("Audio/video duration mismatch")
    return {"width": video["width"], "height": video["height"], "fps": 30,
            "video_codec": "h264", "pixel_format": "yuv420p", "audio_codec": "aac",
            "audio_sample_rate": 48000, "duration": duration}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=Path(__file__).with_name("output"))
    args = parser.parse_args()
    report = {"checked_at": datetime.now(timezone.utc).isoformat(),
              "scope": "technical media checks; not a human listening or publication confirmation",
              "status": "incomplete_not_passed", "media": []}
    args.output.mkdir(parents=True, exist_ok=True)
    # A failed or interrupted rerun must not leave a stale successful verdict.
    (args.output / "verification.json").write_text(json.dumps(report, indent=2) + "\n")
    timeline = json.loads((args.output / "timeline.json").read_text())
    for orientation in ["landscape", "portrait"]:
        path = args.output / f"autodrive-zh-{orientation}.mp4"
        probe = json.loads(subprocess.check_output([
            "ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", str(path)]))
        result = validate_probe(probe, orientation, timeline["duration"])
        decoded = subprocess.run(["ffmpeg", "-v", "error", "-xerror", "-i", str(path),
                                  "-f", "null", "-"], capture_output=True, text=True, check=True)
        if decoded.stderr.strip():
            raise ValueError(f"Decode diagnostics need review: {path.name}: {decoded.stderr}")
        measured = subprocess.run([
            "ffmpeg", "-hide_banner", "-i", str(path), "-vn", "-af",
            "loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json", "-f", "null", "-"],
            capture_output=True, text=True, check=True).stderr
        loudness = parse_loudness(measured)
        integrated = float(loudness["input_i"])
        peak = float(loudness["input_tp"])
        if not -20 <= integrated <= -12 or peak > -0.8:
            raise ValueError(f"Audio loudness needs review: {integrated} LUFS / {peak} dBTP")
        with path.open("rb") as media:
            digest = hashlib.file_digest(media, "sha256").hexdigest()
        report["media"].append({"file": path.name, "bytes": path.stat().st_size,
                                "sha256": digest, **result, "full_decode": "passed",
                                "integrated_lufs": integrated, "true_peak_dbtp": peak})
    report["status"] = "technical_checks_passed"
    (args.output / "verification.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
