# -*- coding: utf-8 -*-
"""
import_flipart.py — 批量入库 word_art_raw/w_<key>.png -> assets/resources/flipart/

与 gen_word_art.py(gen_word_art 产出)衔接:
- cp w_<key>.png -> flipart/<key>.png
- meta: 以 a.png.meta 为模板, 整份 uuid(hex 串)统一换成一个新 uuid.uuid4()
  (uuid 在 meta 出现 6 处: 主 uuid/@f9941/裸 imageUuidOrDatabaseUri/@6c48a/
  imageUuidOrDatabaseUri@6c48a/redirect@6c48a, 同值替换保持主/子资源关联),
  displayName 两处换成词名
- 同步 sight_words.json: art 字段撇号 don't -> dont(与文件名对齐, 原串替换
  保紧凑单行格式; w 字段本身不动, 撇号只在 art/文件名里剥掉)

用法:
  python tools/import_flipart.py              # 入库全部已生成的
  python tools/import_flipart.py cat dog      # 只入库指定词
"""
import os
import re
import sys
import shutil
import json
import uuid

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
RAW = os.path.join(HERE, "word_art_raw")
DEST = os.path.join(ROOT, "assets", "resources", "flipart")
JSON_PATH = os.path.join(ROOT, "assets", "resources", "data", "sight_words.json")
TEMPLATE_META = os.path.join(DEST, "a.png.meta")

_UUID_RE = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}")
_DISP_RE = re.compile(r'"displayName": "[^"]*"')


def fix_json_arts():
    """sight_words.json art 字段撇号剥掉(don't -> dont), 原串替换保格式。"""
    with open(JSON_PATH, encoding="utf-8") as f:
        txt = f.read()
    n = txt.count('"art":"don\'t"')
    if n:
        txt = txt.replace('"art":"don\'t"', '"art":"dont"')
        with open(JSON_PATH, "w", encoding="utf-8", newline="\n") as f:
            f.write(txt)
    print("json art 撇号修正: %d 处" % n)


def import_one(key: str, tpl: str) -> str:
    src = os.path.join(RAW, "w_%s.png" % key)
    dst_png = os.path.join(DEST, "%s.png" % key)
    dst_meta = os.path.join(DEST, "%s.png.meta" % key)
    shutil.copyfile(src, dst_png)
    new_uuid = str(uuid.uuid4())
    meta = _UUID_RE.sub(new_uuid, tpl)
    meta = _DISP_RE.sub('"displayName": "%s"' % key, meta)
    with open(dst_meta, "w", encoding="utf-8", newline="\n") as f:
        f.write(meta)
    return dst_png


def main():
    tpl_path = TEMPLATE_META
    if not os.path.exists(tpl_path):
        print("缺模板 %s" % tpl_path)
        sys.exit(2)
    with open(tpl_path, encoding="utf-8") as f:
        tpl = f.read()

    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if args:
        keys = args
    else:
        keys = sorted(
            m.group(1)
            for m in (re.match(r"^w_(.+)\.png$", name) for name in os.listdir(RAW))
            if m
        )
    if not keys:
        print("word_art_raw 里没有可入库的图")
        return

    ok, miss = 0, []
    for key in keys:
        src = os.path.join(RAW, "w_%s.png" % key)
        if not os.path.exists(src) or os.path.getsize(src) == 0:
            miss.append(key)
            continue
        import_one(key, tpl)
        ok += 1
    print("入库完成: %d 张%s" % (ok, ("; 缺图跳过: %s" % ",".join(miss)) if miss else ""))
    fix_json_arts()


if __name__ == "__main__":
    main()
