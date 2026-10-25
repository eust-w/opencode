# AutoDrive 中文介绍片 · 2026-10-25

约 93 秒，中文合成旁白、逐句字幕和原创机制动画。横屏与竖屏独立排版，不以裁切代替适配。本片解释回合边界的 `CONTINUE / STOP / DEFER`、先记录后入队、用户 steer 输入与每条自动续推链的次数上限。

**研究预览，不是实验结果发布。** 完整对比与消融实验尚未完成；视频不是实时运行录像，不证明性能提升、节省人工或安全保证，论文仍为草稿。未声称期刊录用或已在 arXiv 发表。

## 下载与验收

[媒体 Release](https://github.com/eust-w/opencode/releases/tag/autodrive-intro-zh-2026-10-25) · [代码分支](https://github.com/eust-w/opencode/tree/auto-drive-engine) · [论文研究预览](https://github.com/eust-w/opencode/releases/tag/autodrive-research-preview-2026-10-25)

| 文件 | 尺寸 | 时长 | 大小 |
| --- | --- | --- | --- |
| `autodrive-zh-landscape.mp4` | 1920×1080 | 92.966667 秒 | 4,579,896 bytes |
| `autodrive-zh-portrait.mp4` | 1080×1920 | 92.966667 秒 | 4,866,431 bytes |

两版均为 H.264/yuv420p、30 fps、AAC 48kHz 单声道，含 Fast Start 和烧录字幕。全片 FFmpeg 解码无错误，测得 -16.63 LUFS、-1.46 dBTP。源旁白为 24kHz PCM16，共 2,231,160 个采样、12 场景、17 句。

SHA-256：

```text
7ae42007b63d4c9877cc48a9e92fa56f490bc11c7f9d9cf804b975ba2f978ec5  autodrive-zh-landscape.mp4
237bb434f1856e095bcc526e0d10fe7224b6f06a2a3ae639c2450e5bb6a933e7  autodrive-zh-portrait.mp4
62953a44f212c204091405928102e8dfd02fa767b9474f92b36e32b9c09e23ca  narration.wav
```

Release 同时提供横竖封面、SRT、WAV，以及 `autodrive-media-evidence.tar.gz`。证据包只包含允许公开的时间线、配音来源、环境版本、技术验收、原始 ASR 回读、依赖审计与画面联系表；不含模型权重、虚拟环境、凭据、私人账号信息或研究原始请求日志。

验收范围：

- 27 项本地测试通过（音频 9、渲染 11、导出验收 7）。这不是 AutoDrive 的研究评测结果。
- 检查横竖版各场景、逐句字幕边界与编码后抽帧。竖版为右侧互动按钮和底部平台界面留出空间，仍需在实际发布界面确认裁切。
- Whisper tiny 独立回读覆盖全部 17 句，但存在同音字与术语转写错误；未经人工试听，不能据此证明发音完美。
- 固定脚本、模型 revision、权重哈希、声线与测量时序。字体、FFmpeg 和不同 CPU 环境可能影响像素或音频结果，不承诺跨环境字节完全一致。

## 制作与复现

依赖环境存在未解决的安全告警，**不要把此复现环境作为可信输入不限的在线服务使用**。本次 `pip-audit` 对实际环境的 103 个包检出 Transformers 4.51.3 的 28 条公告记录。固定可信模型哈希、本地执行和虚拟环境并不消除这些风险。见 [安全边界与音频许可](audio-license.md)。MP4、WAV、图片和字幕不携带这些 Python 运行时依赖。

需要 Python 3.12、FFmpeg/FFprobe（本次 8.1.1）与支持中文的字体。从本目录执行，在单独输出目录复现，避免覆盖已验收文件：

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r audio-requirements.txt -r render-requirements.txt
.venv/bin/python -m unittest discover -p 'test_*.py' -v
.venv/bin/python audio.py --output output/rebuild --voice zf_001 --speed 1.05
.venv/bin/python render.py --preview --encode --mode both \
  --timeline output/rebuild/timeline.json --audio output/rebuild/narration.wav \
  --output output/rebuild
.venv/bin/python verify.py --output output/rebuild
```

首次配音会下载固定版本的公开模型，无需提供商 key。默认使用本机的 STHeiti Medium 和 DIN Alternate 字体；其他系统应通过 `AUTODRIVE_CJK_FONT` 和 `AUTODRIVE_LATIN_FONT` 指定自己有权使用的字体。此仓库不分发字体文件。Pillow 固定为 12.3.0。

`audio.py --limit 1` 是开发抽样，会隔离到 `output/audio-sample/`；不能作为成片依据。`render.py --preview` 在没有实测时间线时只生成标明预览用途的布局图；最终编码拒绝这种虚拟时序。

依赖审计复现：

```sh
pip-audit -r audio-requirements.txt --no-deps --disable-pip
# 对 Release 证据包中的实际环境清单再审计：
pip-audit -r audio-environment.txt --no-deps --disable-pip
```

这两个命令在制作时返回非零安全告警，不能将单元测试或 `pip check` 成功写成安全审核通过。不得为了清除告警修改冻结证据；升级应在新的隔离环境验证兼容性并重新审计。

## 文件导航

- [旁白清单](narration.json)：已核对事实范围的中文原文。
- [事实与源码对应](claims-map.md)：控制语义、研究状态及不作出的主张。
- [六平台文案](platform-copy.md)：B站、抖音、视频号、小红书、YouTube、X 的标题、正文、话题和合成内容披露。
- [发布检查单](publishing-checklist.md)：官方资料与尚待账号界面确认的要求。
- [音频来源与许可](audio-license.md)：Kokoro 固定声线、哈希、生成命令和回读限制。
- [音频生成](audio.py)、[画面渲染](render.py)、[成片验收](verify.py)：完整制作链。

## 发布状态的边界

媒体生成和 GitHub 下载不代表六个社交平台已发布。每次发布还需确认账号、完成平台要求的声明，并保留提交后状态与实际作品链接。上传完成、审核中和公开可播放必须分别记录。私人账号标识和后台截图不进入公共仓库。

本轮只制作单条项目介绍的两个比例与分平台文案，不授权定时发布、批量互动或多账号放大。视频明确标注合成配音和机制示意，没有真人声纹克隆或外部音乐。
