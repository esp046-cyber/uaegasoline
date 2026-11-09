#!/usr/bin/env python3
"""Generates all PNG icons, favicons and og-image.png for Dubai Fuel Monitor, and optionally zips the project.
Usage:  pip install pillow && python build_assets.py [--zip]
"""
import math, os, sys, zipfile
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.abspath(__file__))
ICONS = os.path.join(ROOT, 'icons')
GOLD, DARK, WHITE = (245, 184, 61), (10, 13, 20), (255, 255, 255)
FONT_PATHS = ['/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 'C:/Windows/Fonts/arialbd.ttf',
              '/System/Library/Fonts/Supplemental/Arial Bold.ttf']

def font(size):
    for p in FONT_PATHS:
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()

def gradient(size, top=(20, 28, 46), bottom=(6, 8, 14)):
    img = Image.new('RGB', (size, size))
    d = ImageDraw.Draw(img)
    for y in range(size):
        t = y / max(size - 1, 1)
        d.line([(0, y), (size, y)], fill=tuple(int(top[i] + (bottom[i] - top[i]) * t) for i in range(3)))
    return img

def draw_gauge(img, scale):
    """Fuel gauge badge: arc, ticks, needle and drop. `scale` < 1 keeps art inside the maskable safe zone."""
    s = img.size[0]
    d = ImageDraw.Draw(img)
    cx, cy, r = s / 2, s * 0.58, s * 0.34 * scale
    w = max(2, int(s * 0.055 * scale))
    d.arc([cx - r, cy - r, cx + r, cy + r], 180, 360, fill=GOLD, width=w)
    for i in range(7):
        a = math.radians(180 + i * 30)
        x1, y1 = cx + (r - w) * math.cos(a), cy + (r - w) * math.sin(a)
        x2, y2 = cx + (r - w * 2.1) * math.cos(a), cy + (r - w * 2.1) * math.sin(a)
        d.line([x1, y1, x2, y2], fill=WHITE, width=max(1, w // 3))
    a = math.radians(180 + 128)
    d.line([cx, cy, cx + r * 0.78 * math.cos(a), cy + r * 0.78 * math.sin(a)], fill=WHITE, width=max(2, w // 2))
    hub = w * 0.9
    d.ellipse([cx - hub, cy - hub, cx + hub, cy + hub], fill=GOLD)
    # fuel drop below the gauge
    dy, dr = cy + r * 0.62, r * 0.2
    d.ellipse([cx - dr, dy - dr * 0.4, cx + dr, dy + dr * 1.6], fill=GOLD)
    d.polygon([(cx, dy - dr * 1.5), (cx - dr * 0.95, dy + dr * 0.2), (cx + dr * 0.95, dy + dr * 0.2)], fill=GOLD)

def make_icon(size, maskable=False):
    base = gradient(size)
    draw_gauge(base, 0.78 if maskable else 1.0)
    if maskable:
        return base
    mask = Image.new('L', (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, size - 1, size - 1], radius=int(size * 0.22), fill=255)
    out = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    out.paste(base, (0, 0), mask)
    return out

def uae_flag(d, x, y, w, h):
    d.rectangle([x, y, x + w, y + h // 3], fill=(0, 115, 47))
    d.rectangle([x, y + h // 3, x + w, y + 2 * h // 3], fill=WHITE)
    d.rectangle([x, y + 2 * h // 3, x + w, y + h], fill=(0, 0, 0))
    d.rectangle([x, y, x + w // 4, y + h], fill=(255, 0, 0))

def ph_flag(d, x, y, w, h):
    d.rectangle([x, y, x + w, y + h // 2], fill=(0, 56, 168))
    d.rectangle([x, y + h // 2, x + w, y + h], fill=(206, 17, 38))
    d.polygon([(x, y), (x, y + h), (x + w * 0.5, y + h / 2)], fill=WHITE)
    d.ellipse([x + w * 0.08, y + h * 0.42, x + w * 0.16, y + h * 0.58], fill=(252, 209, 22))

def make_og():
    W, H = 1200, 630
    img = Image.new('RGB', (W, H))
    d = ImageDraw.Draw(img)
    for y in range(H):
        t = y / H
        d.line([(0, y), (W, y)], fill=(int(18 - 10 * t), int(26 - 14 * t), int(44 - 26 * t)))
    # skyline cues: Burj Khalifa spire, Burj Al Arab sail, towers
    sky = (30, 40, 62)
    for x, w, h in [(40, 70, 150), (120, 60, 220), (190, 80, 130), (800, 70, 200), (880, 60, 140), (950, 90, 180), (1050, 70, 120), (1120, 60, 210)]:
        d.rectangle([x, H - h, x + w, H], fill=sky)
    d.polygon([(640, H), (660, H - 360), (672, H - 360), (692, H)], fill=(44, 58, 88))  # Burj Khalifa
    d.line([666, H - 360, 666, H - 430], fill=(44, 58, 88), width=5)
    d.polygon([(740, H), (740, H - 150), (790, H - 80)], fill=(44, 58, 88))               # Burj Al Arab sail
    draw = ImageDraw.Draw(img)
    icon = make_icon(220)
    img.paste(icon, (70, 90), icon)
    draw.text((330, 100), 'Dubai Fuel Monitor', font=font(76), fill=WHITE)
    draw.text((330, 200), 'UAE vs Philippines fuel prices', font=font(40), fill=GOLD)
    draw.text((330, 255), 'AED ↔ PHP · Jebel Ali · Daily fuel news', font=font(30), fill=(154, 167, 189))
    uae_flag(draw, 330, 340, 150, 100); ph_flag(draw, 510, 340, 150, 100)
    draw.text((330, 460), 'esp046-cyber.github.io/dubaijebelalinews', font=font(28), fill=(154, 167, 189))
    img.save(os.path.join(ROOT, 'og-image.png'), optimize=True)

def zip_project(name='dubaijebelalinews-pwa.zip'):
    out = os.path.join(ROOT, name)
    with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
        for folder, dirs, files in os.walk(ROOT):
            dirs[:] = [x for x in dirs if not x.startswith('.git')]
            for f in files:
                if f == name or f.startswith('.git'):
                    continue
                p = os.path.join(folder, f)
                z.write(p, os.path.relpath(p, ROOT))
    print('Created', out)

def main():
    os.makedirs(ICONS, exist_ok=True)
    for s in (72, 96, 128, 144, 152, 192, 384, 512):
        make_icon(s).save(os.path.join(ICONS, f'icon-{s}.png'), optimize=True)
    for s in (192, 512):
        make_icon(s, maskable=True).convert('RGB').save(os.path.join(ICONS, f'icon-maskable-{s}.png'), optimize=True)
    for s in (16, 32):
        make_icon(256).resize((s, s), Image.LANCZOS).save(os.path.join(ICONS, f'favicon-{s}x{s}.png'))
    # iOS ignores transparency: full-bleed square
    make_icon(180, maskable=True).convert('RGB').save(os.path.join(ROOT, 'apple-touch-icon.png'), optimize=True)
    make_icon(256).save(os.path.join(ROOT, 'favicon.ico'), sizes=[(16, 16), (32, 32), (48, 48)])
    make_og()
    print('Assets generated.')
    if '--zip' in sys.argv:
        zip_project()

if __name__ == '__main__':
    main()
