# -*- coding: utf-8 -*-
"""
gen_sight.py — 词灵跳跳 Sight Words 词库生成器

Dolch 220 Sight Words(启蒙40/起步52/一级41/二级46/三级41) → 22 关 x 10 词,
每词带发音文件(au): atlas 词光真人发音优先(151 词), 缺词走服务器 edge-tts
预生成静态文件 tts-<word>.mp3(同一 JennyNeural 音色, 匿名可播, 零代码改动)。

用法: python tools/gen_sight.py
输入: tools/sight_audio.json (服务器 atlas_words 查询导出, 见 README)
输出: assets/resources/data/sight_words.json
"""
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))

# Dolch 220 标准表(五段, 顺序即关卡词序)
BANDS = [
    ("pre", """a and away big blue can come down find for funny go help here I in is it
        jump little look make me my not one play red run said see the three to two up
        we where yellow you"""),
    ("primer", """all am are at ate be black brown but came did do eat four get good have
        he into like must new no now on our out please pretty ran ride saw say she so
        soon that there they this too under want was well went what white who will with yes"""),
    ("g1", """after again an any as ask by could every fly from give going had has her
        him his how just know let live may of old once open over put round some stop
        take thank them then think walk were when"""),
    ("g2", """always around because been before best both buy call cold does don't fast
        first five found gave goes green its made many off or pull read right sing sit
        sleep tell their these those upon us use very wash which why wish work would write your"""),
    ("g3", """about better bring carry clean cut done draw drink eight fall far full got
        grow hold hot hurt if keep kind laugh light long much myself never only
        own pick seven shall show six small start ten today together try warm"""),
]

# 中文释义(给家长看的词表用, 游戏内不显示——去学习感)
CN = {
    "a": "一(个)", "and": "和", "away": "离开", "big": "大的", "blue": "蓝色",
    "can": "能", "come": "来", "down": "向下", "find": "找到", "for": "为了",
    "funny": "滑稽的", "go": "去", "help": "帮助", "here": "这里", "i": "我",
    "in": "在...里", "is": "是", "it": "它", "jump": "跳", "little": "小的",
    "look": "看", "make": "做", "me": "我", "my": "我的", "not": "不",
    "one": "一", "play": "玩", "red": "红色", "run": "跑", "said": "说(过去式)",
    "see": "看见", "the": "这个/那个", "three": "三", "to": "到", "two": "二",
    "up": "向上", "we": "我们", "where": "哪里", "yellow": "黄色", "you": "你/你们",
    "all": "全部", "am": "是", "are": "是", "at": "在", "ate": "吃(过去式)",
    "be": "是", "black": "黑色", "brown": "棕色", "but": "但是", "came": "来(过去式)",
    "did": "做(过去式)", "do": "做", "eat": "吃", "four": "四", "get": "得到",
    "good": "好的", "have": "有", "he": "他", "into": "进入", "like": "喜欢",
    "must": "必须", "new": "新的", "no": "不", "now": "现在", "on": "在...上",
    "our": "我们的", "out": "外面", "please": "请", "pretty": "漂亮的",
    "ran": "跑(过去式)", "ride": "骑", "saw": "看见(过去式)", "say": "说",
    "she": "她", "so": "所以", "soon": "很快", "that": "那个", "there": "那里",
    "they": "他们", "this": "这个", "too": "也", "under": "在...下面",
    "want": "想要", "was": "是(过去式)", "well": "好", "went": "去(过去式)",
    "what": "什么", "white": "白色", "who": "谁", "will": "将会",
    "with": "和...一起", "yes": "是的",
    "after": "在...之后", "again": "再一次", "an": "一(个)", "any": "任何",
    "as": "像...一样", "ask": "问", "by": "通过", "could": "能够",
    "every": "每一个", "fly": "飞", "from": "从", "give": "给", "going": "要去",
    "had": "有(过去式)", "has": "有", "her": "她的", "him": "他", "his": "他的",
    "how": "怎样", "just": "刚刚", "know": "知道", "let": "让", "live": "住",
    "may": "可以", "of": "...的", "old": "老的", "once": "一次", "open": "打开",
    "over": "在...上方", "put": "放", "round": "圆的", "some": "一些",
    "stop": "停", "take": "拿", "thank": "感谢", "them": "他们", "then": "然后",
    "think": "想", "walk": "走", "were": "是(过去式)", "when": "什么时候",
    "always": "总是", "around": "周围", "because": "因为", "been": "是(过去分词)",
    "before": "在...之前", "best": "最好的", "both": "两个都", "buy": "买",
    "call": "叫", "cold": "冷的", "does": "做(三单)", "don't": "不要",
    "fast": "快的", "first": "第一", "five": "五", "found": "找到(过去式)",
    "gave": "给(过去式)", "goes": "去(三单)", "green": "绿色", "its": "它的",
    "made": "做(过去式)", "many": "许多", "off": "离开", "or": "或者",
    "pull": "拉", "read": "读", "right": "正确的", "sing": "唱歌", "sit": "坐",
    "sleep": "睡觉", "tell": "告诉", "their": "他们的", "these": "这些",
    "those": "那些", "upon": "在...之上", "us": "我们", "use": "使用",
    "very": "非常", "wash": "洗", "which": "哪个", "why": "为什么",
    "wish": "希望", "work": "工作", "would": "将会", "write": "写", "your": "你的",
    "about": "关于", "better": "更好", "bring": "带来", "carry": "搬运",
    "clean": "干净的", "cut": "切", "done": "完成", "draw": "画", "drink": "喝",
    "eight": "八", "fall": "落下", "far": "远的", "full": "满的", "got": "得到(过去式)",
    "grow": "生长", "hold": "拿住", "hot": "热的", "hurt": "受伤", "if": "如果",
    "keep": "保持", "kind": "善良的", "laugh": "笑", "light": "光/轻的",
    "long": "长的", "much": "许多", "myself": "我自己", "never": "从不",
    "nine": "九", "only": "只", "own": "自己的", "pick": "挑选", "seven": "七",
    "shall": "将", "show": "展示", "six": "六", "small": "小的", "start": "开始",
    "ten": "十", "today": "今天", "together": "一起", "try": "尝试", "warm": "温暖的",
}


def norm(w: str) -> str:
    """atlas/tts 查询与文件名都用小写去撇号形式(don't -> dont)"""
    return w.lower().replace("'", "")


def main():
    words = []
    for band, blob in BANDS:
        ws = blob.split()
        words.append((band, ws))
    total = sum(len(ws) for _, ws in words)
    assert total == 220, "Dolch 总数应为 220, 实得 %d" % total
    flat = [w for _, ws in words for w in ws]
    assert len(set(flat)) == 220, "存在重复词"

    audio = json.load(open(os.path.join(HERE, "sight_audio.json"), encoding="utf-8"))
    levels = []
    n_atlas = n_tts = 0
    for i in range(0, 220, 10):
        chunk = flat[i:i + 10]
        items = []
        for w in chunk:
            hit = audio.get(norm(w))
            if hit and hit.get("au"):
                au = hit["au"]
                n_atlas += 1
            else:
                au = "tts-%s.mp3" % norm(w)
                n_tts += 1
            items.append({"w": w, "au": au, "cn": CN[w.lower()]})
        levels.append({"n": len(levels) + 1, "words": items})
    out = {"v": 1, "total": 220, "levels": levels}
    dest = os.path.join(HERE, "..", "assets", "resources", "data", "sight_words.json")
    with open(dest, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    print("levels=%d words=%d atlas=%d tts=%d -> %s"
          % (len(levels), len(flat), n_atlas, n_tts, os.path.normpath(dest)))


if __name__ == "__main__":
    main()
