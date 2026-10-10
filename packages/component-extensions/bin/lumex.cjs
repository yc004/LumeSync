#!/usr/bin/env node
'use strict';

const { readFile, writeFile } = require('node:fs/promises');
const { resolve, extname } = require('node:path');
const {
  createStarterComponentPack, validateComponentPack, componentPackHash,
  readComponentPack, writeComponentPack
} = require('..');

const HELP = `LumeSync declarative component pack tools

Usage:
  lumex-component init <package-id> <display-name> [--version 1.0.0] [--output extension.json]
  lumex-component validate <extension.json|pack.lumex>
  lumex-component pack <extension.json> [output.lumex]
`;

function parseOptions(args) {
  const positional = [];
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--version' || arg === '--output' || arg === '-o') {
      const key = arg === '--version' ? 'version' : 'output';
      const value = args[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`${arg} 后必须提供值`);
      options[key] = value;
      index += 1;
    } else if (arg.startsWith('-')) {
      throw new Error(`未知选项：${arg}`);
    } else positional.push(arg);
  }
  return { positional, options };
}

async function loadPack(filePath) {
  const bytes = await readFile(filePath);
  if (extname(filePath).toLowerCase() === '.lumex') return readComponentPack(bytes);
  let value;
  try { value = JSON.parse(bytes.toString('utf8')); }
  catch { throw new Error(`${filePath} 不是合法 JSON`); }
  return { pack: validateComponentPack(value), hash: componentPackHash(value) };
}

async function main(argv) {
  const [command, ...rest] = argv;
  if (!command || command === '--help' || command === '-h' || command === 'help') {
    process.stdout.write(HELP);
    return;
  }

  const { positional, options } = parseOptions(rest);
  if (command === 'init') {
    if (positional.length !== 2) throw new Error('init 需要 <package-id> 和 <display-name>');
    const pack = createStarterComponentPack(positional[0], positional[1], options.version || '1.0.0');
    const outputPath = resolve(options.output || 'extension.json');
    let existing;
    try { existing = await readFile(outputPath); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (existing) throw new Error(`${outputPath} 已存在；请使用 --output 指定其他路径`);
    await writeFile(outputPath, `${JSON.stringify(pack, null, 2)}\n`, { flag: 'wx' });
    process.stdout.write(`已创建 ${outputPath}\n组件 ID：${pack.components[0].id}\n`);
    return;
  }

  if (command === 'validate') {
    if (positional.length !== 1) throw new Error('validate 需要一个 extension.json 或 .lumex 路径');
    const { pack, hash } = await loadPack(positional[0]);
    process.stdout.write(`有效组件包：${pack.displayName}\nID：${pack.id}\n版本：${pack.version}\n组件数：${pack.components.length}\nHash：${hash}\n`);
    return;
  }

  if (command === 'pack') {
    if (positional.length < 1 || positional.length > 2) throw new Error('pack 需要 <extension.json> 和可选的输出路径');
    const { pack } = await loadPack(positional[0]);
    const outputPath = resolve(positional[1] || options.output || `${pack.id.split('.').at(-1)}-${pack.version}.lumex`);
    const bytes = await writeComponentPack(pack);
    await writeFile(outputPath, bytes, { flag: 'wx' });
    const installed = await readComponentPack(bytes);
    process.stdout.write(`已打包 ${outputPath}\n组件数：${installed.pack.components.length}\nHash：${installed.hash}\n`);
    return;
  }

  throw new Error(`未知命令：${command}\n\n${HELP}`);
}

main(process.argv.slice(2)).catch(error => {
  process.stderr.write(`错误：${error.code ? `${error.code}: ` : ''}${error.message}\n`);
  process.exitCode = 1;
});
