# 萤火课堂 日志系统文档

## 概述

萤火课堂集成了标准化的日志系统，自动记录应用运行期间的所有事件和错误，方便管理人员排查问题和进行故障修复。

## 日志特性

### 1. 自动记录
- 应用启动、关闭事件
- 服务器启动、连接状态
- 窗口创建、加载事件
- 所有错误和异常
- 用户操作记录

### 2. 多级别日志
- **ERROR**: 错误级别，需要立即处理的问题
- **WARN**: 警告级别，潜在的问题
- **INFO**: 信息级别，常规运行信息
- **DEBUG**: 调试级别，详细调试信息（默认关闭）

### 3. 自动轮转
- 单个日志文件最大 10MB
- 最多保留 5 个历史日志文件
- 超过限制自动删除最旧的文件

### 4. 分类存储
- **教师端**: `~/.LumeSync-Teacher/logs/`
- **学生端**: `~/.LumeSync-Student/logs/`

## 日志文件位置

### Windows
```
C:\Users\[用户名]\.LumeSync-Teacher\logs\
C:\Users\[用户名]\.LumeSync-Student\logs\
```

### 日志文件命名
```
LumeSync-Teacher-2024-03-21.log
LumeSync-Student-2024-03-21.log
```

## 日志格式

```
[2024-03-21T10:30:45.123Z] [INFO] [APP] [PID:12345] Application started
[2024-03-21T10:30:45.456Z] [INFO] [SERVER] Server started successfully {"pid":12346,"port":3000}
[2024-03-21T10:30:46.789Z] [ERROR] [WINDOW] Connection failed {"retries":0,"error":"ECONNREFUSED"}
```

### 格式说明
- `[时间戳]`: ISO 8601 格式
- `[级别]`: ERROR/WARN/INFO/DEBUG
- `[分类]`: 模块名称（APP/SERVER/WINDOW/TRAY/IPC等）
- `[PID]`: 进程 ID
- `消息`: 事件描述
- `数据`: 可选的 JSON 格式附加数据

## 访问日志

### 方法 1: 通过托盘菜单
1. 右键点击系统托盘图标
2. 选择"打开日志目录"
3. 日志文件夹会在文件资源管理器中打开

### 方法 2: 通过设置面板
1. 打开教师端应用
2. 点击右上角的设置图标
3. 在设置面板底部找到"系统日志"区域
4. 点击"打开日志目录"按钮

### 方法 3: 直接访问
直接导航到以下目录：
- 教师端: `%USERPROFILE%\.LumeSync-Teacher\logs`
- 学生端: `%USERPROFILE%\.LumeSync-Student\logs`

## 常见问题排查

### 1. 服务器启动失败
**症状**: 应用启动后显示"无法连接到本地服务器"

**排查步骤**:
1. 打开日志目录
2. 查找包含 `SERVER` 和 `ERROR` 的日志行
3. 检查错误信息：
   - 端口 3000 被占用
   - Node.js 模块加载失败
   - 文件权限问题

**解决方法**:
```cmd
# 检查端口占用
netstat -ano | findstr :3000

# 如果被占用，结束进程
taskkill /F /PID [进程ID]
```

### 2. 窗口无法显示
**症状**: 应用启动后窗口不显示

**排查步骤**:
1. 查找包含 `WINDOW` 的日志
2. 检查是否有 `Failed to load URL` 错误
3. 检查服务器响应状态码

### 3. 学生端无法连接
**症状**: 学生端一直显示等待状态

**排查步骤**:
1. 教师端: 检查日志中的在线学生列表
2. 学生端: 检查连接错误日志
3. 检查防火墙设置

## 调试模式

### 启用 DEBUG 级别日志

在打包后的应用中设置环境变量：

**Windows (CMD)**:
```cmd
set LOG_LEVEL=DEBUG
LumeSync Teacher.exe
```

**Windows (PowerShell)**:
```powershell
$env:LOG_LEVEL="DEBUG"
.\LumeSync Teacher.exe
```

## 导出日志

### 手动导出
1. 打开日志目录
2. 选择需要导出的日志文件
3. 复制到其他位置

### 使用命令导出
```cmd
# 复制今天的日志到桌面
copy %USERPROFILE%\.LumeSync-Teacher\logs\LumeSync-Teacher-%date:~0,10%.log %USERPROFILE%\Desktop\

# 压缩所有日志
7z a logs.zip %USERPROFILE%\.LumeSync-Teacher\logs\*
```

## 日志最佳实践

### 1. 定期清理
- 建议每周检查一次日志目录
- 将旧的日志文件归档到其他位置
- 保留最近 1-2 周的日志用于排查问题

### 2. 问题报告时提供日志
遇到问题时，请提供以下信息：
1. 问题发生时间
2. 相关的日志文件
3. 问题复现步骤
4. 系统环境（Windows 版本等）

### 3. 日志隐私
- 日志中可能包含 IP 地址、文件路径等信息
- 在分享日志前，请检查并移除敏感信息
- 不要在公开平台分享完整的日志文件

## 开发人员指南

### 添加日志记录

```javascript
const { Logger } = require('./logger.js');
const logger = new Logger('MyModule');

// 记录信息
logger.info('CATEGORY', 'Message', { data: 'value' });

// 记录警告
logger.warn('CATEGORY', 'Warning message');

// 记录错误
logger.error('CATEGORY', 'Error occurred', error);

// 记录调试信息
logger.debug('CATEGORY', 'Debug info');
```

### 日志分类建议
- `APP`: 应用生命周期事件
- `SERVER`: 服务器相关
- `WINDOW`: 窗口和 UI 相关
- `TRAY`: 系统托盘相关
- `IPC`: 进程间通信
- `SOCKET`: Socket.io 连接
- `IMPORT`: 文件导入
- `EXPORT`: 数据导出
- `AUTH`: 认证相关
- `CONFIG`: 配置相关

## 技术支持

如果遇到无法解决的问题，请：
1. 导出相关日志文件
2. 记录问题复现步骤
3. 在 GitHub Issues 中提交问题
4. 附上日志文件（可脱敏后提交）
