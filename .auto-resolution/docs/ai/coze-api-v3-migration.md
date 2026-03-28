# Coze Chat v3 API 更新说明

## 更新时间
2026-03-27

## 变更概述
编辑器 AI 对话功能已更新为使用 Coze Chat v3 API，替换了旧版 API。

## 主要变更

### 1. API 端点变更

**旧版（废弃）：**
```
POST https://api.coze.cn/v3/chat
```

**新版：**
```
POST https://api.coze.cn/v3/chat/completions
```

### 2. 请求格式变更

**旧版请求格式：**
```json
{
  "bot_id": "738...",
  "user": "editor_user",
  "query": "用户消息",
  "stream": true
}
```

**新版请求格式：**
```json
{
  "model": "coze-chat-v3.5",
  "messages": [
    { "role": "system", "content": "系统提示词" },
    { "role": "user", "content": "用户消息" }
  ],
  "stream": true,
  "temperature": 0.7,
  "max_tokens": 2000
}
```

### 3. 响应格式变更

**旧版流式响应：**
```
event: conversation.message.delta
data: {"event":"conversation.message.delta","data":{"content":"今"}}

data: [DONE]
```

**新版流式响应：**
```
data: {"id":"...","object":"chat.completion.chunk","choices":[{"delta":{"content":"今"},"index":0,"finish_reason":null}]}

data: [DONE]
```

**非流式响应：**

旧版：
```json
{
  "messages": [
    {
      "role": "assistant",
      "content": "回复内容"
    }
  ]
}
```

新版：
```json
{
  "id": "...",
  "object": "chat.completion",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "回复内容"
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 10,
    "completion_tokens": 20,
    "total_tokens": 30
  }
}
```

## 配置变更

### 配置字段更新

| 字段 | 旧值（默认） | 新值（默认） | 说明 |
|------|-------------|-------------|------|
| Base URL | `https://api.coze.cn/v3/chat` | `https://api.coze.cn` | 去除路径 |
| API Key | `pat_...` | `pat_...` | 不变 |
| Bot ID | `738...` | `coze-chat-v3.5` | 改名为 Model |

### 新增配置参数

- **temperature**: 控制生成随机性（0-1，默认 0.7）
- **max_tokens**: 最大生成 token 数（可选）

## 功能变更

### 1. 支持的模型

新版 API 支持以下模型：
- `coze-chat-v3.5`（默认）
- `coze-chat-4.0`（如有）

### 2. 多模态支持

当前版本：
- ✅ 文本消息
- ✅ 代码文件附件
- ❌ 图片附件（暂不支持，后续版本将支持）

### 3. 流式传输优化

- 流式传输已修复，现在可以实时显示 AI 的思考过程
- 传输完成前会保留完整内容（包括代码块）
- 传输完成后自动隐藏代码块，显示简洁提示

## 迁移指南

### 用户需要做什么？

如果已配置了旧版 API：

1. **更新 Base URL**
   ```
   旧：https://api.coze.cn/v3/chat
   新：https://api.coze.cn
   ```

2. **更新 Model（原 Bot ID）**
   ```
   旧：738...（数字 ID）
   新：coze-chat-v3.5（模型名称）
   ```

3. **测试连接**
   - 点击"测试连接"按钮验证配置

### 兼容性说明

- ✅ 旧版 API 配置会被自动迁移到新版
- ✅ API Key 不需要更改
- ✅ 历史对话记录保持不变

## 技术细节

### 后端变更（electron/main-editor.js）

1. **proxy-ai-chat IPC 处理器**
   - 更新请求格式为 Chat v3 标准
   - 更新流式响应解析逻辑
   - 支持 `model` 参数

2. **test-ai-connection IPC 处理器**
   - 更新端点路径
   - 更新请求格式
   - 使用 `messages` 而非 `query`

### 前端变更（public/editor/01-ai-chat.js）

1. **消息构建逻辑**
   - 移除多模态 content 格式（新版暂不支持）
   - 简化为纯文本消息

2. **流式显示优化**
   - 添加 `isStreaming` 状态检测
   - 流式传输时显示完整内容
   - 传输完成后隐藏代码块

3. **配置界面**
   - 更新字段标签（Bot ID → Model）
   - 更新默认值
   - 更新 placeholder 文本

## 参考资料

- [Coze Chat v3 官方文档](https://www.coze.cn/open/docs/developer_guides/chat_v3)
- [API 调用示例](https://www.coze.cn/open/docs/developer_guides/chat_v3#example)

## 问题反馈

如遇到问题，请检查：
1. Base URL 是否正确（应为 `https://api.coze.cn`）
2. Model 是否正确（如 `coze-chat-v3.5`）
3. API Key 是否有效
4. 网络连接是否正常
