# `@lumesync/component-extensions`

Validates and packages safe, declarative `.lumex` component packs. Pack templates are a constrained React-element tree: they cannot contain JavaScript, raw HTML, event handlers, remote dependencies, or arbitrary CSS. This is the first importable component format; executable extension entrypoints remain a separate future capability requiring isolated execution.

```js
const { writeComponentPack, readComponentPack } = require('@lumesync/component-extensions');
const bytes = await writeComponentPack(pack);
const installed = await readComponentPack(bytes);
console.log(installed.pack.id, installed.hash);
```
