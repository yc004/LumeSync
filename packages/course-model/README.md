# @lumesync/course-model

编辑器使用的可编辑课件文档模型。第一版内置标题、正文、要点列表和提示框四种声明式组件；人类操作与 Agent 提案共用类型化命令、revision 检查、撤销/重做和候选差异审查。

`buildCourseDocument()` 同时生成可编辑源文件 `source/course.json`、`source/pages/*.json`，以及当前 LumeSync ZIP 播放器可读取的受限 TSX 页面和构建清单。TSX 只由内置组件定义生成，不接收模型生成或用户输入的代码。播放器升级到声明式 document 模式后，可移除此兼容输出。

本包不负责 ZIP 文件 I/O、桌面 IPC、组件插件安装、Agent 网络请求或课堂发布；这些边界留给格式库、编辑器主进程和后续扩展系统。

```sh
node --test packages/course-model/test/*.test.js
```
