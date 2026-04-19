## Context
ChromaStudy 后端采用单文件架构（`server.js` ~2759 行），随着论坛模块加入已难以维护。前端数据可视化依赖手写 CSS div，表达能力有限。项目无任何测试框架。

## Goals / Non-Goals
- Goals:
  - 后端按职责拆分为独立模块（config、utils、middleware、routes）
  - 建立后端 + 前端自动化测试体系
  - 引入专业图表库增强数据可视化
- Non-Goals:
  - 不引入 TypeScript
  - 不引入 service 层（保持路由级拆分）
  - 不引入 E2E 测试框架（Playwright/Cypress）
  - 不修改数据库 schema
  - 不改变 API 接口契约

## Decisions

### 后端拆分粒度：路由级模块化
- **决定**: 复用 `forumRoutes.js` 模式，按路由域拆分 + 提取共享工具函数
- **理由**: forumRoutes.js 已验证可行，团队熟悉该模式；不引入 service 层避免过度抽象
- **替代方案**: MVC 三层架构 → 过度设计，项目规模不需要

### 测试框架：Vitest 统一前后端
- **决定**: 后端用 Vitest + supertest，前端用 Vitest + React Testing Library
- **理由**: Vite 项目原生支持，统一框架减少认知负担，零配置集成
- **替代方案**: Jest → 需要额外 babel 配置，与 Vite 构建管线不兼容

### 图表库：Recharts
- **决定**: 使用 Recharts 替换手写 CSS 图表
- **理由**: React 原生，轻量（~40KB gzip），声明式 API，ResponsiveContainer 自适应
- **替代方案**: ECharts → 太重（~200KB+）；Chart.js → 命令式 API，不够 React 化

### 配置集中化：config.js
- **决定**: 所有 `process.env` 派生常量提取到 `config.js`
- **理由**: 避免各模块直接访问 `process.env`，便于测试时 mock

## Risks / Trade-offs
- **拆分导致路由断裂** → 每提取一个模块就启动验证，不批量操作
- **循环依赖** → 依赖方向：server.js → routes → middleware + utils → config/prismaClient，config.js 不引用项目文件
- **Vitest + CommonJS 兼容性** → vitest.config.mjs 用 ESM 配置，测试文件用 .mjs 扩展名
- **Recharts 包体积** → 只导入使用的组件，预期 +15-25KB gzip

## Open Questions
- 无
