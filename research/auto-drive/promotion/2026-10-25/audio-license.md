# Narration provenance and redistribution basis

## Voice and licensing

This introduction uses a stock synthetic Mandarin voice, `zf_001`, from
[hexgrad/Kokoro-82M-v1.1-zh](https://huggingface.co/hexgrad/Kokoro-82M-v1.1-zh).
No personal voice sample was supplied and no voice cloning was performed.
The narration is not a recording or endorsement by a project contributor,
model author, dataset speaker, or public figure.

The upstream model card declares **Apache-2.0** and states that its Chinese
training data was permissively provided by LongMaoData. The voice tensor is
distributed in the same Apache-labelled model repository; no separate restriction
is published alongside this voice. This is the documented basis for using the
stock model to generate narration for public distribution. It is not a claim of
exclusive copyright in synthetic speech or a blanket legal warranty.

Primary references checked on 2026-10-25:

- [Pinned model card](https://huggingface.co/hexgrad/Kokoro-82M-v1.1-zh/blob/01e7505bd6a7a2ac4975463114c3a7650a9f7218/README.md)
- [Stock voice tensor](https://huggingface.co/hexgrad/Kokoro-82M-v1.1-zh/blob/01e7505bd6a7a2ac4975463114c3a7650a9f7218/voices/zf_001.pt)
- [Kokoro inference source](https://github.com/hexgrad/kokoro)
- [Kokoro Apache-2.0 license](https://github.com/hexgrad/kokoro/blob/main/LICENSE)
- [Apache-2.0 license text](https://www.apache.org/licenses/LICENSE-2.0.txt)

The promotion release contains generated audio and its source script, not the
model weights, voice tensor or third-party software binaries. Redistributors who
package those dependencies must retain their respective license/notice files.
No Apple system voice, paid speech API, music, or external reference recording is
used. The video and platform text disclose synthetic narration.

## Exact source identity

Model repository revision: `01e7505bd6a7a2ac4975463114c3a7650a9f7218`.

| File | SHA-256 |
| --- | --- |
| `kokoro-v1_1-zh.pth` | `b1d8410fa44dfb5c15471fd6c4225ea6b4e9ac7fa03c98e8bea47a9928476e2b` |
| `config.json` | `bc333efa5ce4ceff433c8c8e5d027a1eca0166001e4e4a62bea2d26ff7a46890` |
| `voices/zf_001.pt` | `9bdc9a87e13e9bb1ea3e7803259c2ecbfebaeeb2ff80b5d0c76df1a464c1c962` |
| `README.md` | `02ed578bdd24c42f3e4ed0d88d33e923365b41e6a37e86d3a5055f75d456f8e6` |

The weight hash was checked against the upstream model-card value. The other
hashes identify the exact locally retrieved files at that pinned revision.

## Reproduction

Run in this promotion directory using Python 3.12 in an isolated virtualenv:

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r audio-requirements.txt
.venv/bin/python -m unittest test_audio.py
.venv/bin/python audio.py --voice zf_001 --speed 1.05
```

The first synthesis retrieves the pinned public model; it does not require a
model-provider key. `output/audio-model/` and `.venv/` remain ignored. Inference
runs locally on CPU with four PyTorch threads and a fixed seed of zero. English
brand pronunciations for AutoDrive and OpenCode are explicitly supplied as
phonemes without changing the frozen Chinese subtitle strings. This is speech
synthesis, not a recorded execution of the AutoDrive agent.

Each complete sentence is synthesized and measured in PCM samples. The timeline
adds 0.40 s opening silence, 0.14 s between sentences in one scene, 0.34 s between
scenes, and 0.80 s at the end. Scene boundaries are contiguous; subtitle intervals
cover their measured utterance, not proportional text-length guesses. The source
WAV is 24,000 Hz mono signed 16-bit PCM, attenuated only if needed to keep peaks
below 0.89 full scale; delivery loudness is checked separately after encoding.

`output/audio-provenance.json` records the frozen narration hash, model hashes,
voice/speed/device/seed and each sentence's measured sample count and phonemes.
Generated outputs: `narration.wav`, `timeline.json`, `subtitles.zh.srt` and per-line
WAVs in `output/audio-lines/`.

Only the audited `zf_001` stock voice is accepted. Development runs with
`--limit N` require a positive integer and write clips/provenance under
`output/audio-sample/`, never over the completed narration's evidence. They reuse
the immutable hash-checked model cache, not the final clips.

The delivered source narration is **92.965 seconds**, 2,231,160 samples, 12 scenes
and 17 sentence clips. It preserves the frozen manifest with SHA-256
`239d2a677edc631aa9734b729cfd21bbf0beb676187e5c66e8f15987c74cc2b0`.
The initial WAV SHA-256 is
`62953a44f212c204091405928102e8dfd02fa767b9474f92b36e32b9c09e23ca`.
Its measured loudness is -25.03 LUFS with -4.98 dBTP true peak; the video encoder
normalizes delivery audio separately rather than changing the speech timing.
The full installed environment is recorded in `output/audio-environment.txt`;
`pip check` found no broken requirements.

## Quality verification boundaries

Automated duration/continuity/SRT tests are not a listening test. Any ASR backcheck
must be reported as an automatic transcription check with the actual model and
transcript; it must not be described as human listening or evidence of perfect
pronunciation. Final measured delivery and verification are recorded in the
promotion verification report after synthesis and rendering.

The independent local backcheck uses [OpenAI Whisper](https://github.com/openai/whisper),
whose code and weights are [MIT-licensed](https://github.com/openai/whisper/blob/main/LICENSE).
The `tiny` multilingual checkpoint was already cached locally and has SHA-256
`65147644a518d12f04e32d6f3b26facc3f8dd46e5390956a9424a650c0ce22b9`.
No reference transcript, initial prompt or hotword hints are supplied:

```sh
OMP_NUM_THREADS=2 .venv/bin/whisper output/narration.wav \
  --model tiny --language zh --device cpu --fp16 False \
  --output_dir output/audio-asr --output_format json \
  --condition_on_previous_text False --temperature 0 --threads 2
```

`output/audio-asr/narration.json` is the automatic transcript, not corrected ground
truth. Its text must be reviewed for omissions and errors; this small recognizer
can itself misrecognize Chinese words and English project names.

The completed tiny-model backcheck represents all 17 source sentences from the
opening to the closing, but it is **not an exact transcript match**. Examples are
`续推 → 去推`, `消融 → 销容` and `OpenCode → 欧本扣`. The stored synthesis phonemes
for the Chinese technical terms were checked separately (e.g. `续` is `ㄒㄩ4`
and `推` is `ㄊ为1`). These checks support coverage and catch gross omissions;
they do not establish flawless pronunciation. No human listening is claimed.
The uncorrected ASR output and `output/audio-verification.json` retain these
limitations explicitly.

## Known dependency risk — not a clean security audit

The 2026-10-25 `pip-audit` reports cover both the **12 direct pinned dependencies**
(`output/audio-dependency-audit.json`) and the **103 installed packages**
(`output/audio-environment-audit.json`). Both report 28 advisory records against
`transformers==4.51.3`; those include duplicate records and total 19 distinct
advisory IDs, not 28 independent confirmed exploit paths. The installed
reproduction environment has **not eliminated these known advisories**.
Passing `pip check`, unit tests and media decoding does not change that result.

The actual generation was narrowly scoped:

- Kokoro's model, configuration and `zf_001` tensor came from the fixed upstream
  revision above and were checked against the recorded SHA-256 values before load.
- Kokoro constructs its local `CustomAlbert` from `AlbertConfig`; this run does
  not call Transformers `AutoModel.from_pretrained`, `Trainer`, checkpoint
  converters, Donut processors or remote model-code loaders.
- The installed Kokoro loaders and this script use `torch.load(...,
  weights_only=True)`. No arbitrary user-provided model/checkpoint was used.
- Inference consumed local files on CPU; no paid inference API or personal voice
  input was used. This is **not** a claim that the virtualenv is an OS security
  sandbox or that outbound networking was globally disabled. After the verified
  assets are cached, repeat synthesis can additionally set
  `HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1`.

These restrictions reduce exposure for this fixed asset-generation job; they do
not prove every advisory inapplicable or repair the vulnerable package. Do not
expose this environment as a service or feed it untrusted models, URLs or configs.
The exported WAV/MP4 files do not contain the Python environment or model weights,
so delivering those media files does not require running this TTS stack.

No dependency upgrade or audio regeneration was performed after the audit. A
minor-version change cannot honestly be called a complete fix: the report lists
some fixes in 4.52.1/4.53.0, others in 5.x, and some records have no fixed version.
For example, the [Donut ReDoS advisory](https://github.com/advisories/GHSA-37mw-44qp-f5jm)
lists 4.52.1, while the [untrusted model-config RCE advisory](https://github.com/advisories/GHSA-29pf-2h5f-8g72)
lists 5.3.0. A future repair should use a separate environment, choose a then-current
patched version, verify Kokoro's `CustomAlbert` compatibility, rerun the complete
dependency audit and synthesis QA, and publish a new provenance record without
overwriting this frozen audio. Compatibility with that upgrade has not yet been
validated.
