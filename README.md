# 萤火互动课堂 (SyncClassroom)

<div align="center">
  <img src="assets/tray-icon.png" width="100" height="100" alt="SyncClassroom Logo" />
  <img src="assets/editor-icon.png" width="100" height="100" alt="Editor Logo" />
</div>

基于 React + Electron 的低延迟局域网互动教学系统。

## 🌟 核心特性

- **🚀 零延迟同步** - 基于 WebSocket 的极致流畅教学体验
- **⚡ JSX 热编译** - 课件为纯文本 `.tsx` 文件，无需构建工具
- **🤖 AI 课件编辑器** - 集成 AI 助手，支持对话式生成互动课件，提供实时预览与源码编辑
- **📱 跨端支持** - 专为教室环境优化的全屏学生端与便捷教师端
- **💻 Electron 桌面应用** - 教师端/学生端/编辑器独立安装包，学生端卸载需管理员密码
- **🎨 现代化 UI** - 基于 Tailwind CSS 的精美界面设计

## 🤖 AI 课件编辑器 (LumeSync Editor)

全新的 AI 驱动课件开发工具，旨在让每一位教师都能轻松创作互动内容：

- **自然语言创作**：通过与 AI 对话，描述你的教学需求（如：“帮我写一个勾股定理的互动演示”），AI 将自动生成完整的互动代码。
- **流式实时预览**：代码生成过程中即可看到左侧预览区同步更新，支持 16:9 工业标准比例。
- **VS Code 级编辑体验**：支持源码编辑、行号显示、滚动同步，方便进行精细化调整。
- **一键应用**：生成的代码可直接保存为课件文件，供教师端分发。

---

## 🚀 快速开始

### 开发模式

```bash
# 安装依赖
npm install

# 启动服务器
node server.js
```

访问地址：
- **教师端**：http://localhost:3000
- **学生端**：http://局域网IP:3000

### 环境要求

- Node.js 18+
- Python 3.x（打包时需要）

---

## 📦 安装包说明

| 端类型 | 图标 | 说明 |
|------|------|------|
| **教师端** | <img src="assets/tray-icon.png" width="24" /> | 用于开启课堂、分发课件、监控学生状态 |
| **学生端** | <img src="assets/tray-icon.png" width="24" /> | 全屏置顶运行，卸载需管理员密码（默认 `admin123`） |
| **编辑器** | <img src="assets/editor-icon.png" width="24" /> | 独立的 AI 课件开发环境，集成 AI 聊天助手 |

## 🛠 本地开发与打包

### 环境要求
- Node.js 18+
- Python 3.x (用于生成图标)

### 本地打包

```bash
# 一键打包（生成教师端 + 学生端 + 编辑器安装包）
build\build.bat

# 或分步执行
python build/convert-icons.py       # 生成各端图标 (icon-teacher.ico, icon-editor.ico 等)
npm run build:verify                # 打包密码验证工具
npm run build:teacher               # 教师端安装包 -> dist/teacher/
npm run build:student               # 学生端安装包 -> dist/student/
npm run build:editor                # 编辑器安装包 -> dist/editor/
```

详细打包说明见 [build/BUILD-README.md](build/BUILD-README.md)。

### 学生端特性

- 安装需要管理员权限
- 自动注册为 Windows 服务（`LumeSyncStudent`），开机自启
- 普通用户无法关闭服务
- 卸载时弹出密码验证（默认密码 `admin123`）
- 卸载时弹出密码验证（默认密码 `admin123`）
- 管理员密码可在教师端"课堂设置"中修改并实时推送到所有在线学生端

---

## 📚 课件开发

课件为 `.tsx` 文件，放入 `public/courses/` 目录，刷新教师端即可识别。

### 基本示例

```tsx
const { useState } = React;

function Slide1() {
    return (
        <div className="flex flex-col items-center justify-center min-h-full p-8">
            <h1 className="text-4xl font-bold">课程标题</h1>
        </div>
    );
}

window.CourseData = {
    title: "课程标题",
    icon: "📚",
    desc: "简短描述",
    color: "from-blue-500 to-indigo-600",
    dependencies: [
        // 外部依赖（服务器自动缓存，支持离线）
        // { localSrc: "/lib/chart.umd.min.js", publicSrc: "https://fastly.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js" }
    ],
    slides: [
        { id: 's1', component: <Slide1 /> }
    ]
};
```

详细模板和 API 参考见：
- [docs/course-template.md](./docs/course-template.md) - 课件开发模板
- [docs/API.md](./docs/API.md) - 课件 API 文档

可在教师端控制台点击"课件教程"在线查看，或点击"下载 Skill"获取 AI 辅助生成课件的 Skill 文件。

### 支持的外部库

| 库名称 | 用途 | CDN 地址 |
|--------|------|----------|
| Chart.js | 图表绘制 | `https://fastly.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js` |
| KaTeX | 数学公式 | `https://fastly.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js` |
| Prism.js | 代码高亮 | `https://fastly.jsdelivr.net/npm/prismjs@1.29.0/prism.min.js` |
| face-api.js | 人脸识别 | `https://fastly.jsdelivr.net/npm/face-api.js@0.22.2/dist/face-api.min.js` |

---

## 🏠 机房座位管理

在机房视图中点击"模板"可下载示例文件，格式为 CSV：

```csv
# ip,名称,行,列
192.168.1.101,A01,1,1
192.168.1.102,A02,1,2
192.168.1.201,B01,2,1
```

- 行列从 1 开始，左上角为 (1,1)
- `#` 开头为注释行
- 行列可省略，省略时自动排列到末尾

---

## 📁 项目结构

```
萤火课堂/
├── server.js                          # 后端服务（Express + Socket.io + CDN 代理）
├── public/
│   ├── index.html                     # 入口页面
│   ├── engine/                        # 前端引擎模块
│   │   ├── 00-globals.js              # 全局配置和工具
│   │   ├── 01-settings-panel.js       # 设置面板
│   │   ├── 02-classroom-view.js       # 机房视图
│   │   ├── 03-course-selector.js      # 课程选择器
│   │   ├── 04-student-waiting.js      # 学生等待页
│   │   ├── 05-sync-classroom.js       # 同步课堂核心
│   │   ├── 06-resource-loader.js      # 资源加载器
│   │   ├── 07-camera-manager.js       # 摄像头管理
│   │   └── 08-app.js                  # 应用入口
│   ├── courses/                       # 课件目录（.tsx 文件）
│   ├── lib/                           # 第三方库缓存目录
│   ├── images/                        # 图片资源
│   └── weights/                       # AI 模型权重
├── electron/
│   ├── main-teacher.js                # 教师端主进程
│   ├── main-student.js                # 学生端主进程
│   ├── main-editor.js                 # 编辑器端主进程
│   ├── preload.js                     # IPC 桥接
│   ├── config.js                      # 配置读写
│   ├── logger.js                      # 日志系统
│   ├── admin.html                     # 管理员设置页面
│   └── offline.html                   # 离线提示页面
├── build/
│   ├── build.bat                      # 一键打包脚本
│   ├── convert-icons.py               # PNG 转 ICO
│   ├── verify-password.js             # 卸载密码验证工具
│   └── student-installer.nsh          # NSIS 自定义安装脚本
├── assets/
│   └── tray-icon.png                  # 应用图标
├── electron-builder-teacher.json      # 教师端打包配置
├── electron-builder-student.json      # 学生端打包配置
├── electron-builder-editor.json       # 编辑器端打包配置
├── docs/                              # 文档目录
│   ├── course-template.md            # 课件开发模板
│   ├── API.md                         # 课件 API 文档
│   ├── create-course.md               # 课件创建 Skill
│   ├── LOGGING.md                     # 日志系统文档
│   └── LumeSync_参赛全套文档.md       # 参赛文档
└── .github/workflows/release.yml      # 打 tag 自动发布 Release
```

---

## 🔧 技术栈

- **后端**：Express + Socket.io
- **前端**：React + Babel Standalone
- **UI 框架**：Tailwind CSS
- **图标库**：FontAwesome
- **桌面应用**：Electron
- **打包工具**：Electron Builder

---

## 📄 许可证

本项目基于 [MIT](https://opensource.org/licenses/MIT) 许可证开源。

---

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

---

<div align="center">

**Made with ❤️ for Education**

</div>
