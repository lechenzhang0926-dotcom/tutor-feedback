# 多人网站：Supabase + 部署 设置指南（白话）

> 目标：把"Tutor 课后反馈生成器"从「你本机自用」升级成「登录后每人独立数据、可部署到网上」。
> 代码改造已完成：本地模式（不配云端）照常可用；配了 Supabase 就自动启用登录 + 云端同步。

---

## 你已经有的

项目根目录的 `.env.local` 里**已经有 Supabase 的 URL 和 anon key**（你之前建过 Supabase 项目）。
所以代码层面"登录 + 每人独立数据"已经接通了。还差两件事才能真正用上云端：

1. **给 Supabase 项目建表 + 权限**（只做一次）。
2. **把网站部署到网上**（Railway / 小 VPS 等），并填好环境变量。

---

## 第一步：在 Supabase 建表（一次性）

1. 打开你的 Supabase 项目（就是你 `.env.local` 里那个 `rudqbtocugrpbsdsdswl.supabase.co`）。
2. 左侧菜单 → **SQL Editor** → **New query**。
3. 把本项目 `supabase/schema.sql` 的**全部内容**粘贴进去，点 **Run**。
   - 它会建 3 张表：`students`（学生档案）、`feedback_history`（反馈历史）、`daily_usage`（每日限流）。
   - 并开启 RLS 行级权限，保证**每个账号只能看到自己的数据**。

> 不跑这步也能本地用（会走本地缓存、云端同步静默失败）；但要让数据真正存到云端、多人隔离，必须跑。

### 一个小设置（自用更顺手）

Supabase 默认"注册要邮箱确认"。你自己用可以关掉：
**Authentication → Providers → Email** 里把 **Confirm email** 关掉（或注册后点邮件里的确认链接也行）。

---

## 第二步：部署到网上

推荐 **Railway**（零运维，连 GitHub 自动构建 Docker 跑起来）：

1. 把本项目推到 GitHub（私有仓库即可）。
2. 打开 [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub repo** → 选这个仓库。
3. Railway 会自动读 `Dockerfile` 构建（`next start`，端口用 `${PORT:-10000}`）。
4. 在 Railway 项目的 **Variables** 里填入环境变量（和本地 `.env.local` 对应）：
   - `NEXT_PUBLIC_SUPABASE_URL` = 你的 Supabase URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = 你的 anon key
   - `DEEPSEEK_API_KEY` = 你的 DeepSeek key
   - `ANTHROPIC_API_KEY` = 你的 Anthropic key
5. 部署完成后，Railway 会给一个 `*.up.railway.app` 的网址，谁都能打开。
6. 打开网址 → 注册一个账号 → 登录即可使用。你（和以后注册的人）各自数据独立。

> 想更便宜/完全自控，也可以租一台小 VPS（¥30–40/月），把仓库 clone 下来 `docker build` + `docker run -p 80:10000` 即可，环境变量同样填。

---

## 关于你本机已有的学生档案（数据迁移）

- **本地开发（你本机）**：浏览器里原来的学生档案还在 localStorage，照常能用。
- **首次登录云端时**：如果云端是空的、但你浏览器里有档案，系统会**自动把本机数据上传到云端**（一次性迁移）；之后以云端为准。
- 如果云端已经有数据，则登录后拉取云端数据覆盖本机（避免两个人同一浏览器串数据，登出时会清空本机缓存）。

---

## 本地开发 / 纯本地模式

- 本地 `.env.local` 已配置 Supabase → 启动后要求登录，数据走云端。
- 想临时退回"纯本机、不登录、数据只存浏览器"？把 `.env.local` 里两个 `NEXT_PUBLIC_SUPABASE_*` 留空即可——应用会自动跳过登录、走本地模式。
