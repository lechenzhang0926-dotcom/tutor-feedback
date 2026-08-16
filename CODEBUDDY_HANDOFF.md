# 项目交接文档 — Tutor 课后反馈生成器

> 本文档面向接手本项目的 AI 编程助手（CodeBuddy Code），用于快速理解项目结构、运行方式与约定。
> 生成日期：2026-07-13。如有与代码实际状态不一致之处，以代码为准。

---

## 一、项目位置

- 绝对路径：`C:\Users\33696\Projects\tutor-feedback`
- 系统：Windows 11（用户主目录在 C 盘，桌面实际路径为 `D:\OneDrive\Desktop`）

---

## 二、技术栈与依赖

### 语言 / 框架 / 运行时

| 项 | 值 |
|---|---|
| 语言 | TypeScript 5.4（strict，无测试框架） |
| 框架 | Next.js 14.2.35（App Router，`app/` 目录） |
| UI 库 | React 18.3（`react` + `react-dom`） |
| 运行时 | Node.js（本机安装 v24.16.0；Dockerfile 用 node:20-slim；package-lock 要求 >= 10） |
| 包管理 | npm（package-lock.json，勿换 yarn/pnpm） |

### 主要依赖与用途

| 依赖 | 用途 |
|---|---|
| `next` | Web 框架（页面 + API 路由） |
| `@supabase/supabase-js` | **仅用于登录认证**（邮箱+密码），不存业务数据 |
| `playwright` | 服务端无头浏览器，用于把教学系统网页打印成 PDF |
| `adm-zip` | 生成 ZIP 压缩包（本地自动化功能） |
| `jszip` | ZIP 相关（前端/接口使用） |

### 开发依赖

| 依赖 | 用途 |
|---|---|
| `typescript` + `@types/*` | 类型检查（`npx tsc --noEmit`） |

> 说明：AI 能力通过 HTTP 直接调用（DeepSeek / Anthropic / 百度 OCR），没有对应 SDK 依赖。

---

## 三、目录结构

```
tutor-feedback/
├── app/                        # Next.js App Router
│   ├── page.tsx                # 唯一页面：登录 + 6 个 Tab 的主界面
│   ├── layout.tsx / globals.css # 全局布局与样式
│   ├── error.tsx / global-error.tsx / loading.tsx  # 错误边界与加载态
│   └── api/                    # 全部后端 API（服务端逻辑）
│       ├── generate-feedback/          # 旧版反馈生成（DeepSeek）
│       ├── generate-regular-feedback/  # 正课/抗遗忘反馈生成（含学生档案上下文）
│       ├── generate-homework-pdfs/     # 核心：链接 → Playwright 打印 → 生成 PDF（4 类链接并行）
│       ├── download-pdf/               # 按 session + 文件名从临时目录下载 PDF
│       ├── extract-student-name/       # 从链接页面 HTML 提取学生名字（多模式正则）
│       ├── meeting-time/               # 会议时间处理
│       ├── ocr-image/                  # 截图识别（Claude Vision / 百度 OCR）
│       └── local-automation/           # 本地自动化（连外部 Chromium 浏览器）
│           ├── browser/route.ts        # 打开/读取/点击外部浏览器、批量生成 PDF
│           └── get-page-info/          # 获取页面信息
├── components/                 # React 组件（全部客户端组件）
│   ├── AuthForm.tsx            # 登录/注册（Supabase）
│   ├── DashboardTab.tsx        # 仪表盘（统计）
│   ├── RegularFeedbackTab.tsx  # 课后反馈：截图 OCR + 生成反馈 + 选择学生
│   ├── RegularHomeworkTab.tsx  # 正课作业：4 个作业链接 + 下载 PDF + 生成群消息
│   ├── MeetingReminder.tsx     # 会议提醒：选学生自动填会议号 + 生成消息
│   ├── StudentProfilesTab.tsx  # 学生档案管理
│   ├── EnglishSystemGuide.tsx  # 本地自动化操作台（连外部浏览器）
│   ├── ExtensionImportListener.tsx  # 监听 Edge 插件发来的导入数据
│   ├── FeedbackForm/FeedbackOutput/HistoryList  # 旧版反馈流程组件
│   └── UserMenu.tsx            # 用户菜单（退出登录）
├── lib/                        # 工具库（客户端/服务端共享）
│   ├── supabaseClient.ts       # Supabase 客户端（仅 auth）
│   ├── storage.ts              # localStorage 封装：学生/历史/每日限额
│   ├── types.ts                # 共享类型 + 常量（如每日 50 次上限）
│   ├── studentMeetingIds.ts    # ★ 学生名 → 腾讯会议号 硬编码映射表
│   ├── studentProfileUtils.ts  # 学生档案自动积累（常忘词/优点提取）
│   ├── homeworkUtils.ts        # 作业链接解析（page / pdf-direct 模式）
│   ├── homeworkMessage.ts      # 作业群消息模板
│   ├── prompts.ts              # AI 提示词（反馈生成）
│   ├── deepseek.ts             # DeepSeek API 调用（仅服务端）
│   ├── claudeVision.ts         # Claude Vision 截图理解
│   ├── baiduOcr.ts             # 百度 OCR（每月 1000 次免费）
│   ├── playwrightBrowser.ts    # 连接外部 Chromium 浏览器（CDP）
│   ├── dashboardUtils.ts       # 仪表盘统计（localStorage）
│   ├── beijingTime.ts          # 北京时间工具
│   ├── apiRules.ts             # 英语系统 API 规则管理（localStorage）
│   └── clickMemory.ts          # 点击行为记忆
├── extension/                  # ★ Edge 插件「Tutor 课后反馈助手」：读取智能英语系统页面 → 发送到本应用
├── pdf-downloader-extension/   # ★ 独立 Edge 插件「PDF 批量下载器」：批量下载页面 PDF（与本应用无关）
├── public/                     # 静态资源（images）
├── scripts/                    # 空目录（预留）
├── .local-browser-profile/     # Playwright 连接外部浏览器用的用户配置目录
├── .env.local                  # ★ 环境变量（含密钥，已 gitignore）
├── .env.local.example          # 环境变量模板
├── ecosystem.config.js         # pm2 生产进程配置（name: tutor, port 3000）
├── start.bat                   # 双击启动开发服务器（自动装依赖、检查 .env）
├── update.bat                  # 双击更新（git pull + npm install）
├── Dockerfile                  # 部署镜像（内部端口 10000）
├── next.config.mjs             # 空配置
└── tsconfig.json               # TS 配置（@/ → 根目录别名）
```

> 注意：项目根目录**没有** CLAUDE.md / AGENTS.md / README.md / .cursorrules，所有约定以本文档为准。

---

## 四、启动与构建

| 操作 | 命令 | 说明 |
|---|---|---|
| 开发模式 | `npm run dev` | 默认 http://localhost:3000 |
| 类型检查 | `npx tsc --noEmit` | 修改后建议先跑，零输出 = 通过 |
| 生产构建 | `npm run build` | 必须成功才能跑生产模式 |
| 生产运行 | `npm start` | 依赖 `.next` 构建产物 |
| 测试 | 无 | 项目**没有**任何测试框架和测试用例 |

### 当前实际的运行方式（重要）

生产环境用 **pm2** 托管（已配置开机自启）：

```powershell
pm2 status                 # 查看状态（app 名 tutor）
pm2 restart tutor          # 改完代码 + build 后重启
pm2 logs tutor             # 查看日志
pm2 stop tutor             # 停止
```

**改代码后的标准流程：** `npx tsc --noEmit` → `npm run build` → `pm2 restart tutor`

### 坑：`.next` 目录丢失

`next start` 找不到 `.next` 时进程会反复崩溃重启（pm2 里状态变 `errored`）。修复：`pm2 stop tutor` → `npm run build` → `pm2 restart tutor`。

### 端口冲突

端口 3000 被其他进程占用时（如残留的 `next dev`），pm2 会崩溃。排查：`Get-NetTCPConnection -LocalPort 3000` 找到占用进程 PID 后 `Stop-Process -Id <PID> -Force`，再重启 pm2。

---

## 五、配置与运行环境

### 环境变量（`.env.local`，已 gitignore，模板见 `.env.local.example`）

| 变量 | 必须？ | 用途 |
|---|---|---|
| `DEEPSEEK_API_KEY` | 是 | 反馈生成调用 DeepSeek API |
| `ANTHROPIC_API_KEY` | 是 | 截图 OCR（Claude Vision） |
| `NEXT_PUBLIC_SUPABASE_URL` | 是 | 登录认证（浏览器直连 Supabase） |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 是 | 登录认证（publishable key） |

> ⚠️ 不得把真实密钥写入任何会提交到 git 的文件。`.env.local` 已在 .gitignore 中。

### 外部依赖服务

| 服务 | 说明 | 注意事项 |
|---|---|---|
| Supabase | 仅做邮箱密码登录 | **免费版 1 周不活跃会被暂停/删除**。已发生过一次项目被删、换新项目的事件（新 URL 在 .env.local）。若登录报 "Failed to fetch" 先查 Supabase 项目是否存活 |
| 智能英语系统 | `https://test.hzdmsyy.com` | 本应用的业务数据来源（销课记录、打印页），服务器可直接访问（无鉴权） |
| 百度 OCR | 备用 OCR | 有每月 1000 次免费额度 |

### 本地手动准备的环境

- **pm2 全局安装**（`npm install -g pm2`）+ 开机自启脚本位于 Windows 启动文件夹 `pm2-tutor.bat`（内容 `pm2 resurrect`，已在 PATH 中追加 `%APPDATA%\npm`）
- **Playwright Chromium**：首次使用 PDF 功能需 `npx playwright install chromium`
- **本地自动化 Tab** 需要用户手动以调试端口启动外部 Chromium（见「约定与注意事项」）

---

## 六、数据与存储

| 数据 | 位置 | 说明 |
|---|---|---|
| 学生档案、反馈历史、每日生成次数、草稿 | **浏览器 localStorage** | `lib/storage.ts` 封装，键前缀 `tutor_*`；换浏览器/清缓存会丢 |
| 登录会话 | Supabase（auth） | 业务数据不存 Supabase |
| 学生→会议号映射 | 代码硬编码 `lib/studentMeetingIds.ts` | 19 个学生，新增学生会议号改这里 |
| API 规则（本地自动化） | localStorage（`english_system_api_rules`） | |
| 生成的 PDF 临时文件 | 系统临时目录 `%TMP%\tutor-pdfs\<sessionId>` | 10 分钟后自动清理 |
| 点击记忆 | localStorage（`lib/clickMemory.ts`） | |

---

## 七、核心功能与路由

### 页面（单页应用，Tab 切换）

`app/page.tsx` 登录后显示 6 个 Tab：

| Tab | 功能 |
|---|---|
| Dashboard | 使用统计（生成次数、会议数、学生活跃度） |
| 课后反馈 | 上传/粘贴报告截图 → OCR → AI 生成反馈 → 复制；选学生自动归档并积累档案 |
| 正课作业 | 4 个作业链接（link1 打印页/PDF 直链、link2 抗遗忘、link3 极简造句、link4 句式）→ 一键下载全部 PDF；生成作业群消息 |
| 会议提醒 | 选学生 **自动填会议号**（查 `studentMeetingIds.ts`）→ 填时间 → 生成群消息 |
| 学生档案 | 管理学生、查看自动积累的常忘词/优点/反馈历史 |
| 本地自动化 | 连接外部 Chromium，读取/点击英语系统页面，批量生成 PDF（试验性） |

### API 端点

| 端点 | 方法 | 作用 |
|---|---|---|
| `/api/generate-feedback` | POST | 旧版反馈生成（DeepSeek） |
| `/api/generate-regular-feedback` | POST | 正课/抗遗忘反馈生成，带学生档案上下文 |
| `/api/generate-homework-pdfs` | POST | ★ 核心：接收 studentName/date/link1~4 → Playwright 打开页面点打印按钮 → 生成 PDF 到临时目录，返回文件列表。**已做并行优化**：link1 同页面一次生成 4 个版本（中英文/英文/中文/音标），link2/3/4 独立并行 |
| `/api/download-pdf` | GET | `?session=xxx&name=文件名` 下载临时 PDF |
| `/api/extract-student-name` | POST | 从链接页面 HTML 提取学生名（正则多模式，重点支持「学员姓名」标签、中英文名） |
| `/api/meeting-time` | POST | 会议时间格式化 |
| `/api/ocr-image` | POST | 截图 OCR（Claude Vision，备用百度 OCR） |
| `/api/local-automation/browser` | GET/POST | 本地自动化：open/read/click/click-auto/generate-pdfs/monitor 等动作 |
| `/api/local-automation/get-page-info` | GET/POST | 页面信息读取 |

### 学生名字提取（易踩坑）

`/api/extract-student-name` 的提取逻辑有大量模式匹配：
- 标签「学员姓名」**不带冒号**直接跟名字（如 `学员姓名 Lucky2878` / `学员姓名 晶晶6866`），名字尾部可能带数字，需剥离
- 中文无姓氏名（如「晶晶」）只有从强标签（学员姓名/学生：）匹配时才被接受（`strong` 参数）
- 黑名单 `CHINESE_NOT_NAMES` 里硬编码排除了老师名「罗语欣」——**不要删**，否则会误识别

---

## 八、约定与注意事项

### 项目内规范文件

- CLAUDE.md / AGENTS.md / README.md / .cursorrules：**均不存在**（「无」）
- `.claude/settings.local.json`：仅 Claude Code 本地权限配置，与业务无关

### 关键约定（从代码中提炼）

1. **密钥只存在于服务端文件**：`lib/deepseek.ts` 头部注释明确「客户端代码绝不引用此文件」
2. **业务数据全在 localStorage**：`lib/storage.ts` 是唯一存储入口，不要引入新存储方式
3. **每日限额**：`MAX_DAILY_GENERATIONS = 50`（`lib/types.ts`）
4. **文件名格式**：`学生名-MMDD-类型.pdf`（如 `文茜-0712-例句.pdf`），日期用北京时间（`lib/beijingTime.ts`）
5. **插件导入协议**：Edge 插件（`extension/`）通过 `postMessage` / `chrome.runtime` 向本应用导入数据，`components/ExtensionImportListener.tsx` 负责接收；新增插件交互要保证 `test.hzdmsyy.com` 与 `localhost:3000` 的 host_permissions
6. `pdf-downloader-extension/` 是**独立产品**（Edge 批量下载 PDF 插件），与本应用无代码依赖，改动它不影响本应用

### 已知问题 / 未完成 / TODO

| 事项 | 说明 |
|---|---|
| 本地自动化 Tab | 试验性功能，需要用户手动开外部 Chromium（调试端口），流程依赖 `lib/playwrightBrowser.ts` 的 CDP 连接 |
| 学生名字提取 | 靠大量正则 + 白/黑名单，新页面结构可能失配；出现「提取错名/提取不到」时优先排查此 API |
| 每日限额 | 硬编码 50 次，无服务端校验，清 localStorage 可绕过（已知但未修） |
| 无测试 | 全项目无自动化测试，改动核心逻辑需手动回归 |

### 其他易踩坑

- **pm2 与 dev 模式不能共存**：都占 3000 端口
- **改了 .env.local 必须重新 build**，pm2 才会读到新值
- **Supabase 免费项目**休眠是常态，登录突然全挂先查 Supabase 控制台
- Windows 下 PowerShell 5.1 无 `&&`/`??` 语法；bash 工具与 PowerShell 工具语法不同，注意区分
- Playwright 启动有约 2~5 秒开销，PDF 接口天然慢，前端有 loading 态，不要「优化」成同步等待

---

## 九、版本状态

- **Git 仓库**：是。远程 `origin` = `https://github.com/lechenzhang0926-dotcom/tutor-feedback.git`
- **当前分支**：`master`（无其他分支）
- **最近一次提交**：`e04c858` — "Add Import Assistant + English System Guide: paste report, auto-fill, page config"
- **未提交改动**：大量（约 25+ 个文件），包括：
  - 新增：`app/api/extract-student-name/`、`app/api/local-automation/`、`lib/studentMeetingIds.ts`、`lib/playwrightBrowser.ts`、`lib/apiRules.ts`、`lib/beijingTime.ts`、`lib/clickMemory.ts`、`ecosystem.config.js`、`extension/`（Edge 插件）、`pdf-downloader-extension/`（PDF 下载插件）、error/loading 页面
  - 修改：`generate-homework-pdfs`（link4 + 并行优化）、`MeetingReminder`（会议号自动填充）、`RegularFeedbackTab` / `RegularHomeworkTab` 等
  - 删除：`components/ImportAssistantTab.tsx`、`lib/importParser.ts`
- **最近功能进展**（未提交，比 git 历史新）：作业 link4 句式打印（例句/题目/解析）、PDF 下载提速、学生名字提取修复（学员姓名标签/晶晶案例）、Supabase 项目更换、pm2 生产部署

> 建议：接手下一次迭代时，先让用户确认是否要把当前未提交改动 commit，避免历史丢失。
