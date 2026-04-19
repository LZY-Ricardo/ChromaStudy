# ChromaStudy Frontend

基于 Vite + React 18 的移动端优先 H5 前端。

## 技术栈

- React 18 + React Router
- Ant Design Mobile（移动端 UI 组件库）
- Tailwind CSS（样式）
- Vite（构建工具）

## 启动

```bash
pnpm install
pnpm dev
```

默认监听 `http://localhost:5173`。

可选环境变量：

- `VITE_API_BASE_URL`：后端地址（默认 `http://localhost:3001`）

## 构建

```bash
pnpm build
```

产物位于 `dist/`，可部署到任意静态服务器。
