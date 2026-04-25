#!/usr/bin/env bash
# 实时监控本机 IP 是否被封禁，每秒刷新。
# 用法：bash scripts/watch_ban.sh [ip]   默认 127.0.0.1
IP="${1:-127.0.0.1}"
GATEWAY="${GATEWAY:-http://127.0.0.1:8080}"

while true; do
  clear
  echo "================ ShieldGate 封禁实时监控 ================"
  echo "IP:        $IP"
  echo "Gateway:   $GATEWAY"
  echo "Time:      $(date '+%F %T')"
  echo "----------------------------------------------------------"
  REASON=$(redis-cli get "ban:$IP")
  TTL=$(redis-cli ttl "ban:$IP")
  HITS=$(redis-cli hget "ban:hits" "$IP")
  CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 1 "$GATEWAY/" || echo "ERR")

  echo "ban:$IP    = ${REASON:-<not banned>}"
  echo "TTL        = ${TTL}s"
  echo "ban:hits   = ${HITS:-0}"
  echo "curl /     = HTTP $CODE"
  echo "----------------------------------------------------------"
  echo "ban:history (最近 5 条)："
  redis-cli lrange ban:history 0 4 | sed 's/^/  /'
  sleep 1
done
