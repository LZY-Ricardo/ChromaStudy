## ADDED Requirements

### Requirement: 图表库支持
前端 SHALL 使用 Recharts 图表库实现数据可视化，替换手写 CSS 图表。

#### Scenario: 图表库安装
- **WHEN** 前端项目构建
- **THEN** Recharts 作为生产依赖安装，通过 tree-shaking 仅打包使用的组件

### Requirement: 周学习柱状图
Stats 页面 SHALL 使用 Recharts BarChart 展示本周每日学习时长。

#### Scenario: 有数据时渲染柱状图
- **WHEN** 用户查看 Stats 页面且本周有学习记录
- **THEN** 显示 7 天柱状图，每根柱子高度与学习时长成正比，支持 hover tooltip

#### Scenario: 无数据时优雅降级
- **WHEN** 用户查看 Stats 页面且本周无学习记录
- **THEN** 图表区域显示空状态，不报错

### Requirement: 多周趋势图
Stats 页面 SHALL 新增周趋势面积图，展示近 8 周学习时长变化趋势。

#### Scenario: 渲染趋势图
- **WHEN** 用户查看 Stats 页面
- **THEN** 显示 8 周面积图，横轴为周起始日期，纵轴为总学习时长

### Requirement: 学习分布图
Stats 页面 SHALL 新增星期分布饼图，展示本月按星期几的学习时间分布。

#### Scenario: 渲染分布饼图
- **WHEN** 用户查看 Stats 页面且有本月学习记录
- **THEN** 显示 7 个扇区对应周一至周日，扇区大小与该星期几的总学习时长成正比

### Requirement: 日历页迷你图
Calendar 页面 SHALL 使用 Recharts 组件替换手写 7 日迷你趋势图。

#### Scenario: 渲染迷你趋势图
- **WHEN** 用户查看 Calendar 页面
- **THEN** 近 7 天学习时长以迷你柱状图展示

#### Scenario: Heatmap tooltip
- **WHEN** 用户 hover 日历 heatmap 中的某一天
- **THEN** 显示该天的日期和学习时长

### Requirement: Today 页迷你图表
Today 页面 SHALL 在周进度卡片中嵌入迷你趋势图表。

#### Scenario: 嵌入迷你 sparkline
- **WHEN** 用户查看 Today 页面
- **THEN** 周进度区域展示本周每日学习时长的迷你趋势线
