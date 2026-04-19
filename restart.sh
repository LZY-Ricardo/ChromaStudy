#!/bin/bash
# ChromaStudy 重启脚本

set -e

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
FRONTEND_DIR="$PROJECT_DIR/frontend"
BACKEND_DIR="$PROJECT_DIR/backend"

echo "============================="
echo "  ChromaStudy 重启服务"
echo "============================="

# 停止
for port in 3001 5173; do
  pids=$(lsof -ti :$port 2>/dev/null || true)
  if [ -n "$pids" ]; then
    echo "[INFO] 停止 port $port: $pids"
    kill -9 $pids 2>/dev/null || true
  fi
done

sleep 1

# 清理函数
cleanup() {
  echo ""
  echo "[INFO] 正在停止服务..."
  kill 0 2>/dev/null
  exit 0
}
trap cleanup SIGINT SIGTERM

# 启动
echo "[INFO] 重新启动服务..."
echo "[INFO] 启动后端 (port 3001)..."
(cd "$BACKEND_DIR" && pnpm dev) &
echo "[INFO] 启动前端 (port 5173)..."
(cd "$FRONTEND_DIR" && pnpm dev) &

echo ""
echo "============================="
echo "  前端: http://localhost:5173"
echo "  后端: http://localhost:3001"
echo "  按 Ctrl+C 停止所有服务"
echo "============================="

wait
