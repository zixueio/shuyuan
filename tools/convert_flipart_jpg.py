#!/usr/bin/env python3
"""flipart webp -> jpg 转换（绕过 devtool 对 .webp 的剔除）

根因实锤（preview14/15/16 三轮对照）: 微信开发者工具 preview 上传对分包内
.webp 扩展名文件全部剔除（ignoreUploadUnusedFiles=false 与
ignoreDevUnusedFiles=false 双开关都关了也没用）；同目录 .txt 探针 200KB
原样进包（cards 2210175B = 原值+204800 整），mp3/wav/json 全进包——
唯独 webp 消失。修法 = 全部转 jpg（扩展名换掉，其余管线不动）：
  1) PIL 解码 webp -> 白底拍平 -> 存同名 .jpg (quality 88)
  2) <name>.webp.meta 复用为 <name>.jpg.meta: 同 uuid 同 subMetas,
     顶层 files ['.json','.webp'] -> ['.json','.jpg']（uuid 不含扩展名,
     bundle.load('flipart/<art>/spriteFrame') 按路径加载不受影响）
  3) 删 webp 与 webp.meta（防构建双份进包）
幂等: 目录里已无 .webp 时零改动直接退出。
"""
import glob
import json
import os
import sys

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FLIP = os.path.join(ROOT, 'assets', 'cards', 'flipart')


def main() -> int:
    webps = sorted(glob.glob(os.path.join(FLIP, '*.webp')))
    if not webps:
        jpgs = glob.glob(os.path.join(FLIP, '*.jpg'))
        print('NO_WEBP LEFT JPG=%d (already converted)' % len(jpgs))
        return 0 if len(jpgs) >= 200 else 1
    ok = 0
    total = 0
    for w in webps:
        stem = w[:-5]  # 去 .webp
        img = Image.open(w)
        if img.mode in ('RGBA', 'LA', 'P'):
            img = img.convert('RGBA')
            bg = Image.new('RGB', img.size, (255, 255, 255))
            bg.paste(img, mask=img.split()[3])
            img = bg
        else:
            img = img.convert('RGB')
        jp = stem + '.jpg'
        img.save(jp, 'JPEG', quality=88)
        # meta 换皮: 同 uuid 同 subMetas, 仅顶层 files 后缀改 .jpg
        meta = json.load(open(w + '.meta', encoding='utf-8'))
        meta['files'] = ['.json', '.jpg']
        json.dump(meta, open(jp + '.meta', 'w', encoding='utf-8'),
                  ensure_ascii=False, indent=2)
        os.remove(w)
        os.remove(w + '.meta')
        total += os.path.getsize(jp)
        ok += 1
    left = len(glob.glob(os.path.join(FLIP, '*.webp')))
    print('CONVERTED=%d JPG_TOTAL_SIZE=%.2fMB WEBP_LEFT=%d' % (
        ok, total / 1048576.0, left))
    return 0 if ok >= 200 and left == 0 else 1


if __name__ == '__main__':
    sys.exit(main())
