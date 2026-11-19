#!/usr/bin/env python3
"""wordaudio/sfx 导入 cards 分包（与 import_flipart.py 同思路）

用法:
  python tools/import_wordaudio.py list   # 从 WordData.ts 提取 au 清单 -> tools/au_list.txt
  python tools/import_wordaudio.py meta   # 为 assets/cards/wordaudio/*.mp3 生成 .meta
                                          # + 拷 assets/resources/sfx/*.wav -> cards/sfx + meta

背景: 真机远程 mp3 走 wx.downloadFile 需配 downloadFile 合法域名, 未配时静默
失败 = 点卡无声; resources 包在微信构建被剔除 = click 音效必失败。两路解法
都是把音频塞进 cards 分包(零域名依赖), 运行时本地优先+远端兜底(FlipCard.loadClip)。

meta 模板照抄项目里 Cocos 自产物:
  audio-clip: {"ver":"1.0.0","importer":"audio-clip","imported":true,"uuid":..,
               "files":[".json",".<ext>"],"subMetas":{},"userData":{"downloadMode":0}}
  directory : {"ver":"1.2.0","importer":"directory","imported":true,"uuid":..,
               "files":[],"subMetas":{},"userData":{}}
幂等: 已有 .meta 的文件跳过(uuid 不变), 重跑安全。
"""
import json
import os
import re
import shutil
import sys
import uuid

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WORD_TS = os.path.join(ROOT, 'assets', 'scripts', 'game', 'WordData.ts')
LIST_OUT = os.path.join(ROOT, 'tools', 'au_list.txt')
WA_DIR = os.path.join(ROOT, 'assets', 'cards', 'wordaudio')
SFX_SRC = os.path.join(ROOT, 'assets', 'resources', 'sfx')
SFX_DST = os.path.join(ROOT, 'assets', 'cards', 'sfx')


def write_meta(path: str, ext: str) -> None:
    """audio-clip meta: uuid 随机, files 按真实后缀"""
    meta = {
        "ver": "1.0.0",
        "importer": "audio-clip",
        "imported": True,
        "uuid": str(uuid.uuid4()),
        "files": [".json", ext],
        "subMetas": {},
        "userData": {"downloadMode": 0},
    }
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)


def write_dir_meta(path: str) -> None:
    meta = {
        "ver": "1.2.0",
        "importer": "directory",
        "imported": True,
        "uuid": str(uuid.uuid4()),
        "files": [],
        "subMetas": {},
        "userData": {},
    }
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)


def mode_list() -> int:
    with open(WORD_TS, encoding='utf-8') as f:
        text = f.read()
    aus = re.findall(r'"au":\s*"([^"]+)"', text)
    uniq = sorted(set(aus))
    with open(LIST_OUT, 'w', encoding='utf-8', newline='\n') as f:
        f.write('\n'.join(uniq) + '\n')
    print('AU_TOTAL=%d UNIQUE=%d -> %s' % (len(aus), len(uniq), LIST_OUT))
    return 0 if len(uniq) >= 200 else 1  # 220 词全量才正常


def mode_meta() -> int:
    ok = 0
    if not os.path.isdir(WA_DIR):
        print('MISSING_DIR %s' % WA_DIR)
        return 1
    write_dir_meta(WA_DIR + '.meta')
    for name in sorted(os.listdir(WA_DIR)):
        p = os.path.join(WA_DIR, name)
        if not os.path.isfile(p) or not name.endswith('.mp3'):
            continue
        if os.path.exists(p + '.meta'):
            ok += 1
            continue
        write_meta(p + '.meta', '.mp3')
        ok += 1
    # sfx 四音效: 拷贝 + meta
    os.makedirs(SFX_DST, exist_ok=True)
    write_dir_meta(SFX_DST + '.meta')
    sn = 0
    for name in sorted(os.listdir(SFX_SRC)):
        if not name.endswith('.wav'):
            continue
        src = os.path.join(SFX_SRC, name)
        dst = os.path.join(SFX_DST, name)
        shutil.copyfile(src, dst)
        if not os.path.exists(dst + '.meta'):
            write_meta(dst + '.meta', '.wav')
        sn += 1
    print('WORDAUDIO_METAS=%d SFX_COPIED=%d' % (ok, sn))
    return 0 if ok >= 200 and sn == 4 else 1


if __name__ == '__main__':
    mode = sys.argv[1] if len(sys.argv) > 1 else 'list'
    sys.exit(mode_list() if mode == 'list' else mode_meta())
