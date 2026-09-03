#!/usr/bin/env python3
"""Generate PWA icons for the Snek game without external dependencies.

Writes the icons directly into the public/ directory:
  public/icons/icon-192.png
  public/icons/icon-512.png
  public/icons/icon-maskable-512.png
  public/icons/apple-touch-icon.png

Usage: python3 scripts/gen_icons.py
"""

import math
import os
import struct
import zlib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "public", "icons")

W = H = 512

# ---------------------------------------------------------------------------
# PNG writer (pure python, no external deps)
# ---------------------------------------------------------------------------


def write_png(path, width, height, pixels):
    """pixels: flat RGBA bytearray, length width*height*4."""
    raw = bytearray()

    for y in range(height):
        raw.append(0)  # filter type: None
        row = pixels[y * width * 4:(y + 1) * width * 4]
        raw.extend(row)

    def chunk(tag, data):
        c = struct.pack(">I", len(data))
        c += tag
        c += data
        c += struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        return c

    ihdr = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", ihdr)
    png += chunk(b"IDAT", zlib.compress(bytes(raw), 9))
    png += chunk(b"IEND", b"")

    with open(path, "wb") as f:
        f.write(png)


def blank():
    """Create a fully transparent RGBA layer."""
    return bytearray(W * H * 4)


def blend_px(buf, x, y, r, g, b, a):
    if not (0 <= x < W and 0 <= y < H):
        return
    i = (y * W + x) * 4
    if a >= 1.0:
        buf[i], buf[i + 1], buf[i + 2], buf[i + 3] = r, g, b, 255
        return
    dst_a = buf[i + 3] / 255.0
    out_a = a + dst_a * (1 - a)
    if out_a <= 0:
        buf[i], buf[i + 1], buf[i + 2], buf[i + 3] = 0, 0, 0, 0
        return
    for k, srgb in enumerate((r, g, b)):
        buf[i + k] = int(round((srgb * a + buf[i + k] * dst_a * (1 - a)) / out_a))
    buf[i + 3] = int(round(out_a * 255))


def circle(buf, cx, cy, radius, color, alpha=1.0):
    cr, cg, cb = color
    x0, x1 = int(math.floor(cx - radius - 1)), int(math.ceil(cx + radius + 1))
    y0, y1 = int(math.floor(cy - radius - 1)), int(math.ceil(cy + radius + 1))
    for y in range(max(0, y0), min(H, y1 + 1)):
        for x in range(max(0, x0), min(W, x1 + 1)):
            d = math.sqrt((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2)
            if d > radius + 1:
                continue
            a = alpha * min(1.0, max(0.0, radius + 0.5 - d))
            blend_px(buf, x, y, cr, cg, cb, a)


def rounded_rect(buf, x0, y0, x1, y1, r, color, alpha=1.0):
    cr, cg, cb = color
    for y in range(max(0, int(y0)), min(H, int(math.ceil(y1)))):
        for x in range(max(0, int(x0)), min(W, int(math.ceil(x1)))):
            px = min(max(x + 0.5, x0 + r), x1 - r)
            py = min(max(y + 0.5, y0 + r), y1 - r)
            d = math.sqrt((x + 0.5 - px) ** 2 + (y + 0.5 - py) ** 2)
            if d > r + 1:
                continue
            a = alpha * min(1.0, max(0.0, r + 0.5 - d))
            blend_px(buf, x, y, cr, cg, cb, a)


def line_chain(buf, points, radius, color, alpha=1.0, spacing=3.0):
    """Draw a smooth fat polyline by stamping circles along each segment."""
    for i in range(len(points) - 1):
        x0, y0 = points[i]
        x1, y1 = points[i + 1]
        length = math.hypot(x1 - x0, y1 - y0)
        steps = max(1, int(length / spacing))
        for s in range(steps + 1):
            t = s / steps
            circle(buf, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t,
                   radius, color, alpha=alpha)


def diagonal_stripes(buf, points, radius, colors, spacing=3.0):
    """Stamp alternating color bands along the snake body for a striped look."""
    total = 0.0
    samples = []
    for i in range(len(points) - 1):
        x0, y0 = points[i]
        x1, y1 = points[i + 1]
        length = math.hypot(x1 - x0, y1 - y0)
        steps = max(1, int(length / spacing))
        for s in range(steps + 1):
            t = s / steps
            samples.append((x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, 0.0))
            total += spacing

    # Index samples by their arc distance so bands stay even around corners.
    acc = 0.0
    for k, (x, y, _) in enumerate(samples):
        samples[k] = (x, y, acc)
        acc += spacing

    band = 46.0
    for x, y, d in samples:
        idx = int((d / band) % len(colors))
        circle(buf, x, y, radius, colors[idx])


# ---------------------------------------------------------------------------
# Drawing
# ---------------------------------------------------------------------------


def draw_master():
    buf = blank()

    # Background: deep slate gradient + subtle grid.
    for y in range(H):
        t = y / (H - 1)
        row_color = (
            int(15 + (2 - 15) * t),
            int(23 + (6 - 23) * t),
            int(42 + (23 - 42) * t),
        )
        # Paint a solid row using direct byte writes (faster than per-pixel blend).
        base = y * W * 4
        r, g, b = row_color
        for x in range(W):
            i = base + x * 4
            buf[i] = r
            buf[i + 1] = g
            buf[i + 2] = b
            buf[i + 3] = 255

    # Subtle checkerboard grid.
    for gy in range(0, H, 32):
        for gx in range(0, H, 32):
            if (gx // 32 + gy // 32) % 2 == 0:
                rounded_rect(buf, gx + 2, gy + 2, gx + 30, gy + 30, 6,
                             (255, 255, 255), alpha=0.035)

    # Apple / food.
    apple_cx, apple_cy, apple_r = 148, 178, 34
    circle(buf, apple_cx, apple_cy + 4, apple_r, (190, 24, 60))          # shadow edging
    circle(buf, apple_cx, apple_cy, apple_r, (239, 68, 68), alpha=1.0)    # apple body
    circle(buf, apple_cx - 11, apple_cy - 11, 8, (254, 226, 226), alpha=0.65)  # highlight
    # stem
    line_chain(buf, [(apple_cx + 2, apple_cy - apple_r + 2),
                     (apple_cx + 10, apple_cy - apple_r - 14)], 5, (120, 53, 15))
    # leaf
    circle(buf, apple_cx + 24, apple_cy - apple_r - 8, 8, (74, 222, 128))

    # Snake body outline, body, then lighter stripes.
    snake = [
        (86, 430),
        (150, 430),
        (150, 350),
        (262, 350),
        (262, 244),
        (352, 244),
        (352, 152),
        (428, 152),
    ]
    body_r = 36
    line_chain(buf, snake, body_r + 8, (6, 78, 46))  # dark outline
    line_chain(buf, snake, body_r, (22, 163, 74))    # main green
    diagonal_stripes(buf, snake, body_r, [(22, 163, 74), (34, 197, 94)],
                     spacing=4.0)
    circle(buf, snake[-1][0], snake[-1][1], body_r, (34, 197, 94))

    # Snake head.
    head = (snake[-1][0], snake[-1][1])
    circle(buf, head[0], head[1], body_r + 2, (6, 78, 46))
    circle(buf, head[0], head[1], body_r, (34, 197, 94))

    # Tongue.
    tx, ty = head[0] + body_r + 4, head[1] - 6
    line_chain(buf, [(head[0] + body_r - 8, head[1]), (tx + 14, ty)], 4, (239, 68, 68))
    line_chain(buf, [(tx + 14, ty), (tx + 24, ty - 8)], 4, (239, 68, 68))
    line_chain(buf, [(tx + 14, ty), (tx + 24, ty + 6)], 4, (239, 68, 68))

    # Eyes (facing up-right).
    eye_off = (14, -22)
    for eo in ((-12, -18), (18, -24)):
        ex, ey = head[0] + eo[0], head[1] + eo[1]
        circle(buf, ex, ey, 12, (250, 250, 250))
        circle(buf, ex + eye_off[0] * 0.35, ey + eye_off[1] * 0.35, 5, (15, 23, 42))

    return buf


def downscale(src, out_w, out_h):
    """Average downsample an RGBA buffer."""
    out = bytearray(out_w * out_h * 4)
    sx = W / out_w
    sy = H / out_h
    for y in range(out_h):
        for x in range(out_w):
            rs = gs = bs = as_ = 0
            y0, y1 = y * sy, (y + 1) * sy
            x0, x1 = x * sx, (x + 1) * sx
            count = 0
            for yy in range(math.ceil(y0), math.ceil(y1)):
                fy = max(0.0, min(1.0, min(y1, yy + 1) - max(y0, yy)))
                for xx in range(math.ceil(x0), math.ceil(x1)):
                    fx = max(0.0, min(1.0, min(x1, xx + 1) - max(x0, xx)))
                    w = fx * fy
                    i = (yy * W + xx) * 4
                    rs += src[i] * w
                    gs += src[i + 1] * w
                    bs += src[i + 2] * w
                    as_ += src[i + 3] * w
                    count += w
            if count <= 0:
                continue
            i = (y * out_w + x) * 4
            out[i] = int(rs / count)
            out[i + 1] = int(gs / count)
            out[i + 2] = int(bs / count)
            out[i + 3] = int(as_ / count)
    return out


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    master = draw_master()

    # Regular icons: full-bleed square.
    write_png(os.path.join(OUT_DIR, "icon-512.png"), W, H, master)
    write_png(os.path.join(OUT_DIR, "icon-192.png"), 192, 192, downscale(master, 192, 192))

    # Apple touch icon: also full-bleed, slight center crop is fine.
    write_png(os.path.join(OUT_DIR, "apple-touch-icon.png"), 180, 180,
              downscale(master, 180, 180))

    # Maskable icon: identical full-bleed background so the OS mask looks right.
    write_png(os.path.join(OUT_DIR, "icon-maskable-512.png"), W, H, master)

    print("Wrote icons to", OUT_DIR)


if __name__ == "__main__":
    main()
