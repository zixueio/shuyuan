# -*- coding: utf-8 -*-
"""cards/flipart 220 张插画 meta 修复: 按 GUI 编辑器标准结构重写 sprite-frame meta。

背景(三次踩坑实录):
  1) 最初手写 texture 型 meta(无 f9941) -> 构建器不真读图, ImageAsset 全 w:0 h:0
     空壳, 真机没图。
  2) 删光 meta 让 CLI 构建 --build 自动重导入 -> CLI 默认生成 type=texture 的
     meta(也只有 6c48a), 照样没有 spriteFrame 子资源, load spriteFrame 404。
  3) 本脚本: 照 assets/resources/ui/bg_main.jpg.meta(GUI 编辑器亲手生成、
     游戏里正常显示的标准件)逐字段复刻 -- userData.type=sprite-frame +
     subMetas{6c48a texture, f9941 spriteFrame(带真实宽高的 width/height/
     rawWidth/rawHeight/vertices/uv)}, 保留每图现有 uuid 不变; 并删除 library/
     下该 uuid 的旧导入产物强制重导。

用法: PYTHONIOENCODING=utf-8 python tools/fix_flipart_metas.py
"""
import glob
import json
import os
import sys

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FLIPART = os.path.join(ROOT, 'assets', 'cards', 'flipart')
LIBRARY = os.path.join(ROOT, 'library')


def build_meta(uuid: str, name: str, w: int, h: int) -> dict:
    hw, hh = w // 2, h // 2
    return {
        "ver": "1.0.27",
        "importer": "image",
        "imported": True,
        "uuid": uuid,
        "files": [".jpg", ".json"],
        "subMetas": {
            "6c48a": {
                "importer": "texture",
                "uuid": uuid + "@6c48a",
                "displayName": name,
                "id": "6c48a",
                "name": "texture",
                "userData": {
                    "wrapModeS": "repeat",
                    "wrapModeT": "repeat",
                    "minfilter": "linear",
                    "magfilter": "linear",
                    "mipfilter": "none",
                    "anisotropy": 0,
                    "isUuid": True,
                    "imageUuidOrDatabaseUri": uuid,
                    "visible": False,
                },
                "ver": "1.0.22",
                "imported": True,
                "files": [".json"],
                "subMetas": {},
            },
            "f9941": {
                "importer": "sprite-frame",
                "uuid": uuid + "@f9941",
                "displayName": name,
                "id": "f9941",
                "name": "spriteFrame",
                "userData": {
                    "trimThreshold": 1,
                    "rotated": False,
                    "offsetX": 0,
                    "offsetY": 0,
                    "trimX": 0,
                    "trimY": 0,
                    "width": w,
                    "height": h,
                    "rawWidth": w,
                    "rawHeight": h,
                    "borderTop": 0,
                    "borderBottom": 0,
                    "borderLeft": 0,
                    "borderRight": 0,
                    "packable": True,
                    "pixelsToUnit": 100,
                    "pivotX": 0.5,
                    "pivotY": 0.5,
                    "meshType": 0,
                    "vertices": {
                        "rawPosition": [-hw, -hh, 0, hw, -hh, 0, -hw, hh, 0, hw, hh, 0],
                        "indexes": [0, 1, 2, 2, 1, 3],
                        "uv": [0, h, w, h, 0, 0, w, 0],
                        "nuv": [0, 0, 1, 0, 0, 1, 1, 1],
                        "minPos": [-hw, -hh, 0],
                        "maxPos": [hw, hh, 0],
                    },
                    "isUuid": True,
                    "imageUuidOrDatabaseUri": uuid + "@6c48a",
                    "atlasUuid": "",
                    "trimType": "auto",
                },
                "ver": "1.0.12",
                "imported": True,
                "files": [".json"],
                "subMetas": {},
            },
        },
        "userData": {
            "type": "sprite-frame",
            "fixAlphaTransparencyArtifacts": False,
            "hasAlpha": False,
            "redirect": uuid + "@6c48a",
        },
    }


def main() -> int:
    jpgs = sorted(glob.glob(os.path.join(FLIPART, '*.jpg')))
    if not jpgs:
        print('no jpgs found under', FLIPART)
        return 1
    fixed = 0
    for jpg in jpgs:
        name = os.path.splitext(os.path.basename(jpg))[0]
        meta_path = jpg + '.meta'
        if not os.path.exists(meta_path):
            print('SKIP(no meta):', name)
            continue
        with open(meta_path, encoding='utf8') as f:
            old = json.load(f)
        uuid = old.get('uuid', '')
        if not uuid:
            print('SKIP(no uuid):', name)
            continue
        with Image.open(jpg) as im:
            w, h = im.size
        meta = build_meta(uuid, name, w, h)
        with open(meta_path, 'w', encoding='utf8', newline='\n') as f:
            json.dump(meta, f, ensure_ascii=False, indent=2)
            f.write('\n')
        # 清 library 旧导入(文本 json 与拷贝图), 强制编辑器/构建器重导
        for suf in ('.json', '@6c48a.json', '@f9941.json', '.jpg', '.jpg.meta'):
            p = os.path.join(LIBRARY, uuid + suf)
            if os.path.exists(p):
                os.remove(p)
        fixed += 1
    print('metas rewritten: %d / %d' % (fixed, len(jpgs)))
    # 抽查一张
    sample = json.load(open(jpgs[0] + '.meta', encoding='utf8'))
    ok = ('f9941' in sample.get('subMetas', {})
          and sample.get('userData', {}).get('type') == 'sprite-frame')
    print('sample check(%s): f9941=%s type=%s -> %s' % (
        os.path.basename(jpgs[0]),
        'f9941' in sample.get('subMetas', {}),
        sample.get('userData', {}).get('type'),
        'OK' if ok else 'BAD'))
    return 0 if ok else 2


if __name__ == '__main__':
    sys.exit(main())
