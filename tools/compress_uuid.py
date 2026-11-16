# -*- coding: utf-8 -*-
# 手算 Cocos compressUuid(引擎 packer 产物实证变体) + 自校验
#
# 正确变体(2026-11-16 与编辑器 packer 产物 chunk 里 _cclegacy._RF.push 第二参
# 逐字符核对): 32 hex = 前 5 个 hex 原样保留 + 剩余 27 hex 按「3 hex -> 2 base64」
# 共 9 组 -> 23 字符。
#
# 曾错用的 22 字符变体(前 2 hex + 10 组)是另一种压缩形式, 与引擎注册的类 id
# 精确匹配不上, 场景反序列化报 Missing class。教训: 本工具最初的 compress 与
# decode 用同一个错误变体互证, roundtrip 自然通过 —— 自校验必须锚定引擎产物
# 这个外部真值(下方 BOOT_COMPRESSED), 不能只做自洽循环。
#
# 用法: python tools/compress_uuid.py <36位标准uuid>
import sys

KEYS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
VALUES = {c: i for i, c in enumerate(KEYS)}
HEX = '0123456789abcdef'

# 外部真值(编辑器 packer 产物 chunk 里 _RF.push 第二参, 非本工具自算)
BOOT_UUID = '3f7a2c9e-8d1b-4e6f-a5c3-9b0d8e7f1a2c'
BOOT_COMPRESSED = '3f7a2yejRtOb6XDmw2Ofxos'


def compress(uuid36):
    h = uuid36.replace('-', '')
    out = h[:5]  # 前 5 hex 原样保留
    for i in range(5, 32, 3):
        h0, h1, h2 = int(h[i], 16), int(h[i + 1], 16), int(h[i + 2], 16)
        out += KEYS[(h0 << 2) | (h1 >> 2)] + KEYS[((h1 & 3) << 4) | h2]
    return out  # 23 字符


def decode(s):
    if len(s) != 23:
        return s
    out = list(s[:5])
    for i in range(5, 23, 2):
        lhs = VALUES[s[i]]
        rhs = VALUES[s[i + 1]]
        out.append(HEX[lhs >> 2])
        out.append(HEX[((lhs & 3) << 2) | (rhs >> 4)])
        out.append(HEX[rhs & 0xF])
    h = ''.join(out)
    return '-'.join((h[0:8], h[8:12], h[12:16], h[16:20], h[20:32]))


if __name__ == '__main__':
    u = sys.argv[1] if len(sys.argv) > 1 else BOOT_UUID
    c = compress(u)
    ok = decode(c) == u
    sys.stdout.write('COMPRESSED=' + c + '\n')
    sys.stdout.write('LEN=%d\n' % len(c))
    sys.stdout.write('ROUNDTRIP_OK=%s\n' % ('True' if ok else 'False'))
    if u == BOOT_UUID:
        sys.stdout.write('ENGINE_ANCHOR_OK=%s\n' % ('True' if c == BOOT_COMPRESSED else 'False'))
