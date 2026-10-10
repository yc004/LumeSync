# `@lumesync/component-extensions`

Create, validate, and package safe declarative `.lumex` component packs. The current format is intentionally data-only: templates cannot contain JavaScript, raw HTML, event handlers, remote dependencies, arbitrary CSS, or extra ZIP files.

## Quick start

Run the CLI from the repository root:

```sh
node packages/component-extensions/bin/lumex.cjs init org.school.science "科学组件" --version 1.0.0
node packages/component-extensions/bin/lumex.cjs validate extension.json
node packages/component-extensions/bin/lumex.cjs pack extension.json science-1.0.0.lumex
node packages/component-extensions/bin/lumex.cjs validate science-1.0.0.lumex
```

`init` creates an editable `extension.json` containing a sample card component. Edit its label, props, and template, then validate and package it again. The CLI refuses to overwrite an existing output file. Component IDs must stay inside the package namespace; increment the package semver when publishing a changed contract.

Import the resulting `.lumex` in the LumeSync editor. A course records the exact package version and hash and embeds the declarative definition in its `.lume` file, so playback does not need a network connection or a separately installed pack.

## JavaScript API

```js
const { writeComponentPack, readComponentPack } = require('@lumesync/component-extensions');
const bytes = await writeComponentPack(pack);
const installed = await readComponentPack(bytes);
console.log(installed.pack.id, installed.hash);
```

Use `createStarterComponentPack(id, displayName, version?)` to create the same validated starter definition as the CLI. `validateComponentPack` and `componentPackHash` are available for editor and build integrations.

The template language uses an allowlist of HTML-like tags and CSS properties, static text, and references to declared props. This is a safe component library slice, not an executable plugin API. Slots, bundled media, event handlers, classroom state, and JavaScript entrypoints are not supported by format version `1.0.0`.
