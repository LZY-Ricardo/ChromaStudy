## ADDED Requirements

### Requirement: 后端模块化架构
后端 SHALL 将代码按职责组织为独立模块，而非集中在单一 `server.js` 文件中。

#### Scenario: 配置集中管理
- **WHEN** 后端启动
- **THEN** 所有 `process.env` 派生常量从 `config.js` 加载，各模块通过 `require("../config")` 引入

#### Scenario: 工具函数独立模块
- **WHEN** 需要日期处理、字符串标准化、AI 配置解析等功能
- **THEN** 从 `utils/` 目录对应文件引入，而非从 `server.js` 引入

#### Scenario: 路由模块化
- **WHEN** Express app 注册路由
- **THEN** 每个路由域（auth、user、study-log、task、ai、chat）从 `routes/` 目录独立文件引入，格式与 `forumRoutes.js` 一致

#### Scenario: 中间件独立模块
- **WHEN** 请求需要认证
- **THEN** auth 中间件从 `middleware/auth.js` 引入，包括 asyncHandler、JWT 验证、bcrypt 密码处理

#### Scenario: 启动文件精简
- **WHEN** 查看 `server.js`
- **THEN** 文件仅包含 app 创建、中间件挂载、路由注册、cron 任务和服务器启动，约 100 行

#### Scenario: 测试可导入 app
- **WHEN** 测试文件需要创建 supertest 请求
- **THEN** 可通过 `require("../server")` 获取 `{ app }` 对象，无需启动服务器
