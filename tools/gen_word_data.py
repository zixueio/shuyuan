# -*- coding: utf-8 -*-
"""把 sight_words.json 内联成 TS 词表(assets/scripts/game/WordData.ts)。

背景(微信小游戏 CLI 构建六轮实证): Cocos CLI 对内建 resources bundle 稳定
跳过——"Num of bundles: 4" 计数包含它, 但零写入零注册(settings.json
projectBundles 不含), resources.load('data/sight_words') 真机必败, FlipDemo
静默 return 只剩标题。词表改随脚本编译进分包, 运行时零异步加载。
词表源头仍是 assets/resources/data/sight_words.json(22 级 x 10 词 = 220),
改词表后重跑本脚本同步:
    python tools/gen_word_data.py
"""
import io
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'assets', 'resources', 'data', 'sight_words.json')
DST = os.path.join(ROOT, 'assets', 'scripts', 'game', 'WordData.ts')

HEADER = '''/**
 * 220 Sight Words 词表(由 tools/gen_word_data.py 生成, 勿手改)。
 * 背景: 微信小游戏 CLI 构建对内建 resources bundle 稳定跳过(计数含零写入),
 * resources.load('data/sight_words') 真机必败 -> 内联随脚本编译, 零异步加载。
 * 源数据 = assets/resources/data/sight_words.json(22 级 x 10 词),
 * 改词表后重跑: python tools/gen_word_data.py
 */
import { FlipWord } from './FlipCard';

export const SIGHT_WORDS: { v: number; total: number; levels: { n: number; words: FlipWord[] }[] } =
'''


def main():
    data = json.load(io.open(SRC, encoding='utf-8'))
    body = json.dumps(data, ensure_ascii=False, separators=(', ', ': '))
    ts = HEADER + body + ';\n'
    with io.open(DST, 'w', encoding='utf-8', newline='\n') as f:
        f.write(ts)
    lv = data.get('levels', [])
    n = sum(len(x.get('words', [])) for x in lv)
    print('WORD_DATA_OK levels=%d words=%d bytes=%d'
          % (len(lv), n, len(ts.encode('utf-8'))))


if __name__ == '__main__':
    main()
