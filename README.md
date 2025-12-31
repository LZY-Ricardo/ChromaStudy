# ChromaStudy

移动端优先的学习打卡 + 复盘应用，内置 AI 助手能力，支持本地 Ollama 与云端 OpenAI 兼容接口作为 AI Provider。

## 开发启动

### 后端

```bash
cd backend
pnpm start
```

默认监听 `http://localhost:3001`。

### 前端

```bash
cd frontend
pnpm dev
```

默认监听 `http://localhost:5173`。

## AI Provider 配置（Settings）

- **Ollama（本地）**
  - `Host`：默认 `http://localhost:11434`
  - `Model`：例如 `llama3`
  - 可从设置页直接跳转到 Ollama 官网/模型库/文档
- **云端（OpenAI兼容）**
  - 选择 `Cloud Preset` 会自动填入 `Base URL` + 默认 `Model`
  - 常用路径只需粘贴 `API Key`
  - 如需自定义 `Base URL/Model`，打开「高级设置」
  - 「测试连接」会通过后端验证配置连通性

安全提示：云端模式会把 `API Key` 发送到你的后端用于转发请求；请仅在可信环境使用。

## 后端接口

- `POST /api/ai/ping`：验证当前 AI 配置连通性（供设置页「测试连接」调用）
