#!/usr/bin/env python3
"""Generate I Love You's launcher, PWA and notification assets, and the
'chime' notification sound, from the design-language tokens.

Same convention as Events (scripts/generate-app-icons.py): a serif monogram in
Paper ink on the Paper ground, one icon everywhere. The mark is "ILY" in caps —
lowercase "ily" is three thin verticals that blur together at 29-48px; the caps
keep their counters and serifs at the smallest home-screen and taskbar sizes.

Run from anywhere: python3 apps/i-love-you/scripts/generate-assets.py
Requires Pillow and a serif face (Noto Serif, else Liberation Serif, else
DejaVu Serif — the first one present is used).
"""

import math
import struct
import wave
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

# packages/design/Colors.ts -> paper (docs/events-design-language.md §3)
PAPER_BG = (0xFA, 0xF7, 0xF0, 255)
INK = (0x1A, 0x18, 0x15, 255)
WHITE = (255, 255, 255, 255)
TRANSPARENT = (0, 0, 0, 0)

FONTS = [
    Path("/usr/share/fonts/truetype/noto/NotoSerif-Regular.ttf"),
    Path("/usr/share/fonts/truetype/liberation/LiberationSerif-Regular.ttf"),
    Path("/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf"),
]
MARK = "ILY"
TRACKING = 0.06  # extra letter spacing, as a fraction of the font size
CANVAS = 1024
# ~45% of the tile: inside Android's 66% adaptive safe zone and the PWA
# maskable 80% safe circle.
LOCKUP_SIZE = 360

APP = Path(__file__).resolve().parents[1]
ASSETS = APP / "assets"
PUBLIC = APP / "public"


def font_path() -> Path:
    for p in FONTS:
        if p.is_file():
            return p
    raise SystemExit("no serif face found: " + ", ".join(map(str, FONTS)))


def lockup(size: int, bg, fg, font_size: int) -> Image.Image:
    img = Image.new("RGBA", (size, size), bg)
    draw = ImageDraw.Draw(img)
    font = ImageFont.truetype(str(font_path()), font_size)
    gap = font_size * TRACKING
    widths = [draw.textbbox((0, 0), ch, font=font)[2] for ch in MARK]
    total = sum(widths) + gap * (len(MARK) - 1)
    bbox = draw.textbbox((0, 0), MARK, font=font)
    h = bbox[3] - bbox[1]
    x = (size - total) / 2
    y = (size - h) / 2 - bbox[1]
    for ch, w in zip(MARK, widths):
        draw.text((x, y), ch, font=font, fill=fg)
        x += w + gap
    return img


def chime(path: Path) -> None:
    """Two soft sine notes (E5 then A5) with a fast attack and exponential
    decay — a gentle 'it's them' sound, under a second, mono 44.1 kHz."""
    rate = 44100
    notes = [(659.25, 0.0), (880.0, 0.16)]
    length = int(rate * 0.9)
    frames = []
    for i in range(length):
        t = i / rate
        s = 0.0
        for freq, start in notes:
            if t >= start:
                dt = t - start
                env = min(1.0, dt / 0.01) * math.exp(-dt * 5.5)
                s += math.sin(2 * math.pi * freq * dt) * env * 0.32
        frames.append(struct.pack("<h", int(max(-1, min(1, s)) * 32767)))
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(b"".join(frames))


def main() -> None:
    ASSETS.mkdir(exist_ok=True)
    PUBLIC.mkdir(exist_ok=True)
    (ASSETS / "sounds").mkdir(exist_ok=True)

    tile = lockup(CANVAS, PAPER_BG, INK, LOCKUP_SIZE)
    glyph = lockup(CANVAS, TRANSPARENT, INK, LOCKUP_SIZE)
    tile.save(ASSETS / "icon.png")
    glyph.save(ASSETS / "adaptive-icon.png")
    glyph.save(ASSETS / "splash-icon.png")
    tile.resize((192, 192), Image.Resampling.LANCZOS).save(ASSETS / "favicon.png")
    # Expo notifications plugin: 96x96 all-white PNG with transparency.
    lockup(96, TRANSPARENT, WHITE, 34).save(ASSETS / "notification-icon.png")

    # PWA (public/ is copied into dist/ by `expo export`).
    tile.resize((192, 192), Image.Resampling.LANCZOS).save(PUBLIC / "icon-192.png")
    tile.resize((512, 512), Image.Resampling.LANCZOS).save(PUBLIC / "icon-512.png")
    lockup(512, PAPER_BG, INK, 150).save(PUBLIC / "icon-maskable-512.png")
    tile.resize((180, 180), Image.Resampling.LANCZOS).save(PUBLIC / "apple-touch-icon.png")

    chime(ASSETS / "sounds" / "chime.wav")
    print("wrote", ", ".join(sorted(p.name for p in list(ASSETS.rglob("*.*")) + list(PUBLIC.glob("*.png")))))


if __name__ == "__main__":
    main()
