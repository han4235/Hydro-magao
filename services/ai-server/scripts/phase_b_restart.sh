#!/usr/bin/env bash
# 本机重启 ai-server（阶段 B）。环境：phase_b_local.env 或当前 shell 已 export。
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT/scripts/phase_b_local.env"
# 每次重启都从 one-api.db 刷新 LLM_API_KEY（本地开发）；跳过：PHASE_B_SKIP_AUTOFILL=1
if [[ "${PHASE_B_SKIP_AUTOFILL:-0}" != "1" ]]; then
  python3 "$ROOT/scripts/phase_b_autofill_env.py" || true
fi
if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck source=/dev/null
  source "$ENV_FILE"
  set +a
fi
export AI_SERVER_HMAC_SECRET="${AI_SERVER_HMAC_SECRET:-dev-ai-secret}"
export JOB_DATA_DIR="${JOB_DATA_DIR:-/tmp/ai-jobs}"
PID="$(lsof -ti :8090 2>/dev/null || true)"
if [[ -z "${LLM_API_KEY:-}" && -n "$PID" ]]; then
  echo "从旧 ai-server 进程继承 LLM/HYDRO 环境变量"
  while IFS= read -r line; do
    [[ -n "$line" ]] && eval "$line"
  done < <(python3 - "$PID" <<'PY'
import re, subprocess, sys, shlex
pid = sys.argv[1]
ps = subprocess.check_output(["ps", "eww", "-p", pid], text=True, errors="replace")
for key in (
    "LLM_API_KEY", "LLM_BASE_URL", "LLM_MODEL",
    "HYDRO_BASE_URL", "HYDRO_IMPORT_TOKEN", "AI_SERVER_HMAC_SECRET",
):
    m = re.search(rf"{key}=(\S+)", ps)
    if m:
        print(f"export {key}={shlex.quote(m.group(1))}")
PY
  )
fi
if [[ -n "$PID" ]]; then
  echo "停止旧进程 :8090 (pid $PID)"
  kill "$PID" 2>/dev/null || true
  sleep 1
fi
cd "$ROOT"
mkdir -p "$JOB_DATA_DIR"
UVICORN=""
if [[ -x .venv/bin/uvicorn ]]; then
  UVICORN=".venv/bin/uvicorn"
elif python3 -c "import uvicorn" 2>/dev/null; then
  UVICORN="python3 -m uvicorn"
else
  python3 -m venv .venv
  .venv/bin/pip install -r requirements.txt
  UVICORN=".venv/bin/uvicorn"
fi
PIDFILE=/tmp/ai-server.pid
# 显式传入环境，避免 nohup 子进程拿不到 phase_b_local.env
# shellcheck disable=SC2086
nohup env \
  AI_SERVER_HMAC_SECRET="${AI_SERVER_HMAC_SECRET}" \
  JOB_DATA_DIR="${JOB_DATA_DIR}" \
  LLM_API_KEY="${LLM_API_KEY:-}" \
  LLM_BASE_URL="${LLM_BASE_URL:-}" \
  LLM_MODEL="${LLM_MODEL:-}" \
  HYDRO_BASE_URL="${HYDRO_BASE_URL:-}" \
  HYDRO_IMPORT_TOKEN="${HYDRO_IMPORT_TOKEN:-}" \
  HYDRO_AUTO_SID="${HYDRO_AUTO_SID:-1}" \
  $UVICORN app.main:app --host 127.0.0.1 --port 8090 >> /tmp/ai-server.log 2>&1 &
APID=$!
echo "$APID" >"$PIDFILE"
disown "$APID" 2>/dev/null || true
echo "已启动 pid $APID 日志 /tmp/ai-server.log pidfile=$PIDFILE"
for i in 1 2 3 4 5 6 7 8 9 10; do
  if curl -sf http://127.0.0.1:8090/health >/dev/null; then
    curl -s http://127.0.0.1:8090/health | python3 -m json.tool
    exit 0
  fi
  sleep 0.5
done
echo "health 未就绪，见 /tmp/ai-server.log" >&2
tail -20 /tmp/ai-server.log >&2
exit 1
