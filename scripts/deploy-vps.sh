#!/bin/bash
# ============================================================
# 在 VPS（Linux 服务器）上构建并启动本项目
#
# 两种用法：
#
#   【方式一】正式上线（推荐）：域名 + 自动 HTTPS
#     DOMAIN=yourdomain.cn bash scripts/deploy-vps.sh
#     → 容器只监听 127.0.0.1:10000，由 Caddy 反代并自动申请证书
#
#   【方式二】临时测试：直接 IP 访问
#     bash scripts/deploy-vps.sh
#     → 容器监听 80 端口（注意：此模式下浏览器剪贴板功能不可用）
#
# 前提：已安装 Docker；项目根目录有 .env.local 并填好 4 个变量
# ============================================================

set -e

cd "$(dirname "$0")/.."

APP_NAME="tutor-feedback"
CONTAINER_PORT=10000
DOMAIN="${DOMAIN:-}"
HOST_PORT="${HOST_PORT:-80}"

echo "==> 检查环境"

if ! command -v docker >/dev/null 2>&1; then
  echo "错误：未安装 Docker。请先执行："
  echo "  curl -fsSL https://get.docker.com | sh"
  exit 1
fi

if [ ! -f .env.local ]; then
  echo "错误：找不到 .env.local"
  echo "请先创建：cp .env.local.example .env.local && nano .env.local"
  exit 1
fi

set -a
# shellcheck disable=SC1091
source .env.local
set +a

if [ -z "$NEXT_PUBLIC_SUPABASE_URL" ] || [ -z "$NEXT_PUBLIC_SUPABASE_ANON_KEY" ]; then
  echo "错误：.env.local 里的 NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY 不能为空"
  exit 1
fi

echo "    Supabase: $NEXT_PUBLIC_SUPABASE_URL"
if [ -n "$DOMAIN" ]; then
  echo "    模式: 域名 + 自动 HTTPS ($DOMAIN)"
else
  echo "    模式: IP 直接访问（端口 $HOST_PORT）"
fi

echo "==> 构建镜像（首次约 5-10 分钟，需下载 Chromium）"
# NEXT_PUBLIC_* 在 next build 时被写死进前端产物，必须作为 build-arg 传入，
# 否则线上会退化成"无登录的纯本地模式"。
docker build \
  --build-arg NEXT_PUBLIC_SUPABASE_URL="$NEXT_PUBLIC_SUPABASE_URL" \
  --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY="$NEXT_PUBLIC_SUPABASE_ANON_KEY" \
  -t "$APP_NAME" .

echo "==> 停止并移除旧容器（如果存在）"
docker rm -f "$APP_NAME" >/dev/null 2>&1 || true

# 运行期变量：备案号用普通 env 传（服务端读取，改完重启即可生效）
RUNTIME_ENV=(
  -e "PORT=$CONTAINER_PORT"
  -e "DEEPSEEK_API_KEY=$DEEPSEEK_API_KEY"
  -e "ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY"
  -e "NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL"
  -e "NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY"
)
[ -n "$ICP_BEIAN" ]        && RUNTIME_ENV+=(-e "ICP_BEIAN=$ICP_BEIAN")
[ -n "$GONGAN_BEIAN" ]     && RUNTIME_ENV+=(-e "GONGAN_BEIAN=$GONGAN_BEIAN")
[ -n "$GONGAN_CODE" ]      && RUNTIME_ENV+=(-e "GONGAN_CODE=$GONGAN_CODE")

if [ -n "$DOMAIN" ]; then
  # ---------- 域名模式：容器只监听本机，Caddy 对外 ----------
  PUBLISH="127.0.0.1:$CONTAINER_PORT:$CONTAINER_PORT"

  if ! command -v caddy >/dev/null 2>&1; then
    echo "==> 安装 Caddy（用于自动 HTTPS）"
    apt-get update -qq
    apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https curl gnupg >/dev/null
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
      | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
      > /etc/apt/sources.list.d/caddy-stable.list
    apt-get update -qq
    apt-get install -y -qq caddy >/dev/null
  fi

  echo "==> 写入 Caddy 配置（$DOMAIN）"
  cat > /etc/caddy/Caddyfile <<EOF
$DOMAIN, www.$DOMAIN {
    reverse_proxy 127.0.0.1:$CONTAINER_PORT
    encode gzip
}
EOF

  systemctl enable caddy >/dev/null 2>&1 || true
  systemctl restart caddy
else
  # ---------- IP 模式：直接对外映射端口 ----------
  PUBLISH="$HOST_PORT:$CONTAINER_PORT"
fi

echo "==> 启动容器"
docker run -d \
  --name "$APP_NAME" \
  --restart unless-stopped \
  -p "$PUBLISH" \
  "${RUNTIME_ENV[@]}" \
  "$APP_NAME"

echo "==> 等待服务启动"
sleep 6

echo "==> 健康检查"
CHECK_URL="http://127.0.0.1:$CONTAINER_PORT"
if curl -fsS -o /dev/null "$CHECK_URL"; then
  echo "✅ 部署成功"
  echo ""
  if [ -n "$DOMAIN" ]; then
    echo "访问地址： https://$DOMAIN"
    echo "（首次访问证书可能还在申请中，等 30 秒再刷新）"
  else
    echo "访问地址： http://<服务器公网IP>$( [ "$HOST_PORT" = "80" ] || echo ":$HOST_PORT" )"
    echo ""
    echo "⚠️  注意：IP 模式下浏览器会禁用剪贴板 API，"
    echo "    「复制反馈」「粘贴作业链接」功能会失效。正式使用请配域名走 HTTPS。"
  fi
else
  echo "❌ 健康检查失败，最近日志："
  docker logs --tail 40 "$APP_NAME"
  exit 1
fi

echo ""
echo "常用命令："
echo "  查看容器日志   docker logs -f $APP_NAME"
echo "  查看 Caddy 日志 tail -f /var/log/caddy/*.log 2>/dev/null"
echo "  重启应用       docker restart $APP_NAME"
echo "  重新部署       DOMAIN=$DOMAIN bash scripts/deploy-vps.sh"
