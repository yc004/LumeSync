# 教师交互同步规范文档

## 概述

"教师交互同步"功能允许教师在开启该设置后，将其在课件上的所有交互操作实时同步到所有学生端。此功能适用于演示教学、操作步骤讲解等场景。

## 功能说明

### 开启方式

教师端在底部栏点击"开启同步"按钮即可开启交互同步。开启后：

- 教师端的所有交互操作（点击、拖拽、输入等）会被实时同步
- 学生端屏幕右上角会显示"同步教师交互中"提示标识
- 学生端会自动接收并执行教师的交互操作

### 应用场景

- **演示教学**：教师在教师端操作课件，学生端同步显示操作过程
- **操作步骤讲解**：教师演示软件操作步骤，学生跟随观看
- **互动游戏**：教师操作游戏角色或对象，学生端同步显示效果

## 开发方式

### 方式一：自动变量同步（推荐，简化版）

引擎提供了简化的自动同步机制，开发者只需使用类似 `useState` 的 Hook，引擎会自动处理同步逻辑。

#### 使用方法

```javascript
// 使用自动同步 Hook
const [selectedOption, setSelectedOption] = window.CourseGlobalContext.useSyncVar('quiz:option', null);

// 读取值
console.log(selectedOption);

// 设置值（教师端会自动同步到学生端并触发组件重新渲染）
setSelectedOption(newValue);
```

#### 完整示例

```javascript
function QuizSlide() {
    const [selectedOption, setSelectedOption] = window.CourseGlobalContext.useSyncVar('quiz:option', null);

    const handleOptionClick = (index) => {
        // 自动同步到学生端并触发渲染！
        setSelectedOption(index);
    };

    return (
        <div>
            {['A', 'B', 'C'].map((opt, index) => (
                <button
                    key={index}
                    onClick={() => handleOptionClick(index)}
                    className={selectedOption === index ? 'active' : ''}
                >
                    选项 {opt}
                </button>
            ))}
        </div>
    );
}
```

#### 本地变量 Hook（不自动同步）

对于不需要同步的 UI 状态，使用 `useLocalVar`：

```javascript
const [localMenuOpen, setLocalMenuOpen] = window.CourseGlobalContext.useLocalVar('local:menu', false);
```

### 方式二：手动事件同步（高级用法）

对于复杂的同步场景，可以使用手动事件同步方式。

## 数据同步规范

### 数据同步分类

#### 1. **UI 状态类数据（不推荐同步）**

以下类型的数据通常**不应该**同步，因为它们是界面显示层面的临时状态：

```javascript
// ❌ 不推荐：UI 显示状态
{
  event: 'setDropdownOpen',
  payload: { isOpen: true }
}

// ❌ 不推荐：工具栏切换
{
  event: 'setToolActive',
  payload: { tool: 'pen' }
}

// ❌ 不推荐：鼠标位置
{
  event: 'mouseMove',
  payload: { x: 123, y: 456 }
}
```

**原因**：这些状态通常是界面交互的中间状态，同步会导致用户体验混乱（如学生端看到下拉框自动打开关闭）。

#### 2. **业务逻辑类数据（推荐同步）**

以下类型的数据**应该**同步，因为它们是课件的核心业务状态：

```javascript
// ✅ 推荐：选项选择
{
  event: 'selectOption',
  payload: {
    questionId: 'q1',
    optionIndex: 2,
    selected: true
  }
}

// ✅ 推荐：元素状态切换
{
  event: 'toggleElement',
  payload: {
    elementId: 'answer-panel',
    visible: true
  }
}

// ✅ 推荐：拖拽放置
{
  event: 'dropItem',
  payload: {
    itemId: 'item-1',
    targetId: 'dropzone-a',
    position: { x: 100, y: 200 }
  }
}

// ✅ 推荐：数据更新
{
  event: 'updateValue',
  payload: {
    fieldId: 'input-1',
    value: 'Hello World'
  }
}

// ✅ 推荐：场景切换
{
  event: 'switchScene',
  payload: {
    sceneId: 'scene-b',
    transition: 'fade'
  }
}
```

#### 3. **动画效果类数据（谨慎同步）**

以下类型的数据需要**谨慎**考虑是否同步：

```javascript
// ⚠️ 谨慎：动画播放
{
  event: 'playAnimation',
  payload: {
    elementId: 'car-1',
    animation: 'drive',
    duration: 2000
  }
}
```

**建议**：只有当动画是教学内容的核心部分时才同步。简单的装饰性动画不需要同步。

## 使用方法

### 在教师端课件中发起同步

使用 `window.CourseGlobalContext.syncInteraction()` 方法发起同步：

```tsx
// 示例 1：选择题课件
const handleOptionClick = (questionId, optionIndex) => {
  // 更新本地状态
  setSelectedOption(prev => ({
    ...prev,
    [questionId]: optionIndex
  }));
  
  // 同步到学生端（只有当教师在操作时才同步）
  if (window.CourseGlobalContext?.syncInteraction) {
    window.CourseGlobalContext.syncInteraction('selectOption', {
      questionId,
      optionIndex,
      timestamp: Date.now()
    });
  }
};

// 示例 2：拖拽操作
const handleDragEnd = (event, activeId, overId) => {
  // 更新本地状态
  updateItemPosition(activeId, {
    containerId: overId,
    x: event.clientX,
    y: event.clientY
  });
  
  // 同步拖拽结果
  if (window.CourseGlobalContext?.syncInteraction) {
    window.CourseGlobalContext.syncInteraction('itemMoved', {
      itemId: activeId,
      targetId: overId,
      x: event.clientX,
      y: event.clientY
    });
  }
};

// 示例 3：切换面板显示
const togglePanel = (panelId, show) => {
  setPanels(prev => ({
    ...prev,
    [panelId]: show
  }));
  
  if (window.CourseGlobalContext?.syncInteraction) {
    window.CourseGlobalContext.syncInteraction('togglePanel', {
      panelId,
      show
    });
  }
};
```

### 在学生端课件中接收同步

监听 `teacher-interaction` 自定义事件：

```tsx
const [selectedOption, setSelectedOption] = useState({});
const [panels, setPanels] = useState({});

useEffect(() => {
  const handleTeacherInteraction = (e) => {
    const { event, payload } = e.detail;
    
    switch (event) {
      case 'selectOption':
        // 应用教师的选择
        setSelectedOption(prev => ({
          ...prev,
          [payload.questionId]: payload.optionIndex
        }));
        break;
        
      case 'itemMoved':
        // 应用教师拖拽的位置
        updateItemPosition(payload.itemId, {
          containerId: payload.targetId,
          x: payload.x,
          y: payload.y
        });
        break;
        
      case 'togglePanel':
        // 应用教师的面板状态
        setPanels(prev => ({
          ...prev,
          [payload.panelId]: payload.show
        }));
        break;
        
      default:
        console.warn('[Interaction Sync] Unknown event:', event);
    }
  };
  
  // 只在学生端且开启同步时监听
  if (!isHost && settings?.syncInteraction) {
    window.addEventListener('teacher-interaction', handleTeacherInteraction);
  }
  
  return () => {
    window.removeEventListener('teacher-interaction', handleTeacherInteraction);
  };
}, [isHost, settings?.syncInteraction]);
```

## 数据格式规范

### 标准 Payload 结构

每个交互事件都应该遵循以下标准结构：

```typescript
interface InteractionPayload {
  // 必需字段
  [key: string]: any;
  
  // 推荐字段（按需添加）
  elementId?: string;      // 元素唯一标识
  timestamp?: number;       // 操作时间戳
  userId?: string;         // 操作用户标识（预留）
  courseId?: string;       // 课程ID（由系统自动添加）
  slideIndex?: number;     // 幻灯片索引（由系统自动添加）
}
```

### 数据类型约束

- **字符串**：使用简短的英文标识符，避免使用中文
- **数字**：使用 `Number` 类型，避免字符串形式的数字
- **布尔值**：直接使用 `true/false`，避免字符串形式的布尔值
- **数组**：元素数量尽量控制在合理范围内（< 100）
- **对象**：嵌套深度不超过 3 层

### 命名规范

**事件名称（event）**：
- 使用小写字母和连字符
- 采用动词-名词结构
- 示例：`select-option`, `move-item`, `toggle-panel`

**Payload 字段名**：
- 使用小驼峰命名法（camelCase）
- 字段名要语义清晰
- 示例：`questionId`, `optionIndex`, `containerId`

## 最佳实践

### 1. 防抖和节流

对于高频触发的事件（如鼠标移动、滑动条拖动），需要进行防抖或节流：

```tsx
const debouncedSync = useMemo(
  () => debounce((event, payload) => {
    if (window.CourseGlobalContext?.syncInteraction) {
      window.CourseGlobalContext.syncInteraction(event, payload);
    }
  }, 300),
  []
);

// 在滑动条 onChange 中使用
const handleSliderChange = (value) => {
  setValue(value);
  debouncedSync('updateValue', { fieldId: 'slider-1', value });
};
```

### 2. 条件同步

只在特定条件下同步，避免不必要的网络传输：

```tsx
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

### 3. 数据验证

在接收端进行数据验证，防止无效数据导致错误：

```tsx
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

### 4. 幂等性设计

确保重复应用同一个事件不会产生副作用：

```tsx
// ✅ 好：幂等操作
const handleSelectOption = (payload) => {
  setSelectedOption(payload.optionId);  // 重复设置相同值无副作用
};

// ❌ 差：非幂等操作
const handleIncrement = (payload) => {
  setCount(prev => prev + 1);  // 重复执行会导致错误累加
};
```

## 性能优化建议

1. **减少同步频率**：使用防抖/节流控制高频事件
2. **压缩数据大小**：只同步必要的最小数据集
3. **批量同步**：将多个小操作合并为一个事件
4. **增量同步**：只同步变化的部分数据

## 常见问题

### Q: 开启同步后学生端没有响应？

A: 检查以下几点：
1. 教师端是否在"课堂设置"中开启了"同步教师交互"开关
2. 学生端是否正确监听了 `teacher-interaction` 事件
3. 浏览器控制台是否有错误信息

### Q: 如何判断一个数据是否应该同步？

A: 参考以下标准：
- **同步**：对教学内容有直接影响的业务数据
- **不同步**：界面显示、动画效果、临时交互状态

### Q: 同步数据过大导致延迟怎么办？

A: 优化方法：
1. 减少同步的字段数量
2. 使用防抖/节流降低同步频率
3. 将大对象拆分为多个小事件
4. 考虑使用 ID 引用而非完整数据

## 示例课件

完整的示例课件请参考 `public/courses/` 目录下的 `.lume` 文件，搜索 `syncInteraction` 关键字查看实际使用案例。

---

**文档版本**：v1.0  
**最后更新**：2024年3月24日
