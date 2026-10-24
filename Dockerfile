FROM node:20-slim

# 说明：Chromium 运行所需的系统依赖由下面的 `playwright install --with-deps`
# 自动安装（它会匹配 Debian 的包名）。不要手写 apt 包列表，
# 否则容易用到 Ubuntu 专有包名（如 libasound2t64）导致构建失败。

WORKDIR /app

COPY package*.json ./
RUN npm ci

# 安装 Playwright Chromium + 所有系统依赖
RUN npx playwright install --with-deps chromium

COPY . .

# NEXT_PUBLIC_* 是「构建时」写入前端产物的变量，
# 必须在 build 之前注入，否则线上会退化成纯本地模式（没有登录）。
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL}
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=${NEXT_PUBLIC_SUPABASE_ANON_KEY}

RUN npm run build

ENV PORT=10000
EXPOSE 10000

CMD ["/bin/sh", "-c", "npx next start -p ${PORT:-10000}"]
