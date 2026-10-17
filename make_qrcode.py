# -*- coding: utf-8 -*-
"""
粤韵新声 · H5 二维码生成脚本
=============================
用途：把 H5 的访问地址生成二维码，方便印在课件、海报或答辩 PPT 上。

用法（在本目录下执行）：

    # 1) 自动取本机局域网地址（手机连同一 WiFi 时可扫码预览）
    python make_qrcode.py

    # 2) 指定线上地址（部署到 GitHub Pages / 校园服务器后使用）
    python make_qrcode.py --url https://你的域名/yueyun-h5/index.html

    # 3) 自定义端口和输出文件名
    python make_qrcode.py --port 8080 --out poster-qr.png

依赖：优先使用 qrcode 库；若未安装，则用内置的纯 Python 实现（无需联网）。
"""

import argparse
import os
import socket
import sys

HERE = os.path.dirname(os.path.abspath(__file__))


def guess_lan_ip():
    """取本机在局域网中的 IPv4 地址（不会真的建立连接）"""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("10.255.255.255", 1))
        ip = s.getsockname()[0]
    except Exception:
        try:
            ip = socket.gethostbyname(socket.gethostname())
        except Exception:
            ip = "127.0.0.1"
    finally:
        s.close()
    return ip


def build_url(args):
    if args.url:
        return args.url
    host = args.host or guess_lan_ip()
    return "http://%s:%d/index.html" % (host, args.port)


def make_with_qrcode_lib(url, out_path, box_size, border):
    import qrcode  # type: ignore
    try:
        from qrcode.constants import ERROR_CORRECT_M
        qr = qrcode.QRCode(version=None, error_correction=ERROR_CORRECT_M,
                           box_size=box_size, border=border)
    except Exception:
        qr = qrcode.QRCode(box_size=box_size, border=border)
    qr.add_data(url)
    qr.make(fit=True)
    img = qr.make_image(fill_color="#0B0709", back_color="#F3E7D2")
    img.save(out_path)
    return True


def make_with_pure_python(url, out_path, scale, border):
    """不依赖第三方库的最小实现（字节模式 + 纠错等级 M）"""
    from qrcode_pure import QRCode as PureQR  # 同目录下的内置实现
    qr = PureQR(data=url.encode("utf-8"), error="M")
    qr.save_png(out_path, scale=scale, border=border,
                dark=(11, 7, 9), light=(243, 231, 210))
    return True


def main():
    ap = argparse.ArgumentParser(description="生成粤韵新声 H5 的访问二维码")
    ap.add_argument("--url", help="完整的访问地址；给了这个就忽略 --host/--port")
    ap.add_argument("--host", help="指定主机名或 IP（默认自动探测局域网 IP）")
    ap.add_argument("--port", type=int, default=8000, help="本地预览端口，默认 8000")
    ap.add_argument("--out", default="qrcode.png", help="输出文件名，默认 qrcode.png")
    ap.add_argument("--box-size", type=int, default=10, help="qrcode 库的像素倍率")
    ap.add_argument("--scale", type=int, default=8, help="内置实现的像素倍率")
    ap.add_argument("--border", type=int, default=4, help="静默区宽度（模块数）")
    args = ap.parse_args()

    url = build_url(args)
    out_path = args.out if os.path.isabs(args.out) else os.path.join(HERE, args.out)

    done = False
    try:
        done = make_with_qrcode_lib(url, out_path, args.box_size, args.border)
    except ImportError:
        done = False
    except Exception as e:  # 库存在但生成失败时也回退
        print("qrcode 库生成失败（%s），改用内置实现" % e, file=sys.stderr)
        done = False

    if not done:
        make_with_pure_python(url, out_path, args.scale, args.border)

    print("二维码已生成：%s" % out_path)
    print("指向地址：%s" % url)
    print()
    print("提示：")
    print("  · 手机需与电脑在同一 WiFi 下，才能扫码访问上面的局域网地址；")
    print("  · 本地预览请先在 yueyun-h5 目录执行：python -m http.server %d" % args.port)
    print("  · 正式使用时，把 --url 换成部署后的线上地址再生成一次即可。")


if __name__ == "__main__":
    main()
