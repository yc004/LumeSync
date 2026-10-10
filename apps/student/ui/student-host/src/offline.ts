const teacherIp = document.querySelector<HTMLElement>("#teacher-ip");
const statusText = document.querySelector<HTMLElement>("#status-text");
const countdown = document.querySelector<HTMLElement>("#countdown");
let countdownValue = 5;
let countdownTimer: number | undefined;

function ensureHost() {
  if (!window.studentHost) {
    throw new Error("studentHost bridge is unavailable");
  }

  return window.studentHost;
}

function updateCountdown(): void {
  if (countdown) {
    countdown.textContent = String(countdownValue);
  }
}

function startCountdown(): void {
  countdownValue = 5;
  updateCountdown();

  if (countdownTimer) {
    window.clearInterval(countdownTimer);
  }

  countdownTimer = window.setInterval(() => {
    countdownValue -= 1;
    updateCountdown();

    if (countdownValue <= 0) {
      if (countdownTimer) {
        window.clearInterval(countdownTimer);
      }
      startCountdown();
    }
  }, 1000);
}

async function init(): Promise<void> {
  const host = ensureHost();
  const config = await host.getConfig();
  if (teacherIp) {
    teacherIp.textContent = `http://${config.teacherIp}:${config.port || 3000}`;
  }
  startCountdown();
}

function manualRetry(): void {
  if (countdownTimer) {
    window.clearInterval(countdownTimer);
  }

  if (statusText) {
    statusText.innerHTML = "正在连接...";
  }

  ensureHost().manualRetry();
  window.setTimeout(startCountdown, 2000);
}

function toggleDevTools(event: MouseEvent): void {
  event.preventDefault();
  ensureHost().toggleDevTools();
}

document.querySelector<HTMLButtonElement>("#manual-retry")?.addEventListener("click", manualRetry);
document.querySelector<HTMLAnchorElement>("#toggle-devtools")?.addEventListener("click", toggleDevTools);

void init();
