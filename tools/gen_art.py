# -*- coding: utf-8 -*-
"""
gen_art.py — 书院小掌柜 AI 出图管线(智谱 CogView API)

用途: 生成全套游戏美术素材原图 → tools/art_raw/<name>.png
      (后续 process_art.py 去背/裁剪/缩放到 assets/resources/ui/)

用法:
  ZP_KEY=xxxx python tools/gen_art.py            # 生成所有缺失的
  ZP_KEY=xxxx python tools/gen_art.py icon_coin  # 只生成指定项(可多个)
  ZP_KEY=xxxx python tools/gen_art.py --all      # 强制全部重生成

素材清单与用途见 ASSETS; prompt 统一挂 STYLE 风格前缀保证全套风格一致。
"""
import os
import sys
import json
import time
import base64
import urllib.request
import urllib.error

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "art_raw")
os.makedirs(OUT, exist_ok=True)

API = "https://open.bigmodel.cn/api/paas/v4/images/generations"
MODELS = ["cogview-4-250304", "cogview-4", "cogview-3-flash"]  # 依次兜底

# 全套统一风格前缀(每次生成原样携带, 是风格一致性的关键)
STYLE = (
    "Q版中国古风卡通手机游戏美术素材, 儿童教育游戏画风, 扁平水彩插画, "
    "柔和暖色调米黄色与青蓝色, 圆润厚实的深棕色描边, 造型圆润可爱, "
    "色彩明亮干净, 高清细节, "
)

# name -> dict(prompt=出图描述[不含风格前缀], size=出图尺寸, cut=是否需要去背裁剪)
ASSETS = {
    # 整屏背景(不去背, 直接裁成 720x1280)
    "bg_main": dict(
        size="768x1344", cut=False,
        prompt="中国古代书院庭院全景背景插画: 上方三分之一是淡蓝色天空与两三朵祥云, "
               "中部远处是书院白色院墙与青灰色瓦片屋檐一角, 下方是浅色庭院地面与淡淡石板路, "
               "整体低饱和淡雅柔和, 大面积留白干净简洁, 画面上三分之一与中下部尽量空旷平整"
               "便于日后叠加游戏UI, 视角平视, 无文字, 无人物, 无边框, 无水印",
    ),
    # 标题艺术字(cogview-3-flash 中文渲染不稳, 多试几次, 不合格就退回 Label 文字方案)
    "title_logo": dict(
        size="1344x768", cut=True,
        prompt="游戏标题艺术字, 五个汉字从左到右依次是 书 院 小 掌 柜, 一行排列居中, "
               "字与字之间留有空隙, 古风卡通粗圆体, 金铜色字身, 深棕色粗描边, "
               "轻微立体感与高光, 每个汉字笔画结构准确不写错字, "
               "画面里只有这五个汉字没有其他任何文字, 纯白色背景",
    ),
    # 通用纸片面板(九宫格拉伸底板) — 横幅纸卷
    "panel_card": dict(
        size="1344x768", cut=True,
        prompt="一张单独的空白古风纸片面板, 横向长方形圆角纸卷, 米黄色宣纸质感带淡淡纤维纹理, "
               "深棕色圆角描边, 四角有淡淡的纸卷轴装饰, 主体居中占画面约百分之七十, "
               "面板内部完全空白无任何文字图案, 白底",
    ),
    # 答题大卡(竖向) — 九宫格拉伸底板
    "panel_quiz": dict(
        size="768x1344", cut=True,
        prompt="一张单独的竖向长方形空白古风宣纸面板, 竖长圆角, 米黄色宣纸质感, "
               "深棕色圆角描边, 顶部中央一枚小小的方形朱红印章装饰, "
               "面板内部完全空白无任何文字图案, 主体居中占画面约百分之七十, 白底",
    ),
    # 主按钮(青蓝胶囊, 九宫格)
    "btn_main": dict(
        size="1344x768", cut=True,
        prompt="一枚单独的青蓝色圆角胶囊形游戏按钮, 横向长条, 纯青蓝色渐变表面带顶部浅色高光, "
               "深青色描边, 底部有深青色厚度侧面看起来像微微凸起, 按钮表面完全空白无文字, "
               "主体居中横向占满约百分之八十, 白底",
    ),
    # 软按钮(米色, 九宫格)
    "btn_soft": dict(
        size="1344x768", cut=True,
        prompt="一枚单独的米黄色圆角矩形游戏按钮, 横向长条, 米色纯色平滑表面, "
               "深棕色细描边, 底部有浅棕色厚度侧面像微微凸起, 按钮表面完全空白无文字, "
               "主体居中横向占满约百分之七十, 背景是纯白色没有任何纹理和渐变, "
               "没有投影, 白底",
    ),
    # 图标: 铜钱
    "icon_coin": dict(
        size="1024x1024", cut=True,
        prompt="一枚中国古代铜钱图标, 圆形方孔钱, 金铜色金属质感带高光, 深棕色描边, "
               "钱身上无文字, 单个图标居中占画面约百分之六十, 白底",
    ),
    # 图标: 学识(卷轴)
    "icon_know": dict(
        size="1024x1024", cut=True,
        prompt="一卷中国古代书卷卷轴图标, 半展开的卷轴带浅青色饰带, 米色纸面, "
               "深棕色描边, 卷轴上无文字, 单个图标居中占画面约百分之六十, 白底",
    ),
    # 建筑: 算学馆
    "bld_math": dict(
        size="1024x1024", cut=True,
        prompt="一座Q版中国古代学堂小建筑正面图, 青瓦坡屋顶, 浅青蓝色墙面与门帘, "
               "门口挂一个小算盘装饰, 圆润卡通造型带厚描边, 可爱清新, "
               "单个建筑居中占画面约百分之七十, 白底",
    ),
    # 建筑: 书斋
    "bld_en": dict(
        size="1024x1024", cut=True,
        prompt="一座Q版中国古代书斋小建筑正面图, 赭红色屋顶与木柱, 米色墙面, "
               "窗边露出几本叠放的书册与一支毛笔, 圆润卡通造型带厚描边, 可爱清新, "
               "单个建筑居中占画面约百分之七十, 背景是纯白色, 没有圆形背景框, "
               "没有蓝天白云, 没有植物, 没有地面, 白底",
    ),
    # 建筑: 拼词馆
    "bld_forge": dict(
        size="1024x1024", cut=True,
        prompt="一座Q版中国古代拼字工坊小建筑正面图, 竹绿色屋顶与木柱, 米色墙面, "
               "门口挂着几块刻字木牌像积木一样拼在一起, 圆润卡通造型带厚描边, 可爱清新, "
               "单个建筑居中占画面约百分之七十, 背景是纯白色, 没有圆形背景框, "
               "没有蓝天白云, 没有植物, 没有地面, 白底",
    ),
    # 角色: 小书童
    "kid_idle": dict(
        size="1024x1024", cut=True,
        prompt="一个Q版中国古代小书童全身角色, 圆脸笑容, 头戴书生帽, 身穿浅青色汉服小褂, "
               "肩上背一个布书箱, 双手抱着一串铜钱, 二头身可爱比例厚描边, "
               "单个角色居中站姿占画面约百分之六十, 白底",
    ),
}


def call_api(model: str, prompt: str, size: str, key: str) -> str:
    """调 CogView 出图, 返回图片 URL"""
    body = json.dumps({"model": model, "prompt": prompt, "size": size}).encode("utf-8")
    req = urllib.request.Request(
        API, data=body, method="POST",
        headers={
            "Content-Type": "application/json",
            "Authorization": "Bearer " + key,
        },
    )
    with urllib.request.urlopen(req, timeout=120) as r:
        obj = json.loads(r.read().decode("utf-8"))
    return obj["data"][0]["url"]


def gen_one(name: str, spec: dict, key: str) -> str:
    """生成单个素材, 落盘 art_raw/<name>.png, 返回落盘路径"""
    path = os.path.join(OUT, name + ".png")
    prompt = STYLE + spec["prompt"]
    # cogview-3-flash 免费档只出 1024x1024, 非方尺寸先按原 size 试, 被拒就退方图
    tries = [(m, spec["size"]) for m in MODELS] + [(m, "1024x1024") for m in MODELS]
    last_err = None
    for model, size in tries:
        try:
            t0 = time.time()
            url = call_api(model, prompt, size, key)
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=120) as r:
                data = r.read()
            with open(path, "wb") as f:
                f.write(data)
            print("[%s] OK model=%s %.1fs %.0fKB -> %s"
                  % (name, model, time.time() - t0, len(data) / 1024, path))
            return path
        except urllib.error.HTTPError as e:
            detail = ""
            try:
                detail = e.read().decode("utf-8")[:200]
            except Exception:
                pass
            last_err = "%s HTTP %s %s" % (model, e.code, detail)
            print("[%s] %s 失败, 试下一个模型" % (name, last_err))
        except Exception as e:  # noqa: BLE001
            last_err = "%s %s" % (model, e)
            print("[%s] %s 失败, 试下一个模型" % (name, last_err))
    raise RuntimeError("[%s] 全部模型失败: %s" % (name, last_err))


def main():
    key = os.environ.get("ZP_KEY", "").strip()
    if not key:
        print("缺 ZP_KEY 环境变量")
        sys.exit(2)
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    force = "--all" in sys.argv
    todo = []
    for name in (args if args else list(ASSETS)):
        if name not in ASSETS:
            print("未知素材名: %s (可选: %s)" % (name, ", ".join(ASSETS)))
            sys.exit(2)
        path = os.path.join(OUT, name + ".png")
        if force or not os.path.exists(path) or os.path.getsize(path) == 0:
            todo.append(name)
    if not todo:
        print("全部素材已存在(用 --all 强制重生成)")
        return
    for name in todo:
        gen_one(name, ASSETS[name], key)
        time.sleep(2)  # 礼貌间隔
    print("完成: %d/%d" % (len(todo), len(ASSETS)))


if __name__ == "__main__":
    main()
