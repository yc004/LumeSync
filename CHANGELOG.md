# 更新日志

## [当前版本] - 2026-03-27

### Coze SDK 集成

#### 核心变更
- ✅ 集成 Coze 官方 SDK (@coze/api v1.3.9)
- ✅ 使用 Coze SDK 重构 AI 聊天代理接口
- ✅ 添加 AI 配置 IPC 接口到编辑器预加载脚本
- ✅ 新增 `docs/coze-sdk-migration.md` 迁移文档

#### 代码更新 (electron/main-editor.js)
- ✅ `test-ai-connection` 改用 SDK 的 stream 方法
- ✅ `proxy-ai-chat` 使用 SDK 的异步迭代器处理流式响应
- ✅ 参数从 `model` 改为 `bot_id`
- ✅ 移除手动 SSE 解析代码

#### 代码更新 (server/routes.js)
- ✅ `/ai/proxy` 路由使用 Coze SDK
- ✅ 支持流式响应处理
- ✅ 自动处理 usage 统计

#### 代码更新 (electron/preload.js)
- ✅ 添加 AI 配置接口: `getAIConfig`, `saveAIConfig`
- ✅ 添加 AI 测试接口: `testAIConnection`
- ✅ 添加 AI 聊天接口: `proxyAIChat`
- ✅ 添加事件监听器: `onAIChatData`, `onAIChatError`

#### 配置更新
- ✅ 默认 baseURL 更改为 `https://api.coze.cn`
- ✅ 默认 model 改为空字符串（需使用 Bot ID）

#### 技术细节
- SDK 自动处理 SSE 流解析，无需手动处理
- 使用 `conversation.message.delta` 事件获取增量内容
- 支持 temperature 参数控制生成随机性
- 设置 `auto_save_history: false` 避免自动保存对话历史

### Coze API v3 迁移

#### 后端更新 (electron/main-editor.js)
- ✅ 更新 `proxy-ai-chat` IPC 处理器，使用 v3 API 端点 `/v3/chat/completions`（已废弃，改用 SDK）
- ✅ 更新 `test-ai-connection` 处理器，支持 v3 模型测试（已废弃，改用 SDK）
- ✅ 移除旧版 v1 Bot API 相关代码

#### 前端更新 (public/editor/01-ai-chat.js)
- ✅ 更新配置字段：`botId` → `model`
- ✅ 更新默认模型名称为 `coze-chat-v3.5`
- ✅ 更新测试连接和消息发送逻辑
- ✅ 同步更新所有相关代码

#### 服务端更新 (server/routes.js)
- ✅ 更新 `/ai/proxy` 路由，使用 v3 API 端点

#### 文档更新
- ✅ 更新 `docs/API.md`，添加 AI 编辑器配置章节
- ✅ 修正 `docs/coze-api-v3-migration.md` 中的 API 端点路径
- ✅ 记录 RAG 知识库已迁移至 Agent 系统

#### 重大变更
- ⚠️ **移除向量数据库 RAG 系统**：删除 `data/vector-knowledge.db*`、`server/vector-database.js`、`server/vector-embedding.js`
- ✅ **采用基于 Agent 的知识系统**：通过系统提示词和知识块提供知识支持
- ⚠️ **API 配置需要更新**：用户需要更新 Base URL 和 Model 配置

### 修复问题
- ✅ 修复 HTTP 404 错误（API 端点路径不正确）
- ✅ 修复 Coze Bot API 与 v3 Chat API 混用问题

---

## [v2.5.0] - 2026-03-26

### 新增功能

#### 投票组件 (VoteSlide)
- ✅ 添加通用投票组件，支持实时投票统计
- ✅ 教师端发起投票，可设置时长（10-300秒）
- ✅ 学生端接收投票弹窗，选择后提交
- ✅ 实时显示投票结果（票数和百分比）
- ✅ 支持匿名/实名两种投票模式
- ✅ 可视化进度条展示结果
- ✅ 倒计时显示剩余时间

#### 服务端支持
- ✅ 添加投票 Socket 事件处理（`vote:start`, `vote:submit`, `vote:result`, `vote:end`）
- ✅ 投票数据存储和统计
- ✅ 实时广播投票结果

#### 文档更新
- ✅ 更新 API 文档，添加 VoteSlide 说明
- ✅ 创建投票组件使用指南 (`docs/vote-component-guide.md`)
- ✅ 创建知识库更新指南 (`docs/knowledge-update-guide.md`)
- ✅ 更新知识库，添加投票组件相关知识

### 知识库更新

#### 互动组件 (interactive-components.js)
- 新增：投票组件 (VoteSlide) 使用说明
- 包含功能概述、基本用法、配置格式、使用场景、完整示例

#### 系统API (system-api.js)
- 新增：内置组件库说明
- 包含 VoteSlide、SurveySlide、WebPageSlide 使用方法

#### 最佳实践 (best-practices.js)
- 新增：组件复用最佳实践
- 新增：互动设计最佳实践
- 新增：无障碍设计最佳实践

#### 知识库管理
- 创建 `public/knowledge/categories/README.md` - 知识库分类管理说明
- 创建 `docs/knowledge-update-guide.md` - 知识库更新指南

### 改进
- 修复知识库窗口圆角显示问题（添加 `overflow-hidden`）
- 优化知识库分类管理，支持独立文件维护

## 知识库分类统计

| 分类 | 知识数量 | 说明 |
|------|---------|------|
| 系统API | 7条 | API使用、内置组件 |
| 互动组件 | 4条 | 选择题、填空题、拖拽、投票 |
| 教学策略 | 6条 | 不同年龄段教学策略 |
| 动画效果 | 1条 | CSS动画 |
| 样式系统 | 1条 | Tailwind CSS |
| 状态管理 | 1条 | React Hooks |
| 多媒体 | 1条 | 图片视频处理 |
| 最佳实践 | 4条 | 性能优化、组件复用、设计 |
| **总计** | **25条** | 内置知识 |

## 技术细节

### 投票组件架构
- **前端组件**: `public/components/VoteSlide.js`
- **服务端处理**: `server/socket.js` (Socket事件处理)
- **知识库**: `public/knowledge/categories/interactive-components.js`

### Socket 事件流
```
教师端 → vote:start → 服务端 → vote:start → 学生端
学生端 → vote:submit → 服务端 → vote:result → 教师端
教师端 → vote:end → 服务端 → vote:end → 全部
```

### 知识库更新流程
每次添加新功能时：
1. 在对应分类中添加功能说明
2. 在 system-api.js 中添加组件库说明（如果是组件）
3. 在 best-practices.js 中添加最佳实践
4. 更新 API 文档
5. 创建或更新功能使用指南
6. 验证 AI 编辑器能否检索到新知识

## 未来的改进计划

- [ ] 支持投票结果导出（CSV格式）
- [ ] 支持多选题投票
- [ ] 支持自定义投票主题
- [ ] 添加投票历史记录
- [ ] 支持匿名投票时的随机化选项顺序
- [ ] 添加投票分析图表（饼图、柱状图）

## 开发者提示

### 如何使用投票组件
```tsx
function MySlide() {
    return (
        <VoteSlide config={{
            id: 'my-poll',
            question: '问题',
            anonymous: true,
            options: [
                { id: 'opt1', label: '选项1' },
                { id: 'opt2', label: '选项2' }
            ]
        }} />
    );
}
```

### 如何添加新功能到知识库
参考 `docs/knowledge-update-guide.md` 文档，按照以下步骤：
1. 确定更新内容和分类
2. 编写知识条目（包含示例代码）
3. 更新API文档和指南
4. 验证检索效果

---

**维护说明**：每次添加新功能时，请同步更新此 CHANGELOG.md 文件。
