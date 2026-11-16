# -*- coding: utf-8 -*-
"""
process_art.py — AI 原图 → 游戏可用素材

流程(cut=True 素材):
  1. 右下角「AI生成」水印区填白(API 免费档出图自带水印, 主体居中时角落必是背景)
  2. 严格阈值(30)算主体 bbox —— 浅灰投影色差 <30 不进 bbox, 自然裁掉投影
  3. 裁到 bbox, 再从边缘 floodfill(thresh) 挖白底 → alpha=0
  4. alpha 1px erode 去白晕
  5. 等比缩到目标盒内, P 模式 256 色压缩 → assets/resources/ui/<name>.png
bg_main: 直接按 720:1280 居中裁 + resize, 存 JPEG(不透明背景)。

用法: python tools/process_art.py [name ...]   # 缺省=全部
"""
import os
import sys

from PIL import Image, ImageDraw, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(HERE, "art_raw")
DEST = os.path.normpath(os.path.join(HERE, "..", "assets", "resources", "ui"))
os.makedirs(DEST, exist_ok=True)

# name -> (fit 目标盒 (w, h), 存 jpg)
TARGETS = {
    "bg_main": ((720, 1280), True),
    "title_logo": ((560, 300), False),
    "panel_card": ((640, 400), False),      # 九宫格底板, 出大图运行时拉伸
    "panel_quiz": ((600, 1150), False),
    "btn_main": ((520, 200), False),        # 九宫格按钮
    "btn_soft": ((520, 200), False),
    "icon_coin": ((128, 128), False),
    "icon_know": ((128, 128), False),
    "bld_math": ((320, 320), False),
    "bld_en": ((320, 320), False),
    "kid_idle": ((256, 256), False),
}

WATERMARK = 0.72  # 右下角水印填白区: x > W*0.72 且 y > H*0.86
BBOX_TH = 30      # 主体 bbox 色差阈值(相对白)
KEY_TH = 60       # floodfill 挖白阈值

# bg_main 不去背, 水印不能填白(会留白斑) → 用同高度左侧干净地面块羽化贴补盖掉
# dst: 相对覆盖区(右/下边超到图外, 羽化边被图像边界裁掉, 只留左/上羽化缝)
WM_PATCH = {
    "bg_main": dict(dst=(0.66, 0.88, 1.02, 1.03), gap=12, feather=8, blur=6),
}


def _patch_watermark(img: Image.Image, name: str) -> Image.Image:
    """把右下角「AI生成」水印区用左侧同行干净地面块盖掉(羽化接缝)"""
    spec = WM_PATCH.get(name)
    if not spec:
        return img
    w, h = img.size
    rx0, ry0, rx1, ry1 = spec["dst"]
    dx0, dy0 = int(w * rx0), int(h * ry0)
    dw, dh = int(w * (rx1 - rx0)), int(h * (ry1 - ry0))
    gap = spec["gap"]
    sx0 = max(0, dx0 - dw - gap)
    sy0 = max(0, min(dy0, h - dh))
    if sx0 + dw > dx0 or sy0 + dh > h:
        print("  [warn] %s 水印修补区算不出来, 跳过" % name)
        return img
    region = img.crop((sx0, sy0, sx0 + dw, sy0 + dh))
    f = spec["feather"]
    mask = Image.new("L", (dw, dh), 0)
    ImageDraw.Draw(mask).rectangle([f, f, dw - 1, dh - 1], fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(spec["blur"]))
    img.paste(region, (dx0, dy0), mask)
    return img


def _white_blank_watermark(img: Image.Image) -> Image.Image:
    w, h = img.size
    d = ImageDraw.Draw(img)
    d.rectangle([int(w * WATERMARK), int(h * 0.86), w, h], fill=(255, 255, 255))
    return img


def _bbox_of(img: Image.Image):
    """相对白底色差 > BBOX_TH 的像素范围"""
    px = img.load()
    w, h = img.size
    x0, y0, x1, y1 = w, h, -1, -1
    for y in range(0, h, 2):
        for x in range(0, w, 2):
            r, g, b = px[x, y][:3]
            if 255 - r > BBOX_TH or 255 - g > BBOX_TH or 255 - b > BBOX_TH:
                if x < x0: x0 = x
                if y < y0: y0 = y
                if x > x1: x1 = x
                if y > y1: y1 = y
    if x1 < 0:
        return None
    pad = 4
    return (max(0, x0 - pad), max(0, y0 - pad),
            min(w, x1 + pad + 1), min(h, y1 + pad + 1))


def _keyout(img: Image.Image, th: int) -> Image.Image:
    """边缘连通白底 → 透明"""
    img = img.convert("RGBA")
    seed_key = (255, 0, 255)
    w, h = img.size
    d = ImageDraw.floodfill
    for sx, sy in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1),
                   (w // 2, 0), (w // 2, h - 1), (0, h // 2), (w - 1, h // 2)]:
        try:
            d(img, (sx, sy), seed_key, thresh=th)
        except Exception:
            pass
    px = img.load()
    for y in range(h):
        for x in range(w):
            if px[x, y][:3] == seed_key:
                px[x, y] = (0, 0, 0, 0)
    # 1px erode 抑制白晕
    a = img.getchannel("A").filter(ImageFilter.MinFilter(3))
    img.putalpha(a)
    return img


def _fit_save(img: Image.Image, box: tuple, jpg: bool, path: str):
    tw, th_ = box
    w, h = img.size
    s = min(tw / w, th_ / h)
    img = img.resize((max(1, int(w * s)), max(1, int(h * s))), Image.LANCZOS)
    if jpg:
        img = img.convert("RGB")
        img.save(path, "JPEG", quality=82)
    else:
        img = img.convert("P", palette=Image.ADAPTIVE, colors=256)
        img.save(path, "PNG", optimize=True)
    kb = os.path.getsize(path) / 1024
    print("  -> %s %sx%s %.0fKB" % (os.path.basename(path), img.size[0], img.size[1], kb))


def process(name: str):
    src = os.path.join(RAW, name + ".png")
    if not os.path.exists(src):
        print("[process] 缺原图 %s, 先跑 gen_art.py" % name)
        return False
    img = Image.open(src).convert("RGB")
    img = _patch_watermark(img, name)
    box, jpg = TARGETS[name]
    out = os.path.join(DEST, name + (".jpg" if jpg else ".png"))
    if name == "bg_main":
        # 居中裁到 720:1280 比例再缩放
        w, h = img.size
        ar = 720 / 1280
        if w / h > ar:
            nw = int(h * ar)
            img = img.crop(((w - nw) // 2, 0, (w + nw) // 2, h))
        else:
            nh = int(w / ar)
            img = img.crop((0, (h - nh) // 2, w, (h + nh) // 2))
        img = img.resize(box, Image.LANCZOS)
        img.convert("RGB").save(out, "JPEG", quality=82)
        print("[bg_main] -> %s %sx%s %.0fKB"
              % (out, img.size[0], img.size[1], os.path.getsize(out) / 1024))
        return True
    img = _white_blank_watermark(img)
    bb = _bbox_of(img)
    if bb is None:
        print("[process] %s 没找到主体(全白?)" % name)
        return False
    img = img.crop(bb)
    img = _keyout(img, KEY_TH)
    bb2 = img.getbbox()
    if bb2:
        img = img.crop(bb2)
    _fit_save(img, box, jpg, out)
    return True


def main():
    args = [a for a in sys.argv[1:]]
    names = args if args else list(TARGETS)
    ok = 0
    for n in names:
        if process(n):
            ok += 1
    print("完成 %d/%d -> %s" % (ok, len(names), DEST))


if __name__ == "__main__":
    main()
