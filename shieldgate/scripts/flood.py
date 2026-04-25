"""HTTP Flood 模拟脚本（Locust）

用法：
    pip install locust
    locust -f scripts/flood.py --host=http://your-server:8080 \\
           --users=200 --spawn-rate=50 --headless -t 30s
"""
from locust import HttpUser, task, constant, events


class FloodUser(HttpUser):
    wait_time = constant(0)  # 无间隔连续发送

    @task(5)
    def root(self):
        with self.client.get("/", catch_response=True) as resp:
            if resp.status_code in (403, 429):
                resp.success()  # 被拦截视为预期，不影响统计

    @task(2)
    def api_users(self):
        with self.client.get("/api/users", catch_response=True) as resp:
            if resp.status_code in (403, 429):
                resp.success()

    @task(1)
    def api_search(self):
        with self.client.get("/api/search?q=ddos", catch_response=True) as resp:
            if resp.status_code in (403, 429):
                resp.success()


@events.test_start.add_listener
def on_test_start(environment, **kw):
    print(f"[flood] target={environment.host}")
