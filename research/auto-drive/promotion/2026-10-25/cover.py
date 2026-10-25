"""Draw an original 4:3 AutoDrive cover with a 16:9-safe text region.

Reuses local font and shape primitives, never opens an existing raster. The CLI
refuses existing outputs so approved media cannot be silently overwritten.
"""

import argparse
import json
from pathlib import Path

from PIL import Image

from render import BORDER, CN_LABELS, COLORS, Canvas, IVORY, LABELS, MINT, MUTED, NAVY, PANEL, font


ROOT = Path(__file__).resolve().parent


def compose():
    image = Image.new("RGB", (1600, 1200), NAVY)
    canvas = Canvas(image)
    for x in range(0, image.width, 80):
        canvas.line((x, 0, x, image.height), "#142934", 1)
    for y in range(0, image.height, 80):
        canvas.line((0, y, image.width, y), "#142934", 1)

    canvas.rect((95, 170, 1505, 1030), NAVY, BORDER, 40, 2)
    canvas.rect((540, 182, 1060, 244), PANEL, BORDER, 20, 2)
    canvas.dot(570, 213, 6, MINT)
    canvas.line((120, 495, 1480, 495), BORDER, 2)
    canvas.line((620, 949, 980, 949), BORDER, 2)

    texts = [
        {"name": "header", "text": "OPEN SOURCE / RESEARCH", "xy": (811, 199), "size": 28, "color": MUTED, "latin": True, "width": 450},
        {"name": "title", "text": "AutoDrive", "xy": (800, 273), "size": 172, "color": IVORY, "latin": True, "width": 1300},
        {"name": "subtitle", "text": "回合边界续推控制", "xy": (800, 432), "size": 45, "color": MINT, "latin": False, "width": 1300},
    ]
    for index, label in enumerate(LABELS):
        left = 140 + index * 450
        canvas.rect((left, 550, left + 420, 784), PANEL, COLORS[index], 28, 3)
        canvas.dot(left + 210, 753, 5, COLORS[index])
        texts.extend([
            {"name": f"decision-{label.lower()}", "text": label, "xy": (left + 210, 594), "size": 46, "color": COLORS[index], "latin": True, "width": 374},
            {"name": f"decision-{label.lower()}-zh", "text": CN_LABELS[index], "xy": (left + 210, 671), "size": 44, "color": IVORY, "latin": False, "width": 374},
        ])
    texts.extend([
        {"name": "question", "text": "AI 编程，总要你说「继续」？", "xy": (800, 847), "size": 47, "color": IVORY, "latin": False, "width": 1300},
        {"name": "disclosure", "text": "机制示意 · 研究预览 · 合成配音", "xy": (800, 977), "size": 31, "color": MUTED, "latin": False, "width": 1300},
    ])
    for item in texts:
        size = item["size"]
        while font(size, item["latin"]).getlength(item["text"]) + 4 > item["width"]:
            size -= 1
        canvas.text(item["xy"], item["text"], size, item["color"], center=True, latin=item["latin"], name=item["name"])

    return image, {
        "size": [1600, 1200],
        "safe_box": [80, 150, 1520, 1050],
        "center_crop_16x9": [0, 150, 1600, 1050],
        "texts": [{"name": item["name"], "text": item["text"], "bounds": list(bound[1])}
                  for item, bound in zip(texts, canvas.bounds)],
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=ROOT / "output")
    args = parser.parse_args()
    targets = [args.output / "cover-bilibili-4x3.jpg", args.output / "cover-bilibili-4x3-layout.json"]
    if any(target.exists() for target in targets):
        parser.error("refusing to overwrite an existing cover artifact; choose a fresh output directory")
    image, report = compose()
    args.output.mkdir(parents=True, exist_ok=True)
    with targets[0].open("xb") as output:
        image.save(output, format="JPEG", quality=95, subsampling=0)
    with targets[1].open("x") as output:
        json.dump(report, output, ensure_ascii=False, indent=2)
        output.write("\n")
    print("\n".join(str(target) for target in targets))


if __name__ == "__main__":
    main()
