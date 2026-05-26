FROM node:20-slim

# 安装 Playwright 所需的 Chromium 依赖
RUN apt-get update && apt-get install -y \
  libnss3 libnspr4 libatk-bridge2.0-0 libdrm2 libatk1.0-0 libcups2 \
  libxkbcommon0 libxcomposite1 libxdamage1 libxrandr2 libgbm1 \
  libpango-1.0-0 libcairo2 libasound2t64 \
  --no-install-recommends && \
  rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci

# 安装 Playwright Chromium 到系统路径
RUN npx playwright install --with-deps chromium

COPY . .

RUN npm run build

ENV PORT=10000
EXPOSE 10000

CMD ["npx", "next", "start", "-p", "10000"]
