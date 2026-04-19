#!/bin/bash
# ChromaStudy 快捷启动脚本

set -e

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
FRONTEND_DIR="$PROJECT_DIR/frontend"
BACKEND_DIR="$PROJECT_DIR/backend"

echo "============================="
echo "  ChromaStudy Dev Server"
echo "============================="

# 检查依赖
if ! command -v pnpm &>/dev/null; then
  echo "[ERROR] pnpm 未安装，请先运行: npm install -g pnpm"
  exit 1
fi

# 安装依赖（首次或 lock 文件变更时）
install_if_needed() {
  local dir=$1
  if [ ! -d "$dir/node_modules" ]; then
    echo "[INFO] 安装 $dir 依赖..."
    (cd "$dir" && pnpm install)
  fi
}

install_if_needed "$BACKEND_DIR"
install_if_needed "$FRONTEND_DIR"

# 数据库迁移
echo "[INFO] 检查数据库迁移..."
(cd "$BACKEND_DIR" && npx prisma migrate deploy 2>/dev/null || true)

# 清理函数
cleanup() {
  echo ""
  echo "[INFO] 正在停止服务..."
  kill 0 2>/dev/null
  exit 0
}
trap cleanup SIGINT SIGTERM

# 启动后端
echo "[INFO] 启动后端 (port 3001)..."
(cd "$BACKEND_DIR" && pnpm dev) &
BACKEND_PID=$!

# 启动前端
echo "[INFO] 启动前端 (port 5173)..."
(cd "$FRONTEND_DIR" && pnpm dev) &
FRONTEND_PID=$!

echo ""
echo "============================="
echo "  前端: http://localhost:5173"
echo "  后端: http://localhost:3001"
echo "  按 Ctrl+C 停止所有服务"
echo "============================="

wait
