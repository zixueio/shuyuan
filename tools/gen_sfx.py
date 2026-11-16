# -*- coding: utf-8 -*-
"""
gen_sfx.py — 合成游戏音效(纯 numpy, 零版权)

输出 assets/resources/sfx/: click / coin / right / wrong (22050Hz 16bit mono wav)
用法: python tools/gen_sfx.py
"""
import os
import wave

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
DEST = os.path.normpath(os.path.join(HERE, "..", "assets", "resources", "sfx"))
os.makedirs(DEST, exist_ok=True)

SR = 22050


def _save(name, data):
    data = np.clip(data, -1, 1)
    pcm = (data * 32767).astype("<i2")
    path = os.path.join(DEST, name + ".wav")
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    print("  %s.wav %.0fKB" % (name, os.path.getsize(path) / 1024))


def _tone(freq, dur, vol=0.5, decay=8.0, harm=0.0):
    t = np.linspace(0, dur, int(SR * dur), False)
    y = np.sin(2 * np.pi * freq * t) + harm * np.sin(2 * np.pi * freq * 2 * t)
    return y * vol * np.exp(-decay * t)


def main():
    # 点击: 短哒(高通噪声脉冲)
    n = int(SR * 0.04)
    noise = np.random.default_rng(7).standard_normal(n)
    click = noise * np.exp(-90 * np.linspace(0, 0.04, n)) * 0.35
    _save("click", click)

    # 铜钱叮: 双高频金属音叠加, 快衰减(等长才能相加)
    coin = (_tone(1568, 0.28, 0.4, 10) + _tone(2093, 0.28, 0.3, 12)
            + _tone(3136, 0.28, 0.12, 16))
    _save("coin", coin)

    # 答对: 上行三连音
    seg = []
    for f in (523, 659, 784):
        seg.append(_tone(f, 0.11, 0.42, 6, 0.2))
    right = np.concatenate(seg)
    _save("right", right)

    # 答错: 低音两连降
    seg = []
    for f in (330, 247):
        seg.append(_tone(f, 0.14, 0.45, 7, 0.35))
    wrong = np.concatenate(seg)
    _save("wrong", wrong)

    print("完成 -> " + DEST)


if __name__ == "__main__":
    main()
