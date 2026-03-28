# Coze SDK 迁移说明

## 概述

本文档记录了从使用 `fetch` API 调用 Coze API v3 迁移到使用 `@coze/api` 官方 SDK 的过程。

## 迁移时间

2026-03-27

## 主要变更

### 1. 依赖安装

```json
{
  "dependencies": {
    "@coze/api": "^1.3.9"
  }
}
```

### 2. 核心代码变更

#### electron/main-editor.js

**测试连接接口**
- **之前**: 使用 `fetch` 调用 `/v3/chat/completions` 端点
- **之后**: 使用 `CozeAPI` 客户端调用 `chat.stream()` 方法

**AI 聊天代理接口**
- **之前**: 手动处理 SSE 流解析
- **之后**: SDK 自动处理流式响应，通过 `for await` 迭代获取数据块

#### server/routes.js

**AI 助手代理接口**
- **之前**: 使用 `fetch` 调用 Coze API v3
- **之后**: 使用 `CozeAPI` 客户端

#### electron/preload.js

- 添加了 AI 相关的 IPC 接口:
  - `getAIConfig()`: 获取 AI 配置
  - `saveAIConfig(config)`: 保存 AI 配置
  - `testAIConnection(payload)`: 测试连接
  - `proxyAIChat(payload)`: 代理聊天请求
  - 事件监听器: `onAIChatData`, `onAIChatError` 等

### 3. API 参数变化

#### 模型标识
- **之前**: 使用 `model` 参数传递模型名称
- **之后**: 使用 `bot_id` 参数传递 Bot ID

#### 消息格式
- **之前**: 标准格式 `{ role, content }`
- **之后**: 相同格式，但 SDK 内部处理

#### 流式响应事件
- `conversation.message.delta`: 增量内容块
- `conversation.message.completed`: 消息完成事件

### 4. 默认配置更新

```javascript
{
  apiKey: '',
  baseURL: 'https://api.coze.cn',  // 从 https://api.openai.com/v1 更改
  model: ''  // 需要使用实际的 Bot ID
}
```

## 代码示例

### 初始化客户端

```javascript
const CozeAPI = require('@coze/api');

const cozeClient = new CozeAPI({
    baseURL: 'https://api.coze.cn',
    token: 'your-api-key'
});
```

### 发送流式聊天请求

```javascript
const response = await cozeClient.chat.stream({
    bot_id: 'your-bot-id',
    additional_messages: [
        { role: 'user', content: '你好' }
    ],
    auto_save_history: false,
    temperature: 0.7
});

let fullContent = '';
for await (const chunk of response) {
    if (chunk.event === 'conversation.message.delta') {
        fullContent += chunk.data.content;
        console.log('增量:', chunk.data.content);
    }
}

console.log('完整内容:', fullContent);
```

## 优势

1. **类型安全**: SDK 提供更好的类型支持
2. **错误处理**: 内置完善的错误处理机制
3. **流式处理**: 自动处理 SSE 流，无需手动解析
4. **维护性**: 官方维护，与 API 同步更新
5. **简洁性**: 代码更简洁，可读性更好

## 注意事项

1. **Bot ID**: 现在使用 `bot_id` 而不是 `model` 参数
2. **自动保存历史**: 设置 `auto_save_history: false` 避免自动保存对话历史
3. **温度参数**: 传递 `temperature` 参数控制生成随机性
4. **超时处理**: 需要手动实现超时控制（SDK 不内置）

## 测试建议

1. 测试连接功能
2. 测试流式响应
3. 测试非流式响应
4. 测试错误处理
5. 测试参数传递（temperature 等）

## 参考文档

- [Coze API 官方文档](https://www.coze.cn/docs/developer_guides/chat_v3)
- [@coze/api NPM 包](https://www.npmjs.com/package/@coze/api)
