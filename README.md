<div align="center">

# SyncClassroom v2.0

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org/)
[![Platform](https://img.shields.io/badge/platform-Windows-blue)](https://www.microsoft.com/windows)

<img src="assets/tray-icon.png" alt="SyncClassroom Icon" width="128" height="128">

**局域网互动课堂框架** - 支持教师端全局控制、学生端实时同步、机房视图管理，提供 Windows 桌面应用安装包

[功能特性](#-功能特性) · [快速开始](#-快速开始) · [桌面应用](#-桌面应用) · [课件开发](#-课件开发) · [项目结构](#-项目结构)

</div>

---

## ✨ 功能特性

- **🎓 教师端控制台** - 多课件选择、一键开课/结课、在线学生监控
- **👨‍🎓 学生端** - 自动跟随翻页、全屏锁定、断线自动重连
- **🖥️ 机房视图** - 座位网格/列表双视图，支持 CSV 批量导入，拖拽排列，实时在线状态
- **🌐 智能 CDN 缓存代理** - 首次从公网下载依赖后缓存到本地，后续完全离线
- **⚡ JSX 热编译** - 课件为纯文本 `.tsx` 文件，无需构建工具
- **💻 Electron 桌面应用** - 教师端/学生端独立安装包，学生端卸载需管理员密码
- **🎨 现代化 UI** - 基于 Tailwind CSS 的精美界面设计

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

## 💻 桌面应用

### 下载安装包

前往 [Releases](../../releases) 下载最新版本：

| 文件 | 说明 |
|------|------|
| `SyncClassroom-教师端-Setup-*.exe` | 教师端，正常安装卸载 |
| `SyncClassroom-学生端-Setup-*.exe` | 学生端，卸载需管理员密码（默认 `admin123`） |

### 本地打包

```bash
# 一键打包（生成教师端 + 学生端安装包）
build\build.bat

# 或分步执行
python build/convert-icons.py       # 生成图标
npm run build:verify                # 打包密码验证工具
npm run build:teacher               # 教师端安装包 -> dist/teacher/
npm run build:student               # 学生端安装包 -> dist/student/
```

详细打包说明见 [build/BUILD-README.md](build/BUILD-README.md)。

### 学生端特性

- 安装需要管理员权限
- 自动注册为 Windows 服务（`SyncClassroomStudent`），开机自启
- 普通用户无法关闭服务
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

详细模板和 API 参考见 [course-template.md](./course-template.md)，可在教师端控制台点击"课件教程"在线查看，或点击"下载 Skill"获取 AI 辅助生成课件的 Skill 文件。

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
SyncClassroom/
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
│   ├── preload.js                     # IPC 桥接
│   ├── config.js                      # 配置读写
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
├── course-template.md                 # 课件开发文档
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
