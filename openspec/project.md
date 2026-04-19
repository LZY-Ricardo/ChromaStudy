# Project Context

## Purpose
ChromaStudy 是一款**移动优先的个人学习追踪与复习应用**（H5/PWA），面向独立自学者。核心理念是"专注 · 记录 · 进阶"，整合以下功能：
- 每日学习打卡（记录时长、内容，AI 生成反馈）
- 任务管理（支持 RRULE 循环任务、提醒、拖拽排序）
- GitHub 风格日历热力图（学习强度可视化）
- AI 学习助手（SSE 流式对话、任务拆解、学后反思、周/月报告）
- 番茄钟（自动计入每日学习时长）
- 间隔重复闪卡复习（SM-2 算法，AI 从学习内容生成题卡）
- 离线优先 PWA（本地缓存 + 同步队列 + 数据导出/导入）

## Tech Stack
- **前端**: React 18 + Vite 7 + Ant Design Mobile 5 + Tailwind CSS v4 + Recharts 3
- **后端**: Node.js + Express 5（模块化路由架构）
- **数据库**: MySQL（通过 Prisma 7 + MariaDB adapter）
- **认证**: JWT（access 15min + refresh 30d，自实现）
- **测试**: Vitest + supertest（后端），Vitest + React Testing Library（前端）
- **可视化**: Recharts 3（柱状图、面积图、饼图、迷你趋势线）
- **AI 集成**: Ollama（本地）或 OpenAI 兼容 API（云端，后端代理转发，不存储密钥）
- **通知**: Web Push（VAPID，可选）
- **包管理**: pnpm
- **语言**: JavaScript（无 TypeScript），.jsx 用于 React 组件

## Project Conventions

### Code Style
- 所有文档、UI 文本、提交信息使用**中文**；代码标识符（函数名、变量名、组件名）使用**英文**
- ESLint v9 flat config（`eslint.config.js`），无 Prettier
- 文件扩展名：`.jsx`（React 组件），`.js`（其余）
- 组件命名：PascalCase（如 `Today.jsx`、`ShareCard.jsx`）
- 工具文件命名：camelCase（如 `syncQueue.js`、`aiPresets.js`）
- localStorage 键名：snake_case + `chroma_` 前缀（如 `chroma_sync_queue_v1`）
- 自定义事件：snake_case（如 `chroma_ai_changed`、`chroma_auth_changed`）
- 箭头函数优先，无分号（前端代码），ES module `import/export`

### Architecture Patterns
- **前端**: SPA + React Router v6 客户端路由，`RequireAuth` 组件包裹路由守卫
- **状态管理**: 仅 React `useState`/`useEffect`，跨组件通信使用自定义 DOM 事件（`window.dispatchEvent`）
- **数据请求**: Axios 封装（`services/api.js`），拦截器自动刷新 JWT
- **离线优先**: localStorage 缓存 + 合并策略 + 同步队列（`syncQueue.js`）
- **后端**: 模块化 Express 服务器（`server.js` ~80 行启动文件 + `routes/` + `middleware/` + `utils/` 目录）
- **AI 代理模式**: 客户端每次请求携带完整 AI 配置，后端仅转发，不存储 API Key

### Testing Strategy
- **Vitest** 统一测试框架（前后端一致）
- **后端**：`vitest` + `supertest`，单元测试（utils/）+ 集成测试（API 端点）
- **前端**：`vitest` + `@testing-library/react` + `jsdom`，组件测试（Login、Stats、Calendar）
- 运行方式：`pnpm test`（前后端目录各自运行）

### Git Workflow
- **单分支开发**（仅 `main` 分支）
- **Conventional Commits** 格式，中文描述：`type(scope): 中文描述`
  - 已使用的 type：`feat`、`fix`、`refactor`、`style`、`chore`、`docs`
  - 已使用的 scope：`backend`、`frontend`、`auth`、`calendar`、`task`、`review`、`sync`、`ai`、`ui`、`db`、`readme`、`plan`

## Domain Context
- **StudyLog**: 每日学习记录（日期、时长/分钟、内容、AI 反馈），同一用户同一天 upsert
- **Task**: 待办事项（标题、优先级、分类、标签、RRULE 循环规则、计划完成日期）
- **Check-in**: 学习打卡，同一日期覆盖更新
- **Streak**: 连续学习天数（duration > 0）
- **周目标**: 每周目标学习时长（默认 300 分钟）
- **番茄钟**: 25 分钟专注 + 5 分钟休息，自动计入学习时长
- **AI 反馈**: 打卡后 AI 对当天学习内容的评语
- **AI 复习题**: 学后反思问题
- **AI 报告**: 周报 / 月报总结
- **闪卡复习**: SM-2 间隔重复算法，评分等级（Again/Hard/Good/Easy），数据仅存 localStorage
- **同步队列**: 离线变更队列，上线后重放
- **Bento 风格**: UI 设计语言——卡片式圆角布局

## Important Constraints
- **前端仅限 JavaScript**，不使用 TypeScript（尽管安装了 `@types/react`）
- **后端为 CommonJS 模块化架构**（`server.js` + `routes/` + `middleware/` + `utils/`）
- **闪卡/复习数据仅存 localStorage**，非服务端，跨设备不同步
- **AI API Key 仅存客户端 localStorage**，服务端不持久化任何密钥
- **数据库为本地 MySQL**（`localhost:3306/chroma_study`），非云数据库
- **项目面向个人使用**，无多租户/团队/支付等企业级需求

## External Dependencies
- **AI 服务**: Ollama（本地默认 `http://localhost:11434`，模型 `llama3`）或 OpenAI 兼容 API（OpenAI/DeepSeek/OpenRouter/Groq/自定义端点）
- **无第三方 OAuth/支付/云存储/分析服务**
- **Web Push**（可选，需配置 VAPID 环境变量）

## Database Schema
| 模型 | 用途 | 关键字段 |
|---|---|---|
| `User` | 用户账号 | id, username (unique), password (bcrypt) |
| `RefreshToken` | JWT 刷新令牌 | tokenId (unique), userId, expiresAt, revokedAt |
| `StudyLog` | 每日学习记录 | date, duration, content, aiFeedback; unique(userId, date) |
| `Task` | 待办事项 | title, isDone, dueTime, priority, category, labels(JSON), repeatRule(RRULE) |
| `TaskOccurrenceOverride` | 循环任务实例覆盖 | taskId + occurrenceDate (unique), overrideDate, isCancelled |
| `TaskReminderInstance` | 定时提醒记录 | taskId, occurrenceDate, remindAt, status |
| `PushSubscription` | Web Push 订阅 | endpoint (unique), keys (JSON) |
