# 课件格式、加载器与课程 SDK

状态：**当前 Core 检出源码 + 新编辑器 MVP 格式**（2026-09-26）；Core 与教师仓库锁定的提交不一致，端到端兼容尚未验证。旧编辑器与 VS Code 插件不在目标架构内。

## 课程发现与优先级

教师服务递归扫描 `coursesDir`，允许 `.lume`、`.tsx`、`.ts`、`.jsx`、`.js`、`.pdf`。同一相对路径基名存在多个扩展名时，会按实现中的扩展名优先级保留一个，`.lume` 排最前。文件/文件夹 ID 由相对路径 base64url 编码，不是持久不变的数据库主键；移动文件会改变 ID。`GET /api/courses` 返回目录，`/courses/*` 提供实际文件。

## ZIP `.lume` 结构

当前新格式的 `.lume` 是 ZIP，根目录必须有 `manifest.json`。下面是与仓库测试课件相符的最小示意；字段可按实际页面扩充：

```text
lesson.lume
├── manifest.json
├── slides/
│   └── Intro.tsx
└── assets/
    └── figure.svg
```

```json
{
  "schemaVersion": "1.0.0",
  "id": "lesson",
  "title": "示例课",
  "runtime": {"format": "lumesync-zip", "entryMode": "pages", "slideModule": "tsx"},
  "pages": [{"id": "intro", "file": "slides/Intro.tsx", "title": "第一页"}],
  "assets": {"assets/figure.svg": {"type": "image/svg+xml"}}
}
```

`validateLumeManifest` 目前只强制检查：`runtime.format === 'lumesync-zip'`、`entryMode` 为 `pages` 或 `legacy-course-data`、`pages` 非空、每页有 `file`。它**没有**全面校验 `schemaVersion`、MIME、资源大小或页面字段。`pages` 数组决定播放顺序，`file` 指向 ZIP 内文件。`pages` 模式期望每个 TSX 模块默认导出 React 组件，或按 `exportName` / 文件基名找到导出。`legacy-course-data` 则编译第一页脚本并期望它注册 `window.CourseData`。

> 服务端已改用[共享契约](contracts.md) `packages/course-format` 的校验器（`schemaVersion`、`entryMode`、`pages[].file` 是否存在、资源引用、ZIP 路径/大小/压缩比），教师服务课程扫描对不合规课件返回 `invalid` 原因。浏览器运行时仍保留上面这份较弱的 `validateLumeManifest`，两者的统一属于下一步（见[迁移状态](../status/migration.md)）。

加载过程：HTTP 下载 ZIP → JSZip 解包 → 读取/校验 manifest → 为 assets 建 Blob URL 并在换课时释放 → Babel Standalone 用 React/TypeScript preset 编译 TSX（模块用 CommonJS 转换）→ `new Function` 执行 → 渲染 React 元素。`require` 只显式映射 `react`、`react-dom`、`@lumesync/course-sdk` / `lumesync-course-sdk`，其他包名会抛错；额外脚本依赖应通过课件 `dependencies` 和服务端 `/lib` 缓存路径处理。课件与课堂页处于同一个 JS 上下文，**没有隔离沙箱**。`assetUrl('assets/figure.svg')` 返回解包后的 Blob URL；源码还会改写部分 JSX 字面量 `src`/`href`/`poster` 路径。

运行时还有旧文本 `.lume`、TSX/JS 页面和 PDF 的兼容分支；它们与 ZIP manifest 不共享完整的构建约束。建议新课件以仓库的 `zip-format-smoke-test` 示例为可审查起点，并在当前运行时实机验证。

### 新编辑器 MVP 的源文件

`apps/editor` 写出的 ZIP 包仍使用当前 `schemaVersion: 1.0.0` 与 `runtime.entryMode: pages`，但增加 `manifest.editor` 标记源文档格式，并包含：

```text
lesson.lume
├── manifest.json                 # pages 指向当前播放器兼容 TSX
├── source/course.json            # 文档元数据、主题 token、页面顺序
├── source/pages/<id>.json        # 可编辑声明式标准组件树
├── source/extensions/<id>.json   # 课件锁定的声明式组件定义（可选）
├── slides/<id>.tsx               # 由 core.* 组件定义生成的兼容输出
└── build/build-manifest.json     # source/output SHA-256 摘要和构建器标识
```

`packages/course-model` 校验四种内置组件和用户导入的声明式模板组件。`source/course.json` 可包含 `extensions: [{id, version, hash}]`；每个锁定包的 JSON 定义位于 `source/extensions/<id>.json`，并参与输入摘要。扩展 `.lumex` 包仅允许根目录 `extension.json`，当前字段表支持文本、数字、布尔值、颜色和枚举；模板由受限标签、样式和文本/属性引用组成，不执行包内 JavaScript。一个课件对同一扩展 ID 只能锁定一个版本。

当前 Core 源码识别 `manifest.editor` 后读取声明式 source，校验 schema、组件包 hash 和输入/输出摘要，再通过白名单 React 元素渲染，不编译或执行这些课件的 TSX。生成的 TSX 是旧版 Core 的兼容输出；旧版 Core 仍走 Babel。Core 当前检出与根仓锁定版本不一致，真实教室联调尚未完成。带行为的插件、包内媒体/样式资源、隔离运行时和通用预编译产物仍需后续版本化运行时契约；当前用户组件支持是安全的声明式组件切片，不是任意代码插件支持。

## `CourseGlobalContext` 实际能力

当前浏览器运行时向 `window.CourseGlobalContext` 注入课件上下文，`@lumesync/course-sdk` import 映射到该对象。以下依据 `core/src/browser/engine/runtime/app.tsx`、`sync-classroom.tsx`，是实现观察，不等于稳定版本化 SDK。

| 成员 | 当前行为 |
| --- | --- |
| `isHost`、`getSocket()`、`getCurrentCourseMeta()` | 当前角色、Socket 对象、课程 ID 与页码 |
| `useSyncVar(key, initial, {onChange?})` | 类 Hook 的共享变量；host 修改且 `syncInteraction` 开启时发 `sync-var`；viewer 接收对应课程/页的更新 |
| `useLocalVar(key, initial, {onChange?})` | 仅本地变量，不通过 Socket |
| `syncInteraction(event, payload)` | 发课堂交互同步事件；具体转发受服务器设置限制 |
| `getStudentInfo()` | 当前学生信息；教师端不应假定有学生身份 |
| `submitContent({content,fileName?,mergeFile?})` | 学生发 `student:submit`，按 `submissionId` 等结果，10 秒超时；教师端调用会报错 |
| `setVoteToolbarState(patch)`、`clearVoteToolbarState()` | 课件控制投票工具栏显示状态 |
| `getCamera(onStream)`、`releaseCamera()`、`unregisterCamera(onStream)` | 调用页面的相机管理器；依赖浏览器权限 |
| `canvas` | 页面注入的画布上下文；可用性取决于当前加载路径 |

`useSyncVar` 和 `useLocalVar` 内部使用 React Hook，必须在 React 组件/Hook 的合法调用位置使用。同一个 `key` 的值保存在当前课件上下文 Map 中；重连时 viewer 发 `request-sync-state`，host 返回 `full-sync-state`。这是临时课堂状态，不是持久数据库。学生提交链路和消息字段见 [Socket 事件](socket-events.md#学生提交链路)。

`assetUrl(path)` 是 ZIP TSX 编译执行时单独注入的函数参数，不是 `CourseGlobalContext` 成员；可用它引用包内 `assets/*`。

旧 `shared/docs/dev/API.md` 提及 `registerSyncVar` / `registerVar`，但本次在当前运行时中未找到相应注入实现，因此不将它们列为可用 API。类型声明和运行时存在漂移风险；新编辑器设计前应以同一源码包生成 SDK 类型、schema、示例和文档。
