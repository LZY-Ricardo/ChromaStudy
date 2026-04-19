## Context
ChromaStudy 是一个移动端优先的学习追踪应用，技术栈为 Vite + React 18 + Express + Prisma + MySQL。已有学习记录、任务管理、番茄钟、闪卡复习、AI Chat Mate、Web Push 通知等功能。本次新增论坛模块，需要与已有学习数据和通知系统联动。

## Goals / Non-Goals
- Goals:
  - 构建以学习为核心的社区论坛，提供发帖、评论、点赞基础能力
  - 学习数据与论坛内容分层联动（展示联动优先，内容联动次之，交互联动 v2）
  - 三档隐私预设 + 逐项覆盖，用户完全控制数据可见性
  - 支持匿名发帖，降低用户分享门槛
  - 学习打卡墙自动从 StudyLog 生成，一键分享
  - 复用已有 Web Push 基础设施推送论坛通知

- Non-Goals:
  - 不做私信/IM（已有 AI Chat Mate）
  - 不做复杂版主/权限系统（初期只做举报 + 管理员屏蔽）
  - 不做富文本编辑器（v1 使用 Markdown）
  - 不做图片/附件上传（v1 纯文本 + 学习卡片）
  - 不做学习小组挑战赛等交互联动功能（v2）

## Decisions

### D1: 数据模型设计
- **Decision**: 新增 `Post`、`Comment`、`PostLike`、`CommentLike`、`StudyGroup`、`StudyGroupMember` 模型，隐私设置存为 User 表的 JSON 字段
- **Alternatives considered**:
  - 独立 PrivacySetting 表：过于碎片化，字段不多，JSON 足够
  - 复用 Task 表做论坛：语义不匹配，且字段差异大
- **Rationale**: 独立模型保持关注点分离；隐私设置用 JSON 灵活且简单

### D2: 匿名实现方式
- **Decision**: Post 表增加 `isAnonymous` 布尔字段，匿名帖子查询时隐藏 userId，显示 "匿名用户"。后端保留真实 userId 以便管理和防滥用
- **Alternatives considered**:
  - 独立 AnonymousUser 表：增加复杂度，且匿名用户本质上就是普通用户隐藏身份
  - 完全不记录匿名者身份：无法处理举报和滥用
- **Rationale**: 简单有效，保留管理能力，前端统一处理显示逻辑

### D3: 学习卡片生成
- **Decision**: 后端提供 `/api/forum/study-card` 接口，根据用户 StudyLog 实时生成卡片数据（总时长、连续天数、本周学习、科目分布）。卡片作为 Post 的 JSON 元数据存储，不存为图片
- **Alternatives considered**:
  - 生成图片卡片：需要图片渲染服务，增加依赖
  - 纯前端计算：数据需要完整暴露给前端，隐私控制复杂
- **Rationale**: JSON 格式前端自由渲染，服务端统一做隐私过滤

### D4: 打卡墙数据来源
- **Decision**: 打卡墙不存储额外数据，直接从 StudyLog 聚合查询。用户可选择"同步到打卡墙"，对应 StudyLog 增加一个 `sharedToWall` 布尔标记
- **Alternatives considered**:
  - 独立 CheckIn 表：与 StudyLog 数据重复
  - 自动全部同步：部分用户可能不想分享每天记录
- **Rationale**: 最小化数据冗余，用户自主控制

### D5: 评论层级
- **Decision**: v1 仅支持一级评论（对帖子评论），不支持楼中楼。保持简单
- **Alternatives considered**:
  - 无限嵌套：复杂度高，移动端体验差
  - 两级嵌套：增加查询复杂度
- **Rationale**: v1 先验证核心需求，后续按用户反馈决定是否扩展

### D6: 论坛通知复用 Web Push
- **Decision**: 复用已有 `PushSubscription` 模型，新增通知类型枚举（comment, like, mention, group_invite）。通知记录存为独立 `ForumNotification` 表
- **Rationale**: 已有基础设施，避免重复建设

## Risks / Trade-offs
- **内容质量风险** → 初期依赖用户举报 + 管理员审核，后续可引入 AI 内容审核
- **匿名滥用风险** → 保留后端 userId，匿名用户发帖/评论频率限制与实名一致，被封号同样生效
- **性能风险（打卡墙聚合查询）** → 打卡墙列表使用分页 + 缓存，避免全表扫描
- **隐私边界模糊** → 严格按预设档位 + overrides 过滤，API 层统一处理，不留后门

## Migration Plan
1. 执行 Prisma migration 创建新表
2. User 表新增 `forumPrivacySettings` 字段，默认值 `{"preset":"privacy"}`
3. StudyLog 表新增 `sharedToWall` 布尔字段，默认 `false`
4. 无需数据迁移（纯增量变更）

## Open Questions
- [ ] 学习小组是否需要群主/管理员角色？v1 建议仅创建者有管理权限
- [ ] 匿名帖子的评论是否也默认匿名？建议不强制，评论者自行选择
