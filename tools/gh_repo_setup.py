# -*- coding: utf-8 -*-
"""一次性: 用已存 GitHub 凭据(git credential fill, zixueio PAT)经 socks 代理
创建 shuyuan 远端仓库; 可见性对齐 ruci(匿名 GET 200=public/404=private)。
token 全程内存流转, 不打印不落盘。"""
import json
import subprocess
import sys

PROXY = "socks5h://127.0.0.1:10808"


def curl(method, url, token=None, body=None):
    cmd = ["curl", "-s", "--max-time", "30", "-x", PROXY,
           "-X", method, "-H", "Accept: application/vnd.github+json"]
    if token:
        cmd += ["-H", "Authorization: token " + token]
    if body is not None:
        cmd += ["-H", "Content-Type: application/json", "-d", json.dumps(body)]
    cmd.append(url)
    p = subprocess.run(cmd, capture_output=True, timeout=60,
                       encoding="utf-8", errors="replace")
    out = p.stdout or ""
    try:
        data = json.loads(out) if out.strip() else {}
    except ValueError:
        data = {}
    return p.returncode, out, data


def main():
    fill = subprocess.run(
        ["git", "credential", "fill"],
        input="protocol=https\nhost=github.com\n\n",
        capture_output=True, timeout=30,
        encoding="utf-8", errors="replace").stdout or ""
    token = ""
    for line in fill.splitlines():
        if line.startswith("password="):
            token = line.split("=", 1)[1]
    if not token:
        print("NO_TOKEN")
        return 1
    print("token: <found len=%d>" % len(token))

    # ruci 可见性: 匿名 GET 200 -> public, 404 -> private
    rc, out, data = curl("GET", "https://api.github.com/repos/zixueio/ruci")
    ruci_private = "full_name" not in data
    print("ruci_private=%s (rc=%s)" % (ruci_private, rc))

    # shuyuan 是否已存在(带 token 查)
    rc, out, data = curl("GET", "https://api.github.com/repos/zixueio/shuyuan",
                         token=token)
    if "full_name" in data:
        print("REPO_EXISTS %s private=%s" % (data["full_name"], data.get("private")))
        return 0

    body = {
        "name": "shuyuan",
        "description": "英语争霸 - Cocos Creator 3.8.8 微信小游戏(220 sight words 翻翻配对)",
        "private": bool(ruci_private),
        "has_wiki": False,
        "has_projects": False,
    }
    rc, out, data = curl("POST", "https://api.github.com/user/repos",
                         token=token, body=body)
    if "full_name" in data:
        print("REPO_CREATED %s private=%s" % (data["full_name"], data.get("private")))
        return 0
    print("CREATE_FAIL rc=%s msg=%s" % (rc, json.dumps(data.get("errors", data))[:300]))
    return 2


if __name__ == "__main__":
    sys.exit(main())
