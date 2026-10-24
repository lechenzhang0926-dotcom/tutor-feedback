#!/bin/bash
# ============================================================
# 在 VPS（Linux 服务器）上一键构建并启动本项目
#
# 用法（在项目根目录执行）：
#   bash scripts/deploy-vps.sh
#
# 前提：
#   1. 已安装 Docker
#   2. 项目根目录有 .env.local，且填写了 4 个变量
# ============================================================

set -e

# 切到项目根目录（本脚本所在目录的上一级）
cd "$(dirname "$0")/.."

APP_NAME="tutor-feedback"
HOST_PORT="${HOST_PORT:-80}"
CONTAINER_PORT=10000

echo "==> 检查环境"

if ! command -v docker >/dev/null 2>&1; then
  echo "错误：未安装 Docker。请先执行："
  echo "  curl -fsSL https://get.docker.com | sh"
  exit 1
fi

if [ ! -f .env.local ]; then
  echo "错误：找不到 .env.local"
  echo "请先复制 .env.local.example 为 .env.local，并填入真实值："
  echo "  cp .env.local.example .env.local && nano .env.local"
  exit 1
fi

# 载入 .env.local 里的变量
set -a
# shellcheck disable=SC1091
source .env.local
set +a

# 关键校验：这两个值如果为空，线上会退化成"无登录的本地模式"
if [ -z "$NEXT_PUBLIC_SUPABASE_URL" ] || [ -z "$NEXT_PUBLIC_SUPABASE_ANON_KEY" ]; then
  echo "错误：.env.local 里的 NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY 不能为空"
  exit 1
fi

echo "    Supabase: $NEXT_PUBLIC_SUPABASE_URL"
echo "    宿主机端口: $HOST_PORT -> 容器端口 $CONTAINER_PORT"

echo "==> 构建镜像（首次约 5-10 分钟，要下载 Chromium）"
# NEXT_PUBLIC_* 会在 next build 时被写死进前端代码，
# 所以必须作为 build-arg 传入，否则线上没有登录功能。
docker build \
  --build-arg NEXT_PUBLIC_SUPABASE_URL="$NEXT_PUBLIC_SUPABASE_URL" \
  --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY="$NEXT_PUBLIC_SUPABASE_ANON_KEY" \
  -t "$APP_NAME" .

echo "==> 停止并移除旧容器（如果存在）"
docker rm -f "$APP_NAME" >/dev/null 2>&1 || true

echo "==> 启动容器"
docker run -d \
  --name "$APP_NAME" \
  --restart unless-stopped \
  -p "$HOST_PORT:$CONTAINER_PORT" \
  -e PORT="$CONTAINER_PORT" \
  -e DEEPSEEK_API_KEY="$DEEPSEEK_API_KEY" \
  -e ANTHROPIC_API_KEY="$ANTHROPIC_API_KEY" \
  -e NEXT_PUBLIC_SUPABASE_URL="$NEXT_PUBLIC_SUPABASE_URL" \
  -e NEXT_PUBLIC_SUPABASE_ANON_KEY="$NEXT_PUBLIC_SUPABASE_ANON_KEY" \
  "$APP_NAME"

echo "==> 等待服务启动"
sleep 6

echo "==> 健康检查"
if curl -fsS -o /dev/null "http://127.0.0.1:$HOST_PORT"; then
  echo "✅ 部署成功"
  echo ""
  echo "访问地址： http://<你的服务器公网IP>$( [ "$HOST_PORT" = "80" ] || echo ":$HOST_PORT" )"
else
  echo "❌ 健康检查失败，最近日志："
  docker logs --tail 40 "$APP_NAME"
  exit 1
fi

echo ""
echo "常用命令："
echo "  查看日志   docker logs -f $APP_NAME"
echo "  重启       docker restart $APP_NAME"
echo "  停止       docker stop $APP_NAME"
