import type { StudentConfig } from "./types";

const loginScreen = document.querySelector<HTMLElement>("#screen-login");
const configScreen = document.querySelector<HTMLElement>("#screen-config");
const loginPassword = document.querySelector<HTMLInputElement>("#login-pwd");
const loginError = document.querySelector<HTMLElement>("#login-error");
const ipInput = document.querySelector<HTMLInputElement>("#cfg-ip");
const portInput = document.querySelector<HTMLInputElement>("#cfg-port");
const autostartInput = document.querySelector<HTMLInputElement>("#cfg-autostart");
const passwordInput = document.querySelector<HTMLInputElement>("#cfg-newpwd");
const confirmPasswordInput = document.querySelector<HTMLInputElement>("#cfg-confirmpwd");
const configError = document.querySelector<HTMLElement>("#cfg-error");
const configSuccess = document.querySelector<HTMLElement>("#cfg-success");

function ensureHost() {
  if (!window.studentHost) {
    throw new Error("studentHost bridge is unavailable");
  }

  return window.studentHost;
}

async function sha256Hex(value: string): Promise<string> {
  const payload = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", payload);
  return [...new Uint8Array(digest)].map((part) => part.toString(16).padStart(2, "0")).join("");
}

async function loadConfig(): Promise<void> {
  const host = ensureHost();
  const config = await host.getConfig();
  const autostart = await host.getAutostart();

  if (ipInput) ipInput.value = config.teacherIp ?? "";
  if (portInput) portInput.value = String(config.port ?? 3000);
  if (autostartInput) autostartInput.checked = Boolean(autostart);
}

async function doLogin(): Promise<void> {
  if (!loginPassword || !loginError) return;

  const host = ensureHost();
  const password = loginPassword.value.trim();
  if (!password) {
    loginError.textContent = "请输入管理员密码";
    return;
  }

  const result = await host.verifyPassword(password);
  if (!result.ok) {
    loginError.textContent = "密码错误";
    loginPassword.value = "";
    return;
  }

  loginError.textContent = "";
  loginScreen?.classList.remove("active");
  configScreen?.classList.add("active");
  await loadConfig();
}

function buildConfigPatch(): Partial<StudentConfig> {
  return {
    teacherIp: ipInput?.value.trim() ?? "",
    port: Number.parseInt(portInput?.value ?? "3000", 10) || 3000,
  };
}

async function saveConfig(): Promise<void> {
  const host = ensureHost();
  if (!configError || !configSuccess || !passwordInput || !confirmPasswordInput) return;

  configError.textContent = "";
  configSuccess.textContent = "";

  const patch = buildConfigPatch();
  if (!patch.teacherIp) {
    configError.textContent = "请输入教师机 IP";
    return;
  }

  const nextPassword = passwordInput.value;
  const confirmPassword = confirmPasswordInput.value;
  if (nextPassword && nextPassword !== confirmPassword) {
    configError.textContent = "两次输入的密码不一致";
    return;
  }

  if (nextPassword) {
    patch.adminPasswordHash = await sha256Hex(nextPassword);
  }

  const ok = await host.saveConfig(patch);
  if (!ok) {
    configError.textContent = "保存失败，请重试";
    return;
  }

  const autostart = Boolean(autostartInput?.checked);
  const autostartResult = await host.setAutostart(autostart);
  if (!autostartResult.success) {
    configError.textContent = autostartResult.error ?? "开机自启动设置失败";
    return;
  }

  configSuccess.textContent = "保存成功";
  passwordInput.value = "";
  confirmPasswordInput.value = "";
}

async function quitApp(): Promise<void> {
  const host = ensureHost();
  await host.saveConfig({ _quit: true });
}

function goBack(): void {
  window.close();
}

loginPassword?.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    void doLogin();
  }
});

document.querySelector<HTMLButtonElement>("#login-submit")?.addEventListener("click", () => void doLogin());
document.querySelector<HTMLButtonElement>("#config-save")?.addEventListener("click", () => void saveConfig());
document.querySelector<HTMLButtonElement>("#config-quit")?.addEventListener("click", () => void quitApp());
document.querySelector<HTMLButtonElement>("#config-cancel")?.addEventListener("click", goBack);
