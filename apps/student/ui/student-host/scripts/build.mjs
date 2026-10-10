import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const dist = resolve(root, "dist");
const staticDir = resolve(root, "static");
const require = createRequire(import.meta.url);
const tscBin = process.platform === "win32" ? "tsc.cmd" : "tsc";

// 依赖可能被提升到工作区根目录（pnpm node-linker=hoisted），
// 因此按"本包 node_modules → 工作区根 node_modules → 解析 typescript 包"的顺序查找。
function resolveTsc() {
  const candidates = [
    resolve(root, "node_modules", ".bin", tscBin),
    resolve(root, "..", "node_modules", ".bin", tscBin),
    resolve(root, "..", "..", "..", "..", "node_modules", ".bin", tscBin),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  try {
    return require.resolve("typescript/bin/tsc");
  } catch (_) {
    return null;
  }
}

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });
cpSync(staticDir, dist, { recursive: true });

const tsc = resolveTsc();
if (!tsc) {
  console.warn("[host-ui] TypeScript compiler not installed; kept checked-in dist assets.");
  process.exit(0);
}

// 通过 node 执行 tsc，兼容 .bin/tsc（脚本）与 typescript/bin/tsc（JS）两种形态。
const result = spawnSync(process.execPath, [tsc, "-p", resolve(root, "tsconfig.json")], {
  cwd: resolve(root, "..", ".."),
  stdio: "inherit",
});

if (result.status !== 0) {
  if (result.error) {
    console.error(result.error.message);
  }
  process.exit(result.status ?? 1);
}

console.log("[host-ui] compiled student host UI with", tsc);
