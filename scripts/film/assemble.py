#!/usr/bin/env python3
"""Turns the raw frames from render.js into old film stock (see README, "The film").

Tone curve, halation around the highlights, a soft lens, a little gate weave and exposure
flicker, the rounded corners of an old film gate, a few specks of dust. The grain isn't baked in:
the site lays it over the whole wall of tiles at runtime, so no two tiles share the same grain
(and the file stays small).

    python3 scripts/film/assemble.py preview sillage_test.f32 800 600
    python3 scripts/film/assemble.py loop sillage 32 960 720
    python3 scripts/film/assemble.py seals
    python3 scripts/film/assemble.py door shelf 48 640 800
"""

import sys
from pathlib import Path

import numpy as np
from PIL import Image

HERE = Path(__file__).parent
OUT = HERE / "out"
PUBLIC = HERE.parent.parent / "public" / "film"

FPS = 16


def gaussian(image, sigma):
    """Gaussian blur through the FFT, so big radii cost the same as small ones."""
    h, w = image.shape
    fy = np.fft.fftfreq(h)[:, None]
    fx = np.fft.rfftfreq(w)[None, :]
    kernel = np.exp(-2 * (np.pi * sigma) ** 2 * (fx * fx + fy * fy))
    return np.fft.irfft2(np.fft.rfft2(image) * kernel, s=image.shape)


def load(name, w, h):
    data = np.fromfile(OUT / name, dtype=np.float32).reshape(h, w)
    data = np.clip(np.nan_to_num(data, nan=0.0, posinf=0.0, neginf=0.0), 0, 40)
    return np.flipud(data).astype(np.float64)


def tone(linear, exposure=1.0):
    x = np.clip(linear * exposure, 0, None)
    # Filmic shoulder and toe.
    x = (x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14)
    x = np.clip(x, 0, 1) ** (1 / 2.2)
    # Silent-film contrast: blacks that bite, without losing the mid greys.
    return np.clip(x + 0.2 * (x - 0.5) * (1 - (2 * x - 1) ** 2) * 2, 0, 1)


def matte(w, h, inset=0.018, radius=0.07, softness=0.012):
    """The rounded corners of the film gate, and the falloff toward them."""
    ys, xs = np.mgrid[0:h, 0:w]
    u = (xs + 0.5) / w * 2 - 1
    v = (ys + 0.5) / h * 2 - 1
    aspect = w / h
    # Rounded rectangle.
    qx = np.abs(u) * aspect - (aspect * (1 - inset) - radius * 2)
    qy = np.abs(v) - (1 - inset * aspect - radius * 2)
    d = np.hypot(np.maximum(qx, 0), np.maximum(qy, 0)) + np.minimum(np.maximum(qx, qy), 0) - radius * 2
    gate = np.clip(-d / (softness * 2), 0, 1)
    gate = gate * gate * (3 - 2 * gate)
    # Vignette.
    r2 = (u * 0.92) ** 2 + (v * 0.98) ** 2
    vignette = 1 - 0.58 * np.clip(r2 / 1.65, 0, 1) ** 1.35
    return gate * vignette


def develop(linear, matte_image, rng=None, exposure=1.0):
    h, w = linear.shape
    if rng is not None:
        # Gate weave: the image shifts a pixel or so against the gate.
        dx, dy = rng.integers(-1, 2), rng.integers(-1, 2)
        linear = np.roll(np.roll(linear, dy, axis=0), dx, axis=1)
    # Halation: highlights bleed into the emulsion around them.
    bright = np.clip(linear - 0.9, 0, 6)
    linear = linear + 0.32 * gaussian(bright, w * 0.008) + 0.22 * gaussian(bright, w * 0.03)
    # An old lens.
    linear = gaussian(linear, w * 0.0008)
    flicker = 1.0
    if rng is not None:
        flicker = 1 + rng.normal(0, 0.035)
    x = tone(linear, exposure * flicker)
    x = x * matte_image
    if rng is not None:
        x = dust(x, rng)
    return x


def dust(x, rng):
    """A few specks and a hair or two, different on every frame."""
    h, w = x.shape
    if rng.random() < 0.8:
        for _ in range(rng.integers(1, 4)):
            cx, cy = rng.integers(0, w), rng.integers(0, h)
            r = rng.uniform(0.7, 1.9) * w / 800
            ys, xs = np.ogrid[max(cy - 6, 0) : min(cy + 7, h), max(cx - 6, 0) : min(cx + 7, w)]
            d = np.hypot(xs - cx, ys - cy)
            a = np.clip(r + 0.6 - d, 0, 1)
            value = 1.0 if rng.random() < 0.65 else 0.0
            region = x[max(cy - 6, 0) : min(cy + 7, h), max(cx - 6, 0) : min(cx + 7, w)]
            region[:] = region * (1 - a * 0.8) + value * a * 0.8
    if rng.random() < 0.28:
        # A scratch running down the frame.
        cx = rng.integers(int(w * 0.05), int(w * 0.95))
        wander = np.cumsum(rng.normal(0, 0.12, h))
        xs = np.clip((cx + wander).astype(int), 0, w - 1)
        x[np.arange(h), xs] = x[np.arange(h), xs] * 0.72 + 0.28 * (0.92 if rng.random() < 0.7 else 0.0)
    return x


def door(prefix, frames, w, h, quality=60):
    """A door film for the lobby: the same stock, without the rounded gate (it fills its panel)."""
    PUBLIC.mkdir(parents=True, exist_ok=True)
    rng = np.random.default_rng(len(prefix) * 97)
    ys, xs = np.mgrid[0:h, 0:w]
    u = (xs + 0.5) / w * 2 - 1
    v = (ys + 0.5) / h * 2 - 1
    vignette = 1 - 0.42 * np.clip((u * u + v * v) / 1.9, 0, 1) ** 1.4
    images = []
    for n in range(frames):
        images.append(to_image(develop(load(f"{prefix}_{n:03d}.f32", w, h), vignette, rng)).convert("RGB"))
    target = PUBLIC / f"{prefix}.webp"
    images[0].save(target, save_all=True, append_images=images[1:], duration=round(1000 / FPS), loop=0, quality=quality, method=6)
    still = PUBLIC / f"{prefix}-still.webp"
    images[frames // 4].save(still, quality=68, method=6)
    print(target, f"{target.stat().st_size / 1024:.0f} KB,", still, f"{still.stat().st_size / 1024:.0f} KB")
    columns = 8
    rows = (frames + columns - 1) // columns
    tw, th = 200, int(200 * h / w)
    sheet = Image.new("L", (columns * tw, rows * th))
    for n, image in enumerate(images):
        sheet.paste(image.convert("L").resize((tw, th)), ((n % columns) * tw, (n // columns) * th))
    sheet.save(OUT / f"{prefix}_sheet.png")


def to_image(x):
    return Image.fromarray((np.clip(x, 0, 1) * 255 + 0.5).astype(np.uint8))


def preview(name, w, h):
    image = to_image(develop(load(name, w, h), matte(w, h)))
    path = OUT / (Path(name).stem + ".png")
    image.save(path)
    print(path)


def loop(prefix, frames, w, h, quality=62):
    PUBLIC.mkdir(parents=True, exist_ok=True)
    rng = np.random.default_rng(1908)
    m = matte(w, h)
    images = []
    for n in range(frames):
        images.append(to_image(develop(load(f"{prefix}_{n:03d}.f32", w, h), m, rng)).convert("RGB"))
    duration = round(1000 / FPS)
    target = PUBLIC / f"{prefix}.webp"
    images[0].save(target, save_all=True, append_images=images[1:], duration=duration, loop=0, quality=quality, method=6)
    poster = PUBLIC / f"{prefix}-still.webp"
    images[frames // 4].save(poster, quality=70, method=6)
    print(target, f"{target.stat().st_size / 1024:.0f} KB,", poster, f"{poster.stat().st_size / 1024:.0f} KB")
    # A contact sheet, for checking the whole loop at a glance.
    columns = 8
    rows = (frames + columns - 1) // columns
    tw, th = w // 2, h // 2
    sheet = Image.new("L", (columns * tw, rows * th))
    for n, image in enumerate(images):
        sheet.paste(image.convert("L").resize((tw, th)), ((n % columns) * tw, (n // columns) * th))
    sheet.save(OUT / f"{prefix}_sheet.png")


FAMILIES = [
    "aldehydic", "amber", "animalic", "balsamic", "citrus", "earthy", "floral", "fresh", "fruity", "gourmand", "green",
    "herbal", "leathery", "marine", "mossy", "musk", "powdery", "smoky", "spicy", "tea", "tobacco", "woody",
]


def seals(size=640):
    """The 22 odor-family textures, full size and as small swatches, plus a contact sheet."""
    target = HERE.parent.parent / "public" / "seals"
    target.mkdir(parents=True, exist_ok=True)
    sheet = Image.new("L", (6 * 200, 4 * 200), 0)
    for n, family in enumerate(FAMILIES):
        linear = load(f"seal_{family}.f32", size, size)
        x = np.clip(linear, 0, 8)
        x = x / (1 + 0.28 * x)  # a soft shoulder
        x = np.clip(x, 0, 1) ** (1 / 2.2)
        # Spread each texture across the full range, so they tint evenly.
        lo, hi = np.percentile(x, [1.5, 99.2])
        x = np.clip((x - lo) / max(hi - lo, 1e-4), 0, 1)
        x = x * 0.92 + 0.04
        image = to_image(x)
        image.save(target / f"{family}.webp", quality=66, method=6)
        image.resize((96, 96), Image.LANCZOS).save(target / f"{family}-small.webp", quality=70, method=6)
        sheet.paste(image.resize((200, 200), Image.LANCZOS), ((n % 6) * 200, (n // 6) * 200))
    sheet.save(OUT / "seals_sheet.png")
    total = sum(f.stat().st_size for f in target.glob("*.webp"))
    print(f"{len(FAMILIES)} seals, {total / 1024:.0f} KB in all")


if __name__ == "__main__":
    mode = sys.argv[1]
    if mode == "preview":
        preview(sys.argv[2], int(sys.argv[3]), int(sys.argv[4]))
    elif mode == "loop":
        loop(sys.argv[2], int(sys.argv[3]), int(sys.argv[4]), int(sys.argv[5]))
    elif mode == "seals":
        seals()
    elif mode == "door":
        door(sys.argv[2], int(sys.argv[3]), int(sys.argv[4]), int(sys.argv[5]))
    else:
        sys.exit(__doc__)
