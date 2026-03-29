# 学生端连接问题解决方案

## 问题描述

学生端启动时出现以下错误：

```
electron: Failed to load URL: http://192.168.1.100:3000/ with error: ERR_CONNECTION_TIMED_OUT
```

这是由于学生端默认配置的教师端 IP 地址（`192.168.1.100`）不正确导致的。

## 解决方案

### 方法一：本地测试（单机测试）

如果只是在同一台机器上测试学生端和教师端：

1. **启动教师端**
   ```bash
   npm run start:teacher
   ```

2. **修改学生端配置**
   - 启动学生端：`npm run start:student`
   - 按下快捷键 `Ctrl+Shift+A` 打开管理员设置
   - 输入默认密码：`admin123`
   - 将教师端 IP 修改为：`127.0.0.1`
   - 保存配置并重启学生端

### 方法二：局域网连接（多台机器）

如果需要在局域网内连接教师端和学生端：

1. **查看教师端机器的 IP 地址**
   ```bash
   # Windows
   ipconfig

   # macOS/Linux
   ifconfig
   ```

2. **启动教师端**
   ```bash
   npm run start:teacher
   ```

3. **配置学生端**
   - 启动学生端：`npm run start:student`
   - 按下快捷键 `Ctrl+Shift+A` 打开管理员设置
   - 输入默认密码：`admin123`
   - 将教师端 IP 修改为教师端机器的实际 IP 地址
   - 保存配置并重启学生端

4. **检查防火墙**
   - 确保教师端机器的防火墙允许端口 3000 的入站连接
   - 如果使用 Windows 防火墙，可能需要添加例外规则

## 常见问题

### Q: 如何快速测试连接？

```bash
# 在学生端机器上测试能否连接到教师端
curl http://教师端IP:3000

# 如果连接成功，会返回 HTML 内容
# 如果连接失败，会显示 connection refused 或 timeout
```

### Q: 仍然无法连接怎么办？

1. **确认教师端服务器正在运行**
   ```bash
   # 在教师端机器上
   curl http://localhost:3000
   ```

2. **检查网络连接**
   ```bash
   # 从学生端机器 ping 教师端机器
   ping 教师端IP
   ```

3. **检查防火墙设置**
   - Windows：控制面板 → 系统和安全 → Windows Defender 防火墙
   - 确保端口 3000 允许入站连接

4. **临时关闭防火墙测试**
   - 关闭防火墙后测试是否能连接
   - 如果能连接，说明是防火墙阻止了连接
   - 重新打开防火墙并添加例外规则

### Q: 默认密码是什么？

学生端管理员设置默认密码：`admin123`

建议在实际使用环境中修改密码以提高安全性。

### Q: 如何重置配置？

删除学生端的配置文件（位置取决于操作系统）：

**Windows:**
```
%APPDATA%/LumeSync-Student/config.json
```

**macOS:**
```
~/Library/Application Support/LumeSync-Student/config.json
```

**Linux:**
```
~/.config/LumeSync-Student/config.json
```

删除配置文件后，学生端会恢复默认配置。

## 快速命令

### 查看本机 IP
```bash
# Windows
ipconfig | findstr IPv4

# macOS/Linux
ifconfig | grep "inet " | grep -v 127.0.0.1
```

### 测试端口连接
```bash
# Windows
netstat -an | findstr :3000

# macOS/Linux
lsof -i :3000
```

## 配置文件格式

学生端配置文件 (`config.json`) 示例：

```json
{
  "teacherIp": "192.168.1.100",
  "port": 3000,
  "adminPasswordHash": ""
}
```

## 需要帮助？

如果仍然无法解决问题：

1. 查看日志文件：`~/.lumesync/logs/`
2. 检查教师端是否正常启动
3. 确认网络连接正常
4. 检查防火墙设置

---

祝你使用愉快！🎉
