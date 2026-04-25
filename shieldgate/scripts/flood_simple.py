"""简易 HTTP Flood（无需 Locust，适合快速演示）。

用法：
    python3 scripts/flood_simple.py http://127.0.0.1:8080 --threads 20 --duration 30
"""
import argparse
import threading
import time
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError


def worker(target, stop_at, counters):
    while time.time() < stop_at:
        try:
            req = Request(target, headers={"User-Agent": "python-requests/2.31"})
            with urlopen(req, timeout=2) as resp:
                resp.read(64)
            counters["ok"] += 1
        except HTTPError as e:
            counters[f"http_{e.code}"] = counters.get(f"http_{e.code}", 0) + 1
        except URLError:
            counters["err"] += 1
        except Exception:
            counters["err"] += 1


def main():
    p = argparse.ArgumentParser()
    p.add_argument("target", help="例如 http://127.0.0.1:8080")
    p.add_argument("--threads", type=int, default=20)
    p.add_argument("--duration", type=int, default=30)
    args = p.parse_args()

    print(f"[flood] {args.target} threads={args.threads} duration={args.duration}s")
    stop_at = time.time() + args.duration
    counters = {"ok": 0, "err": 0}

    threads = []
    for _ in range(args.threads):
        t = threading.Thread(target=worker, args=(args.target, stop_at, counters), daemon=True)
        t.start()
        threads.append(t)

    while time.time() < stop_at:
        time.sleep(1)
        snapshot = dict(counters)
        print(f"[flood] {snapshot}")

    for t in threads:
        t.join(timeout=1)
    print("[flood] done", counters)


if __name__ == "__main__":
    main()
