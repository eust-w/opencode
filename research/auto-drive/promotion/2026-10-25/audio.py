"""Reproducible Mandarin narration with sample-measured scene/subtitle timing."""

import argparse
import hashlib
import json
import math
from pathlib import Path

MODEL_REPOSITORY = "hexgrad/Kokoro-82M-v1.1-zh"
MODEL_REVISION = "01e7505bd6a7a2ac4975463114c3a7650a9f7218"
MODEL_SHA256 = "b1d8410fa44dfb5c15471fd6c4225ea6b4e9ac7fa03c98e8bea47a9928476e2b"
PINNED_SHA256 = {
    "kokoro-v1_1-zh.pth": MODEL_SHA256,
    "config.json": "bc333efa5ce4ceff433c8c8e5d027a1eca0166001e4e4a62bea2d26ff7a46890",
    "voices/zf_001.pt": "9bdc9a87e13e9bb1ea3e7803259c2ecbfebaeeb2ff80b5d0c76df1a464c1c962",
    "README.md": "02ed578bdd24c42f3e4ed0d88d33e923365b41e6a37e86d3a5055f75d456f8e6",
}
SAMPLE_RATE = 24000


def validate_manifest(manifest):
    if not isinstance(manifest, dict) or manifest.get("language") != "zh-CN":
        raise ValueError("A zh-CN narration manifest is required")
    scenes = manifest.get("scenes")
    if not isinstance(scenes, list) or not scenes:
        raise ValueError("At least one scene is required")
    identifiers = set()
    for scene in scenes:
        if not isinstance(scene, dict) or not isinstance(scene.get("id"), str) or not scene["id"].strip():
            raise ValueError("Each scene requires a nonempty ID")
        if scene["id"] in identifiers:
            raise ValueError("Scene IDs must be unique")
        identifiers.add(scene["id"])
        if not isinstance(scene.get("lines"), list) or not scene["lines"]:
            raise ValueError("Each scene requires spoken lines")
        for line in scene["lines"]:
            if not isinstance(line, str) or not line.strip() or "\n" in line or "\r" in line:
                raise ValueError("Spoken lines must be nonempty single-line strings")
    return manifest


def build_timeline(manifest, sample_counts, sample_rate, *, line_pause=0.14,
                   scene_pause=0.34, lead_in=0.4, tail=0.8):
    validate_manifest(manifest)
    if type(sample_rate) is not int or sample_rate <= 0:
        raise ValueError("Sample rate must be a positive integer")
    if len(sample_counts) != sum(len(scene["lines"]) for scene in manifest["scenes"]):
        raise ValueError("Every spoken line requires one measured sample count")
    if any(type(count) is not int or count <= 0 for count in sample_counts):
        raise ValueError("Sample counts must be positive integers")
    if any(not math.isfinite(pause) or pause < 0 for pause in [line_pause, scene_pause, lead_in, tail]):
        raise ValueError("Pauses must be finite and nonnegative")
    cursor = 0
    index = 0
    scenes = []
    for scene_number, scene in enumerate(manifest["scenes"]):
        start = cursor
        if scene_number == 0:
            cursor += round(lead_in * sample_rate)
        lines = []
        for line_number, line in enumerate(scene["lines"]):
            line_start = cursor
            cursor += sample_counts[index]
            index += 1
            lines.append({"text": line, "start": round(line_start / sample_rate, 6),
                          "end": round(cursor / sample_rate, 6)})
            if line_number < len(scene["lines"]) - 1:
                cursor += round(line_pause * sample_rate)
        cursor += round((tail if scene_number == len(manifest["scenes"]) - 1 else scene_pause) * sample_rate)
        scenes.append({"id": scene["id"], "start": round(start / sample_rate, 6),
                       "end": round(cursor / sample_rate, 6), "lines": lines})
    return {"duration": round(cursor / sample_rate, 6), "sample_rate": sample_rate, "scenes": scenes}


def srt_timestamp(seconds):
    milliseconds = round(seconds * 1000)
    seconds, milliseconds = divmod(milliseconds, 1000)
    minutes, seconds = divmod(seconds, 60)
    hours, minutes = divmod(minutes, 60)
    return f"{hours:02}:{minutes:02}:{seconds:02},{milliseconds:03}"


def to_srt(timeline):
    lines = [line for scene in timeline["scenes"] for line in scene["lines"]]
    return "\n\n".join(f"{index + 1}\n{srt_timestamp(line['start'])} --> {srt_timestamp(line['end'])}\n{line['text']}"
                       for index, line in enumerate(lines)) + "\n"


def output_directory(root, limit):
    # Sample generation must never target the completed narration's evidence.
    return root if limit is None else root / "audio-sample"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path, default=Path(__file__).with_name("narration.json"))
    parser.add_argument("--output", type=Path, default=Path(__file__).with_name("output"))
    parser.add_argument("--voice", default="zf_001", choices=["zf_001"])
    parser.add_argument("--speed", type=float, default=1.05)
    parser.add_argument("--limit", type=int, help="Development sample only; does not write final narration/timeline")
    args = parser.parse_args()
    if not 0.8 <= args.speed <= 1.2:
        parser.error("Speech speed must stay within 0.8–1.2")
    if args.limit is not None and args.limit < 1:
        parser.error("--limit must be a positive integer")
    output = output_directory(args.output, args.limit)
    manifest = validate_manifest(json.loads(args.manifest.read_text()))
    import numpy as np
    import soundfile as sf
    import torch
    from huggingface_hub import hf_hub_download
    from kokoro import KModel, KPipeline

    output.mkdir(parents=True, exist_ok=True)
    # Samples share immutable, hash-checked resources but have separate evidence.
    cache = args.output / "audio-model"
    files = {}
    for name in ["config.json", "kokoro-v1_1-zh.pth", f"voices/{args.voice}.pt", "README.md"]:
        if name in PINNED_SHA256 and (cache / name).is_file():
            files[name] = cache / name
            continue
        files[name] = Path(hf_hub_download(MODEL_REPOSITORY, name, revision=MODEL_REVISION, local_dir=cache))
    hashes = {name: hashlib.sha256(path.read_bytes()).hexdigest() for name, path in files.items()}
    if hashes["kokoro-v1_1-zh.pth"] != MODEL_SHA256:
        raise ValueError("Model weight hash does not match the published model card")
    for name, digest in hashes.items():
        if name in PINNED_SHA256 and digest != PINNED_SHA256[name]:
            raise ValueError(f"Pinned model asset hash mismatch: {name}")
    torch.set_num_threads(4)
    torch.manual_seed(0)
    model = KModel(repo_id=MODEL_REPOSITORY, config=str(files["config.json"]),
                   model=str(files["kokoro-v1_1-zh.pth"])).to("cpu").eval()

    # Explicit pronunciations prevent fallback downloads and ambiguous brand reading.
    pronunciations = {"AutoDrive": "ˈɔtoʊ dɹˈaɪv", "OpenCode": "ˈoʊpən kˈoʊd"}

    def english(text):
        if text.strip() not in pronunciations:
            raise ValueError(f"Unreviewed English phrase in narration: {text!r}")
        return pronunciations[text.strip()]

    pipeline = KPipeline(lang_code="z", repo_id=MODEL_REPOSITORY, model=model, en_callable=english)
    voice = torch.load(str(files[f"voices/{args.voice}.pt"]), weights_only=True)
    line_dir = output / "audio-lines"
    line_dir.mkdir(exist_ok=True)
    waves = []
    records = []
    source_lines = [line for scene in manifest["scenes"] for line in scene["lines"]]
    for index, line in enumerate(source_lines[:args.limit] if args.limit else source_lines):
        chunks = list(pipeline(line, voice=voice, speed=args.speed))
        waveform = np.concatenate([chunk.audio.numpy() for chunk in chunks]).astype(np.float32)
        if not np.isfinite(waveform).all() or not len(waveform):
            raise ValueError(f"Invalid synthesis output for line {index + 1}")
        sf.write(line_dir / f"{index + 1:02}.wav", waveform, SAMPLE_RATE, subtype="FLOAT")
        waves.append(waveform)
        records.append({"text": line, "samples": len(waveform), "duration": len(waveform) / SAMPLE_RATE,
                        "phonemes": [chunk.phonemes for chunk in chunks]})
        print(json.dumps({"line": index + 1, "seconds": round(len(waveform) / SAMPLE_RATE, 3),
                          "text": line}, ensure_ascii=False), flush=True)
    metadata = {"model": MODEL_REPOSITORY, "revision": MODEL_REVISION, "voice": args.voice,
                "speed": args.speed, "device": "cpu", "seed": 0, "file_sha256": hashes,
                "manifest_sha256": hashlib.sha256(args.manifest.read_bytes()).hexdigest(),
                "synthetic_voice": True, "personal_voice_cloning": False, "lines": records}
    (output / "audio-provenance.json").write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n")
    if args.limit:
        return
    timeline = build_timeline(manifest, [len(wave) for wave in waves], SAMPLE_RATE)
    audio = np.zeros(round(timeline["duration"] * SAMPLE_RATE), dtype=np.float32)
    lines = [line for scene in timeline["scenes"] for line in scene["lines"]]
    for wave, line in zip(waves, lines, strict=True):
        start = round(line["start"] * SAMPLE_RATE)
        audio[start:start + len(wave)] = wave
    # Only attenuate; final FFmpeg delivery performs measured loudness normalization.
    audio *= min(1.0, 0.89 / max(float(np.max(np.abs(audio))), 1e-9))
    sf.write(output / "narration.wav", audio, SAMPLE_RATE, subtype="PCM_16")
    (output / "timeline.json").write_text(json.dumps(timeline, ensure_ascii=False, indent=2) + "\n")
    (output / "subtitles.zh.srt").write_text(to_srt(timeline))
    print(json.dumps({"duration": timeline["duration"], "lines": len(lines), "output": str(output)}))


if __name__ == "__main__":
    main()
