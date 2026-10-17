# -*- coding: utf-8 -*-
"""
粤韵新声 · 内置二维码生成器（纯 Python，零依赖）
================================================
用于 make_qrcode.py 在未安装 qrcode 库时生成二维码 PNG。

支持：
  · 字节模式（UTF-8）
  · 版本 1~10 自动选择（容量足够放下普通 H5 地址）
  · 纠错等级 L / M / Q / H
  · 8 种掩码自动择优（按标准罚分规则）
"""

import struct
import zlib

# ---------------------------------------------------------------- 版本参数
# 每个版本：(每边模块数, [(纠错等级, 数据码字数, 纠错码字数), ...], 对齐图案中心)
# 数据来自 ISO/IEC 18004 表 9 与附录 E。
VERSION_INFO = {
    1:  (21, {'L': (19, 7),   'M': (16, 10),  'Q': (13, 13),  'H': (9, 17)},   []),
    2:  (25, {'L': (34, 10),  'M': (28, 16),  'Q': (22, 22),  'H': (16, 28)},   [6, 18]),
    3:  (29, {'L': (55, 15),  'M': (44, 26),  'Q': (34, 36),  'H': (26, 44)},   [6, 22]),
    4:  (33, {'L': (80, 20),  'M': (64, 36),  'Q': (48, 52),  'H': (36, 64)},   [6, 26]),
    5:  (37, {'L': (108, 26), 'M': (86, 48),  'Q': (62, 72),  'H': (46, 88)},   [6, 30]),
    6:  (41, {'L': (136, 36), 'M': (108, 64), 'Q': (76, 96),  'H': (60, 112)},  [6, 34]),
    7:  (45, {'L': (156, 40), 'M': (124, 72), 'Q': (88, 108), 'H': (66, 130)},  [6, 22, 38]),
    8:  (49, {'L': (194, 48), 'M': (154, 80), 'Q': (110, 132), 'H': (86, 156)}, [6, 24, 42]),
    9:  (53, {'L': (232, 60), 'M': (182, 96), 'Q': (132, 160), 'H': (100, 192)}, [6, 26, 46]),
    10: (57, {'L': (274, 72), 'M': (216, 112), 'Q': (154, 192), 'H': (122, 224)}, [6, 28, 50]),
}

# 纠错等级对应的「格式信息」比特
EC_BITS = {'L': 1, 'M': 0, 'Q': 3, 'H': 2}

# 掩码罚分权重
N1, N2, N3, N4 = 3, 3, 40, 10


# ---------------------------------------------------------------- GF(256)
def _make_gf():
    exp = [0] * 512
    log = [0] * 256
    x = 1
    for i in range(255):
        exp[i] = x
        log[x] = i
        x <<= 1
        if x & 0x100:
            x ^= 0x11D
    for i in range(255, 512):
        exp[i] = exp[i - 255]
    return exp, log


GF_EXP, GF_LOG = _make_gf()


def _gf_mul(a, b):
    if a == 0 or b == 0:
        return 0
    return GF_EXP[GF_LOG[a] + GF_LOG[b]]


def _rs_generator(n):
    poly = [1]
    for i in range(n):
        poly = _poly_mul(poly, [1, GF_EXP[i]])
    return poly


def _poly_mul(a, b):
    out = [0] * (len(a) + len(b) - 1)
    for i, av in enumerate(a):
        if av == 0:
            continue
        for j, bv in enumerate(b):
            out[i + j] ^= _gf_mul(av, bv)
    return out


def _rs_encode(data, ec_len):
    gen = _rs_generator(ec_len)
    res = list(data) + [0] * ec_len
    for i in range(len(data)):
        c = res[i]
        if c == 0:
            continue
        for j, g in enumerate(gen):
            res[i + j] ^= _gf_mul(g, c)
    return res[len(data):]


# ---------------------------------------------------------------- 矩阵工具
def _blank(size):
    return [[None] * size for _ in range(size)]


def _place_finder(m, cx, cy):
    for dy in range(-4, 5):
        for dx in range(-4, 5):
            x, y = cx + dx, cy + dy
            if not (0 <= x < len(m) and 0 <= y < len(m)):
                continue
            d = max(abs(dx), abs(dy))
            m[y][x] = 1 if d != 2 and d != 4 else 0


def _place_alignment(m, centers):
    for cy in centers:
        for cx in centers:
            if m[cy][cx] is not None:
                continue
            for dy in range(-2, 3):
                for dx in range(-2, 3):
                    d = max(abs(dx), abs(dy))
                    m[cy + dy][cx + dx] = 1 if d != 1 else 0


def _place_timing(m):
    size = len(m)
    for i in range(8, size - 8):
        bit = 1 if i % 2 == 0 else 0
        if m[6][i] is None:
            m[6][i] = bit
        if m[i][6] is None:
            m[i][6] = bit


def _reserve_format(m):
    size = len(m)
    for i in range(9):
        if m[8][i] is None:
            m[8][i] = 0
        if m[i][8] is None:
            m[i][8] = 0
    for i in range(8):
        m[8][size - 1 - i] = 0
        m[size - 1 - i][8] = 0
    m[size - 8][8] = 1  # 固定的黑模块


# ---------------------------------------------------------------- 主体
class QRCode(object):
    def __init__(self, data, error='M'):
        if error not in EC_BITS:
            raise ValueError('纠错等级只能是 L/M/Q/H')
        self.error = error
        self.data = data
        self.version, self.size, code_words, ec_len = self._fit(data)
        bits = self._bit_stream(data, self.version)
        final = self._interleave(bits, code_words, ec_len)
        self.matrix = self._build_matrix(final)

    # ---- 版本选择 ----
    def _fit(self, data):
        for v in sorted(VERSION_INFO):
            size, table, _ = VERSION_INFO[v]
            if self.error not in table:
                continue
            code_words, ec_len = table[self.error]
            cc_bits = 8 if v <= 9 else 16
            need = 4 + cc_bits + len(data) * 8
            if need <= code_words * 8:
                return v, size, code_words, ec_len
        raise ValueError('内容过长，超出版本 10 的容量（约 200 字节）')

    # ---- 比特流 ----
    def _bit_stream(self, data, version):
        code_words = VERSION_INFO[version][1][self.error][0]
        cc_bits = 8 if version <= 9 else 16
        bits = []

        def put(val, n):
            for i in range(n - 1, -1, -1):
                bits.append((val >> i) & 1)

        put(0b0100, 4)              # 字节模式
        put(len(data), cc_bits)     # 字符计数
        for b in data:
            put(b, 8)
        # 结束符
        cap = code_words * 8
        for _ in range(min(4, cap - len(bits))):
            bits.append(0)
        # 补齐到字节
        while len(bits) % 8:
            bits.append(0)
        # 填充字节
        pad = [0xEC, 0x11]
        i = 0
        while len(bits) < cap:
            put(pad[i % 2], 8)
            i += 1
        return bits

    def _interleave(self, bits, code_words, ec_len):
        words = [int(''.join(map(str, bits[i:i + 8])), 2) for i in range(0, len(bits), 8)]
        data_words = words[:code_words]
        ec_words = _rs_encode(data_words, ec_len)
        return data_words + ec_words

    # ---- 矩阵 ----
    def _build_matrix(self, words):
        size, _, centers = VERSION_INFO[self.version]

        # ① 先铺好所有功能图形，并把「不能动」的位置记进 reserved
        base = _blank(size)
        _place_finder(base, 3, 3)
        _place_finder(base, size - 4, 3)
        _place_finder(base, 3, size - 4)
        if centers:
            _place_alignment(base, centers)
        _place_timing(base)
        _reserve_format(base)
        for i in range(size):
            base[6][i] = base[6][i] if base[6][i] is not None else (1 if i % 2 == 0 else 0)
            base[i][6] = base[i][6] if base[i][6] is not None else (1 if i % 2 == 0 else 0)
        base[size - 8][8] = 1

        reserved = [[base[y][x] is not None for x in range(size)] for y in range(size)]
        for i in range(size):
            reserved[6][i] = True          # 时序行 / 列属于功能图形
            reserved[i][6] = True

        # ② 数据比特按「右下起、两列一组、蛇形向上」的方式填入空位
        m = [row[:] for row in base]
        for y in range(size):
            for x in range(size):
                if not reserved[y][x]:
                    m[y][x] = 0
        bits = []
        for w in words:
            for i in range(7, -1, -1):
                bits.append((w >> i) & 1)

        idx = 0
        col = size - 1
        upward = True
        while col > 0:
            if col == 6:
                col -= 1
            rows = range(size - 1, -1, -1) if upward else range(size)
            for row in rows:
                for c in (col, col - 1):
                    if not reserved[row][c]:
                        m[row][c] = bits[idx] if idx < len(bits) else 0
                        idx += 1
            upward = not upward
            col -= 2

        # ③ 逐一套用掩码（只翻数据区），写入格式信息后按标准罚分择优
        self._apply_best_mask(m, reserved)
        return m

    # ---- 掩码 ----
    def _mask_fn(self, k, x, y):
        if k == 0:
            return (x + y) % 2 == 0
        if k == 1:
            return y % 2 == 0
        if k == 2:
            return x % 3 == 0
        if k == 3:
            return (x + y) % 3 == 0
        if k == 4:
            return (y // 2 + x // 3) % 2 == 0
        if k == 5:
            return (x * y) % 2 + (x * y) % 3 == 0
        if k == 6:
            return ((x * y) % 2 + (x * y) % 3) % 2 == 0
        return ((x + y) % 2 + (x * y) % 3) % 2 == 0

    def _apply_best_mask(self, m, reserved):
        size = len(m)
        best, best_penalty, best_k = None, None, 0
        for k in range(8):
            # 每次都从「未加掩码」的原始矩阵派生，避免把上一次的格式信息带进来
            cand = [row[:] for row in m]
            for y in range(size):
                for x in range(size):
                    if not reserved[y][x] and self._mask_fn(k, x, y):
                        cand[y][x] ^= 1
            self._write_format(cand, k)
            p = self._penalty(cand)
            if best_penalty is None or p < best_penalty:
                best, best_penalty, best_k = cand, p, k
        self.mask = best_k
        for y in range(size):
            m[y] = best[y][:]

    def _write_format(self, m, mask):
        size = len(m)
        ec = EC_BITS[self.error]
        data = (ec << 3) | mask
        rem = data
        for _ in range(10):
            rem = (rem << 1) ^ ((rem >> 9) * 0x537)
        value = ((data << 10) | rem) ^ 0x5412

        def bit(i):
            """位序：bit(0) 是 15 位串的最高位（标准规定先放最高位）"""
            return (value >> (14 - i)) & 1

        # 用一组带坐标的 15 位串来写格式信息，位序 0 = 最高位（标准规定先放最高位）。
        # 坐标依据 ISO/IEC 18004 图 25：
        #   第一份（左上）：水平段 (8,0)..(8,5)、(8,7)、(8,8)、(7,8)；竖直段列 8 行 5..0
        #   第二份：水平段 (8,size-1)..(8,size-8)；竖直段列 8 行 size-7..size-1
        bits15 = [bit(i) for i in range(15)]

        format_a = [
            (8, 0), (8, 1), (8, 2), (8, 3), (8, 4), (8, 5),   # 位 0..5
            (8, 7), (8, 8), (7, 8),                            # 位 6..8
            (5, 8), (4, 8), (3, 8), (2, 8), (1, 8), (0, 8)     # 位 9..14
        ]
        for i, (r, c) in enumerate(format_a):
            m[r][c] = bits15[i]

        format_b = [(8, size - 1 - i) for i in range(8)] + \
                   [(size - 15 + i, 8) for i in range(8, 15)]
        for i, (r, c) in enumerate(format_b):
            m[r][c] = bits15[i]

        m[size - 8][8] = 1

    def _penalty(self, m):
        size = len(m)
        score = 0
        # 规则 1：同色连续
        for line in list(m) + [[m[y][x] for y in range(size)] for x in range(size)]:
            run, prev = 1, line[0]
            for v in line[1:]:
                if v == prev:
                    run += 1
                else:
                    if run >= 5:
                        score += N1 + (run - 5)
                    run, prev = 1, v
            if run >= 5:
                score += N1 + (run - 5)
        # 规则 2：2x2 同色块
        for y in range(size - 1):
            for x in range(size - 1):
                v = m[y][x]
                if v == m[y][x + 1] == m[y + 1][x] == m[y + 1][x + 1]:
                    score += N2
        # 规则 3：类似定位图案的组合
        pat1 = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0]
        pat2 = [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1]
        for line in list(m) + [[m[y][x] for y in range(size)] for x in range(size)]:
            for i in range(size - 10):
                seg = line[i:i + 11]
                if seg == pat1 or seg == pat2:
                    score += N3
        # 规则 4：黑白比例
        dark = sum(sum(row) for row in m)
        ratio = dark * 100 // (size * size)
        score += N4 * (abs(ratio - 50) // 5)
        return score

    # ---- 输出 ----
    def to_bool_matrix(self):
        return self.matrix

    def save_png(self, path, scale=8, border=4, dark=(0, 0, 0), light=(255, 255, 255)):
        size = self.size
        full = size + border * 2
        px = full * scale

        rows = []
        for y in range(px):
            fy = y // scale - border
            row = bytearray()
            for x in range(px):
                fx = x // scale - border
                if 0 <= fx < size and 0 <= fy < size and self.matrix[fy][fx]:
                    row += bytes(dark)
                else:
                    row += bytes(light)
            rows.append(b'\x00' + bytes(row))
        raw = b''.join(rows)

        def chunk(tag, data):
            c = struct.pack('>I', len(data)) + tag + data
            return c + struct.pack('>I', zlib.crc32(tag + data) & 0xFFFFFFFF)

        ihdr = struct.pack('>IIBBBBB', px, px, 8, 2, 0, 0, 0)
        png = b'\x89PNG\r\n\x1a\n'
        png += chunk(b'IHDR', ihdr)
        png += chunk(b'IDAT', zlib.compress(raw, 9))
        png += chunk(b'IEND', b'')
        with open(path, 'wb') as f:
            f.write(png)
        return path


if __name__ == '__main__':
    import sys
    url = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:8000/index.html'
    out = sys.argv[2] if len(sys.argv) > 2 else 'qrcode.png'
    qr = QRCode(url.encode('utf-8'), error='M')
    qr.save_png(out)
    print('已生成 %s（版本 %d，%dx%d）' % (out, qr.version, qr.size, qr.size))
