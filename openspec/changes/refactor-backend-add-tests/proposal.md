# Change: 后端模块化拆分、自动化测试与数据可视化增强

## Why
`server.js` 已膨胀至 ~2759 行，包含所有路由、中间件、工具函数和定时任务，可维护性持续下降。项目零测试覆盖，每次改动都有回归风险。数据可视化仅靠手写 CSS div 实现，缺乏专业图表表达能力。

## What Changes
- **后端模块化拆分**：将 `server.js` 拆分为 `config.js`、`utils/`、`middleware/`、`routes/` 四个模块目录，server.js 缩减为 ~100 行启动文件
- **新增自动化测试**：引入 Vitest + supertest + React Testing Library，覆盖后端单元/集成测试和前端组件测试
- **数据可视化增强**：引入 Recharts 图表库，替换手写 CSS 图表，新增周趋势、学习分布等图表
- **BREAKING**: `server.js` 不再直接定义路由函数，改为从模块引入

## Impact
- Affected specs: backend-architecture（新建）、testing（新建）、data-visualization（新建）
- Affected code:
  - `backend/server.js` — 大幅重写为启动文件
  - `backend/forumRoutes.js` — 不变（已是模块化模式）
  - `backend/package.json` — 新增 vitest、supertest 开发依赖
  - `frontend/package.json` — 新增 vitest、react-testing-library、recharts 依赖
  - `frontend/src/pages/Stats.jsx` — 替换手写图表为 Recharts 组件
  - `frontend/src/pages/Calendar.jsx` — 增强 heatmap tooltip
  - `frontend/src/pages/Today.jsx` — 嵌入迷你图表
  - `openspec/project.md` — 更新架构描述（单文件 → 模块化）
