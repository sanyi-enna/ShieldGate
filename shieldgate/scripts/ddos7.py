import threading
import requests
import time

# 目标 URL
target_url = "http://74.48.61.47:8080"  # 替换为实际目标地址
requests_per_thread = 5000  # 每线程请求数
thread_count = 100          # 线程数量

def send_requests():
    for _ in range(requests_per_thread):
        try:
            response = requests.get(target_url, timeout=5)
            print(f"Response: {response.status_code}")
        except Exception as e:
            print(f"Request failed: {e}")

if __name__ == "__main__":
    start_time = time.time()

    threads = []
    for _ in range(thread_count):
        thread = threading.Thread(target=send_requests)
        threads.append(thread)
        thread.start()

    for thread in threads:
        thread.join()

    end_time = time.time()
    print(f"Test completed in {end_time - start_time:.2f} seconds")
