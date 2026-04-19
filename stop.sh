#!/bin/bash
# ChromaStudy 停止脚本

echo "============================="
echo "  ChromaStudy 停止服务"
echo "============================="

KILLED=0

# 按端口查找并终止进程
kill_port() {
  local port=$1
  local name=$2
  local pids=$(lsof -ti :$port 2>/dev/null || true)
  if [ -n "$pids" ]; then
    echo "[INFO] 停止${name}进程 (port $port): $pids"
    kill -9 $pids 2>/dev/null || true
    KILLED=1
  fi
}

kill_port 3001 "后端"
kill_port 5173 "前端"

if [ $KILLED -eq 0 ]; then
  echo "[INFO] 没有发现运行中的服务"
else
  echo "[INFO] 所有服务已停止"
fi
