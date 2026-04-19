## 1. 后端模块化拆分
- [x] 1.1 创建 `backend/config.js`，提取所有 `process.env` 派生常量
- [x] 1.2 创建 `backend/utils/dateUtils.js`（日期解析、范围计算）
- [x] 1.3 创建 `backend/utils/stringUtils.js`（字符串标准化、JSON 解析）
- [x] 1.4 创建 `backend/utils/aiUtils.js`（AI 配置解析、OpenAI 模型缓存、ping）
- [x] 1.5 创建 `backend/utils/taskUtils.js`（任务标准化、RRULE、occurrence 构建）
- [x] 1.6 创建 `backend/utils/taskReminderUtils.js`（提醒刷新/清理/发送）
- [x] 1.7 创建 `backend/utils/pushUtils.js`（推送订阅解析、payload 构建）
- [x] 1.8 创建 `backend/utils/chatUtils.js`（chatOnce、generateFeedback）
- [x] 1.9 创建 `backend/middleware/auth.js`（asyncHandler、JWT、bcrypt、auth 中间件）
- [x] 1.10 创建 `backend/routes/authRoutes.js`（/health、/register、/login、/refresh、/logout）
- [x] 1.11 创建 `backend/routes/userRoutes.js`（/me）
- [x] 1.12 创建 `backend/routes/studyLogRoutes.js`（/checkin、/study-logs/*）
- [x] 1.13 创建 `backend/routes/taskRoutes.js`（/tasks*、/task-occurrences*、/push/*）
- [x] 1.14 创建 `backend/routes/aiRoutes.js`（/ai/*）
- [x] 1.15 创建 `backend/routes/chatRoutes.js`（/chat SSE）
- [x] 1.16 重写 `backend/server.js` 为 ~100 行启动文件，导出 `app` 供测试使用
- [x] 1.17 验证所有 API 端点正常工作

## 2. 自动化测试
- [x] 2.1 后端：安装 vitest + supertest，创建 vitest.config.mjs
- [x] 2.2 后端：创建 tests/helpers/（createApp、db helpers）
- [x] 2.3 后端：单元测试 — dateUtils、stringUtils、taskUtils、aiUtils
- [x] 2.4 后端：集成测试 — health、auth
- [x] 2.5 前端：安装 vitest + @testing-library/react，配置 vite.config.js
- [x] 2.6 前端：组件测试 — Login、Stats、Calendar

## 3. 数据可视化增强
- [x] 3.1 安装 recharts
- [x] 3.2 创建 `frontend/src/components/charts/WeeklyBarChart.jsx`
- [x] 3.3 创建 `frontend/src/components/charts/WeeklyTrendChart.jsx`
- [x] 3.4 创建 `frontend/src/components/charts/DayDistributionChart.jsx`
- [x] 3.5 创建 `frontend/src/components/charts/MiniSparkline.jsx`
- [x] 3.6 改造 Stats.jsx — 替换手写柱状图 + 新增周趋势和分布图
- [x] 3.7 改造 Calendar.jsx — Recharts 迷你图 + heatmap tooltip
- [x] 3.8 改造 Today.jsx — 嵌入 MiniSparkline
- [x] 3.9 验证空数据场景和响应式行为

## 4. 收尾
- [x] 4.1 更新 `openspec/project.md` 架构描述
- [x] 4.2 清理现有手动测试脚本（保留为参考，不删除）
