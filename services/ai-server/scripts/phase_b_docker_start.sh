#!/usr/bin/env bash
# 构建并启动 compose 服务 oj-ai，并写入 oj-backend 的 ai-server.json
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
COMPOSE_DIR="$ROOT/../../install/docker"
"$ROOT/scripts/phase_b_docker_env.sh" "$COMPOSE_DIR/oj-ai.runtime.env"
cd "$COMPOSE_DIR"
docker compose build oj-ai
docker compose up -d oj-ai
mkdir -p ./data/backend
printf '%s\n' '{"url":"http://oj-ai:8090","secret":"dev-ai-secret"}' >./data/backend/ai-server.json
echo "等待 oj-ai 健康检查..."
for i in $(seq 1 30); do
  if docker compose exec -T oj-backend curl -sf http://oj-ai:8090/health >/dev/null 2>&1; then
    docker compose exec -T oj-backend curl -s http://oj-ai:8090/health | python3 -m json.tool
    echo "已配置 data/backend/ai-server.json → http://oj-ai:8090，请刷新 /ai/jobs"
    exit 0
  fi
  sleep 1
done
echo "oj-backend 仍无法访问 oj-ai，查看日志: docker compose logs oj-ai" >&2
exit 1
