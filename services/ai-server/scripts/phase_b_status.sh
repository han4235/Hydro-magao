#!/usr/bin/env bash
# 查看本机 ai-server（8090）是否在跑
set -euo pipefail
PID="$(lsof -ti :8090 2>/dev/null || true)"
if [[ -z "$PID" ]]; then
  echo "8090 无进程（ai-server 未启动）"
  echo "启动: ./scripts/phase_b_restart.sh"
  exit 1
fi
echo "监听 8090 的 pid: $PID"
if [[ -f /tmp/ai-server.pid ]]; then
  echo "pid 文件: /tmp/ai-server.pid -> $(cat /tmp/ai-server.pid)"
fi
curl -sf http://127.0.0.1:8090/health | python3 -m json.tool
