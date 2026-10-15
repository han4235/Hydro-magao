#!/usr/bin/env bash
# 把 phase_b_local.env 转成 Docker env_file（无 export 前缀）
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/scripts/phase_b_local.env"
OUT="${1:-$ROOT/../../install/docker/oj-ai.runtime.env}"
if [[ ! -f "$SRC" ]]; then
  echo "缺少 $SRC" >&2
  exit 1
fi
grep -E '^export [A-Za-z_][A-Za-z0-9_]*=' "$SRC" | sed 's/^export //' >"$OUT"
{
  echo "AI_SERVER_HMAC_SECRET=${AI_SERVER_HMAC_SECRET:-dev-ai-secret}"
  echo "JOB_DATA_DIR=/data/jobs"
  echo "HYDRO_BASE_URL=http://oj-backend:8888"
  echo "HYDRO_MONGO_URI=mongodb://oj-mongo:27017"
  echo "HYDRO_AUTO_SID=${HYDRO_AUTO_SID:-1}"
} >>"$OUT"
echo "已写入 $OUT"
