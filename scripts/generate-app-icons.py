#!/usr/bin/env python3
"""Generate the Paper 'E's' launcher assets from design-language tokens.

Requires Pillow and the Noto Serif Regular file shipped on this image
(/usr/share/fonts/truetype/noto/NotoSerif-Regular.ttf). Re-run after
changing the lockup; the PNGs in assets/ are what Expo bakes into builds.
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

# constants/Colors.ts → paper (docs/events-design-language.md §3)
PAPER_BG = (0xFA, 0xF7, 0xF0, 255)
INK = (0x1A, 0x18, 0x15, 255)
WHITE = (255, 255, 255, 255)
TRANSPARENT = (0, 0, 0, 0)

FONT_PATH = Path("/usr/share/fonts/truetype/noto/NotoSerif-Regular.ttf")
MARK = "E\u2019s"  # E + U+2019 + s
CANVAS = 1024
# ~50% of the tile; stays inside Android's 66% adaptive safe zone.
LOCKUP_SIZE = 400

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"


def lockup(size: int, bg, fg, font_size: int) -> Image.Image:
    img = Image.new("RGBA", (size, size), bg)
    draw = ImageDraw.Draw(img)
    font = ImageFont.truetype(str(FONT_PATH), font_size)
    bbox = draw.textbbox((0, 0), MARK, font=font)
    w, h = bbox[2] - bbox[0], bbox[3] - bbox[1]
    x = (size - w) / 2 - bbox[0]
    y = (size - h) / 2 - bbox[1]
    draw.text((x, y), MARK, font=font, fill=fg)
    return img


def main() -> None:
    if not FONT_PATH.is_file():
        raise SystemExit(f"missing serif face: {FONT_PATH}")
    ASSETS.mkdir(exist_ok=True)

    tile = lockup(CANVAS, PAPER_BG, INK, LOCKUP_SIZE)
    glyph = lockup(CANVAS, TRANSPARENT, INK, LOCKUP_SIZE)
    tile.save(ASSETS / "icon.png")
    glyph.save(ASSETS / "adaptive-icon.png")
    glyph.save(ASSETS / "splash-icon.png")

    # High-dpi favicon; browsers downscale. Same Paper tile as the launcher.
    tile.resize((192, 192), Image.Resampling.LANCZOS).save(ASSETS / "favicon.png")

    # Expo notifications plugin: 96×96 all-white PNG with transparency.
    lockup(96, TRANSPARENT, WHITE, 50).save(ASSETS / "notification-icon.png")

    print("wrote", ", ".join(p.name for p in sorted(ASSETS.glob("*.png"))))


if __name__ == "__main__":
    main()
