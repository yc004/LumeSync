# LumeSync Core

LumeSync Core 是 LumeSync 的核心运行时 SDK。它负责提供跨端复用的课堂运行能力、课件渲染运行时、Socket 身份与转发控制、以及可独立启动的 Core Runtime Server。

Core 是一个独立仓库，可以单独构建、测试、发布为 npm 包；教师端通过 Git submodule 的方式把它嵌入到 `packages/course-runtime` 中使用。

## 定位

Core 只承载“通用能力”，不承载教师端产品界面。

Core 负责：

- 课件加载与执行环境。
- 课件舞台渲染运行时。
- 课件可复用组件。
- Canvas、侧边工具栏、摄像头、资源加载等通用浏览器运行时能力。
- Socket 身份认证、host/viewer 房间、事件转发。
- viewer session token 的创建与校验。
- 独立 Core Runtime Server。
- 面向外部项目的 npm SDK 发布。

Core 不负责：

- 教师端机房视图。
- 教师端课程选择页。
- 教师端设置面板。
- 教师端学生等待页。
- 教师端提交浏览器。
- 教师端 native shell。
- 教师端安装器。
- 教师端课程文件存储、提交文件存储、产品级业务流程。

这些教师端 UI 与业务能力属于 `LumeSync-Teacher` 仓库。

## 仓库关系

```text
SyncClassroom/
  repos/
    teacher/              # 教师端仓库
      core/               # LumeSync-Core 子模块
```

Core 的独立仓库地址：

```text
https://github.com/yc004/LumeSync-Core
```

教师端通过 `apps/teacher/.gitmodules` 引用 Core：

```text
[submodule "core"]
  path = core
  url = https://github.com/yc004/LumeSync-Core.git
```

这意味着 Core 的代码应该先在 `LumeSync-Core` 仓库中提交和发布，然后教师端仓库只更新 submodule 指针。

## npm 包

包名：

```text
@lumesync/core
```

构建产物：

```text
dist/
  cjs/       # CommonJS
  esm/       # ES Module
  types/     # TypeScript declaration files
  browser/   # 浏览器端课件运行时源码资产
```

Core 发布时会包含：

- `dist/`
- `packages/` 兼容入口
- `README.md`
- `LICENSE`

## 对外导出

Core 使用 package exports 暴露稳定入口。新代码应该只依赖这些入口，不应该引用内部文件路径。

```ts
import { createCoreServer } from '@lumesync/core';
import { createViewerSessionToken } from '@lumesync/core/identity';
import { setupSocketHandlers } from '@lumesync/core/runtime-control';
import { getTeacherRenderEngineSources } from '@lumesync/core/render-engine';
```

可用入口：

```text
@lumesync/core
@lumesync/core/identity
@lumesync/core/runtime-control
@lumesync/core/render-engine
@lumesync/core/server
```

### `@lumesync/core`

聚合入口，导出 Core 的主要公共 API。

适合外部 SDK 使用者快速接入：

```ts
import {
  createCoreServer,
  createViewerSessionToken,
  setupSocketHandlers,
} from '@lumesync/core';
```

### `@lumesync/core/identity`

身份与 viewer token 相关 API。

主要导出：

- `normalizeIp(rawIp)`
- `createViewerSessionToken(options)`
- `verifyViewerSessionToken(token, secret)`

示例：

```ts
import {
  createViewerSessionToken,
  verifyViewerSessionToken,
} from '@lumesync/core/identity';

const token = createViewerSessionToken({
  clientId: 'student-001',
  ttlSec: 4 * 60 * 60,
  secret: process.env.LUMESYNC_VIEWER_TOKEN_SECRET!,
});

const result = verifyViewerSessionToken(
  token,
  process.env.LUMESYNC_VIEWER_TOKEN_SECRET!,
);
```

### `@lumesync/core/runtime-control`

Socket runtime control 相关 API。

主要导出：

- `setupSocketHandlers(io, options)`
- `buildCoreRuntimeSnapshot(io)`
- `listCompatibilityStudents(io)`
- `listCompatibilityLog(io)`

它负责：

- 校验 host token。
- 校验 viewer session token。
- 分配 `hosts` / `viewers` 房间。
- 发送 `role-assigned`、`identity-rejected`、`participant-joined`、`participant-left`。
- 转发 host/viewer 之间的业务事件。
- 支持 `targetId` 定向转发。
- 提供兼容学生列表和兼容日志。

### `@lumesync/core/render-engine`

浏览器端课件运行时资源定位 API。

主要导出：

- `resolveEngineSrcDir()`
- `resolveEngineDevelopmentSrcDir()`
- `getTeacherRenderEngineSources(options)`
- `getTeacherRenderEngineSourceOrder()`

教师端 `server/src/teacher-shell-build.js` 使用这个入口获取浏览器运行时源码列表，而不是硬编码文件路径。

### `@lumesync/core/server`

独立 Core Runtime Server。

主要导出：

- `createCoreServer(options)`
- `app`
- `server`
- `io`
- `startServer`

可以作为独立服务启动，也可以被其他 Node.js 应用嵌入。

## 源码结构

```text
src/
  node/
    identity.ts
    render-engine.ts
    runtime-control.ts

  server/
    create-core-server.ts
    index.ts

  public-api/
    index.ts

  browser/
    engine/
      runtime/
        globals.tsx
        sync-classroom.tsx
        resource-loader.tsx
        camera-manager.tsx
        app.tsx

      course-components/
        survey-slide.tsx
        vote-slide.tsx
        web-page-slide.tsx
```

### `src/node`

Node.js SDK 层。

- `identity.ts`：viewer session token 创建、校验、IP 标准化。
- `runtime-control.ts`：Socket 身份解析、房间管理、事件转发、兼容状态。
- `render-engine.ts`：浏览器端 engine 源码路径解析与 manifest。

### `src/server`

独立 Core Runtime Server。

它提供：

- `/api/health`
- `/api/runtime-status`
- `/api/students`
- `/api/student-log`
- `/api/session/bootstrap`
- `/engine`

它不托管教师端课程管理页面，也不持有教师端课程文件业务。

### `src/browser/engine/runtime`

浏览器端课件运行时。

- `globals.tsx`：注入 React hooks、Canvas 工具、通用 UI 工具。
- `resource-loader.tsx`：脚本资源加载与 fallback。
- `camera-manager.tsx`：课件摄像头能力。
- `sync-classroom.tsx`：课件舞台、翻页同步、标注、投票工具栏、提交相关运行能力。
- `app.tsx`：课件加载、PDF 课件支持、Zip `.lume` 课件装载、`LumeSyncRenderEngine` 暴露。

## 课件加载模型

Core 浏览器运行时的最终运行数据结构仍然是 `CourseData`。无论课件来源是 PDF、旧版脚本课件，还是新版 Zip `.lume`，最终都会被转换成：

```ts
type CourseData = {
  id?: string;
  title?: string;
  icon?: string;
  desc?: string;
  color?: string;
  slides: Array<{
    id?: string;
    title?: string;
    component: React.ReactNode;
    scrollable?: boolean;
  }>;
};
```

这样 `sync-classroom.tsx`、翻页同步、标注、投票、提交等运行时能力不需要感知课件物理格式。

### Zip `.lume`

新版 `.lume` 是标准 Zip 包，入口固定为包根目录下的 `manifest.json`。Core 只读取 Zip 内部路径，所有路径都使用 `/` 分隔，不使用 Windows 反斜杠。

```text
/
├── manifest.json
├── slides/
│   ├── Intro.tsx
│   ├── Activity.tsx
│   └── Summary.tsx
└── assets/
    ├── cover.png
    ├── demo.mp4
    └── data.json
```

推荐约定：

- `manifest.json`：课件清单，声明元数据、运行时、页面顺序、资源、外部依赖。
- `slides/*.tsx`：页面源码。每个页面文件默认导出一个 React 组件，或通过 `exportName` 指定命名导出。
- `assets/*`：图片、音视频、字体、数据文件等课件内置资源。
- 课件页面顺序只由 `manifest.pages` 决定，文件名不会自动排序。

浏览器运行时会按以下流程加载：

1. `fetch(course.file)` 获取 `.lume` 二进制。
2. 通过 JSZip 解包。
3. 读取 `manifest.json` 并按 `pages` 顺序加载页面。
4. 将 `assets/*` 转为 `URL.createObjectURL(blob)`。
5. 编译并执行 `slides/*.tsx`。
6. 将页面组件组装为标准 `CourseData.slides`。

#### 标准 `manifest.json`

下面是推荐的标准配置。字段可以按需裁剪，但 `runtime.format`、`runtime.entryMode`、`pages` 是新版 Zip 课件的核心字段。

```json
{
  "schemaVersion": "1.0.0",
  "id": "ai-literacy-demo",
  "title": "人工智能通识课",
  "version": "1.0.0",
  "author": {
    "name": "LumeSync",
    "email": "course@example.com"
  },
  "createdAt": "2026-04-18T00:00:00.000Z",
  "updatedAt": "2026-04-18T00:00:00.000Z",
  "icon": "AI",
  "desc": "面向课堂演示的人工智能互动课件",
  "color": "from-emerald-500 to-cyan-600",
  "runtime": {
    "format": "lumesync-zip",
    "react": "18",
    "slideModule": "tsx",
    "entryMode": "pages",
    "preferredAspectRatio": "16:9"
  },
  "dependencies": [
    {
      "name": "chartjs",
      "localSrc": "/lib/chart.umd.min.js",
      "publicSrc": "https://fastly.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"
    }
  ],
  "modelsUrls": {
    "local": "/weights",
    "public": "https://fastly.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights"
  },
  "pages": [
    {
      "id": "intro",
      "file": "slides/Intro.tsx",
      "title": "课程导入",
      "scrollable": false,
      "transition": {
        "type": "fade",
        "duration": 260,
        "easing": "ease-out"
      }
    },
    {
      "id": "activity",
      "file": "slides/Activity.tsx",
      "title": "互动探究",
      "exportName": "ActivitySlide",
      "scrollable": true,
      "transition": {
        "type": "slide",
        "direction": "left",
        "duration": 320,
        "easing": "ease-in-out"
      }
    }
  ],
  "assets": {
    "assets/cover.png": {
      "type": "image/png",
      "size": 245760,
      "usage": ["intro"]
    },
    "assets/demo.mp4": {
      "type": "video/mp4",
      "usage": ["activity"]
    }
  }
}
```

#### 顶层配置项

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `schemaVersion` | string | 推荐 | 课件清单版本。当前推荐 `1.0.0`。 |
| `id` | string | 推荐 | 课件稳定 ID。教师端扫描时可使用该值作为课程 ID；缺省时宿主可用文件路径生成 ID。 |
| `title` | string | 推荐 | 课件标题。 |
| `version` | string | 可选 | 课件内容版本。 |
| `author` | object/string | 可选 | 作者信息。对象形式推荐包含 `name`、`email`。 |
| `createdAt` | string | 可选 | ISO 时间字符串。 |
| `updatedAt` | string | 可选 | ISO 时间字符串。 |
| `icon` | string | 可选 | 教师端课程卡片图标文本。 |
| `desc` / `description` | string | 可选 | 课件简介。`desc` 优先用于转换到 `CourseData.desc`。 |
| `color` | string | 可选 | 教师端课程卡片色彩标记，由宿主 UI 解释。 |
| `runtime` | object | 必填 | 运行时配置。见下表。 |
| `pages` | array | 必填 | 页面列表和播放顺序。至少包含 1 个页面。 |
| `assets` | object | 可选 | 内置资源清单。Core 会同时扫描 Zip 中实际存在的 `assets/*`。 |
| `dependencies` | array/object | 可选 | 外部脚本依赖声明。教师端可据此预缓存脚本，浏览器运行时按顺序加载。 |
| `modelsUrls` | object | 可选 | 模型资源地址配置，常用于 face-api 等模型文件。 |

#### `runtime` 配置项

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `format` | string | 必填 | 必须为 `lumesync-zip`。不是该值时 Core 会拒绝作为新版 Zip 课件加载。 |
| `entryMode` | string | 必填 | `pages` 或 `legacy-course-data`。 |
| `slideModule` | string | 推荐 | 当前推荐 `tsx`，表示页面源码按 React + TypeScript 编译。 |
| `react` | string | 可选 | 课件声明的 React 目标版本。当前宿主提供 React 18。 |
| `preferredAspectRatio` | string | 可选 | 推荐画布比例，例如 `16:9`。当前主要由宿主舞台布局解释。 |

支持的 `runtime.entryMode`：

- `pages`：主路径，一页一个 `slides/*.tsx` 文件。每个文件导出 React 组件，Core 将其组装到 `CourseData.slides`。
- `legacy-course-data`：迁移兼容路径，执行包装后的旧源码并读取 `window.CourseData`。

#### `pages[]` 配置项

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `id` | string | 推荐 | 页面稳定 ID。缺省时使用 `file`。 |
| `file` | string | 必填 | Zip 内页面源码路径，例如 `slides/Intro.tsx`。 |
| `title` | string | 可选 | 页面标题，可用于目录、导出或调试。 |
| `exportName` | string | 可选 | 页面文件使用命名导出时指定导出名。未设置时按 `default`，再按文件名推断。 |
| `scrollable` | boolean | 可选 | 是否允许页面内容滚动。默认 `false`。 |
| `transition` | object | 可选 | 页面切换动效元数据。当前由宿主或后续运行时解释。 |

页面模块示例：

```tsx
export default function IntroSlide() {
  return (
    <section className="flex h-full items-center justify-center bg-white text-slate-900">
      <h1 className="text-5xl font-bold">人工智能通识课</h1>
    </section>
  );
}
```

命名导出示例：

```tsx
export function ActivitySlide() {
  return <div className="h-full bg-white p-8">互动探究</div>;
}
```

对应 `manifest.pages[]`：

```json
{
  "id": "activity",
  "file": "slides/Activity.tsx",
  "exportName": "ActivitySlide"
}
```

资源路径处理：

- 支持 `<img src="assets/logo.png" />`。
- 支持 `<video src="assets/demo.mp4" />`。
- 支持 `<source src="assets/audio.mp3" />`。
- 找不到资源时保留原路径并输出 warning。
- 资源路径会在编译前被改写为 Object URL，只对 JSX 属性中的 `src`、`href`、`poster` 生效。

`assets` 清单用于描述资源，不强制要求完整列出所有资源。Core 会把清单中的路径和 Zip 内实际存在的 `assets/*` 合并处理。推荐字段：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `type` | string | MIME 类型，例如 `image/png`、`video/mp4`、`application/json`。 |
| `size` | number | 文件大小，单位字节。可用于打包校验或宿主展示。 |
| `usage` | string[] | 使用该资源的页面 ID 列表。 |

外部脚本依赖需要在 `manifest.json` 中声明：

```json
{
  "dependencies": [
    {
      "name": "chartjs",
      "localSrc": "/lib/chart.umd.min.js",
      "publicSrc": "https://fastly.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"
    }
  ]
}
```

`dependencies` 支持数组形式，推荐每项包含：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `name` | string | 可选 | 依赖名称，仅用于可读性。 |
| `localSrc` | string | 必填 | 本地加载地址。脚本缓存目前推荐 `/lib/<filename>.js`。 |
| `publicSrc` | string | 必填 | 远程下载地址。首次缓存或本地缺失时使用。 |

教师端选中课件时会调用 Core 的脚本缓存能力，先检查 `localSrc` 对应的本地缓存文件；如果不存在，则从 `publicSrc` 拉取并写入本地 `/lib` 缓存目录。浏览器运行时仍会按声明顺序加载 `/lib/...`，这样首屏播放不会再依赖临时注册。

注意事项：

- `dependencies` 只负责外部脚本，不负责课件内 `assets/*`。
- 依赖脚本加载后应暴露全局变量，例如 `window.Chart`、`window.katex`、`window._`。
- 页面组件首次渲染时应容忍依赖仍在初始化中的情况，复杂依赖建议在组件内检查全局对象。

`modelsUrls` 用于模型文件目录探测：

```json
{
  "modelsUrls": {
    "local": "/weights",
    "public": "https://fastly.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights"
  }
}
```

运行时会优先检查 `local`，不可用时回退到 `public`。

宿主需要提供：

- `window.Babel`，用于浏览器内 TSX 编译。
- `JSZip`，或可从 `/lib/jszip.min.js` 加载。

Core 只负责浏览器内课件装载和渲染，不负责 `.lume` 文件扫描、课程目录管理、迁移脚本、打包上传或本地文件存储。这些属于教师端宿主。

### `src/browser/engine/course-components`

课件通用组件目录。

目前包含：

- `survey-slide.tsx`：问卷组件，暴露为 `window.SurveySlide`。
- `vote-slide.tsx`：投票组件，暴露为 `window.VoteSlide`。
- `web-page-slide.tsx`：网页嵌入组件，暴露为 `window.WebPageSlide` 和 `window.CourseComponents.WebPageSlide`。

课件作者可以直接在 `.lume` / `.tsx` 课件中使用这些全局组件。

示例：

```tsx
const slides = [
  {
    id: 'vote',
    component: (
      <VoteSlide
        config={{
          id: 'q1',
          question: '你更喜欢哪种课堂互动方式？',
          options: [
            { id: 'a', label: '投票' },
            { id: 'b', label: '问卷' },
          ],
        }}
      />
    ),
  },
];

window.CourseData = {
  id: 'demo',
  title: '示例课件',
  slides,
};
```

## 浏览器运行时全局对象

Core 的浏览器运行时会向 `window` 注入一些稳定对象。

### `window.LumeSyncRenderEngine`

课件加载和渲染入口。

主要能力：

- `loadCourse(course, options)`
- `renderCourseToRoot(root, props)`
- `createCourseContext(options)`
- `WebPageSlide`

### `window.CourseGlobalContext`

课件执行上下文。

常见能力：

- `canvas`
- `getCamera(onStream)`
- `releaseCamera()`
- `unregisterCamera(onStream)`
- `syncInteraction(event, payload)`
- `useSyncVar(key, initialValue, options)`
- `useLocalVar(key, initialValue, options)`
- `submitContent(options)`
- `getSocket()`
- `getCurrentCourseMeta()`
- `getStudentInfo()`

## 同步变量

同步变量是课件运行时提供给课件作者的状态同步机制。它用于把教师端课件中的某些交互状态同步到学生端，例如当前选中的选项、拖拽位置、展开状态、小游戏状态、步骤进度等。

同步变量依赖 `window.CourseGlobalContext`，只能在 React 组件渲染期间使用。推荐优先使用 Hook 形式：

- `useSyncVar`：需要在教师端和学生端之间同步的变量。
- `useLocalVar`：只在当前客户端本地保存的变量。

兼容旧写法时可以使用：


课件状态 API 只允许使用 `useSyncVar` 和 `useLocalVar`。旧写法已移除，不再提供兼容入口。

### `useSyncVar`

```tsx
const [selectedId, setSelectedId] = window.CourseGlobalContext.useSyncVar(
  'selected-option',
  '',
  {
    onChange: (next, prev) => {
      console.log('selected-option changed:', prev, '->', next);
    },
  },
);
```

教师端调用 `setSelectedId(nextValue)` 时，会先更新教师端本地状态；如果当前课堂开启了教师交互同步，也就是 `settings.syncInteraction === true`，Core 会通过 Socket 发出 `sync-var` 事件，把该变量同步给学生端。

学生端收到 `sync-var` 后，会更新同名变量，并触发使用该变量的组件重新渲染。

### `useLocalVar`

```tsx
const [expanded, setExpanded] = window.CourseGlobalContext.useLocalVar(
  'local-expanded',
  false,
);
```

`useLocalVar` 只保存在当前客户端，不会发出 `sync-var`，适合保存临时 UI 状态，例如本地弹窗开关、本地输入草稿、只影响当前学生的展示状态。

### key 的命名

同步变量通过 `key` 区分。建议使用稳定、可读、避免冲突的名字：

```text
slide-quiz:selected
drag-demo:position
timeline:step
```

不要使用随机 key，否则教师端和学生端无法订阅同一个变量。

### 初始值

`initialValue` 可以是普通值，也可以是函数：

```tsx
const [count, setCount] = window.CourseGlobalContext.useSyncVar(
  'counter',
  () => 0,
);
```

同一个 key 第一次注册时会写入初始值；后续同 key 的 Hook 会复用已经存在的值。

### 完整状态同步

学生端进入页面或请求同步状态时，会通过 `request-sync-state` 向教师端请求当前页面的完整同步状态。教师端返回 `full-sync-state` 后，学生端会按 key 更新本地已注册的同步变量。

这可以避免学生端中途加入课堂时只收到后续增量事件，而拿不到教师端当前状态。

### 同步范围

`sync-var` 当前按 `courseId` 和 `slideIndex` 过滤：

- 只有同一个课程的变量会被应用。
- 只有同一页幻灯片的变量会被应用。
- 切页后，学生端会请求当前页的完整同步状态。

因此，同一个 key 可以在不同幻灯片中重复使用，但更推荐在复杂课件中加上业务前缀，减少误用。

### 示例：教师端选择，学生端跟随

```tsx
function ChoiceDemo() {
  const [choice, setChoice] = window.CourseGlobalContext.useSyncVar(
    'choice-demo:selected',
    '',
  );

  const options = ['A', 'B', 'C'];

  return (
    <div className="w-full h-full flex flex-col items-center justify-center gap-6">
      <h2 className="text-4xl font-bold">当前选择：{choice || '未选择'}</h2>
      <div className="flex gap-4">
        {options.map(option => (
          <button
            key={option}
            onClick={() => setChoice(option)}
            className={`px-8 py-4 rounded-xl text-2xl font-bold ${
              choice === option ? 'bg-blue-600 text-white' : 'bg-slate-100'
            }`}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}
```

当教师端开启交互同步时，教师点击按钮后，学生端同一页里的 `choice-demo:selected` 会更新为相同值。

### 示例：本地变量不参与同步

```tsx
function LocalNote() {
  const [draft, setDraft] = window.CourseGlobalContext.useLocalVar(
    'local-note:draft',
    '',
  );

  return (
    <textarea
      value={draft}
      onChange={event => setDraft(event.target.value)}
      className="w-full h-48 border rounded-xl p-4"
      placeholder="这个输入只保存在当前客户端"
    />
  );
}
```

### 注意事项

- `useSyncVar` 必须在 React 组件或自定义 Hook 中调用。
- 同步变量值应尽量是可序列化数据，例如 string、number、boolean、普通对象、数组。
- 不要把 DOM 节点、函数、MediaStream、Canvas context 等不可序列化对象放进同步变量。
- 高频拖拽、绘图等场景要注意节流，避免频繁发出过多 `sync-var`。
- 是否真正广播给学生端取决于教师端当前是否开启 `syncInteraction`。

### `window.__LumeSyncCanvas`

Canvas 工具。

主要能力：

- `getCanvasPoint(evt, canvas)`
- `getHiDpiContext2d(canvas, width, height)`
- `useCanvasDims(padL, padR, padT, padB)`

### `window.__LumeSyncUI`

通用 UI 工具。

目前包含：

- `SideToolbar`
- `usePresence`
- `relayoutSideToolbars`
- `styles`

注意：`__LumeSyncUI` 是课件运行时的通用 UI 工具，不是教师端产品 UI。教师端页面级组件不应放入 Core。

## 教师端接入方式

教师端通过 submodule 使用 Core。

典型路径：

```text
packages/course-runtime
```

教师端服务端通过 `server/src/core-paths.js` 定位 Core：

1. 优先使用环境变量 `LUMESYNC_CORE_DIR`。
2. 默认使用 `packages/course-runtime`。

教师端构建浏览器 bundle 时，通过：

```ts
getTeacherRenderEngineSources({ preferSource: true })
```

获取 Core 浏览器运行时源码列表。

这可以避免教师端硬编码 Core 内部文件名。

教师端自身仍然负责以下宿主能力：

- 扫描课程目录并区分 PDF、Zip `.lume`、旧版脚本 `.lume`。
- 从 Zip `manifest.json` 提取课程列表元数据。
- 提供 `/courses/*`、`/lib/jszip.min.js` 等静态资源入口。
- 提供 Babel Standalone、React、ReactDOM 等浏览器运行时依赖。
- 使用迁移脚本把旧版单文件 `.lume` 包装成新版 Zip `.lume`。
- 由 native shell 启动和关闭本地 Node 服务。
- 由 native shell 管理系统托盘、主窗口生命周期、PID 文件和残留 `node.exe` 清理。

Core 与 teacher 的边界是：Core 暴露可复用运行时和课件渲染能力；teacher 决定课程来自哪里、如何列出、如何保存、如何启动本地服务。

## 开发

安装依赖：

```bash
pnpm install
```

构建：

```bash
pnpm run build
```

类型检查：

```bash
pnpm run typecheck
```

测试：

```bash
pnpm test
```

启动独立 Core Runtime Server：

```bash
pnpm run build
pnpm start
```

默认端口是 `3000`。可以通过 `PORT` 覆盖。

```bash
PORT=3100 pnpm start
```

## 测试覆盖

当前测试包含：

- viewer token 创建和校验。
- IPv4-mapped IPv6 地址标准化。
- token 签名错误。
- token 过期。
- host/viewer Socket 连接。
- viewer 事件转发到 host。
- host 事件广播到 viewer。
- 非法 viewer token 拒绝。

测试文件位于：

```text
tests/
  identity.test.js
  runtime-control.test.js
```

## 构建输出

执行：

```bash
pnpm run build
```

会生成：

```text
dist/
  cjs/
  esm/
  types/
  browser/
```

其中：

- `dist/cjs` 给 CommonJS 使用。
- `dist/esm` 给 ES Module 使用。
- `dist/types` 给 TypeScript 类型提示使用。
- `dist/browser` 给教师端或其他宿主构建浏览器课件运行时使用。

## 发布

发布由独立 Core 仓库负责。

发布前确认：

```bash
pnpm run typecheck
pnpm test
npm pack --dry-run
```

发布流程：

1. 在 `LumeSync-Core` 仓库提交变更。
2. 更新版本号。
3. 创建 tag，例如 `v1.0.1`。
4. 推送 tag。
5. GitHub Actions 执行构建、测试、pack dry run。
6. 如果仓库配置了 `NPM_TOKEN`，自动发布 `@lumesync/core` 到 npm。

## 兼容层

`packages/*` 目录目前保留作为兼容层。

```text
packages/
  engine/
  render-engine/
  runtime-control/
  server/
```

新代码不应该继续依赖这些旧路径。

推荐使用：

```ts
import { setupSocketHandlers } from '@lumesync/core/runtime-control';
```

不推荐使用：

```js
require('./packages/runtime-control')
```

保留兼容层的目的只是降低旧教师端集成迁移风险。后续确认没有旧路径依赖后，可以单独移除。

## 设计约束

Core 的长期约束：

- 可以从教师端仓库中提取出来单独使用。
- 可以作为 npm SDK 被其他项目安装。
- 不依赖教师端私有目录。
- 不包含教师端产品页面。
- 不包含 native shell 和安装器逻辑。
- 不管理本地 Node 服务进程、托盘图标、PID 文件或安装器级生命周期。
- 不扫描教师端课程目录，也不负责课程文件持久化。
- 所有公共能力必须通过 package exports 暴露。
- 浏览器运行时文件名按职责命名，不使用 `00-name` 这种顺序编号命名。
- 课件通用组件统一放在 `src/browser/engine/course-components`。

## 常见问题

### 为什么 Core 在教师端目录里面？

这是为了让教师端开发和打包时可以稳定引用 Core，同时保持 Core 自己仍然是独立仓库。它不是教师端源码的一部分，而是教师端仓库中的 submodule。

### Core 里为什么没有机房视图？

机房视图是教师端产品 UI，属于 teacher shell。Core 只提供课堂运行时和通用课件能力。

### Core 负责关闭教师端 Node 服务吗？

不负责。Core 可以提供独立 Runtime Server，也可以被教师端服务端复用 Socket、身份和渲染运行时能力；但教师端本地 `node.exe` 的启动、关闭、PID 文件、托盘和窗口生命周期都属于 `LumeSync-Teacher` 的 native shell。

### Zip `.lume` 是 Core 还是 Teacher 的能力？

两边各负责一部分。Core 的浏览器运行时负责把 Zip `.lume` 解包、编译 `slides/*.tsx`、映射 `assets/*`，并转换成 `CourseData`。Teacher 负责扫描课程目录、读取清单元数据、提供静态文件入口、迁移旧课件和保存课件文件。

### 课件通用组件在哪里？

在：

```text
src/browser/engine/course-components/
```

当前包括 `SurveySlide`、`VoteSlide`、`WebPageSlide`。

### 教师端如何拿到浏览器运行时源码？

通过：

```ts
import { getTeacherRenderEngineSources } from '@lumesync/core/render-engine';
```

而不是直接写死 Core 内部路径。

### 修改 Core 后教师端怎么更新？

1. 在 `packages/course-runtime` 中提交并推送到 `LumeSync-Core`。
2. 回到 `apps/teacher`，提交 submodule 指针变化。
3. 重新执行教师端 bundle 构建。
