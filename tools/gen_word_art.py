# -*- coding: utf-8 -*-
"""
gen_word_art.py — 翻翻乐 220 Sight Words 单词插画管线(智谱 CogView API)

与 gen_art.py(书院古风 UI)分开: 单词卡插画要求「直观一眼可认」——
单主体大居中/纯白底/无场景元素, 全套风格一致由 WORD_STYLE 前缀保证。

产出: tools/word_art_raw/w_<word>.png (1024x1024 白底)
用法:
  ZP_KEY=xxxx python tools/gen_word_art.py            # 生成 WORDS 里缺失的
  ZP_KEY=xxxx python tools/gen_word_art.py a ball     # 只画指定词
  ZP_KEY=xxxx python tools/gen_word_art.py --all      # 强制全部重生成
"""
import os
import sys
import json
import time
import urllib.request
import urllib.error

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "word_art_raw")
os.makedirs(OUT, exist_ok=True)

API = "https://open.bigmodel.cn/api/paas/v4/images/generations"
MODELS = ["cogview-4-250304", "cogview-4", "cogview-3-flash"]

# 单词卡插画统一风格前缀(直观性是硬要求: 单主体/大居中/纯白底/无场景)
WORD_STYLE = (
    "幼儿英语单词卡插画, 极简扁平卡通, 画面里只有一个主体, 居中构图, "
    "主体大而醒目占画面约百分之六十, 纯白色背景没有任何场景元素, "
    "没有地面没有天空没有家具没有植物, 圆润厚实的深棕色描边, "
    "色彩明亮柔和, 造型简单直观一眼可认, 高清, 无文字, 无边框, 无水印, "
)

# word -> 出图描述(不含风格前缀)。功能词用「概念场景」表达,
# 实词直接画本体; 每个词画完都要给用户过目确认。
WORDS = {
    "a": "一只大红色的皮球, 单独一个, 圆形, 表面有简单的高光, "
         "直观表现「一个」的数量概念",
    "and": "一只大红色的皮球和一只黄色的五角星并排紧紧挨在一起, "
           "两者中间有一个粗粗的深棕色圆角加号符号相连, "
           "直观表现「两个东西加在一起」的含义",
    "away": "一只大红色的皮球往画面的右上方飞走, 球比正常略小显得正在远去, "
            "球的左下方带着三段弧形的深棕色运动虚线轨迹, "
            "直观表现「飞走了/离开了」的含义",
    "big": "一只特别巨大的大红色皮球和一只很小的黄色皮球并排挨在一起放在画面下方, "
           "大球特别大占画面约一半, 小球只有大球的十分之一, 大小对比非常悬殊, "
           "直观表现「大」的含义",
}


def scrub_watermark(path: str) -> None:
    """抹掉右下角「AI生成」角标(watermark:false 未签免责声明不生效, 只能后处理)。
    角标固定在右下角 (约 x 845~1005, y 938~1008 @1024); 按列从角标上边界之上
    逐列垂直复制底色——白底纯白, 阴影竖向渐变也能无缝延续(行填充会拉横条, 弃)。"""
    from PIL import Image
    img = Image.open(path).convert("RGB")
    w, h = img.size
    px = img.load()
    x0, x1 = int(w * 0.81), int(w * 0.99)     # 829~1013 覆盖角标及外扩
    y0, y1 = int(h * 0.90), int(h * 0.995)    # 921~1018
    for x in range(x0, x1):
        bg = px[x, y0 - 6]                    # 上边界之上同行干净底色
        for y in range(y0, y1):
            px[x, y] = bg
    img.save(path)


def call_api(model: str, prompt: str, key: str) -> str:
    body = json.dumps({"model": model, "prompt": prompt,
                       "size": "1024x1024", "watermark": False}).encode("utf-8")
    req = urllib.request.Request(
        API, data=body, method="POST",
        headers={"Content-Type": "application/json",
                 "Authorization": "Bearer " + key},
    )
    with urllib.request.urlopen(req, timeout=120) as r:
        obj = json.loads(r.read().decode("utf-8"))
    return obj["data"][0]["url"]


def gen_one(word: str, desc: str, key: str) -> str:
    path = os.path.join(OUT, "w_%s.png" % word)
    prompt = WORD_STYLE + desc
    last_err = None
    for model in MODELS:
        try:
            t0 = time.time()
            url = call_api(model, prompt, key)
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=120) as r:
                data = r.read()
            with open(path, "wb") as f:
                f.write(data)
            scrub_watermark(path)
            print("[%s] OK model=%s %.1fs %.0fKB -> %s"
                  % (word, model, time.time() - t0, len(data) / 1024, path))
            return path
        except urllib.error.HTTPError as e:
            detail = ""
            try:
                detail = e.read().decode("utf-8")[:200]
            except Exception:
                pass
            last_err = "%s HTTP %s %s" % (model, e.code, detail)
            print("[%s] %s 失败, 试下一个模型" % (word, last_err))
        except Exception as e:  # noqa: BLE001
            last_err = "%s %s" % (model, e)
            print("[%s] %s 失败, 试下一个模型" % (word, last_err))
    raise RuntimeError("[%s] 全部模型失败: %s" % (word, last_err))


def main():
    key = os.environ.get("ZP_KEY", "").strip()
    if not key:
        print("缺 ZP_KEY 环境变量")
        sys.exit(2)
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    force = "--all" in sys.argv
    todo = []
    for word in (args if args else list(WORDS)):
        if word not in WORDS:
            print("词表里没有 %r 的画法描述, 先在 WORDS 里补 prompt" % word)
            sys.exit(2)
        path = os.path.join(OUT, "w_%s.png" % word)
        if force or not os.path.exists(path) or os.path.getsize(path) == 0:
            todo.append(word)
    if not todo:
        print("全部插画已存在(用 --all 强制重生成)")
        return
    for word in todo:
        gen_one(word, WORDS[word], key)
        time.sleep(2)
    print("完成: %d/%d" % (len(todo), len(WORDS)))


if __name__ == "__main__":
    main()
