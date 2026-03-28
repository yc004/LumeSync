# SQLite 数据库安装指南

## 问题说明

在 Windows 环境下，`better-sqlite3` 需要本地编译，可能会遇到以下问题：
- 需要 Visual Studio C++ 构建工具
- 需要 Python 3.x
- node-gyp 编译失败

## 解决方案

### 方案 1：使用预编译版本

直接安装预编译的二进制文件：

```bash
npm install better-sqlite3@9.4.3
```

如果失败，尝试：

```bash
npm install better-sqlite3@9.4.3 --build-from-source
```

### 方案 2：安装构建工具

1. 安装 Visual Studio Build Tools
   - 下载：https://visualstudio.microsoft.com/downloads/#build-tools-for-visual-studio-2022
   - 选择"Desktop development with C++" 工作负载

2. 确认 Python 已安装（建议 3.9 或更高版本）

3. 运行安装脚本：

```bash
npm install better-sqlite3@9.4.3
```

### 方案 3：使用 Docker（推荐）

如果本地环境问题较多，可以使用 Docker：

```dockerfile
FROM node:18
RUN npm install better-sqlite3@9.4.3
```

### 方案 4：使用 CloudBuild

在 CI/CD 环境中自动构建：

```yaml
# GitHub Actions
- name: Install dependencies
  run: npm install better-sqlite3@9.4.3 --build-from-source
```

## 验证安装

安装完成后，运行以下代码验证：

```javascript
try {
    const Database = require('better-sqlite3');
    const db = new Database(':memory:');
    console.log('SQLite 安装成功！');
    db.close();
} catch (error) {
    console.error('SQLite 安装失败：', error);
}
```

## 备用方案

如果 better-sqlite3 仍然无法安装，可以使用以下纯 JavaScript SQL 数据库：

- `sql.js` - SQLite 的 WASM 版本（完全在内存中运行）
- `alasql` - 纯 JavaScript SQL 数据库
- `lovefield` - Google 的关系数据库框架

## 当前项目选择

项目已包含一个纯内存版本的向量数据库（`server/vector-database.js`），可以正常使用。
如果需要真正的 SQL 数据库，请按照上述方案安装 `better-sqlite3`。

## 快速安装脚本

Windows 用户可以双击运行 `install-sqlite.bat` 进行安装。
