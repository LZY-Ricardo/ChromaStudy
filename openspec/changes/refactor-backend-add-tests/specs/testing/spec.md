## ADDED Requirements

### Requirement: 后端自动化测试
后端 SHALL 使用 Vitest + supertest 进行单元测试和集成测试。

#### Scenario: 运行后端测试
- **WHEN** 执行 `pnpm test`
- **THEN** 所有后端测试自动运行并通过，包括单元测试和集成测试

#### Scenario: 工具函数单元测试
- **WHEN** 修改 dateUtils、stringUtils、taskUtils、aiUtils 中的纯函数
- **THEN** 对应的单元测试覆盖正常输入、边界条件和异常输入

#### Scenario: API 端点集成测试
- **WHEN** 修改 API 端点
- **THEN** 对应的集成测试覆盖认证（注册/登录/刷新/登出）、学习记录 CRUD、任务 CRUD

#### Scenario: 测试数据库隔离
- **WHEN** 运行集成测试
- **THEN** 测试使用独立的测试数据，完成后清理，不影响开发数据库

### Requirement: 前端自动化测试
前端 SHALL 使用 Vitest + React Testing Library 进行组件测试。

#### Scenario: 运行前端测试
- **WHEN** 执行 `pnpm test`
- **THEN** 所有前端测试自动运行并通过

#### Scenario: 关键页面组件测试
- **WHEN** 修改 Login、Stats、Calendar 页面组件
- **THEN** 对应的组件测试覆盖渲染、用户交互和 API mock
