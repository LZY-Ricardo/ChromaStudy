# ChromaStudy

移动端优先的学习打卡 + 复盘应用，内置 AI 助手能力，支持本地 Ollama 与云端 OpenAI 兼容接口。

## 快速启动

```bash
# 后端（默认 http://localhost:3001）
cd backend && pnpm install && pnpm start

# 前端（默认 http://localhost:5173）
cd frontend && pnpm install && pnpm dev
```

环境变量参考 `backend/.env.example`。

## 功能概览

- 学习打卡 + AI 点评（Ollama / 云端 LLM）
- 任务管理（重复任务、提醒、拖拽排序）
- 日历热力图 + 统计（周目标、streak、AI 周报/月报）
- AI 学习伙伴（SSE 流式对话）、任务拆解、复盘追问
- 番茄钟 + 答题复习（SM-2 间隔重复）
- 离线缓存 + 待同步队列 + 数据导出/导入
- PWA（可安装、Web Push 通知）

## 技术栈

- **前端**：Vite + React 18 + React Router + Ant Design Mobile + Tailwind CSS
- **后端**：Node.js + Express + Prisma ORM
- **数据库**：SQLite
- **AI**：Ollama（本地）/ OpenAI 兼容接口（云端，后端转发）

## 文档

| 文档 | 说明 |
|---|---|
| [使用与开发指南](docs/GUIDE.md) | 完整功能说明、API 文档、配置、FAQ |
| [架构设计](docs/ARCHITECTURE.md) | 初始设计稿（历史参考） |
| [开发路线图](docs/ROADMAP.md) | 分期规划与未完成设计 |

## License

Private
