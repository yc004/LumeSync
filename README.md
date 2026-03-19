# **🚀 SyncClassroom (极速互动课堂框架 \- 智能控制台版)**

这是一个专为现代化局域网教学设计的**无构建 (No-build) React 单页互动框架**。

告别传统的单一网页，本系统自带 **多课程动态调度** 功能。教师在一个精美的仪表盘中选课，框架会**实时拉取、热编译 JSX** 并将全班学生瞬间拽入对应的课堂。同时附带智能网络代理加速、在线学生监控等杀手级功能！

## **✨ 核心亮点**

* 🎮 **教师全局控制台 (Course Dashboard)**：将多个课件集合在一个系统中。老师点击任意课件，无需刷新页面，全班学生屏幕瞬间热加载进入对应的课堂场景。老师也可一键结束课程，将全班拉回等待大厅。  
* ⚙️ **JSX 热编译与动态装载 (Dynamic SPA)**：课件内容作为纯文本放置在目录下，底层通过 Babel Standalone 实时按需拉取、编译并注入运行。完全剥离外壳与内容，**永远告别 Webpack / Vite 构建烦恼**。  
* 📡 **WebSocket 实时状态机**：不仅同步翻页，还支持**断线重连/迟到状态同步**。迟到的学生打开链接，会自动跳过大厅，直接跃迁到老师当前正在讲的 PPT 页面。  
* 🤖 **无感鉴权与监控 (IP-based)**：通过 localhost 访问即为“主控端”；局域网 IP (192.168.x.x) 访问即为纯净的“观看端”。同时提供右上角实时人数与侧边栏上下线弹窗预警。  
* ⚡️ **智能 CDN 缓存代理 (LAN Acceleration)**：内置 Node.js 爬虫层，解决 AI 权重模型下载卡顿痛点。主控端探路下载至硬盘，百位学生瞬间通过千兆局域网“秒传”取货，彻底打通局域网教学的最后一公里。

## **📂 目录结构与配置**

请严格按照以下结构组织你的项目：

```
SyncClassroom/  
├── server.js              \<-- 后端状态机与智能下载代理  
├── package.json             
└── public/                \<-- 静态资源总目录  
    ├── index.html         \<-- 入口基座 (不要改)  
    ├── SyncEngine.js      \<-- 底层路由、UI 与 Socket 引擎 (核心)  
    └── courses/           \<-- 📁 新增！把所有的课件放在这里  
        ├── face-recognition.js  
        └── fruit-sorting.js
```

### **🔨 1\. 安装与启动**

```bash
npm install express socket.io  
node server.js
```

### **🔨 2\. 添加新课件**

你想加几节课都可以！只需要两步：

\*\*第一步：在 public/courses/ 下新建一个你的 xxx.js 课件文件。\*\*文件格式只需要定义各种 Slide 组件并在底部暴露出 window.CourseData 即可：

```js
function Slide1() { return \<h1\>我的第一页\</h1\>; }

window.CourseData \= {  
    title: "AI 基础导论",  
    slides: \[ { id: 's1', component: \<Slide1 /\> } \]  
};
```

**第二步：在 public/SyncEngine.js 顶部的清单中注册它：**
```js
const COURSE\_CATALOG \= \[  
    {  
        id: 'ai-intro',                // 唯一ID  
        file: 'ai-intro.js',           // 你在 courses/ 下建的文件名  
        title: '人工智能基础导论',  
        icon: '🤖',                    // 会展示在老师控制台卡片上  
        desc: '一节非常生动的入门课',  
        color: 'from-blue-500 to-indigo-600'  
    }  
\];
```

大功告成！老师现在就可以在控制台里看到这节新课，并带着全班一起体验了！

## **📝 开源协议**

MIT License. 献给所有致力于用技术创新提升课堂体验的教育者！