# **🚀 SyncClassroom (极速互动课堂框架 \- 智能控制台版)**

这是一个专为现代化局域网教学设计的**无构建 (No-build) React 单页互动框架**。

告别传统的单一网页，本系统自带 **多课程动态调度** 功能。教师在一个精美的仪表盘中选课，框架会**实时拉取、热编译 JSX** 并将全班学生瞬间拽入对应的课堂。同时附带智能网络代理加速、在线学生监控等杀手级功能！

## **✨ 核心亮点**

* 🎮 **教师全局控制台**：多课件集合在一个系统，老师点击任意课件，全班学生屏幕瞬间热加载进入对应课堂。支持一键结束课程，将全班拉回等待大厅。
* ⚙️ **JSX 热编译与动态装载**：课件作为纯文本放置在目录下，通过 Babel Standalone 实时按需拉取、编译并注入运行。**无需 Webpack / Vite 构建**。
* 📡 **WebSocket 实时同步**：支持翻页同步、**断线重连/迟到状态同步**。迟到学生自动跳转到老师当前页面。
* 🤖 **无感鉴权与监控**：`localhost` 访问为教师端；局域网 IP 访问为学生端。提供实时在线人数监控。
* ⚡️ **智能 CDN 缓存代理**：内置脚本缓存代理，教师首次从公网下载第三方库（Chart.js、KaTeX 等）后，后续学生通过**千兆局域网秒传**，大幅提升加载速度。

## **📂 目录结构与配置**

请严格按照以下结构组织你的项目：

```
SyncClassroom/  
├── server.js              \<-- 后端状态机与智能下载代理  
├── package.json             
└── public/                \<-- 静态资源总目录  
    ├── index.html         \<-- 入口基座 (不要改)  
    ├── SyncEngine.js      \<-- 底层路由、UI 与 Socket 引擎 (核心)  
    └── courses/           \<-- 📁 把所有的课件放在这里  
        ├── face-recognition.js  
        └── intro-to-ai.js
```

## **🚀 快速开始**

### **1. 安装与启动**

```bash
npm install
node server.js
```

启动后：
- 教师端：http://localhost:3000
- 学生端：http://局域网IP:3000

### **2. 使用流程**

1. **教师**访问 `localhost:3000`，在控制台选择课程并点击"开始授课"
2. **学生**访问教师电脑的局域网 IP（如 `http://192.168.1.100:3000`）
3. 教师翻页时，所有学生自动同步跟随
4. 教师点击"结束课程"可返回选择界面

### **3. 添加新课程**

只需在 `public/courses/` 目录下创建 `.js` 文件即可：

```js
const { useState, useEffect, useRef } = React;

// 定义幻灯片组件
function Slide1() {
    return (
        <div className="flex flex-col items-center justify-center min-h-full p-8">
            <h1 className="text-4xl font-bold">课程标题</h1>
            <p className="text-lg text-slate-600 mt-4">课程介绍</p>
        </div>
    );
}

// 课程数据
window.CourseData = {
    title: "课程标题",
    icon: "📚",
    desc: "简短描述",
    color: "from-blue-500 to-indigo-600",
    // 外部依赖（可选）
    dependencies: [
        // { name: "chartjs", localSrc: "/lib/chart.min.js", publicSrc: "https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js" }
    ],
    slides: [
        { id: 's1', component: <Slide1 /> }
    ]
};
```

保存文件后，刷新教师页面即可看到新课程！

### **4. 外部依赖加载（支持断网环境）**

课件可以声明外部脚本依赖（如 Chart.js、KaTeX）：

```js
dependencies: [
    {
        name: "chartjs",
        localSrc: "/lib/chart.umd.min.js",
        publicSrc: "https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"
    }
]
```

**工作原理**：
1. 首次加载时，服务器自动从公网下载脚本到 `public/lib/` 目录
2. 后续访问直接从局域网加载，速度极快
3. **注意**：`localSrc` 中的文件名需要与 CDN 上的实际文件名一致（如 `chart.umd.min.js`）

### **5. 断网环境支持**

本系统支持完全断网的教学环境：

**课前准备（教师机需要联网）**：
```bash
# 下载所有外部资源到本地
node download-resources.js
```

**资源类型**：
- 核心框架：React、ReactDOM、Babel、Tailwind CSS、FontAwesome
- 课件依赖：Chart.js、KaTeX 等（首次加载时自动缓存）
- 外部图片：通过 `/images/proxy?url=...` 自动缓存

**上课时使用**：
1. 教师机可以断开外网（保持局域网正常）
2. 学生机完全不需要外网连接
3. 所有资源通过教师机局域网提供

## **📖 课程开发指南**

详细的课程开发模板和 API 参考，请查看：
- `course-template.md` - 课程模板说明
- `create-course.skill` - 课程创建 Skill

## **📝 开源协议**

MIT License. 献给所有致力于用技术创新提升课堂体验的教育者！