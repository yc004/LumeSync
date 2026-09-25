# 项目审查报告

首次审查日期：2026-09-25。首次范围：根仓配置、文档、文档站、下载站源码和 GitHub Actions。首次审查时业务子模块为空，因此下列问题主要是根仓问题。随后已取得教师端、学生端、Core 与遗留插件源码并完成静态[源码级架构评估](../architecture/source-review.md)，但功能与 Windows 构建尚未实测。旧 AI Editor 未克隆，旧插件也已退出目标架构。学生端和 Core 锁定提交不可取得，详见[子模块状态](submodules.md)。

后续的跨仓源码评估、信任边界问题和改造路线见[源码级架构评估](../architecture/source-review.md)。本页保留首次根仓审查的问题清单。

## 高优先级问题

| 编号 | 问题与证据 | 影响 | 建议 |
| --- | --- | --- | --- |
| H1 | `.github/workflows/release.yml` 更新不存在的 `apps/teacher/package.json`、`apps/student/package.json`，并使用旧的 `shared/build`、`dist/*`、Electron 参数 | 发布流程在当前根仓拓扑下无法按脚本完成 | 根据子模块实际构建脚本重写并在 Windows CI 验证 |
| H2 | `build-branch.yml` 同样使用旧路径和 `build:editor`（根脚本只有 `build:editor-plugin`），两个构建工作流 checkout 均未启用递归子模块 | 分支产物构建易失败或找不到业务包 | 初始化子模块后校正命令和产物路径 |
| H3 | `website/server.js` 比较小写的仓库全名与混合大小写的 `EDITOR_REPO` 常量；主仓常量是 `yc004/lumesync`，而根仓远端文档指向 `yc004/SyncClassroom` | 旧编辑器事件永远无法匹配，主仓事件也可能无法匹配 | 新架构不再发布旧编辑器；后续清除旧事件分支，并校正主仓配置与 webhook 测试 |
| H4 | `website/public/index.html` 下载链接是 `SyncClassroom-*-Latest.exe`，服务端写入 `LumeSync-*-Latest.exe` | 首页下载按钮指向不存在的文件 | 统一下载名称并验证页面链接 |

## 中优先级问题

| 编号 | 问题与证据 | 影响 | 建议 |
| --- | --- | --- | --- |
| M1 | `website/server.js` 在异步下载完成前写入 `version.json` 和文件列表；`downloadAsset` 的部分错误仅打印日志，未上报调用方 | 页面可能显示尚未成功下载的版本；失败后仍标记可用 | 下载到临时文件，校验完成后原子替换并更新版本信息 |
| M2 | Release webhook 使用事件提供的 `browser_download_url` 拼接第三方代理地址，未限制资产来源主机；允许 `edited` 重复触发，并发事件修改同一 JSON | 下载来源与竞态缺少明确控制 | 校验仓库、资产 URL、下载结果并串行化发布更新 |
| M3 | 首次审查时，文档站首页声称“本轮内容重新读取了最新代码”，而当时尚无业务源码；旧章节大量引用不存在的 `repos/core` | 读者难以判断文档可信度 | 已将旧章节与旧站内容归档；当前站点从 `docs/` 同步并区分现状、评估和目标设计 |
| M4 | 根仓 `build:icons` 使用裸 `python`，两个 CI 工作流直接 `pip install Pillow`；没有项目自有 `environment.yml` | Python 构建环境不可复现，也不符合本项目的 Conda 偏好 | 建立明确 Python/Conda 环境并在 CI 中使用 |
| M5 | 根仓没有 `LICENSE`；文档站的许可证页只列部分子模块声明，原页脚却标注 MIT | 许可证范围与再分发条件不明确 | 本次已去除页脚的 MIT 声明；维护者需确定根仓及子模块许可并补文件与第三方清单 |

## 待验证项目

1. 在用户确定是否继续使用现有子模块组合后，处理学生端和 Core 的失效指针；AI Editor 留待重新设计。
2. 对照子模块 `package.json` 验证每个根脚本、Windows 构建产物路径与 Node 版本。
3. 在可重复的版本组合上运行 Core 测试和教师/学生连课测试；执行文档站构建。旧 AI Editor 与插件不作为新架构验证目标。
4. 在 Windows 机上验证教师、学生服务及桌面端；覆盖连课、翻页、投票、提交和离线情形。
5. 复核 API、Socket、SDK、身份默认值、课件格式、安装器行为及数据存储路径。
6. 修复 CI 后通过真实 tag 的预发布演练验证发布产物。

本页是首次根仓问题清单；业务源码审查结论和新架构设计分别见[源码级评估](../architecture/source-review.md)与[目标架构](../architecture/target-architecture.md)。
