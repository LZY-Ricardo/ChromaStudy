# ChromaStudy 设计书（未完成部分）

> 版本：v0.1（草案）  
> 目标：覆盖“习惯闭环 / AI 深度 / 产品打磨”尚未完成的设计，能直接拆分为开发任务与接口实现。  
> 约束：现状为本地 Express + SQLite（Prisma）+ H5（Vite/React），AI 支持本地 Ollama 与“用户自填 API Key 的云端 OpenAI 兼容接口”（后端转发）。

---

## 0. 现状与缺口

### 0.1 已有能力（已实现）
- 用户：`POST /api/login`（无会话/无 token，demo 直连）
- 打卡：`POST /api/checkin`（同日 upsert），异步写入 `aiFeedback`
- 日历：当月热力图 + 当天 AI 点评弹窗
- 任务：list/create/updateDone
- AI Chat：`POST /api/chat` SSE（Ollama）；已扩展支持 OpenAI 兼容 SSE（云端）
- 设置页：AI provider 配置（本地保存）+ 通知权限/测试通知
- PWA：manifest + service worker（离线壳）
- 离线可读：StudyLog/Task 本地缓存，网络失败回退读取

### 0.2 本设计书覆盖的未完成项
- **v0.1 可用闭环**：登录页/退出与用户切换；任务编辑/删除/排序/归档；打卡后 AI 点评“生成中→可见→自动刷新”；日历切换月份 + 当天详情（含编辑）
- **v0.2 留存**：周目标分钟数 + streak；番茄钟/专注计时并一键生成打卡；周/月统计
- **v0.3 AI 深度**：AI 任务拆解；打卡后 AI 复盘追问并保存；AI 周报/月报；（可选）检索历史笔记/RAG
- **v0.4 产品打磨**：导出/备份/恢复；更可靠的通知策略（PWA “尽力提醒” + 可选升级）；离线可写 + 自动同步（L2）
- **v0.5 复习强化**：基于学习内容生成“题卡”并进行答题复习（SRS 间隔重复 + 自评），可离线使用，复习时长计入周目标

---

## 1. 目标与非目标

### 1.1 目标（可验收）
- 用户能在**弱网/无后端**时：打开应用、查看最近数据、继续记录（至少做到 L2 的设计可落地）。
- 习惯闭环：每日打卡→可见反馈→周目标与 streak 驱动复用。
- AI 深度：让 AI 进入“任务拆解、复盘追问、周报总结”三个闭环点，而不是仅聊天。
- 产品打磨：PWA 可安装、可导出、隐私可控（API Key 不落库）。

### 1.2 非目标（本阶段不做/可选）
- 完整鉴权体系（token、权限、多端同步安全模型）
- 原生系统级通知（先 PWA；若需严格定时再上壳）
- 复杂向量检索基础设施（RAG 先做轻量版，再可插拔升级）

---

## 2. 总体架构（目标态）

```
   ┌─────────────┐            ┌────────────────────┐
   │  React H5   │  HTTP/SSE  │  Express Backend    │
   │  + PWA SW   ├───────────►│  Prisma + SQLite    │
   │  + LocalCache│           │  AI Proxy (optional)│
   └──────┬──────┘            └─────────┬──────────┘
          │                              │
          │                              ├────────► Ollama (localhost)
          │                              │
          │                              └────────► Cloud LLM (OpenAI兼容)
          │                                     (用户提供 API Key)
          │
          └── IndexedDB/LocalStorage：缓存 & 离线队列（L2）
```

---

## 3. 数据模型设计（Prisma）

### 3.1 设计原则
- 保持 `StudyLog` 作为“每日汇总”稳定主实体（用于日历/统计/周报）。
- 新增 `StudySession` 支撑番茄钟与多段学习记录，避免“一天只能一条日志”限制导致体验差。
- 为离线同步准备：`updatedAt`、软删除字段、`clientId`（客户端生成幂等键）。

### 3.2 Schema 变更提案（增量）

> 注：以下字段为设计提案，落地时按迭代逐步迁移，不要求一次性全上。

**User**
- 增加：`createdAt`、`updatedAt`

**Task**
- 增加：`order`（排序）、`archivedAt`、`deletedAt`（软删除）、`clientId`（可选，用于离线创建幂等）
- 增加：`createdAt`、`updatedAt`

**StudyLog**
- 增加：`createdAt`、`updatedAt`
- 建议：保留 `@@unique([userId, date])`（每日唯一汇总），但允许通过 Session 汇总累计时长

**StudySession（新增）**
- `id`
- `clientId`（可选，离线幂等）
- `userId`
- `date`（YYYY-MM-DD，便于查询汇总）
- `startedAt`、`endedAt`
- `duration`（分钟）
- `note`（可选）
- `source`（`manual` | `pomodoro`）
- `createdAt`、`updatedAt`、`deletedAt`

**WeeklyGoal（新增）**
- `id`
- `userId`
- `weeklyMinutes`
- `timezone`（如 `Asia/Shanghai`）
- `weekStart`（`monday`/`sunday`）
- `createdAt`、`updatedAt`

**AiReview（新增，用于复盘追问）**
- `id`
- `userId`
- `date`
- `providerSnapshot`（可选：记录当时 provider/model，便于追溯）
- `createdAt`

**AiReviewItem（新增）**
- `id`
- `reviewId`
- `kind`（`question` | `answer`）
- `content`
- `order`

**AiReport（新增：周报/月报）**
- `id`
- `userId`
- `type`（`weekly` | `monthly`）
- `periodStart`、`periodEnd`（YYYY-MM-DD）
- `content`
- `createdAt`

---

## 4. API 设计（未完成部分）

### 4.1 通用约定
- 仍以 `userId` 作为轻量身份标识（后续再引入 token）。
- 对“可幂等写入”的接口统一支持 `clientId`（可选），用于离线队列重放。
- AI 配置：客户端传 `ai`（provider/baseUrl/model/apiKey），后端只做一次请求转发，不落库。

### 4.2 用户与会话（v0.1）
- `POST /api/login`：现有
- `POST /api/logout`：前端清缓存即可；后端可返回 `{ ok: true }`（可选）
- `GET /api/users`：列出本地已注册用户（支持用户切换）

### 4.3 任务（v0.1）
- `GET /api/tasks?userId&includeArchived=0`
- `POST /api/tasks`：支持 `clientId`、`order`
- `PATCH /api/tasks/:id`：支持 `title/isDone/order/archivedAt/deletedAt`
- `DELETE /api/tasks/:id`：软删除（推荐）或硬删（本地项目可选）
- `POST /api/tasks/reorder`：批量更新顺序（减少多次 PATCH）

### 4.4 学习记录（v0.1 + v0.2）
- `GET /api/study-logs?userId&from&to`：支持按区间拉取（为统计/报表做准备）
- `GET /api/study-logs/:date?userId`：当天详情
- `PATCH /api/study-logs/:date`：更新 `content/duration`（并触发重新点评，可选）
- `POST /api/study-sessions`：新增 session（用于番茄钟/多段记录）
- `GET /api/study-sessions?userId&date`：当天 sessions
- `DELETE /api/study-sessions/:id`：软删除

### 4.5 统计（v0.2）
- `GET /api/stats/summary?userId&period=week|month&date=YYYY-MM-DD`
  - 返回：总分钟数、平均、连续打卡天数、任务完成率等

### 4.6 AI 深度（v0.3）
- `POST /api/ai/tasks/decompose`
  - 入参：`goal`（文本）、`constraints`（可选：每天分钟数/截止日期/偏好）
  - 出参：结构化任务数组（title + 估时 + 顺序）
- `POST /api/ai/review`
  - 入参：`date`、`studyLog + sessions`、`ai`
  - 出参：`questions[]`（2~3 个），并落库到 `AiReview/AiReviewItem`
- `POST /api/ai/report`
  - 入参：`type`、`periodStart/end`、`ai`
  - 出参：报告文本，并落库到 `AiReport`

### 4.7 导出/备份/恢复（v0.4）
- `GET /api/export?userId`
  - 返回：用户数据 JSON（用户、任务、日志、sessions、reviews、reports、goals）
- `POST /api/import`
  - 入参：导出 JSON + `mode`（merge/overwrite）
  - 风险：覆盖数据；需要前端二次确认（“危险操作”）

---

## 5. 前端信息架构与页面设计

### 5.1 路由规划
- `/login`：登录/注册/用户切换
- `/`：Today（任务 + 今日摘要 + 番茄钟入口 + 打卡入口 + streak/目标进度）
- `/calendar`：月视图 + 月切换 + 点击进入 `/day/:date`
- `/day/:date`：当天详情（日志编辑 + sessions 列表 + AI 点评/复盘）
- `/chat`：AI Coach（可选注入“最近 7 天摘要”作为上下文按钮）
- `/stats`：周/月统计
- `/settings`：AI provider + 通知 + 导出/导入 + 隐私开关

### 5.2 关键交互（v0.1）
- **AI 点评闭环**：打卡成功后立即显示 `aiFeedback: null` 的“生成中”状态；前端轮询/或在日历/详情页再次拉取更新。
- **任务体验**：编辑/删除/排序/归档；完成任务在 Today 顶部显示完成率。
- **日历增强**：月切换；点击日期进入 Day 详情，不只弹窗。

### 5.3 番茄钟（v0.2）
- `PomodoroTimer`：25/5 可配；开始/暂停/放弃/完成
- 完成时：生成 `StudySession(source=pomodoro)`；若当日日志存在则累计 `duration`
- 离线：先写入本地队列，恢复网络后同步

### 5.4 统计（v0.2）
- 周：每日分钟柱状 + streak + 周目标进度环
- 月：热力图 + 最高/最低学习日 + 总分钟数

### 5.5 AI 深度（v0.3）
- **任务拆解**：在 Today/Stats 提供“把目标拆成任务”入口；结果可一键写入 Task（支持批量预览后确认）。
- **复盘追问**：当天详情页展示“AI 复盘问题”，用户回答后保存；可用于周报素材。
- **周报/月报**：Stats 页生成，支持“重新生成/复制/导出”。

---

## 6. 离线与同步（L2 目标设计）

### 6.1 离线分层
- 已有：PWA 离线壳 + 可读缓存（localStorage）
- 目标：离线可写（任务/打卡/session）+ 自动同步（IndexedDB 队列）

### 6.2 离线队列（前端）
- 存储：IndexedDB（建议）或 localStorage（临时）
- 结构：
  - `pendingOps[]`：`{ id, type, payload, createdAt, retryCount }`
  - `type`：`task.create`/`task.update`/`task.delete`/`checkin.upsert`/`session.create`/...
- 同步触发：
  - 应用启动
  - 网络恢复（`window.online`）
  - 用户手动“立即同步”

### 6.3 幂等与冲突策略（后端配合）
- `checkin.upsert`：天然以 `(userId, date)` 幂等，冲突采用“最后写入覆盖”
- `task.create/session.create`：引入 `clientId` 幂等；服务端若已存在则返回已创建记录
- 更新冲突：基于 `updatedAt`（可选），采用“最后写入覆盖”并在 UI 提示冲突（v1 可不做复杂合并）

---

## 7. 通知策略（PWA 优先）

### 7.1 v1（尽力提醒）
- 设置页：开启通知权限 + 测试通知（已做）
- 新增：提醒时间设置（每天 HH:mm）
- 实现：应用打开时，如果“超过提醒时间且当天未打卡”，弹出提示 + 可选发一条通知（仅在 App 运行中可靠）

### 7.2 v2（可选增强）
- 若未来需要更稳定触达：引入 Web Push（VAPID + 订阅）+ 服务器调度（但对“本地后端”场景不友好）
- 若必须严格定时：升级系统级（Capacitor）不在本阶段

---

## 8. 安全与隐私
- API Key **仅存前端本地**（localStorage/IndexedDB），不写入 SQLite。
- 后端作为代理转发时：
  - 禁止在日志中输出 Authorization 或完整请求体
  - 对错误信息做脱敏
- 提供“隐私开关”：关闭云端后不允许任何外部请求（仅 Ollama localhost）。

---

## 9. 分期交付与验收（建议）

### v0.1（可用闭环）
- 登录页/退出/用户切换
- 任务编辑/删除/排序/归档
- AI 点评生成状态可见 + 自动刷新
- 月历切换 + Day 详情页（可编辑）

### v0.2（留存）
- 周目标 + streak
- 番茄钟 + session 记录
- 周/月统计页

### v0.3（AI 深度）
- AI 任务拆解（结构化输出 + 批量入库）
- 复盘追问与保存
- 周报/月报（可再生成）
- RAG-lite：把最近 N 天记录注入上下文（先不做向量）

### v0.4（产品打磨）
- 导出/备份/恢复（含危险确认）
- 离线可写 + 自动同步（IndexedDB 队列）
- 通知策略增强（尽力提醒完善）

---

## 10. 未决问题（需要你确认的默认值）
## 10. 默认值（已确认）
- 周目标默认值：`300` 分钟/周；首次进入提供引导，可随时在设置/统计页修改
- streak 口径：`duration > 0` 视为当日已打卡
- 番茄钟默认：`25/5`
- Task 排序：手动拖拽优先；无手动顺序时按创建时间/ID 兜底
- 答题复习：默认每次从学习内容生成 `5` 张题卡
- 答题复习：复习时长计入周目标（以 `checkin` 的 `mode=increment` 写入 `duration`）
- 答题复习入口：Today 主入口 + Calendar（Day 详情）次入口
- 答题复习判分：MVP 不做 AI 判分，采用自评按钮（Again/Hard/Good/Easy）

---

## 11. 答题复习（题卡 + SRS）

### 11.1 目标（MVP）
- 把“学习内容”沉淀为可复用的题卡，让用户每天花 3~10 分钟做一次答题复习，形成巩固闭环。
- 可离线复习：题卡与复习进度保存在本地；需要跨设备时通过导出/导入迁移（先不做服务端同步）。
- 与习惯闭环打通：复习耗时计入当天 `duration`（用于 streak/周目标/统计）。

### 11.2 核心概念
- **题卡（Card）**：`front`（题目/提示）+ `back`（参考答案/要点），支持手动创建与 AI 从学习内容生成。
- **复习队列（Due）**：到期（`dueDate <= today`）的题卡集合。
- **自评（Grade）**：用户在看答案后选择：Again / Hard / Good / Easy，用于更新下次复习时间（SRS）。

### 11.3 SRS 调度算法（SM-2 简化）
为保证实现简单且可解释，MVP 采用 SM-2（Anki 等常用）：
- 状态字段：`repetition`（成功次数）、`intervalDays`（间隔天数）、`easeFactor`（难度系数，最小 1.3）、`dueDate`
- 映射：Again→`q=1`，Hard→`q=3`，Good→`q=4`，Easy→`q=5`
- 更新规则（伪码）：
  - 若 `q < 3`：`repetition = 0`，`intervalDays = 1`
  - 否则：
    - 若 `repetition == 0`：`intervalDays = 1`
    - 若 `repetition == 1`：`intervalDays = 6`
    - 否则：`intervalDays = round(intervalDays * easeFactor)`
    - `easeFactor = max(1.3, easeFactor + (0.1 - (5-q)*(0.08 + (5-q)*0.02)))`
    - `repetition += 1`
  - `dueDate = today + intervalDays`

### 11.4 数据结构（本地存储）
MVP 以 localStorage/IndexedDB 保存（与导出/导入打通）：
- `reviewCards[]`（按 `userId` 分 key 存储）：
  - `id`：uuid
  - `type`：`short_answer` / `cloze`（MVP 先统一按 Q/A 展示）
  - `front`：题目
  - `back`：参考答案/要点
  - `source`：`{ date?: "YYYY-MM-DD" }`（可追溯到学习日期）
  - `srs`：`{ repetition, intervalDays, easeFactor, dueDate, lastReviewedAt }`
  - `createdAt` / `updatedAt`

### 11.5 交互流程（MVP）
**入口**
- Today：展示“今日待复习 X 题”，点击进入复习页
- Calendar → Day 详情：可一键跳转到复习页，并支持“从该日学习内容生成题卡”

**生成题卡**
- 从学习内容生成（AI）：选择日期（默认 today）→ 点击“生成 5 张”→ 用户可编辑后保存
- 手动创建：输入 `front/back` 保存

**开始复习**
- 进入复习模式：按 `dueDate` 取到期题卡（可先默认上限 10 张/组）
- 卡片流程：显示题目 → “显示答案” → 自评按钮（Again/Hard/Good/Easy）→ 下一题
- 结束后：自动以 `mode=increment` 写入当天 `duration`（以本次复习时长估算分钟数，至少 1 分钟）

### 11.6 AI 生成题卡（接口建议）
新增接口（不落库、不保存到数据库）：
- `POST /api/ai/flashcards`
  - 入参：`{ userId, date, count=5, ai }`
  - 出参：`{ date, cards: [{ type, question, answer }] }`
  - 规则：只输出严格 JSON；题干<=30字，答案<=120字；中文；必须基于当天学习内容

### 11.7 验收标准（MVP）
- 能从某天学习内容生成并保存题卡（默认 5 张，可编辑）。
- 复习页能按到期队列出题，支持“显示答案→自评→更新到期日”闭环。
- 复习结束会把耗时计入当天 `duration`，并在 Stats/Today 的周目标与 streak 中体现。
- 题卡/进度随导出/导入迁移（不包含云端 API Key）。

### 11.8 开发任务拆分（MVP）
- 后端：新增 `POST /api/ai/flashcards`（基于 `StudyLog` 内容生成题卡 JSON）
- 前端：新增 `Review` 页面（题库/草稿编辑/复习模式），实现 SM-2 调度与自评
- 前端：新增本地存储 `reviewCards`（按 userId 分 key），并在导出/导入中包含
- 入口：Today 展示“今日待复习 X 题”；Calendar Day 详情提供“去生成题卡”跳转
