# ChromaStudy - 初始架构设计

> **注意**：本文档为项目初期的设计稿，部分内容已被后续迭代覆盖（如数据模型已扩展、认证已升级为 JWT 等）。当前完整功能与 API 说明请参阅 [GUIDE.md](./GUIDE.md)，开发路线图请参阅 [ROADMAP.md](./ROADMAP.md)。

---

## 1. 项目概览
本项目名为 **ChromaStudy**，是一个移动端优先（Mobile-First）的学习打卡 H5 应用。
- **核心理念**：利用日历热力图（类似 GitHub）展示学习进度，并结合本地 AI (Ollama) 提供反馈。
- **技术栈**：
  - 前端：React (Vite), Tailwind CSS, Ant Design Mobile
  - 后端：Node.js (Express), Prisma ORM
  - 数据库：SQLite (本地文件 `dev.db`)
  - AI 引擎：Ollama (本地调用 Llama3 或 DeepSeek)

---

## 2. 数据库建模 (Prisma Schema)
要求：请使用 Prisma 管理 SQLite，定义如下模型：

- `User`: id, username, password (明文存储即可，自用项目)
- `StudyLog`: id, date (YYYY-MM-DD), duration (分钟), content (学习笔记), aiFeedback (AI点评), userId
- `Task`: id, title, isDone (Boolean), userId

---

## 3. 功能模块需求描述

### 3.1 首页 (Today 视图)
- 显示今日日期和状态。
- **任务列表**：展示 AI 拆解或手动输入的待办事项。
- **打卡操作**：点击“完成学习”弹出录入框（输入时长和内容）。

### 3.2 统计页 (Calendar 视图)
- **视觉核心**：日历单元格颜色根据 `duration` 变化。
  - 0: #f3f4f6 (灰)
  - 1-60: #dcfce7 (浅绿)
  - 61-180: #86efac (中绿)
  - >180: #22c55e (深绿)
- **交互**：点击日期展示当天的 `aiFeedback` 弹窗。

### 3.3 AI 助手页 (Chat 视图)
- 对接本地 **Ollama API** (http://localhost:11434)。
- 支持流式输出（Streaming）。
- 设定：AI 是一名专业的“学习教练”，语气幽默且富有鼓励性。

---

## 4. 第一步：初始化后端 (指令)
> "请在 ./backend 目录下初始化项目。执行以下任务：
> 1. 安装 express, @prisma/client, cors, dotenv, ollama。
> 2. 配置 Prisma 连接 SQLite。
> 3. 编写 `server.js`，实现简单的登录接口和 `POST /api/checkin`（存入打卡记录并触发 Ollama 生成 aiFeedback）。
> 4. 确保 AI 点评逻辑是：获取用户学习内容后，异步调用 Ollama 生成一句 50 字以内的点评并更新数据库。"

---

## 5. 第二步：初始化前端 (指令)
> "请在 ./frontend 目录下使用 Vite 创建 React 项目。执行以下任务：
> 1. 安装 tailwindcss, antd-mobile, axios, dayjs, lucide-react。
> 2. 配置 Tailwind 移动端适配：限制页面最大宽度 430px，水平居中，背景色 #f9fafb。
> 3. 创建 `App.jsx` 和基础路由：包括首页、日历页、聊天页。
> 4. 实现日历逻辑：调用后端数据，根据时长动态设置日期格子的背景色颜色阶梯。"

---

## 6. 第三步：联调与 AI 功能增强 (指令)
> "实现 `/api/chat` 的 SSE 流式传输。
> 1. 后端调用 `ollama.chat({ model: 'llama3', messages: [...], stream: true })`。
> 2. 前端使用 `fetch` 和 `ReadableStream` 接收数据，并实现打字机效果。
> 3. 调整样式，使应用看起来像一个原生的移动端 App。"