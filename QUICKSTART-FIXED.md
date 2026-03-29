# SyncClassroom 快速启动指南

## 环境准备

### 必需软件
- **Node.js**: v18 或更高版本
- **npm**: 随 Node.js 一起安装

### 可选软件
- **Python**: 用于图标转换（仅在构建安装包时需要）

## 安装依赖

在项目根目录运行：

```bash
npm install
```

这会自动安装所有工作区的依赖。

## 启动应用

### 方式一：使用根目录命令（推荐）

```bash
# 启动服务器（独立）
npm start

# 启动教师端（包含服务器）
npm run start:teacher

# 启动学生端
npm run start:student

# 启动编辑器
npm run start:editor
```

### 方式二：进入应用目录启动

```bash
# 启动教师端
cd apps/teacher
npm start

# 启动学生端
cd ../student
npm start

# 启动编辑器
cd ../editor
npm start
```

## 使用指南

### 教师端使用流程

1. **启动教师端**
   ```bash
   npm run start:teacher
   ```
   - 教师端会自动启动内置服务器（端口 3000）
   - 打开控制窗口

2. **添加课程**
   - 点击"导入课件"按钮
   - 选择 `.lume`、`.tsx`、`.js` 或 `.pdf` 文件
   - 课程会自动添加到课程列表

3. **开始上课**
   - 选择课程和课件
   - 点击"开始上课"按钮
   - 学生可以连接到课堂

4. **学生管理**
   - 查看连接的学生列表
   - 查看学生提交的内容
   - 下载学生提交文件

### 学生端使用流程

1. **启动学生端**
   ```bash
   npm run start:student
   ```

2. **连接课堂**
   - 输入教师端服务器地址（默认 `http://教师端IP:3000`）
   - 点击"连接"按钮

3. **参与课堂**
   - 跟随教师端的课件进度
   - 参与投票和调查
   - 提交作业

### 编辑器使用流程

1. **启动编辑器**
   ```bash
   npm run start:editor
   ```

2. **创建课件**
   - 点击"新建课件"
   - 添加幻灯片
   - 添加多媒体内容

3. **保存课件**
   - 导出为 `.lume` 格式
   - 可以导入到教师端使用

## 常见问题

### 1. 启动教师端时提示"找不到页面"

**解决方案：**
```bash
# 检查服务器是否启动
curl http://localhost:3000

# 如果服务器未启动，先启动服务器
npm start

# 然后再启动教师端
npm run start:teacher
```

**注意**：教师端启动时会自动启动服务器，但如果服务器启动失败，会显示"找不到页面"错误。

### 2. 端口被占用

如果端口 3000 被占用，可以修改环境变量：

```bash
# Windows
set PORT=3001
npm start

# macOS/Linux
export PORT=3001
npm start
```

### 3. 找不到模块

如果出现找不到模块的错误，请重新安装依赖：

```bash
npm install
```

### 4. 学生端无法连接

确保：
- 教师端服务器正在运行
- 防火墙允许端口 3000 的连接
- 学生端和教师在同一网络
- 使用正确的教师端 IP 地址

### 5. 构建时出错

```bash
# 清除缓存
npm cache clean --force

# 重新安装依赖
rm -rf node_modules package-lock.json
npm install

# 再次尝试构建
npm run build:all
```

## 构建安装包

### 构建教师端

```bash
npm run build:teacher
```

### 构建学生端

```bash
npm run build:student
```

### 构建编辑器

```bash
npm run build:editor
```

### 构建所有端

```bash
npm run build:all
```

构建后的安装包在 `dist/` 目录。

## 项目结构

```
SyncClassroom/
├── packages/           # 共享包
│   ├── engine/        # 渲染引擎（所有端公用）
│   └── server/        # 服务器
├── apps/              # 应用
│   ├── teacher/       # 教师端
│   ├── student/       # 学生端
│   └── editor/        # 编辑器端
└── shared/            # 共享资源
    ├── public/        # 公共 HTML/CSS/JS
    ├── assets/        # 图标、图片
    ├── build/         # 构建文件
    └── docs/          # 文档
```

## 技术支持

如遇问题，请查看：
- 日志文件：`~/.lumesync/logs/`
- 项目文档：`shared/docs/` 目录
- 重构文档：`REFACTORING_SUMMARY.md`

---

祝你使用愉快！🎉
