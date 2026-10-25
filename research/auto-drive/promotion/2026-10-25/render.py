"""Original AutoDrive motion graphics. Run --preview before --encode.

Only local fonts, measured narration and original vector shapes are used. Preview
timings are never accepted by --encode. Font files are not redistributed.
"""

import argparse
from functools import lru_cache
import json
import math
import os
from pathlib import Path
import re
import subprocess

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parent
NAVY = "#091823"
PANEL = "#102633"
BORDER = "#294451"
IVORY = "#F5F2E8"
MUTED = "#A8B8BC"
MINT = "#91E4C0"
CORAL = "#F09282"
AMBER = "#F2CB78"
COLORS = (MINT, CORAL, AMBER)
LABELS = ("CONTINUE", "STOP", "DEFER")
CN_LABELS = ("继续", "停止", "交给用户")


@lru_cache(maxsize=128)
def font(size, latin=False):
    path = os.environ.get("AUTODRIVE_LATIN_FONT") if latin else os.environ.get("AUTODRIVE_CJK_FONT")
    if path is None:
        path = "/System/Library/Fonts/Supplemental/DIN Alternate Bold.ttf" if latin else "/System/Library/Fonts/STHeiti Medium.ttc"
    return ImageFont.truetype(path, round(size))


def wrap_text(text, face, max_width):
    if max_width <= 0:
        raise ValueError("text width must be positive")
    lines = []
    for paragraph in text.split("\n"):
        line = ""
        tokens = re.findall(r"[A-Za-z0-9_/-]+|.", paragraph)
        tokens = [piece for token in tokens for piece in (list(token) if face.getlength(token) > max_width else [token])]
        for char in tokens:
            if line and face.getlength(line + char) > max_width:
                if char in "，。！？、：；）】》”」" and len(line) > 1:
                    lines.append(line[:-1])
                    line = line[-1] + char
                else:
                    lines.append(line)
                    line = char
            else:
                line += char
        lines.append(line)
    return lines


def layout(mode):
    if mode == "landscape":
        return {"size": (1920, 1080), "header": (100, 58, 1820, 124),
                "title": (100, 205, 930, 770), "visual": (1000, 208, 1820, 808),
                "caption": (100, 856, 1820, 992), "disclosure": (100, 1018, 1820, 1055)}
    if mode == "portrait":
        return {"size": (1080, 1920), "header": (80, 100, 920, 164),
                "title": (80, 225, 920, 565), "visual": (80, 620, 920, 1320),
                "caption": (80, 1380, 920, 1570), "disclosure": (80, 1600, 920, 1638)}
    raise ValueError("mode must be landscape or portrait")


def overlap(a, b):
    return a[0] < b[2] and a[2] > b[0] and a[1] < b[3] and a[3] > b[1]


def validate_timeline(timeline, manifest):
    if not math.isfinite(timeline["duration"]) or timeline["duration"] <= 0:
        raise ValueError("duration must be positive and finite")
    if [scene["id"] for scene in timeline["scenes"]] != [scene["id"] for scene in manifest["scenes"]]:
        raise ValueError("scene IDs must match narration manifest")
    cursor = 0.0
    for scene, narration in zip(timeline["scenes"], manifest["scenes"]):
        if [line["text"] for line in scene["lines"]] != narration["lines"]:
            raise ValueError("caption text must exactly match the frozen narration manifest")
        if not all(math.isfinite(scene[key]) for key in ("start", "end")) or abs(scene["start"] - cursor) > 0.01:
            raise ValueError("scene timeline must be contiguous")
        if scene["end"] <= scene["start"]:
            raise ValueError("scene duration must be positive")
        line_cursor = scene["start"]
        for line in scene["lines"]:
            if not all(math.isfinite(line[key]) for key in ("start", "end")):
                raise ValueError("line times must be finite")
            if line["start"] < line_cursor - 0.001 or line["end"] <= line["start"] or line["end"] > scene["end"] + 0.001:
                raise ValueError("line interval lies outside its scene or overlaps")
            line_cursor = line["end"]
        cursor = scene["end"]
    if abs(cursor - timeline["duration"]) > 0.01:
        raise ValueError("duration must equal the last scene end")


def select_scene(timeline, timestamp):
    time = min(max(0.0, timestamp), timeline["duration"])
    for index, scene in enumerate(timeline["scenes"]):
        if time < scene["end"] or index == len(timeline["scenes"]) - 1:
            return index, scene, min(1.0, max(0.0, (time - scene["start"]) / (scene["end"] - scene["start"])))
    raise ValueError("empty timeline")


def active_caption(scene, timestamp):
    return next((line["text"] for line in scene["lines"] if line["start"] <= timestamp < line["end"]), "")


def preview_timeline(manifest):
    scenes = []
    for index, scene in enumerate(manifest["scenes"]):
        start = index * 7.5
        width = 7.0 / len(scene["lines"])
        scenes.append({"id": scene["id"], "start": start, "end": start + 7.5,
                       "lines": [{"text": text, "start": start + 0.2 + line_index * width,
                                  "end": start + 0.2 + (line_index + 1) * width - 0.1}
                                 for line_index, text in enumerate(scene["lines"])]})
    return {"duration": len(scenes) * 7.5, "sample_rate": 24000, "preview_only": True, "scenes": scenes}


@lru_cache(maxsize=1024)
def text_tile(text, size, color, latin=False):
    face = font(size, latin)
    bounds = face.getbbox(text, anchor="lt")
    width = max(1, math.ceil(face.getlength(text)))
    height = max(1, bounds[3])
    tile = Image.new("RGBA", (width + 4, height + 4))
    ImageDraw.Draw(tile).text((2, 2), text, font=face, fill=color, anchor="lt")
    return tile


class Canvas:
    def __init__(self, image, bounds=None, offset=(0, 0)):
        self.image = image
        self.draw = ImageDraw.Draw(image)
        self.bounds = bounds if bounds is not None else []
        self.offset = offset

    def text(self, xy, text, size, color=IVORY, center=False, latin=False, name="text"):
        tile = text_tile(text, size, color, latin)
        x = round(xy[0] - (tile.width / 2 if center else 0))
        y = round(xy[1])
        self.image.paste(tile, (x, y), tile)
        self.bounds.append((name, (x + self.offset[0], y + self.offset[1], x + tile.width + self.offset[0], y + tile.height + self.offset[1])))
        return tile.height

    def rect(self, box, fill=PANEL, outline=BORDER, radius=22, width=2):
        self.draw.rounded_rectangle(tuple(round(value) for value in box), radius, fill=fill, outline=outline, width=width)

    def line(self, coords, color=BORDER, width=3):
        self.draw.line(coords, fill=color, width=width)

    def dot(self, x, y, radius=7, color=MINT):
        self.draw.ellipse((x - radius, y - radius, x + radius, y + radius), fill=color)

    def arrow(self, x0, y0, x1, y1, color=MINT, width=3):
        self.line((x0, y0, x1, y1), color, width)
        direction = math.atan2(y1 - y0, x1 - x0)
        for shift in (-0.58, 0.58):
            self.line((x1, y1, x1 - 13 * math.cos(direction + shift), y1 - 13 * math.sin(direction + shift)), color, width)


class Renderer:
    def __init__(self, manifest, timeline, mode):
        validate_timeline(timeline, manifest)
        self.manifest = manifest
        self.timeline = timeline
        self.mode = mode
        self.layout = layout(mode)
        self.portrait = mode == "portrait"
        self.static = {}
        self.background = self.make_background()

    def make_background(self):
        width, height = self.layout["size"]
        image = Image.new("RGB", (width, height), NAVY)
        draw = ImageDraw.Draw(image)
        for y in range(height):
            ratio = y / height
            draw.line((0, y, width, y), fill=(9 + round(3 * ratio), 24 + round(6 * ratio), 35 + round(8 * ratio)))
        for x in range(0, width, 80):
            draw.line((x, 0, x, height), fill="#142934", width=1)
        for y in range(0, height, 80):
            draw.line((0, y, width, y), fill="#142934", width=1)
        return image

    def scene_base(self, index):
        if index in self.static:
            return self.static[index]
        image = self.background.copy()
        canvas = Canvas(image)
        scene = self.manifest["scenes"][index]
        hx, hy, hx1, _ = self.layout["header"]
        canvas.rect((hx, hy + 1, hx + 40, hy + 41), MINT, MINT, 11)
        canvas.arrow(hx + 11, hy + 20, hx + 29, hy + 20, NAVY, 3)
        canvas.text((hx + 57, hy + 4), "AutoDrive", 35, latin=True, name="brand")
        canvas.text((hx1 - (174 if self.portrait else 234), hy + 9), "RESEARCH / 2026", 22 if self.portrait else 26, MUTED, latin=True)
        tx, ty, tx1, _ = self.layout["title"]
        color = COLORS[index - 3] if 3 <= index <= 5 else MINT
        canvas.text((tx, ty), scene["eyebrow"], 28 if self.portrait else 27, color, name="eyebrow")
        title_size = 90 if self.portrait else 88
        if scene["id"] == "intro":
            title_size = 138 if self.portrait else 130
        while max(font(title_size).getlength(line) for line in scene["title"].split("\n")) > tx1 - tx - 4:
            title_size -= 1
        title_y = ty + (64 if self.portrait else 92)
        for line_index, line in enumerate(scene["title"].split("\n")):
            canvas.text((tx, title_y + line_index * (title_size + 26)), line, title_size, name="title")
        subtitle_y = title_y + len(scene["title"].split("\n")) * (title_size + 26) + (8 if self.portrait else 36)
        subtitle_size = 31 if self.portrait else 32
        for line_index, line in enumerate(wrap_text(scene["subtitle"], font(subtitle_size), tx1 - tx - 8)):
            canvas.text((tx, subtitle_y + line_index * 45), line, subtitle_size, MUTED, name="subtitle")
        dx, dy, _, _ = self.layout["disclosure"]
        canvas.text((dx, dy), self.manifest["disclosure"], 24 if self.portrait else 23, MUTED, name="disclosure")
        if not self.portrait:
            canvas.text((1560, dy), "OPEN SOURCE RESEARCH", 22, MUTED, latin=True)
        self.static[index] = image, canvas.bounds
        return self.static[index]

    def decision_cards(self, canvas, width, height, elapsed, active=None):
        card_width = (width - 44) / 3
        top = height * 0.49
        for index, label in enumerate(LABELS):
            left = index * (card_width + 22)
            is_active = active == index
            uplift = 16 * (0.5 + 0.5 * math.sin(elapsed * 1.2)) if is_active else 0
            canvas.rect((left, top - uplift, left + card_width, top + 181 - uplift), "#17392F" if is_active and index == 0 else PANEL,
                        COLORS[index] if is_active or active is None else BORDER, 24, 3 if is_active else 2)
            canvas.text((left + card_width / 2, top + 35 - uplift), label, 31 if self.portrait else 29,
                        COLORS[index] if is_active or active is None else MUTED, center=True, latin=True)
            canvas.text((left + card_width / 2, top + 103 - uplift), CN_LABELS[index], 32 if self.portrait else 30,
                        IVORY if is_active or active is None else MUTED, center=True)
            if is_active:
                canvas.dot(left + card_width / 2, top + 157 - uplift, 5, COLORS[index])

    def illustration(self, scene_id, width, height, elapsed, progress, bounds):
        image = Image.new("RGBA", (width, height))
        canvas = Canvas(image, bounds, self.layout["visual"][:2])
        center_x = width / 2
        center_y = height / 2
        if scene_id == "hook":
            canvas.rect((18, 70, width - 18, height - 52), PANEL, BORDER, 32)
            canvas.text((57, 108), "LONG-HORIZON TASK", 26, MUTED, latin=True)
            for index, label in enumerate(("理解", "修改", "验证", "完成")):
                x = 110 + index * (width - 220) / 3
                if index < 3:
                    canvas.line((x, 267, x + (width - 220) / 3, 267), BORDER, 5)
                canvas.dot(x, 267, 17, MINT if index < 2 else BORDER)
                canvas.text((x, 316), label, 30, IVORY if index < 2 else MUTED, center=True)
            lift = math.sin(elapsed * 1.3) * 8
            canvas.rect((center_x - 145, 384 + lift, center_x + 145, 478 + lift), AMBER, AMBER, 28)
            canvas.text((center_x, 407 + lift), "继续？", 42, NAVY, center=True)
            canvas.text((center_x, height - 37), "回合结束 ≠ 任务完成", 27, MUTED, center=True)
        elif scene_id in ("intro", "continue", "stop", "defer", "outro"):
            active = {"continue": 0, "stop": 1, "defer": 2}.get(scene_id)
            halo = 95 + 5 * math.sin(elapsed * 1.5)
            canvas.draw.ellipse((center_x - halo, 83, center_x + halo, 83 + 2 * halo), outline=BORDER, width=2)
            canvas.draw.arc((center_x - halo, 83, center_x + halo, 83 + 2 * halo), elapsed * 25, elapsed * 25 + 100,
                            fill=COLORS[active] if active is not None else MINT, width=5)
            if active == 0:
                canvas.arrow(center_x - 42, 176, center_x + 42, 176, MINT, 8)
            elif active == 1:
                canvas.rect((center_x - 29, 147, center_x + 29, 205), CORAL, CORAL, 9)
            elif active == 2:
                canvas.draw.ellipse((center_x - 18, 126, center_x + 18, 162), outline=AMBER, width=5)
                canvas.draw.arc((center_x - 40, 174, center_x + 40, 230), 180, 360, fill=AMBER, width=5)
            else:
                canvas.text((center_x, 147), "AD", 66, MINT, center=True, latin=True)
            self.decision_cards(canvas, width, height, elapsed, active)
            if scene_id == "outro":
                canvas.text((center_x, height - 32), "eust-w / opencode", 30, MUTED, center=True, latin=True)
        elif scene_id == "layer":
            boxes = [(50, 20, width - 50, 120), (50, 210, width - 50, 310)]
            canvas.rect(boxes[0])
            canvas.text((center_x, 51), "智能体执行", 39, IVORY, center=True)
            canvas.arrow(center_x, 140, center_x, 188, MINT)
            canvas.text((center_x + 38, 145), "回合边界", 26, MUTED)
            canvas.rect(boxes[1], "#183C32", MINT)
            canvas.text((center_x, 237), "AutoDrive", 49, MINT, center=True, latin=True)
            signal_y = 140 + (elapsed * 36 % 45)
            canvas.dot(center_x, signal_y, 7)
            for index, label in enumerate(LABELS):
                x = 140 + index * (width - 280) / 2
                canvas.arrow(center_x, 330, x, 379, BORDER)
                canvas.text((x, 397), label, 27, COLORS[index], center=True, latin=True)
            code_y = 500 if self.portrait else 467
            canvas.rect((30, code_y, width - 30, code_y + 130), "#07141D", BORDER, 15)
            canvas.text((53, code_y + 17), "源码节选 · packages/core/src/session/auto-drive.ts", 20, MUTED, name="source-excerpt")
            canvas.text((53, code_y + 55), "export const Action = Schema.Literals([", 23, MINT, name="source-excerpt")
            canvas.text((53, code_y + 87), '  "continue", "stop", "defer"])', 23, IVORY, name="source-excerpt")
        elif scene_id == "queue":
            if self.portrait:
                labels = [("01", "会话记录", "PERSIST"), ("02", "待处理输入", "ADMIT"), ("03", "安全边界", "PROMOTE")]
                for index, (number, label, action) in enumerate(labels):
                    y = 38 + index * 230
                    canvas.rect((80, y, width - 80, y + 152), PANEL, MINT if int(elapsed / 1.1) % 3 == index else BORDER)
                    canvas.text((112, y + 34), number, 38, MINT, latin=True)
                    canvas.text((230, y + 31), label, 40)
                    canvas.text((230, y + 94), action, 24, MUTED, latin=True)
                    if index < 2:
                        canvas.arrow(center_x, y + 168, center_x, y + 213, MINT)
                        canvas.dot(center_x, y + 172 + elapsed * 38 % 38, 6)
            else:
                box_width = (width - 72) / 3
                for index, label in enumerate(("会话记录", "待处理", "安全边界")):
                    x = index * (box_width + 36)
                    canvas.rect((x, 177, x + box_width, 385), PANEL, MINT if int(elapsed / 1.1) % 3 == index else BORDER)
                    canvas.text((x + 26, 207), f"0{index + 1}", 34, MINT, latin=True)
                    canvas.text((x + box_width / 2, 280), label, 32, center=True)
                    if index < 2:
                        canvas.arrow(x + box_width + 7, 281, x + box_width + 30, 281, MINT)
                canvas.text((center_x, 71), "DECISION → DURABLE INPUT", 31, MINT, center=True, latin=True)
                canvas.text((center_x, 458), "记录可恢复 · 接入可核对", 32, MUTED, center=True)
                canvas.dot(20 + (elapsed * 130) % (width - 40), 415, 7)
        elif scene_id == "priority":
            user_y = 85 + 5 * math.sin(elapsed)
            canvas.rect((36, user_y, width - 36, user_y + 140), "#3B3525", AMBER, 26, 3)
            canvas.text((76, user_y + 31), "STEER", 35, AMBER, latin=True)
            canvas.text((76, user_y + 88), "用户引导输入", 30)
            canvas.text((width - 105, user_y + 48), "↑", 49, AMBER, center=True)
            canvas.rect((90, 265, width - 90, 385), PANEL, BORDER)
            canvas.text((132, 299), "AUTO", 31, MINT, latin=True)
            canvas.text((width - 135, 301), "队列等待", 29, MUTED, center=True)
            canvas.text((center_x, 451), "安全边界接入 · 每条链有限", 29, MUTED, center=True)
            line_start = 90
            for index in range(5):
                x = line_start + index * (width - 180) / 4
                if index < 4:
                    canvas.line((x, 540, x + (width - 180) / 4, 540), BORDER, 4)
                canvas.dot(x, 540, 10, MINT if index < min(5, int(elapsed) % 7 + 1) else BORDER)
            canvas.line((width - 90, 515, width - 90, 565), CORAL, 5)
            canvas.text((width - 90, 570), "上限", 25, CORAL, center=True)
        elif scene_id == "goal":
            canvas.text((center_x, 65), "CONTINUATION × CONTROL", 30, MINT, center=True, latin=True)
            for index in range(3):
                x = 35 + index * (width - 250) / 2
                y = 160 + index * 70 + 4 * math.sin(elapsed + index)
                canvas.rect((x, y, x + 210, y + 91), PANEL, BORDER)
                canvas.text((x + 105, y + 24), "继续？", 35, MUTED, center=True)
            canvas.arrow(center_x, 415, center_x, 470, MINT)
            canvas.rect((center_x - 245, 488, center_x + 245, 594), "#183C32", MINT)
            canvas.text((center_x, 516), "减少打断，保留控制", 35, MINT, center=True)
        elif scene_id == "evidence":
            labels = (("SOURCE", "代码与评测工具", MINT), ("DRAFT", "论文草稿", MINT), ("PENDING", "完整对比与消融", AMBER))
            for index, (label, detail, color) in enumerate(labels):
                y = 72 + index * (175 if self.portrait else 160)
                canvas.rect((25, y, width - 25, y + 127), PANEL, color if int(elapsed) % 3 == index else BORDER)
                canvas.text((62, y + 28), label, 33, color, latin=True)
                canvas.text((62, y + 79), detail, 28, MUTED)
                canvas.dot(width - 68, y + 65, 9, color)
        elif scene_id == "limits":
            canvas.rect((28, 75, width - 28, height - 83), PANEL, AMBER, 30)
            canvas.text((center_x, 128), "展示机制 ≠ 验证效果", 42 if self.portrait else 39, AMBER, center=True)
            for index, text in enumerate(("没有虚构性能跑分", "没有宣称正式评测完成", "没有宣称论文已发表")):
                canvas.text((84, 246 + index * 86), "—", 30, AMBER)
                canvas.text((138, 245 + index * 86), text, 33 if self.portrait else 30, IVORY)
        return image

    def frame(self, timestamp, audit=False, captions=True):
        index, timed_scene, progress = select_scene(self.timeline, timestamp)
        base, base_bounds = self.scene_base(index)
        image = base.copy()
        bounds = list(base_bounds)
        canvas = Canvas(image, bounds)
        elapsed = max(0.0, timestamp - timed_scene["start"])
        x, y, x1, y1 = self.layout["visual"]
        visual = self.illustration(timed_scene["id"], x1 - x, y1 - y, elapsed, progress, bounds)
        image.paste(visual, (x, y), visual)
        if captions:
            caption = active_caption(timed_scene, timestamp)
            if caption:
                cx, cy, cx1, cy1 = self.layout["caption"]
                canvas.rect((cx, cy, cx1, cy1), "#07141D", BORDER, 22)
                size = 46 if self.portrait else 43
                lines = wrap_text(caption, font(size), cx1 - cx - 64)
                line_height = size + 15
                while len(lines) * line_height > cy1 - cy - 24:
                    size -= 1
                    line_height = size + 15
                    lines = wrap_text(caption, font(size), cx1 - cx - 64)
                for line_index, line in enumerate(lines):
                    canvas.text(((cx + cx1) / 2, cy + (cy1 - cy - len(lines) * line_height) / 2 + line_index * line_height + 4),
                                line, size, center=True, name="caption")
        width, height = self.layout["size"]
        bar_width = ((840 if self.portrait else width - 160) - 11 * 8) / 12
        bar_y = 1645 if self.portrait else height - 34
        for bar_index in range(12):
            bar_x = 80 + bar_index * (bar_width + 8)
            canvas.rect((bar_x, bar_y, bar_x + bar_width, bar_y + 6), BORDER, BORDER, 3)
            fill = 1 if bar_index < index else progress if bar_index == index else 0
            if fill:
                canvas.rect((bar_x, bar_y, bar_x + max(1, bar_width * fill), bar_y + 6), MINT, MINT, 3)
        # A short fade bridges each new composition. Motion within scenes stays continuous.
        fade = min(1.0, elapsed / 0.22) if index else min(1.0, elapsed / 0.35)
        if fade < 1:
            image = Image.blend(self.background, image, fade)
        return (image, bounds) if audit else image

    def preview(self, output, measured=False):
        thumbs = []
        thumb_width = 480 if not self.portrait else 270
        thumb_height = round(thumb_width * self.layout["size"][1] / self.layout["size"][0])
        for index, scene in enumerate(self.timeline["scenes"]):
            time = min(scene["start"] + 2.2, (scene["start"] + scene["end"]) / 2)
            frame = self.frame(time)
            frame.save(output / f"visual-{self.mode}-{index + 1:02d}-{scene['id']}.jpg", quality=92)
            thumb = frame.resize((thumb_width, thumb_height), Image.Resampling.LANCZOS)
            thumbs.append(thumb)
        columns = 3 if self.portrait else 4
        rows = math.ceil(len(thumbs) / columns)
        sheet = Image.new("RGB", (columns * thumb_width, rows * (thumb_height + 34) + 60), NAVY)
        header = "MEASURED TIMELINE" if measured else "LAYOUT PREVIEW / SYNTHETIC TIMING / NOT FINAL"
        ImageDraw.Draw(sheet).text((18, 17), header, font=font(22, True), fill=AMBER)
        for index, thumb in enumerate(thumbs):
            x = index % columns * thumb_width
            y = index // columns * (thumb_height + 34) + 60
            sheet.paste(thumb, (x, y))
            ImageDraw.Draw(sheet).text((x + 12, y + thumb_height + 6), f"{index + 1:02d}  {self.timeline['scenes'][index]['id']}", font=font(19, True), fill=MUTED)
        sheet.save(output / f"contact-{self.mode}.jpg", quality=94)
        intro = self.timeline["scenes"][1]
        cover = self.frame(intro["start"] + min(2.0, (intro["end"] - intro["start"]) / 2), captions=False)
        cx, cy, cx1, cy1 = self.layout["caption"]
        canvas = Canvas(cover)
        canvas.rect((cx, cy, cx1, cy1), "#183C32", MINT, 25)
        lines = ["什么时候继续，什么时候交给人？"] if not self.portrait else ["什么时候继续，", "什么时候交给人？"]
        for index, line in enumerate(lines):
            canvas.text(((cx + cx1) / 2, cy + (cy1 - cy - len(lines) * 65) / 2 + index * 65), line,
                        48 if self.portrait else 50, MINT, center=True)
        cover.save(output / f"cover-{self.mode}.jpg", quality=95)

    def encode(self, output, audio):
        if self.timeline.get("preview_only"):
            raise ValueError("synthetic preview timeline cannot be encoded as a final video")
        width, height = self.layout["size"]
        destination = output / f"autodrive-zh-{self.mode}.mp4"
        command = ["ffmpeg", "-hide_banner", "-loglevel", "warning", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24",
                   "-s", f"{width}x{height}", "-r", "30", "-i", "pipe:0", "-i", str(audio),
                   "-map", "0:v:0", "-map", "1:a:0", "-c:v", "libx264", "-preset", "veryfast", "-crf", "18",
                   "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-ar", "48000",
                   "-af", "loudnorm=I=-16:TP=-1.5:LRA=11", "-t", str(self.timeline["duration"]),
                   "-movflags", "+faststart", "-metadata", "title=AutoDrive Chinese research preview",
                   "-metadata", "comment=Original mechanism illustrations; synthetic narration; no benchmark claims", str(destination)]
        process = subprocess.Popen(command, stdin=subprocess.PIPE)
        total = math.ceil(self.timeline["duration"] * 30)
        for index in range(total):
            process.stdin.write(self.frame(index / 30).tobytes())
            if index % 300 == 0:
                print(f"{self.mode}: {index}/{total} frames", flush=True)
        process.stdin.close()
        if process.wait() != 0:
            raise RuntimeError("ffmpeg encoding failed")
        print(f"Created {destination}", flush=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--preview", action="store_true")
    parser.add_argument("--encode", action="store_true")
    parser.add_argument("--mode", choices=("landscape", "portrait", "both"), default="both")
    parser.add_argument("--manifest", type=Path, default=ROOT / "narration.json")
    parser.add_argument("--timeline", type=Path, default=ROOT / "output/timeline.json")
    parser.add_argument("--audio", type=Path, default=ROOT / "output/narration.wav")
    parser.add_argument("--output", type=Path, default=ROOT / "output")
    args = parser.parse_args()
    manifest = json.loads(args.manifest.read_text())
    if args.encode and not args.timeline.is_file():
        parser.error("final encoding requires a measured timeline")
    timeline = json.loads(args.timeline.read_text()) if args.timeline.is_file() else preview_timeline(manifest)
    args.output.mkdir(parents=True, exist_ok=True)
    for mode in ("landscape", "portrait") if args.mode == "both" else (args.mode,):
        renderer = Renderer(manifest, timeline, mode)
        if args.preview:
            renderer.preview(args.output, measured=not timeline.get("preview_only"))
        if args.encode:
            renderer.encode(args.output, args.audio)


if __name__ == "__main__":
    main()
