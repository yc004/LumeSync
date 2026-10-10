const { existsSync } = require("fs");
const { delimiter, join } = require("path");
const { spawnSync } = require("child_process");

const args = process.argv.slice(2);

function commandExists(command) {
  const result = spawnSync(process.platform === "win32" ? "where.exe" : "which", [command], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"]
  });

  if (result.status !== 0) {
    return null;
  }

  return result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
}

function findVisualStudioCMake() {
  if (process.platform !== "win32") {
    return null;
  }

  const roots = [
    process.env.CMAKE_HOME,
    process.env.VSINSTALLDIR,
    process.env.ProgramFiles && join(process.env.ProgramFiles, "Microsoft Visual Studio"),
    process.env["ProgramFiles(x86)"] && join(process.env["ProgramFiles(x86)"], "Microsoft Visual Studio")
  ].filter(Boolean);

  const versions = ["18", "2022", "17", "2019"];
  const editions = ["Community", "Professional", "Enterprise", "BuildTools"];
  const suffix = join("Common7", "IDE", "CommonExtensions", "Microsoft", "CMake", "CMake", "bin", "cmake.exe");

  for (const root of roots) {
    if (root.endsWith("cmake.exe") && existsSync(root)) {
      return root;
    }

    for (const version of versions) {
      for (const edition of editions) {
        const candidate = join(root, version, edition, suffix);
        if (existsSync(candidate)) {
          return candidate;
        }
      }
    }
  }

  return null;
}

const cmakePath = process.env.CMAKE || commandExists("cmake") || findVisualStudioCMake();

if (!cmakePath) {
  console.error("Unable to find cmake. Install CMake or set the CMAKE environment variable to cmake.exe.");
  process.exit(1);
}

const cmakeBinDir = cmakePath.endsWith("cmake.exe") ? cmakePath.slice(0, -"cmake.exe".length) : "";
const env = cmakeBinDir ? { ...process.env, PATH: `${cmakeBinDir}${delimiter}${process.env.PATH || ""}` } : process.env;
const result = spawnSync(cmakePath, args, {
  stdio: "inherit",
  env,
  shell: false
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
