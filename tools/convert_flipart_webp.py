# -*- coding: utf-8 -*-
"""把 tools/word_art_raw/w_*.png 转 768px WebP q82 覆盖入库 assets/resources/flipart/
动机: 插画 72MB PNG 远超微信小游戏主包 4MB/整包 30MB 上限, 转 WebP 后约 7MB,
配合 resources bundle 配置为微信分包(单分包上限 20MB)即可真机预览与发布。
sight_words.json art 字段与 FlipDemo 加载路径均不带扩展名, PNG->WebP 零代码改动。
"""
import os
import sys
import glob
from PIL import Image

RAW_DIR = os.path.join(os.path.dirname(__file__), "word_art_raw")
OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "assets", "resources", "flipart")
SIZE = 768
QUALITY = 82

def main():
    raws = sorted(glob.glob(os.path.join(RAW_DIR, "w_*.png")))
    if not raws:
        print("no raw png found")
        sys.exit(1)
    # 先清旧 png+meta(被 webp 取代, 留着会双份占包体)
    removed = 0
    for old in glob.glob(os.path.join(OUT_DIR, "*.png")) + glob.glob(os.path.join(OUT_DIR, "*.png.meta")):
        os.remove(old)
        removed += 1
    total = 0
    ok = 0
    for p in raws:
        word = os.path.basename(p)[2:-4]  # 剥 w_ 前缀与 .png 后缀
        try:
            im = Image.open(p).convert("RGB")
            if im.size[0] > SIZE:
                im = im.resize((SIZE, SIZE), Image.LANCZOS)
            out = os.path.join(OUT_DIR, word + ".webp")
            im.save(out, "WEBP", quality=QUALITY, method=6)
            total += os.path.getsize(out)
            ok += 1
        except Exception as e:
            print("FAIL", word, e)
    print("converted:", ok, "/", len(raws), " removed old:", removed,
          " total:", round(total / 1048576, 1), "MB")

if __name__ == "__main__":
    main()
