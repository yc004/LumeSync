# @lumesync/course-format

`.lume` 课件的共享格式库：manifest schema 与校验、ZIP 读写与安全限制、内容 hash、旧脚本课件迁移。
编辑器、教师服务和播放器共用这一份实现。

对应设计：[目标架构](../../docs/architecture/target-architecture.md) 第 5 节、[课件格式与 SDK](../../docs/reference/course-format-sdk.md)。

## 内容

| 模块 | 说明 |
| --- | --- |
| `src/manifest.js` | `schemaVersion`/`runtime.format`/`entryMode`/`pages`/`assets` 校验，区分 `errors`（无法播放）与 `warnings`（可疑但不阻塞） |
| `src/package.js` | `readLumePackage`（异步，JSZip）、`writeLumePackage`（确定性打包）、`computeCourseHash`（与打包时间无关的内容 hash） |
| `src/node.js` | Node 专用：`readLumeManifestSync`（课程目录同步扫描）、`lintLumeFileSync`、`readLumeFile`、`writeLumeFile`（临时文件 + 改名，原子替换）、旧课件迁移与收集 |
| `src/migrate.js` | 旧脚本 `.lume` → `legacy-course-data` ZIP 课件（纯函数，不碰文件系统） |

安全限制（`LIMITS`）：条目数、单文件解压上限、总解压上限、压缩比、路径长度、页面上限、manifest 大小。
路径校验拒绝绝对路径、盘符、反斜杠、控制字符与 `..` 段；解包端即使面对恶意 ZIP 也不会写到包外。

## Node 与浏览器

- 主入口 `require('@lumesync/course-format')` 不依赖 Node 专有模块：ZIP 读写用 JSZip，摘要优先走 Web Crypto（浏览器与 Node 18+ 都有），回退才用 Node 的 `crypto`。
- `@lumesync/course-format/node` 是 Node 专用子路径（文件读写、同步扫描、迁移落盘），浏览器不要引用。
- 旧课件迁移当前只在 Node 侧执行（迁移 id 使用同步 SHA-1）；网页编辑器如需迁移，应由服务端产出 ZIP 后再下发。

## 使用

```js
const { readLumePackage, writeLumePackage, computeCourseHash, migrateLegacyCourse } = require('@lumesync/course-format');
const { lintLumeFileSync, readLumeManifestSync } = require('@lumesync/course-format/node');

const pkg = await readLumePackage(buffer);
if (!pkg.ok) console.error(pkg.code, pkg.errors);   // manifest_missing / package_entry_path_unsafe / ...
const { hash } = await computeCourseHash(buffer);   // sha256:...
```

教师服务接入点：`apps/teacher/server/src/courses.js` 用 `lintLumeFileSync` 扫描目录，
损坏的课件进入目录结果的 `invalid` 列表而不是被静默跳过；旧迁移脚本
`apps/teacher/scripts/legacy-lume-migrator.js` 也只是本包的兼容层。

## 已知限制

- **异步读取的内存放大**：`readLumePackage` 只能先信任 ZIP 头声明的大小再解压，头部谎报小值时会在二次校验前完成一次大额分配；同步路径用 `zlib.inflateRawSync({ maxOutputLength })` 封顶，因此服务端扫描走同步路径。编辑器/导入流程若直接解压不受信任的文件，应改流式解压或先落盘限制。
- 迁移当前只在 Node 侧执行（见上）。
- 内容 hash 对（路径, 内容）排序后计算，因此重打包不影响 hash；但它不覆盖 ZIP 元数据（注释、外部属性）。

## 测试

```bash
node --test packages/course-format/test/*.test.js
# 或在仓库根目录：pnpm run test:contracts
```
