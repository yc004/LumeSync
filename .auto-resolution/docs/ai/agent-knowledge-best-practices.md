# 萤火课件最佳实践

## 设计原则

### 1. 简单优先

避免过度复杂的交互设计，优先考虑用户理解成本。

**推荐**：
```json
{
  "type": "Button",
  "id": "btn1",
  "props": {
    "label": "开始",
    "variant": "primary"
  }
}
```

**避免**：
```json
{
  "type": "Button",
  "id": "btn1",
  "props": {
    "label": "点击此处以开始学习过程",
    "variant": "primary",
    "size": "medium",
    "borderWidth": "2px",
    "borderColor": "#FF5722",
    "hoverEffect": "scale",
    "animation": "pulse"
  }
}
```

### 2. 渐进式揭示

不要一次性展示所有内容，逐步引导学生学习。

**示例**：
```json
{
  "type": "Text",
  "id": "step1",
  "props": {
    "content": "第一步：观察图片",
    "actions": [
      {
        "event": "onClick",
        "target": "step2",
        "action": "show"
      }
    ]
  }
},
{
  "type": "Text",
  "id": "step2",
  "props": {
    "content": "第二步：思考问题",
    "style": { "display": "none" }
  }
}
```

### 3. 明确的反馈机制

每个交互操作都应该给予用户反馈。

```json
{
  "type": "Button",
  "id": "check",
  "props": {
    "label": "检查答案",
    "actions": [
      {
        "event": "onClick",
        "action": "showFeedback",
        "correct": "正确！",
        "incorrect": "再想想..."
      }
    ]
  }
}
```

### 4. 错误容错

允许学生犯错，提供重试机会。

```json
{
  "type": "Input",
  "id": "answer",
  "props": {
    "placeholder": "输入答案",
    "onInvalid": {
      "action": "showHint",
      "message": "提示：答案是数字"
    }
  }
}
```

## 交互设计

### 拖拽交互

拖拽交互适合排序、配对、分类等场景。

**配对示例**：
```json
{
  "type": "Draggable",
  "id": "item1",
  "props": {
    "content": "苹果",
    "targetId": "fruitZone",
    "onDrop": {
      "action": "showFeedback",
      "message": "正确！"
    }
  }
},
{
  "type": "DropZone",
  "id": "fruitZone",
  "props": {
    "label": "水果",
    "accept": ["item1", "item2"]
  }
}
```

**排序示例**：
```json
{
  "type": "Draggable",
  "id": "order1",
  "props": {
    "content": "1",
    "sortable": true
  }
}
```

### 选择交互

单选/多选适合测试题场景。

```json
{
  "type": "Button",
  "id": "optionA",
  "props": {
    "label": "A. 选项一",
    "selectable": true,
    "groupName": "question1",
    "onSelect": {
      "action": "checkAnswer",
      "correct": false
    }
  }
}
```

### 填空交互

适合词汇练习、数学计算等。

```json
{
  "type": "Text",
  "id": "question",
  "props": {
    "content": "苹果的英文是 ___"
  }
},
{
  "type": "Input",
  "id": "answer",
  "props": {
    "placeholder": "输入单词",
    "caseSensitive": false,
    "correctAnswers": ["apple"]
  }
}
```

## 视觉设计

### 色彩搭配

- **主题色**：选择一个主色调，用于强调和品牌识别
- **辅助色**：使用 2-3 种辅助色
- **中性色**：灰度用于背景和文本

**推荐配色**：
- 教育：蓝色系（#2196F3）
- 游戏：橙色系（#FF5722）
- 自然：绿色系（#4CAF50）
- 艺术：紫色系（#9C27B0）

### 字体层级

使用不同字号和粗细建立视觉层次。

```json
{
  "type": "Text",
  "id": "title",
  "props": {
    "content": "标题",
    "style": {
      "fontSize": "32px",
      "fontWeight": "bold"
    }
  }
},
{
  "type": "Text",
  "id": "subtitle",
  "props": {
    "content": "副标题",
    "style": {
      "fontSize": "24px",
      "fontWeight": "medium"
    }
  }
},
{
  "type": "Text",
  "id": "body",
  "props": {
    "content": "正文",
    "style": {
      "fontSize": "16px",
      "fontWeight": "normal"
    }
  }
}
```

### 间距规范

使用一致的间距单位。

```json
{
  "style": {
    "padding": "16px",
    "margin": "24px auto",
    "gap": "12px"
  }
}
```

推荐间距值：
- 8px - 极小间距
- 12px - 小间距
- 16px - 标准间距
- 24px - 中等间距
- 32px - 大间距

## 性能优化

### 图片优化

1. 使用适当尺寸的图片
2. 压缩图片文件
3. 懒加载非首屏图片

```json
{
  "type": "Image",
  "id": "img1",
  "props": {
    "src": "images/small.jpg",
    "lazyLoad": true
  }
}
```

### 组件复用

相似功能的组件应保持结构一致。

```json
// 重复使用相同模式
{
  "type": "Button",
  "id": "btn1",
  "props": {
    "label": "选项 1",
    "variant": "secondary",
    "size": "medium"
  }
}
```

### 避免过度动画

动画应有目的性，避免影响性能。

```json
{
  "type": "Text",
  "id": "text1",
  "props": {
    "content": "Hello",
    "style": {
      "animation": "fadeIn 0.5s ease"
    }
  }
}
```

## 可访问性

### 语义化命名

使用有意义的 ID 和标签。

```json
{
  "type": "Button",
  "id": "submitAnswer",
  "props": {
    "label": "提交答案",
    "ariaLabel": "提交你的答案"
  }
}
```

### 高对比度

确保文本与背景有足够的对比度。

```json
{
  "type": "Text",
  "id": "text1",
  "props": {
    "content": "Hello World",
    "style": {
      "color": "#FFFFFF",
      "backgroundColor": "#000000"
    }
  }
}
```

### 键盘导航

确保所有交互元素可通过键盘访问。

## 教学场景模式

### 知识讲解

使用图文结合、逐步揭示的方式。

```json
{
  "components": [
    {
      "type": "Text",
      "id": "concept",
      "props": {
        "content": "概念定义"
      }
    },
    {
      "type": "Image",
      "id": "example",
      "props": {
        "src": "example.jpg"
      }
    },
    {
      "type": "Button",
      "id": "next",
      "props": {
        "label": "继续学习"
      }
    }
  ]
}
```

### 练习巩固

提供即时反馈和多次尝试机会。

```json
{
  "components": [
    {
      "type": "Input",
      "id": "practice",
      "props": {
        "placeholder": "输入答案",
        "attempts": 3,
        "onFail": {
          "action": "showHint"
        }
      }
    }
  ]
}
```

### 游戏化学习

引入积分、进度、奖励机制。

```json
{
  "components": [
    {
      "type": "ScoreBoard",
      "id": "score",
      "props": {
        "label": "当前得分",
        "initial": 0
      }
    },
    {
      "type": "ProgressBar",
      "id": "progress",
      "props": {
        "current": 1,
        "total": 10
      }
    }
  ]
}
```

## 错误处理

### 友好的错误提示

避免技术性术语，使用易懂的语言。

```json
{
  "onError": {
    "action": "showMessage",
    "message": "加载失败，请刷新页面重试"
  }
}
```

### 备用方案

提供降级体验。

```json
{
  "type": "Image",
  "id": "img1",
  "props": {
    "src": "photo.jpg",
    "fallback": "images/placeholder.png"
  }
}
```

## 测试建议

### 单元测试

每个组件应独立测试。

### 集成测试

测试组件间的交互。

### 用户测试

邀请目标用户测试课件。

## 文档规范

每个复杂课件应包含：

```json
{
  "title": "课件标题",
  "description": "简短描述",
  "targetAudience": "目标年级",
  "duration": "预计时长",
  "objectives": [
    "学习目标 1",
    "学习目标 2"
  ],
  "components": []
}
```

## 版本控制

建议使用语义化版本号：

- v1.0.0 - 初始版本
- v1.1.0 - 新增功能
- v1.0.1 - 修复 bug
- v2.0.0 - 重大更新

---

## 交互同步最佳实践

### 选择合适的同步方式

根据课件需求选择自动同步或手动同步：

| 场景 | 推荐方式 | 原因 |
|------|----------|------|
| 简单状态同步 | `useSyncVar` | 代码简洁，自动处理 |
| 复杂事件同步 | `syncInteraction` | 灵活可控，可自定义 |

### 自动同步命名规范

使用 `prefix:name` 格式：

```javascript
// 好的命名
const [quizOption, setQuizOption] = useSyncVar('quiz:option', null);
const [dragPosition, setDragPosition] = useSyncVar('drag:position', { x: 0, y: 0 });
const [panelVisible, setPanelVisible] = useSyncVar('panel:visible', false);

// 避免的命名
const [opt, setOpt] = useSyncVar('opt', null);  // 太简单
const [myVariable, setMyVariable] = useSyncVar('var', null);  // 无意义
```

### 防抖高频事件

对高频触发的事件进行防抖：

```javascript
import { useMemo } from 'react';

const debouncedSync = useMemo(
  () => debounce((event, payload) => {
    if (window.CourseGlobalContext?.syncInteraction) {
      window.CourseGlobalContext.syncInteraction(event, payload);
    }
  }, 300),
  []
);

const handleSliderChange = (value) => {
  setValue(value);
  debouncedSync('updateValue', { fieldId: 'slider', value });
};
```

### 条件同步

只在必要时同步，避免不必要的网络传输：

```javascript
const handleOptionClick = (optionId) => {
  // 如果选项已经选中，不同步
  if (selectedOption === optionId) return;

  setSelectedOption(optionId);

  // 只有在教师端操作时才同步
  if (isHost && window.CourseGlobalContext?.syncInteraction) {
    window.CourseGlobalContext.syncInteraction('selectOption', { optionId });
  }
};
```

### 数据验证

在接收端进行数据验证：

```javascript
const handleTeacherInteraction = (e) => {
  const { event, payload } = e.detail;

  // 验证 payload 是否为对象
  if (!payload || typeof payload !== 'object') {
    console.error('[Interaction Sync] Invalid payload:', payload);
    return;
  }

  // 验证必需字段
  if (event === 'selectOption' && !payload.optionId) {
    console.error('[Interaction Sync] Missing required field: optionId');
    return;
  }

  // 应用数据
  // ...
};
```

### 幂等性设计

确保重复应用同一事件不会产生副作用：

```javascript
// ✅ 好：幂等操作
const handleSelectOption = (payload) => {
  setSelectedOption(payload.optionId);  // 重复设置相同值无副作用
};

// ❌ 差：非幂等操作
const handleIncrement = (payload) => {
  setCount(prev => prev + 1);  // 重复执行会导致错误累加
};
```
