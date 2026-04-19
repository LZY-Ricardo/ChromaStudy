# Change: Add Forum — 学习社区论坛功能

## Why
ChromaStudy 目前是一个纯个人学习工具，用户缺乏交流和互助的渠道。添加论坛功能可以为用户构建学习社区，促进经验分享、问题互助和学习激励，同时利用已有的学习数据（学习记录、统计、AI 反馈）打造差异化社交体验。

## What Changes
- 新增论坛核心功能：发帖、评论、点赞
- 新增学习数据联动：帖子可附带学习统计卡片，个人主页展示学习数据
- 新增隐私控制：三档预设（隐私/社交/开放）+ 逐项覆盖，控制学习数据对外可见性
- 新增匿名提问：用户可选择匿名方式发帖，隐藏真实身份
- 新增学习打卡墙：自动从每日学习记录生成动态，支持点赞互动
- 新增学习小组：按科目/考试/目标建组，组内专属讨论区
- 复用已有的 Web Push 通知基础设施，支持论坛消息通知

## Impact
- Affected specs: 新建 `forum` capability（首个 spec）
- Affected code:
  - `backend/prisma/schema.prisma` — 新增 Forum 相关数据模型（Post, Comment, Like, StudyGroup, ForumPrivacySetting 等）
  - `backend/src/` — 新增论坛 API 路由和业务逻辑
  - `frontend/src/` — 新增论坛相关页面组件（帖子列表、帖子详情、个人主页、小组、打卡墙）
  - `frontend/src/router/` — 新增论坛路由
