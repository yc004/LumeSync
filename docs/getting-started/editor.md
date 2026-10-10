# 新课件编辑器 MVP

状态：**Electron 客户端已实现；macOS ARM64 DMG 已校验并启动验证，Intel x64 DMG 已校验，Windows 安装包仍待 Windows runner 验证**（2026-09-26）。编辑器使用独立课件文档模型，不依赖旧 AI Editor 或 VS Code 插件。

## 启动

```sh
pnpm install --no-frozen-lockfile
pnpm run start:editor
```

需要桌面图形环境。编辑器主进程通过 Electron `safeStorage` 保存加密后的 API 密钥；如果系统没有可用的 Keychain、DPAPI 或 libsecret 后端，编辑器会拒绝保存密钥，不会退回明文存储。

## macOS 和 Windows 安装包

```sh
# macOS：生成 arm64 和 x64 的 DMG 与 ZIP
pnpm run dist:editor:mac

# macOS：生成仅供当前构建机器测试的 ad-hoc 签名包
pnpm run dist:editor:mac:local

# macOS：使用 Developer ID 签名，并在配置 Apple API 密钥后执行公证
pnpm run dist:editor:mac:release

# Windows x64：在 Windows 环境生成 NSIS 安装程序
pnpm run dist:editor:win
```

产物写入 `apps/editor/release/`。GitHub Actions 的“Editor desktop builds”工作流会分别在 macOS 和 Windows runner 构建，并提供可下载的构建产物；也可手动触发该工作流。客户端安装后可双击 `.lume` 课件打开；菜单提供新建、打开、保存、撤销/重做及对应系统快捷键。

`dist:editor:mac` 会自动使用构建机上的 Developer ID 证书（如已配置）。没有证书时，使用 `dist:editor:mac:local` 生成本机 ad-hoc 签名包；这种签名仅用于构建机器上的开发验证，不适合作为跨设备发布包。GitHub Actions 可通过 `MACOS_CSC_LINK` / `MACOS_CSC_KEY_PASSWORD` 和 `WINDOWS_CSC_LINK` / `WINDOWS_CSC_KEY_PASSWORD` secrets 签署安装包；配置 `APPLE_API_KEY`、`APPLE_API_KEY_ID`、`APPLE_API_ISSUER` 与 `APPLE_TEAM_ID` 后，macOS 工作流会执行公证。工作流只产出构建产物，不发布到商店或自动更新渠道。

## 编辑课件

MVP 支持新建课件和页面，编辑课件/页面标题，添加或调整以下标准组件：

- `core.heading`：一级到三级标题。
- `core.paragraph`：纯文本正文，保留换行。
- `core.bullets`：每行一个要点。
- `core.callout`：说明、建议和注意提示框。

页面和内容块有稳定 ID；添加、移动、删除、属性编辑都经过同一命令模型，并支持撤销/重做。编辑器面板用本地静态 HTML 预览；预览在无脚本的 sandbox iframe 内，不执行课件代码。草稿自动保存到 Electron userData 目录。

保存的 `.lume` 同时包含 `source/course.json`、`source/pages/*.json` 和播放兼容页面。重新打开时编辑器会从 source 重建产物，并逐项比较包内文件；校验失败或构建过期时拒绝编辑，不覆盖原文件。没有本编辑器 source 的旧课件暂不支持导入编辑，请先保留原文件；旧课迁移器尚未接到新 UI。

## 导入自定义组件

点击顶栏“导入组件包”，选择 `.lumex` 文件。首版组件包是只包含根目录 `extension.json` 的 ZIP；导入后组件会出现在内容块按钮中，文本、数字、布尔值、颜色和枚举字段可在属性面板编辑。保存课件会将锁定的 `{id, version, hash}` 和组件定义一起写入 `.lume`，因此课堂端不需要另行安装组件包，也可以离线播放。

组件模板仅支持白名单 HTML 标签、白名单样式、固定文本和属性引用，不支持 JavaScript、事件处理器、插槽、图片等包内资源或课堂交互 API。包的示例结构、限制和当前播放实现见[扩展与组件设计](../architecture/course-content-extensions.md)。

## 接入 Agent 模型 API

在“AI 创作”页设置服务名称、模型 ID 和 API 基址。适配器目前支持 OpenAI Chat Completions 兼容接口：可以填写 `https://服务地址/v1`，也可直接填写 `.../chat/completions`。远程地址必须使用 HTTPS；仅 `localhost`、`127.0.0.1` 和 `::1` loopback 服务允许 HTTP。API 密钥经受限 IPC 交给主进程加密保存；连通测试和生成请求也由主进程发起。

点击“生成候选课件”时，Agent 会发送你的提示词、当前课件的页面/组件结构（正文每字段最多截取 1200 字，总上下文最多 120 KB）和已配置模型 ID。编辑器不会读取或发送未被当前文档引用的文件、学生提交、教师凭证或课程目录。Agent 不会执行代码、读取文件、安装组件、调用 Hub 或发布课件。

模型返回必须是 JSON 编辑命令。编辑器重新按本地 schema 和 revision 校验，并生成一个隔离候选；页面展示大纲和变化摘要后，作者可以接受或放弃。接受后是一条可撤销操作。点击取消会中断网络请求；如果草稿在生成期间已经改变，旧候选会被拒绝。

当前 Agent 仅支持一次非流式请求，上限为 6000 输出 token；未实现单次/每日费用预算、多供应商能力探测、用户材料选择、引用来源或多阶段大纲审批。模型输出的内容仍需作者审核。

## 当前限制

- 当前 Core 源码识别编辑器标记后，校验声明式 source、构建摘要与嵌入组件包 hash，再将标准组件和受限组件模板创建为 React 元素；这条路径不编译或执行生成的 TSX。生成的 TSX 暂时保留作旧 Core 的兼容输出，因此旧版 Core 仍会走 Babel。根仓锁定的 Core 与已检出源码不一致，尚未完成真实教师/学生课堂联调；本地静态预览也不等同于课堂运行验收。
- 尚不支持媒体资源、任意代码插件、插槽、主题包、课堂互动组件和独立预编译运行时。
- macOS ARM64 DMG 已通过 `hdiutil verify` 与 `codesign --verify --deep --strict`，并实际启动到编辑器窗口；Intel x64 DMG 通过镜像校验，但未在原生 Intel Mac 验收；Windows runner 构建、正式签名/公证与跨设备播放尚未验收。

自动化检查：

```sh
node --test packages/component-extensions/test/*.test.js packages/course-model/test/*.test.js apps/editor/test/*.test.cjs
```

设计与进度见[编辑器设计](../architecture/editor-design.md)、[Agent/API 设计](../architecture/editor-agent.md)、[扩展与组件设计](../architecture/course-content-extensions.md)和[迁移状态](../status/migration.md)。
