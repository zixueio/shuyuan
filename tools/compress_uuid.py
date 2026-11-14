# -*- coding: utf-8 -*-
# 手算 Cocos compressUuid(与引擎 decodeUuid 互逆) + roundtrip 自校验
# 用法: python tools/compress_uuid.py <36位标准uuid>
import sys

KEYS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
VALUES = {c: i for i, c in enumerate(KEYS)}
HEX = '0123456789abcdef'
TMPL = list('xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx')
IDX = [i for i, c in enumerate(TMPL) if c == 'x']


def compress(uuid36):
    h = uuid36.replace('-', '')
    out = h[:2]  # 前 2 hex 原样保留
    for i in range(2, 32, 3):
        h0, h1, h2 = int(h[i], 16), int(h[i + 1], 16), int(h[i + 2], 16)
        lhs = (h0 << 2) | (h1 >> 2)
        rhs = ((h1 & 3) << 4) | h2
        out += KEYS[lhs] + KEYS[rhs]
    return out


def decode(b64):
    # 与引擎 cocos/core/utils/decode-uuid.ts 逐行同构
    if len(b64) != 22:
        return b64
    out = list(TMPL)  # '-' 已就位, x 位逐个覆盖(32 个 x = 2 + 10*3 全覆盖)
    out[0] = b64[0]
    out[1] = b64[1]
    j = 2
    for i in range(2, 22, 2):
        lhs = VALUES[b64[i]]
        rhs = VALUES[b64[i + 1]]
        out[IDX[j]] = HEX[lhs >> 2]
        out[IDX[j + 1]] = HEX[((lhs & 3) << 2) | (rhs >> 4)]
        out[IDX[j + 2]] = HEX[rhs & 0xF]
        j += 3
    return ''.join(out)


if __name__ == '__main__':
    u = sys.argv[1] if len(sys.argv) > 1 else '3f7a2c9e-8d1b-4e6f-a5c3-9b0d8e7f1a2c'
    c = compress(u)
    ok = decode(c) == u
    sys.stdout.write('COMPRESSED=' + c + '\n')
    sys.stdout.write('LEN=%d\n' % len(c))
    sys.stdout.write('ROUNDTRIP_OK=%s\n' % ('True' if ok else 'False'))
