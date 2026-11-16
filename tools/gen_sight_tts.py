# -*- coding: utf-8 -*-
"""
gen_sight_tts.py — 词灵跳跳缺词 TTS 静态音频生成(服务器跑)

Dolch 220 词里 atlas 真人发音缺的那部分(主要是功能词), 用 edge-tts
(en-US-JennyNeural, rate=-25% 放慢) 预生成为 tts-<word>.mp3, 直接落进
atlas_repo/public/atlas/audio/uk/ —— 该目录由 app.py _atlas_file 匿名白名单
服务(^\\S+\\.(webp|mp3)), 客户端 BASE_URL+/atlas/audio/uk/tts-xxx.mp3 直取,
零后端代码改动。幂等: 已存在且 >1000 字节的文件跳过。

用法: venv/bin/python /tmp/gen_sight_tts.py
"""
import asyncio
import os

import edge_tts

OUT = "/home/ubuntu/ruci/atlas_repo/public/atlas/audio/uk"
VOICE = "en-US-JennyNeural"
RATE = "-25%"

# Dolch 220 全表(与 tools/gen_sight.py BANDS 一致); norm 后作文件名
WORDS = """a and away big blue can come down find for funny go help here I in is it
jump little look make me my not one play red run said see the three to two up
we where yellow you
all am are at ate be black brown but came did do eat four get good have
he into like must new no now on our out please pretty ran ride saw say she so
soon that there they this too under want was well went what white who will with yes
after again an any as ask by could every fly from give going had has her
him his how just know let live may of old once open over put round some stop
take thank them then think walk were when
always around because been before best both buy call cold does don't fast
first five found gave goes green its made many off or pull read right sing sit
sleep tell their these those upon us use very wash which why wish work would write your
about better bring carry clean cut done draw drink eight fall far full got
grow hold hot hurt if keep kind laugh light long much myself never nine only
own pick seven shall show six small start ten today together try warm""".split()


def norm(w: str) -> str:
    return w.lower().replace("'", "")


# 合成文本与文件名不同的词(撇号还原/大小写)
TEXT_MAP = {"i": "I", "dont": "don't"}


async def gen(word: str) -> str:
    name = norm(word)
    path = os.path.join(OUT, "tts-%s.mp3" % name)
    if os.path.exists(path) and os.path.getsize(path) > 1000:
        return "skip"
    text = TEXT_MAP.get(name, name)
    com = edge_tts.Communicate(text, VOICE, rate=RATE)
    await com.save(path)
    ok = os.path.exists(path) and os.path.getsize(path) > 1000
    return "ok" if ok else "bad"


async def main() -> None:
    seen, uniq = set(), []
    for w in WORDS:
        n = norm(w)
        if n not in seen:
            seen.add(n)
            uniq.append(w)
    print("total=%d uniq=%d" % (len(WORDS), len(uniq)))
    ok = skip = bad = 0
    for w in uniq:
        try:
            r = await gen(w)
        except Exception as e:  # noqa: BLE001
            print("[%s] FAIL %s" % (w, e))
            r = "bad"
        if r == "ok":
            ok += 1
        elif r == "skip":
            skip += 1
        else:
            bad += 1
    print("total=%d ok=%d skip=%d bad=%d" % (len(uniq), ok, skip, bad))


if __name__ == "__main__":
    asyncio.run(main())
