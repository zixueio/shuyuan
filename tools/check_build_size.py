# -*- coding: utf-8 -*-
"""检查 build/wechatgame 产物: 主包/分包体积 + game.json 分包字段"""
import os, json

ROOT = os.path.join(os.path.dirname(__file__), "..", "build", "wechatgame")
ROOT = os.path.normpath(ROOT)

gj = json.load(open(os.path.join(ROOT, "game.json"), encoding="utf-8"))
subs = [sp["root"] for sp in gj.get("subpackages", [])]
print("game.json subpackages:", subs or "(NONE - 分包未生效!)")

def du(p):
    t = 0
    for r, d, f in os.walk(p):
        for x in f:
            t += os.path.getsize(os.path.join(r, x))
    return t

total = du(ROOT)
print("total: %.2f MB" % (total / 1048576))

subsize = 0
for s in subs:
    subsize += du(os.path.join(ROOT, s))
main = total - subsize
print("main: %.2f MB  (limit 4)" % (main / 1048576))
print("sub : %.2f MB  (limit 20)" % (subsize / 1048576))

# 顶层结构
for name in sorted(os.listdir(ROOT)):
    p = os.path.join(ROOT, name)
    if os.path.isdir(p):
        print("  dir  %-22s %8.1f KB" % (name + "/", du(p) / 1024))
    else:
        print("  file %-22s %8.1f KB" % (name, os.path.getsize(p) / 1024))
