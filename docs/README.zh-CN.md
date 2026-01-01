# ChromaStudy 项目说明文档

> 适用对象：项目使用者与开发者（偏移动端/PWA 场景）  
> 文档目的：说明项目能力、模块划分、安装部署、使用方式与配置项  
> 代码基线：以仓库当前实现为准；`DESIGN_SPEC.md`/`DEVELOPMENT_PLAN.md` 中包含部分“规划/草案”内容，不代表已全部落地

---

## 目录

1. [项目概述](#1-项目概述)
2. [功能模块说明](#2-功能模块说明)
3. [后端 API 说明](#3-后端-api-说明)
4. [数据模型与存储](#4-数据模型与存储)
5. [安装与部署](#5-安装与部署)
6. [使用方法与操作指南](#6-使用方法与操作指南)
7. [配置说明](#7-配置说明)
8. [常见问题（FAQ）](#8-常见问题faq)
9. [项目结构说明](#9-项目结构说明)

---

## 1. 项目概述

**ChromaStudy** 是一个移动端优先（Mobile-First）的学习打卡 + 复盘应用，集成 AI 能力（本地 Ollama / 云端 OpenAI 兼容接口），并提供离线缓存、待同步队列与 PWA 能力。

### 1.1 主要特性（当前实现）

- **学习打卡（StudyLog）**：按天记录学习时长与学习内容（笔记），支持覆盖/累计两种写入模式。
- **AI 点评**：打卡后异步生成 AI 点评；也支持手动重新生成。
- **任务管理（Task）**：任务创建/编辑/删除/完成；支持计划日期、截止时间、标签、分类、优先级。
- **重复任务与任务实例（Task Occurrence）**：基于 RRULE 生成指定日期范围内的任务实例，并支持对单次实例进行覆盖（改期/取消/完成状态等）。
- **提醒与通知（Web Push）**：任务可配置提醒时间（HH:mm 列表），后端基于 Cron 定时派发；前端通过 Service Worker 接收 push 并弹通知（需配置 VAPID）。
- **日历热力图（Calendar）**：按学习时长渲染热力图，并可查看某日记录与任务完成情况。
- **统计（Stats）**：周目标（默认 300 分钟/周）、周进度、连续打卡 streak、本月概览；支持 AI 生成周报/月报。
- **AI 学习伙伴（Mate/Chat）**：SSE 流式对话（后端 `/api/chat`），前端支持 Markdown 渲染。
- **专注计时（Focus Timer）**：25/5 番茄钟；完成后可一键累计 25 分钟到当日打卡，并可选择是否生成点评。
- **复盘问题（AI Review）**：对某日学习内容生成复盘问题（目前本地保存，不写入数据库）。
- **答题复习（Flashcards + SRS）**：从某日学习内容生成题卡（后端 AI），本地题库与 SM-2（简化版）间隔重复调度，复习耗时会计入学习时长。
- **离线与同步队列**：网络失败时写入本地缓存并入队；恢复网络后可一键同步；设置页支持查看/编辑/丢弃队列操作。
- **本地数据导出/导入**：导出包含任务/缓存/复盘/题卡/设置/待同步队列；默认不导出云端 API Key，并在导出时自动清理相关敏感字段。

### 1.2 技术栈

- **前端**：Vite + React 18 + React Router + Ant Design Mobile + Tailwind CSS
- **后端**：Node.js + Express + Prisma ORM
- **数据库**：SQLite（默认文件：`backend/dev.db`）
- **AI**：
  - 本地：Ollama（HTTP API）
  - 云端：OpenAI 兼容接口（后端转发；前端在设置页配置 baseUrl/model/apiKey）
- **PWA**：Web App Manifest + Service Worker（缓存壳 + Push 通知）

---

## 2. 功能模块说明

### 2.1 认证与用户（JWT）

- 前端提供独立路由：
  - `/login`：登录
  - `/register`：注册
- 后端采用 **Access Token + Refresh Token**：
  - `accessToken`：前端以 `Authorization: Bearer <token>` 调用受保护接口
  - `refreshToken`：`401` 时自动刷新（axios 拦截器）；Chat SSE 场景额外做了 refresh 逻辑
- 相关实现：
  - 前端：`frontend/src/utils/authStorage.js`、`frontend/src/services/api.js`
  - 后端：`backend/server.js`（`/api/register`、`/api/login`、`/api/refresh`、`/api/logout`、`/api/me`）

### 2.2 学习打卡（StudyLog）与 AI 点评

- 今日打卡支持：
  - **覆盖（replace）**：直接覆盖当日的时长与内容
  - **累计（increment）**：在既有基础上追加时长、拼接内容（常用于番茄钟/复习累计）
- AI 点评：
  - 打卡接口返回后，后端异步生成 `aiFeedback` 并写回
  - 前端在 Today/DayDetail/Focus 页面实现轮询刷新（看到 `aiFeedback === null` 时每 2s 轮询，最多约 24s）

### 2.3 任务系统（Task）与任务实例（Occurrence）

任务支持字段（数据库层面）：

- `title`、`description`、`isDone`
- `plannedDate`（YYYY-MM-DD）
- `dueTime`（HH:mm）
- `priority`、`category`
- `labels`（JSON 字符串，前端以逗号输入并转数组/序列化）
- 重复任务：`repeatRule`（RRULE 字符串）、`repeatStartDate`、`repeatTimeZone`
- 提醒：`reminderTimes`（JSON 字符串，HH:mm 数组）

任务实例（Occurrence）：

- 后端通过 `/api/task-occurrences?start=...&end=...` 生成日期范围内的“任务实例列表”
- 对重复任务的某一次实例，可通过 `/api/task-occurrences`（PATCH）写入覆盖记录（`TaskOccurrenceOverride`）：
  - 单次改期（overrideDate）
  - 单次取消/完成状态
  - 单次标题/描述/标签等字段覆盖

### 2.4 提醒与通知（Web Push）

- 前端：PWA `sw.js` 监听 `push` 事件并展示通知；点击通知跳回应用。
- 后端：
  - 存储订阅：`PushSubscription` 表（按 userId）
  - 生成待派发提醒：`TaskReminderInstance` 表
  - Cron 定时：
    - 每分钟检查到期提醒并派发（需要配置 VAPID）
    - 每天 00:10 刷新未来一段时间的提醒实例
    - 每天 00:20 清理历史完成/发送记录
- 注意：Web Push 在多数浏览器要求 **HTTPS**（本地可用 `localhost` 例外），且需要正确配置 VAPID。

### 2.5 日历（Calendar）与日详情（DayDetail）

- Calendar：按学习时长渲染当月热力图；点击日期弹层展示：
  - 当天学习内容与是否已有 AI 点评
  - 当天任务实例完成情况（调用 `/api/task-occurrences` 获取单日实例）
  - 一键跳转到 DayDetail 进行补记/编辑
- DayDetail：展示并支持编辑某日学习记录；支持：
  - 生成/刷新 AI 点评
  - 生成 AI 复盘问题（本地保存）
  - 跳转到题卡生成/复习页

### 2.6 统计（Stats）与周目标

- 周目标：默认 `300` 分钟/周（本地存储，按 userId 区分）
- Stats 页面包含：
  - 本周 7 天柱状图
  - 周目标进度
  - streak（连续天数）
  - 本月汇总（总分钟/活跃天/日均/最佳日）
  - AI 周报/月报（调用 `/api/ai/report`）

### 2.7 AI 学习伙伴（Mate/Chat）

- 前端使用 `fetch` 直连 SSE（`/api/chat`），并对输出做 Markdown 渲染（`react-markdown` + `remark-gfm`）。
- 后端支持：
  - Ollama：转发到 `OLLAMA_HOST`（默认 `http://localhost:11434`）
  - OpenAI 兼容：转发到 `baseUrl`（前端设置项）
- SSE 数据格式：后端每次写出形如 `data: {"content":"..."}\n\n`，结束会发 `event: done`。

### 2.8 AI 任务拆解（decompose）

在 Today 页可输入目标，调用 `/api/ai/tasks/decompose` 生成 5~10 个可执行子任务（严格 JSON），再批量加入任务列表。

### 2.9 AI 复盘（review questions）

DayDetail 可调用 `/api/ai/review` 基于当天学习内容生成 3 个复盘问题（严格 JSON），并在本地 `localStorage` 保存用户回答（当前版本不写入数据库）。

### 2.10 答题复习（Flashcards + SM-2）

- 题卡生成：后端 `/api/ai/flashcards` 基于某日学习内容生成题卡 JSON（默认 5 张，上限 20）。
- 本地题库：按 `userId` 存在 `localStorage` 中（`chroma_review_cards_v1_<userId>`）。
- 调度算法：SM-2 简化版（Again/Hard/Good/Easy），实现见 `frontend/src/utils/flashcards.js`。
- 复习耗时计入学习时长：Review 页面在完成复习会话后，会调用 `checkin(mode=increment)` 将耗时折算分钟数写入当天记录。

### 2.11 离线缓存与待同步队列

为保证弱网体验，前端实现了：

- **缓存（cache）**：
  - 打卡缓存：`chroma_cache_studyLogs_<userId>`
  - 任务缓存：`chroma_cache_tasks_<userId>`
- **队列（sync queue）**：`chroma_sync_queue_v1`
  - 网络错误时将操作入队：`checkin`、`task_create`、`task_update`、`task_delete`
  - `Settings` 页可查看队列、查看详情、编辑 payload、丢弃单条/清空队列、调整顺序（将阻塞项移到末尾）
  - `App` 顶部提供“同步”入口：调用 `syncPendingOps` 逐条回放队列并更新缓存

### 2.12 数据导出/导入（备份）

- Settings 页支持导出/导入 JSON：
  - 导出包含：任务、打卡缓存、复盘、题卡、本地设置、待同步队列
  - **默认不导出云端 API Key**：导出时会将 `openai.apiKey` 置空，并清理队列中携带的 `payload.ai.openai.apiKey`
  - 导入支持按模块勾选（AI 配置/周目标/任务顺序/缓存/复盘/题卡/待同步队列）
  - 若备份账号与当前账号不一致，导入“待同步队列”会触发额外确认（避免误同步到其他账号）

### 2.13 PWA（Manifest + Service Worker）

- `frontend/public/manifest.webmanifest`：PWA 元信息与图标
- `frontend/public/sw.js`：
  - 缓存壳资源（`index.html`、图标等）
  - 对同源 GET 请求进行缓存兜底（排除 `/api/` 与 Vite dev 模块路径）
  - 支持 push 事件通知展示与点击跳转

---

## 3. 后端 API 说明

> 默认后端监听：`http://localhost:3001`  
> 受保护接口要求请求头：`Authorization: Bearer <accessToken>`

### 3.1 认证（Public）

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/register` | 注册并返回 `user/accessToken/refreshToken` |
| POST | `/api/login` | 登录并返回 `user/accessToken/refreshToken` |
| POST | `/api/refresh` | 使用 refreshToken 轮换刷新 |
| POST | `/api/logout` | 撤销 refreshToken（可选传入） |
| GET | `/api/health` | 健康检查 |

### 3.2 用户（Auth）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/me` | 获取当前登录用户（从 token 解析） |

### 3.3 学习记录（Auth）

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/checkin` | 写入/更新当日 StudyLog，支持 `mode=replace/increment`，可选异步生成点评 |
| GET | `/api/study-logs` | 获取 StudyLog 列表（可选 `from/to`） |
| GET | `/api/study-logs/:date` | 获取指定日期的 StudyLog |
| POST | `/api/study-logs/:date/ai-feedback` | 重新生成并更新该日 AI 点评 |

### 3.4 任务（Auth）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/tasks` | 获取任务列表（原始 Task 记录） |
| POST | `/api/tasks` | 创建任务（支持重复与提醒字段） |
| PATCH | `/api/tasks/:id` | 更新任务字段（含 `isDone`） |
| DELETE | `/api/tasks/:id` | 删除任务 |
| GET | `/api/task-occurrences` | 获取日期范围内任务实例（含重复任务展开与覆盖） |
| PATCH | `/api/task-occurrences` | 更新某个重复任务实例（覆盖/改期/取消/完成等） |

### 3.5 Push 通知（Auth/部分 Public）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/push/vapid-public-key` | 获取 VAPID 公钥（用于前端订阅） |
| POST | `/api/push/subscribe` | 上报 PushSubscription（入库/更新） |
| POST | `/api/push/unsubscribe` | 取消订阅（按 endpoint 删除） |

### 3.6 AI 能力（Auth）

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/ai/ping` | 测试当前 AI 配置连通性 |
| POST | `/api/ai/models` | 列出 OpenAI 兼容接口模型列表（带缓存与搜索） |
| POST | `/api/ai/tasks/decompose` | 目标拆解为任务列表（严格 JSON） |
| POST | `/api/ai/review` | 基于某日学习内容生成复盘问题（严格 JSON） |
| POST | `/api/ai/flashcards` | 基于某日学习内容生成题卡（严格 JSON） |
| POST | `/api/ai/report` | 生成周报/月报文字总结 |

### 3.7 AI Chat（Auth，SSE）

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/chat` | SSE 流式对话（Ollama/OpenAI 兼容） |

---

## 4. 数据模型与存储

### 4.1 Prisma 数据模型（SQLite）

核心实体见 `backend/prisma/schema.prisma`：

- `User`：用户名/密码（bcrypt 存储）及关联关系
- `RefreshToken`：refresh token 轮换、撤销与过期信息
- `StudyLog`：`userId + date` 唯一；存储 `duration/content/aiFeedback`
- `Task`：任务字段 + 重复/提醒配置
- `TaskOccurrenceOverride`：对重复任务某次实例的覆盖记录
- `TaskReminderInstance`：待派发/已派发/失败等提醒实例
- `PushSubscription`：Web Push 订阅信息（endpoint + keys）

默认数据库文件：`backend/dev.db`（可通过 `DATABASE_URL` 修改）

### 4.2 前端本地存储（localStorage）

常用 Key（按实现约定）：

- 认证：`chroma_auth`
- AI 配置（多 profile）：`chroma_ai`
- 周目标：`chroma_weekly_goal_<userId>`
- 任务排序：`chroma_task_order_<userId>`
- 打卡缓存：`chroma_cache_studyLogs_<userId>`
- 任务缓存：`chroma_cache_tasks_<userId>`
- 离线队列：`chroma_sync_queue_v1`
- 复盘问题：`chroma_review_<userId>_<YYYY-MM-DD>`
- 题卡：`chroma_review_cards_v1_<userId>`

---

## 5. 安装与部署

### 5.1 环境要求

- Node.js：建议 `>= 18`（后端使用 `fetch`；前端 Vite 7 也要求较新版本）
- pnpm：项目使用 `pnpm-lock.yaml`
-（可选）Ollama：需要本地 AI 时安装并启动

### 5.2 后端安装与启动

```bash
cd backend
pnpm install
```

准备环境变量（建议从示例复制）：

```bash
cp .env.example .env
```

初始化 Prisma（如需）：

```bash
pnpm prisma generate
pnpm prisma migrate dev
```

启动：

```bash
pnpm start
```

默认监听：`http://localhost:3001`

### 5.3 前端安装与启动

```bash
cd frontend
pnpm install
pnpm dev
```

默认监听：`http://localhost:5173`

如需指定后端地址，可设置环境变量：

- `VITE_API_BASE_URL=http://localhost:3001`

### 5.4 生产部署建议（参考）

- 前端：
  - `cd frontend && pnpm build` 产物位于 `frontend/dist`
  - 使用任意静态服务器/对象存储/反向代理托管 `dist`
- 后端：
  - 以 Node 进程方式运行 `backend/server.js`
  - 配置 `PORT`、JWT secrets、数据库路径等
- 如启用 Push：需要 HTTPS + VAPID keys（详见配置章节）

---

## 6. 使用方法与操作指南

### 6.1 登录/注册

1. 打开前端地址（开发态：`http://localhost:5173`）
2. 进入 `/register` 创建账号
3. 登录后自动进入主界面（TabBar）

### 6.2 Today（首页）

- 查看：
  - 今日学习状态（时长、AI 点评状态）
  - 任务列表（按日期分组：逾期/今日/明日/本周/未来/无日期；可切换 Focus 模式）
  - 今日待复习题卡数量（到期队列）
- 操作：
  - 新增/编辑/完成/删除任务；支持拖拽排序
  - 任务可配置截止时间、提醒、重复规则等
  - “AI 拆解目标”为任务：输入目标 → 生成草稿 → 选择并导入任务
  - 打卡：录入学习时长与内容 → 提交 → AI 点评异步生成
  - 一键跳转 Focus Timer / Review
  - 分享：生成分享卡片图片保存/复制

### 6.3 Calendar（日历）

- 浏览月份热力图（颜色深浅代表当日学习时长）
- 点击日期弹层查看当日内容与任务完成情况
- 点击“去记录”进入 DayDetail 补记/编辑

### 6.4 DayDetail（日详情）

- 编辑当日学习记录
- AI 点评：查看“生成中/已生成”，支持手动生成
- AI 复盘：生成 3 个复盘问题并填写回答（本地保存）
- 答题复习入口：跳转到 Review 并自动带日期参数

### 6.5 Focus Timer（番茄钟）

- 默认 25/5；专注结束弹窗可记录本次专注并累计到当天
- 可选择“记录并生成点评”（后端异步生成）

### 6.6 Review（答题复习）

- 生成题卡：
  - 从某日学习内容一键生成（需要该日已有学习记录）
  - 或手动创建题卡
- 开始复习：
  - 按到期队列取前 10 张
  - 显示答案后自评（Again/Hard/Good/Easy）
  - 会更新题卡的下次到期日（SM-2）
  - 结束后按耗时折算分钟数写入当日打卡（累计模式）

### 6.7 Stats（统计）

- 查看本周进度、streak、本月概览
- AI 周报/月报：一键生成，总结/建议可复制
- 分享统计卡片

### 6.8 Settings（设置）

- AI Provider：
  - Ollama：配置 host/model，提供相关跳转链接
  - 云端（OpenAI 兼容）：支持预置（OpenAI/DeepSeek/OpenRouter/Groq）与自定义 baseUrl/model/apiKey
  - 支持测试连接（后端 `/api/ai/ping`）与在线拉取模型列表（`/api/ai/models`）
  - 支持多 profile（切换/新增/删除）
- 周目标：设置每周分钟数
- 离线队列：查看/编辑/移动/丢弃/清空，并可手动触发同步
- 导出/导入：本地数据备份与恢复（默认不覆盖云端 API Key）
- 退出登录

---

## 7. 配置说明

### 7.1 后端环境变量（`backend/.env`）

示例见 `backend/.env.example`：

- `DATABASE_URL`：SQLite 连接串（默认 `file:./dev.db`）
- JWT：
  - `JWT_ISSUER` / `JWT_AUDIENCE`
  - `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET`（生产必须设置强随机值）
  - `ACCESS_TOKEN_TTL`（默认 `15m`）
  - `REFRESH_TOKEN_TTL`（默认 `30d`）
- 密码哈希：
  - `BCRYPT_COST`（默认 `10`）

代码中额外支持但示例未列出（可选）：

- `PORT`：服务端口（默认 3001）
- `OLLAMA_HOST` / `OLLAMA_MODEL`：Ollama 默认 host/model（未从前端传入时使用）
- Push（启用 Web Push 时必需）：
  - `VAPID_PUBLIC_KEY`
  - `VAPID_PRIVATE_KEY`
  - `VAPID_SUBJECT`（默认 `mailto:admin@example.com`）

### 7.2 前端环境变量

- `VITE_API_BASE_URL`：后端地址，默认 `http://localhost:3001`

### 7.3 AI Provider 配置与安全提示

- AI 配置默认保存在浏览器 `localStorage`（支持多个 profile）
- 云端模式会把 `API Key` 发送到后端用于转发请求；请仅在可信环境使用
- Settings 的导出功能默认会把 `openai.apiKey` 清空，避免备份文件泄露密钥

---

## 8. 常见问题（FAQ）

### 8.1 后端启动报错：`DATABASE_URL is required`

- 检查 `backend/.env` 是否存在且包含 `DATABASE_URL`
- 可从 `backend/.env.example` 复制生成

### 8.2 Prisma 相关报错/表结构不一致

建议在 `backend` 下执行：

```bash
pnpm prisma generate
pnpm prisma migrate dev
```

如你希望重置本地数据库，请先备份数据，再处理 `dev.db`（危险操作请谨慎）。

### 8.3 AI（Ollama）连接失败

- 确认 Ollama 已启动，并可访问 `http://localhost:11434`
- 在 Settings 中检查 Host/Model 是否正确

### 8.4 云端模型提示 `openai config requires baseUrl/model/apiKey`

- 在 Settings 中补全：
  - `Base URL`
  - `Model`
  - `API Key`
- 或切换到本地 Ollama

### 8.5 频繁出现 401 / 会话失效

- 前端会尝试用 refreshToken 自动刷新；若 refresh 也失败会清空本地会话并要求重新登录
- 可在浏览器 Storage 中确认 `chroma_auth` 是否存在且为最新

### 8.6 提醒不可用：后端提示 `Push is not configured`

需在后端配置 VAPID keys（`VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY`），并在 HTTPS 环境下使用 Web Push（localhost 例外）。

### 8.7 离线修改无法同步/队列阻塞

- 进入 Settings 查看待同步队列：
  - “冲突/非网络错误”会阻塞后续回放
  - 可编辑该条 payload、丢弃该条、或将其移动到队列末尾后继续同步

### 8.8 AI 点评长期显示“生成中…”

前端会轮询最多约 24 秒。若后端生成失败，可能会写入空字符串；可在 DayDetail/Today 中手动点击“生成点评”重试。

---

## 9. 项目结构说明

```text
ChromaStudy/
  README.md                    # 项目快速说明（中文）
  DESIGN_SPEC.md               # 设计书/路线图（含未落地项）
  DEVELOPMENT_PLAN.md          # 开发手册/需求草案
  backend/
    server.js                  # Express API + AI Proxy + Reminder Cron
    prismaClient.js            # Prisma Client（better-sqlite3 adapter）
    prisma/
      schema.prisma            # 数据模型
      migrations/              # Prisma migrations
    dev.db                     # SQLite 数据库文件（开发态）
    .env.example               # 环境变量示例
    package.json               # 后端依赖与脚本
  frontend/
    index.html
    vite.config.js
    package.json
    public/
      manifest.webmanifest     # PWA manifest
      sw.js                    # Service worker（缓存壳 + push）
      icons/                   # PWA icons
    src/
      main.jsx                 # React 入口 + SW 注册/清理
      App.jsx                  # 路由壳 + TabBar + 同步入口 + AI profile 切换
      pages/                   # Today/Calendar/Stats/Chat/Settings/...
      services/api.js          # API 封装 + auth refresh + 离线队列回放
      utils/                   # localStorage、队列、题卡SRS等工具
      components/              # ShareCard、SegmentedControl 等
  .claude/                     # 助手/技能相关文件（不参与应用运行）
```

