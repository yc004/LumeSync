#include <windows.h>
#include <tlhelp32.h>
#include <userenv.h>
#include <wtsapi32.h>

#include <filesystem>
#include <sstream>
#include <string>

#include "lumesync/shared.h"

namespace {

constexpr wchar_t kServiceName[] = L"LumeSyncStudentGuard";
SERVICE_STATUS g_status = {};
SERVICE_STATUS_HANDLE g_statusHandle = nullptr;
HANDLE g_stopEvent = nullptr;

std::filesystem::path ExePath() {
  std::wstring buffer(MAX_PATH, L'\0');
  DWORD length = GetModuleFileNameW(nullptr, buffer.data(), static_cast<DWORD>(buffer.size()));
  while (length == buffer.size()) {
    buffer.resize(buffer.size() * 2);
    length = GetModuleFileNameW(nullptr, buffer.data(), static_cast<DWORD>(buffer.size()));
  }
  buffer.resize(length);
  return buffer;
}

std::filesystem::path ShellPath() {
  return ExePath().parent_path() / L"LumeSyncStudentShell.exe";
}

void SetServiceStatus(DWORD state, DWORD win32ExitCode = NO_ERROR, DWORD waitHint = 0) {
  g_status.dwServiceType = SERVICE_WIN32_OWN_PROCESS;
  g_status.dwCurrentState = state;
  g_status.dwControlsAccepted = state == SERVICE_START_PENDING ? 0 : SERVICE_ACCEPT_STOP | SERVICE_ACCEPT_SHUTDOWN;
  g_status.dwWin32ExitCode = win32ExitCode;
  g_status.dwWaitHint = waitHint;
  SetServiceStatus(g_statusHandle, &g_status);
}

bool ProcessMatchesInSession(const std::wstring& exeName, DWORD sessionId) {
  HANDLE snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
  if (snapshot == INVALID_HANDLE_VALUE) {
    return false;
  }

  PROCESSENTRY32W entry = {};
  entry.dwSize = sizeof(entry);
  bool found = false;
  if (Process32FirstW(snapshot, &entry)) {
    do {
      DWORD processSessionId = 0;
      if (_wcsicmp(entry.szExeFile, exeName.c_str()) == 0 &&
          ProcessIdToSessionId(entry.th32ProcessID, &processSessionId) &&
          processSessionId == sessionId) {
        found = true;
        break;
      }
    } while (Process32NextW(snapshot, &entry));
  }

  CloseHandle(snapshot);
  return found;
}

bool LaunchShellInActiveSession() {
  const DWORD sessionId = WTSGetActiveConsoleSessionId();
  if (sessionId == 0xFFFFFFFF) {
    lumesync::AppendLog(L"service", L"No active console session");
    return false;
  }

  if (ProcessMatchesInSession(L"LumeSyncStudentShell.exe", sessionId)) {
    return true;
  }

  const auto shellPath = ShellPath();
  if (!std::filesystem::exists(shellPath)) {
    lumesync::AppendLog(L"service", L"Shell executable missing: " + shellPath.wstring());
    return false;
  }

  HANDLE userToken = nullptr;
  if (!WTSQueryUserToken(sessionId, &userToken)) {
    lumesync::AppendLog(L"service", L"WTSQueryUserToken failed");
    return false;
  }

  HANDLE primaryToken = nullptr;
  if (!DuplicateTokenEx(userToken, TOKEN_ALL_ACCESS, nullptr, SecurityIdentification, TokenPrimary, &primaryToken)) {
    CloseHandle(userToken);
    lumesync::AppendLog(L"service", L"DuplicateTokenEx failed");
    return false;
  }

  LPVOID environment = nullptr;
  CreateEnvironmentBlock(&environment, primaryToken, FALSE);

  std::wstring command = L"\"" + shellPath.wstring() + L"\"";
  STARTUPINFOW startup = {};
  startup.cb = sizeof(startup);
  startup.lpDesktop = const_cast<LPWSTR>(L"winsta0\\default");

  PROCESS_INFORMATION process = {};
  const BOOL created = CreateProcessAsUserW(
      primaryToken,
      nullptr,
      command.data(),
      nullptr,
      nullptr,
      FALSE,
      CREATE_UNICODE_ENVIRONMENT,
      environment,
      shellPath.parent_path().c_str(),
      &startup,
      &process);

  if (environment) {
    DestroyEnvironmentBlock(environment);
  }
  CloseHandle(primaryToken);
  CloseHandle(userToken);

  if (!created) {
    lumesync::AppendLog(L"service", L"CreateProcessAsUserW failed");
    return false;
  }

  CloseHandle(process.hThread);
  CloseHandle(process.hProcess);
  lumesync::AppendLog(L"service", L"Launched student shell in active session");
  return true;
}

void WorkerLoop() {
  lumesync::AppendLog(L"service", L"Guard worker started");

  while (WaitForSingleObject(g_stopEvent, 5000) == WAIT_TIMEOUT) {
    const auto config = lumesync::LoadConfig();
    if (!config.guardEnabled || !config.autoStart) {
      continue;
    }

    LaunchShellInActiveSession();
  }

  lumesync::AppendLog(L"service", L"Guard worker stopped");
}

DWORD WINAPI WorkerThread(LPVOID) {
  WorkerLoop();
  return 0;
}

DWORD WINAPI ServiceControlHandler(DWORD control, DWORD, LPVOID, LPVOID) {
  switch (control) {
    case SERVICE_CONTROL_STOP:
    case SERVICE_CONTROL_SHUTDOWN:
      SetServiceStatus(SERVICE_STOP_PENDING, NO_ERROR, 3000);
      SetEvent(g_stopEvent);
      return NO_ERROR;
    default:
      return NO_ERROR;
  }
}

void WINAPI ServiceMain(DWORD, LPWSTR*) {
  g_statusHandle = RegisterServiceCtrlHandlerExW(kServiceName, ServiceControlHandler, nullptr);
  if (!g_statusHandle) {
    return;
  }

  SetServiceStatus(SERVICE_START_PENDING, NO_ERROR, 3000);
  g_stopEvent = CreateEventW(nullptr, TRUE, FALSE, nullptr);
  if (!g_stopEvent) {
    SetServiceStatus(SERVICE_STOPPED, GetLastError());
    return;
  }

  SetServiceStatus(SERVICE_RUNNING);
  HANDLE worker = CreateThread(nullptr, 0, WorkerThread, nullptr, 0, nullptr);
  if (worker) {
    WaitForSingleObject(worker, INFINITE);
    CloseHandle(worker);
  }

  CloseHandle(g_stopEvent);
  SetServiceStatus(SERVICE_STOPPED);
}

void RunConsoleMode() {
  g_stopEvent = CreateEventW(nullptr, TRUE, FALSE, nullptr);
  lumesync::AppendLog(L"service", L"Guard service running in console mode");
  WorkerLoop();
  CloseHandle(g_stopEvent);
}

bool HasConsoleArg() {
  int argc = 0;
  LPWSTR* argv = CommandLineToArgvW(GetCommandLineW(), &argc);
  if (!argv) return false;

  bool found = false;
  for (int i = 1; i < argc; ++i) {
    if (wcscmp(argv[i], L"--console") == 0) {
      found = true;
      break;
    }
  }
  LocalFree(argv);
  return found;
}

}  // namespace

int wmain() {
  lumesync::EnsureRuntimeDirectories();

  if (HasConsoleArg()) {
    RunConsoleMode();
    return 0;
  }

  SERVICE_TABLE_ENTRYW table[] = {
      {const_cast<LPWSTR>(kServiceName), ServiceMain},
      {nullptr, nullptr},
  };

  if (!StartServiceCtrlDispatcherW(table)) {
    lumesync::AppendLog(L"service", L"StartServiceCtrlDispatcherW failed");
    return 1;
  }

  return 0;
}
