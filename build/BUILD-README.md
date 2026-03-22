# 萤火课堂 打包说明

## 环境要求

- Node.js 18+（含 npm）
- Windows 10/11 x64（打包机器）
- 管理员权限（学生端安装包需要）
- Python 3.x (生成图标需要)

## 一键打包

```bat
build\build.bat
```

输出目录：
- 教师端：`dist/teacher/LumeSync Teacher Setup 1.0.0.exe`
- 学生端：`dist/student/LumeSync Student Setup 1.0.0.exe`
- 编辑器端：`dist/editor/LumeSync Editor Setup 1.0.0.exe`

## 分步打包

```bat
# 1. 安装依赖
npm install

# 2. 生成 .ico 图标（需要 Python + Pillow：pip install Pillow）
python build/convert-icons.py

# 3. 打包密码验证工具（学生端卸载用）
npm run build:verify

# 4. 打包教师端
npm run build:teacher

# 5. 打包学生端
npm run build:student

# 6. 打包 AI 编辑器
npm run build:editor
```

## 安装说明

### 教师端
- 双击安装包，按向导完成安装
- 支持自定义安装目录
- 可通过控制面板正常卸载

### 学生端
- 需要以**管理员身份**运行安装包
- 安装后自动注册为 Windows 服务（开机自启，无法被普通用户关闭）
- **卸载时需要输入管理员密码**（默认密码：`admin123`）
- 管理员密码可在教师端"课堂设置"中修改并推送到所有学生端

### AI 课件编辑器
- 集成了 AI 对话生成功能的独立编辑器
- 安装后可直接使用自然语言创作互动课件
- 同样支持自定义安装目录

## 离线安装说明

所有安装包均为**完全离线包**：
- 所有 Node.js 依赖已打包进 asar
- Electron 运行时已内嵌
- 安装后无需联网即可运行
- 课件资源（lib/weights）首次使用时由教师端服务器代理下载并缓存，之后完全离线

## 目录结构

```
build/
  build.bat              # 一键打包脚本
  convert-icons.py       # PNG -> ICO 转换 (Python 实现)
  verify-password.js     # 卸载密码验证工具源码
  verify-password.exe    # 打包后的验证工具（自动生成）
  student-installer.nsh  # 学生端 NSIS 自定义脚本
  icon-teacher.ico       # 教师端图标（自动生成）
  icon-student.ico       # 学生端图标（自动生成）
  icon-editor.ico        # 编辑器图标（自动生成）
```

## 注意事项

1. `build/verify-password.exe` 由 `npm run build:verify` 自动生成，不需要手动创建
2. 图标文件必须是 `.ico` 格式，`convert-icons.py` 脚本会自动从 `assets/tray-icon.png` (和 `editor-icon.png`) 转换
3. 学生端安装包使用 `perMachine: true`，安装到 `Program Files`，需要管理员权限
4. 学生端服务名：`LumeSyncStudent`，可用 `sc query LumeSyncStudent` 查看状态
5. 如果 `assets/editor-icon.png` 存在，编辑器将使用该独立图标，否则回退到通用图标
