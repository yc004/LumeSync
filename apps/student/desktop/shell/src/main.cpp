#define NOMINMAX
#include <winsock2.h>
#include <ws2tcpip.h>
#include <windows.h>
#include <shellapi.h>
#include <winhttp.h>
#include <wincrypt.h>
#include <iphlpapi.h>
#include <objidl.h>
#include <gdiplus.h>
#pragma comment(lib, "winhttp.lib")
#pragma comment(lib, "iphlpapi.lib")

#include <algorithm>
#include <filesystem>
#include <optional>
#include <sstream>
#include <iomanip>
#include <string>
#include <vector>
#include <cstring>
#include <cmath>
#include <thread>
#include <atomic>
#include <memory>

#include "lumesync/shared.h"
#include "resource.h"

#if __has_include(<WebView2.h>)
#define LUMESYNC_HAS_WEBVIEW2 1
#include <WebView2.h>
#include <WebView2EnvironmentOptions.h>
#include <wrl.h>
using Microsoft::WRL::Callback;
using Microsoft::WRL::ComPtr;
using Microsoft::WRL::Make;
#else
#define LUMESYNC_HAS_WEBVIEW2 0
#endif

using namespace Gdiplus;

namespace {

struct GdiplusScope {
  ULONG_PTR token = 0;

  GdiplusScope() {
    GdiplusStartupInput input;
    const Status status = GdiplusStartup(&token, &input, nullptr);
    if (status != Ok) {
      token = 0;
      lumesync::AppendLog(L"shell", L"GDI+ startup failed");
    }
  }

  ~GdiplusScope() {
    if (token != 0) {
      GdiplusShutdown(token);
    }
  }

  bool Ready() const { return token != 0; }
};

std::optional<std::wstring> Base64Encode(const BYTE* data, DWORD size) {
  if (!data || size == 0) return std::nullopt;
  DWORD required = 0;
  if (!CryptBinaryToStringW(data, size, CRYPT_STRING_BASE64 | CRYPT_STRING_NOCRLF, nullptr, &required)) {
    return std::nullopt;
  }
  std::wstring encoded(required, L'\0');
  if (!CryptBinaryToStringW(data, size, CRYPT_STRING_BASE64 | CRYPT_STRING_NOCRLF, encoded.data(), &required)) {
    return std::nullopt;
  }
  if (!encoded.empty() && encoded.back() == L'\0') encoded.pop_back();
  return encoded;
}

std::optional<CLSID> FindEncoderClsid(const WCHAR* mimeType) {
  UINT num = 0;
  UINT size = 0;
  if (GetImageEncodersSize(&num, &size) != Ok || size == 0) {
    return std::nullopt;
  }
  std::vector<BYTE> buffer(size);
  auto* info = reinterpret_cast<ImageCodecInfo*>(buffer.data());
  if (GetImageEncoders(num, size, info) != Ok) {
    return std::nullopt;
  }
  for (UINT i = 0; i < num; ++i) {
    if (info[i].MimeType && wcscmp(info[i].MimeType, mimeType) == 0) {
      return info[i].Clsid;
    }
  }
  return std::nullopt;
}

std::wstring BuildScreenshotPayloadJson(const std::wstring& dataUrl, int width, int height) {
  std::wostringstream json;
  json << L"{"
       << L"\"dataUrl\":\"" << lumesync::JsonEscape(dataUrl) << L"\","
       << L"\"width\":" << width << L","
       << L"\"height\":" << height << L","
       << L"\"capturedAt\":\"" << lumesync::JsonEscape(std::to_wstring(lumesync::UnixTimeMs())) << L"\""
       << L"}";
  return json.str();
}

std::wstring FormatMacAddress(const BYTE* address, ULONG length) {
  if (!address || length != 6) return L"";
  std::wostringstream mac;
  mac << std::hex << std::setfill(L'0');
  for (ULONG i = 0; i < length; ++i) {
    if (i > 0) mac << L":";
    mac << std::setw(2) << static_cast<int>(address[i]);
  }
  return mac.str();
}

std::wstring GetPrimaryMacAddress() {
  ULONG bufferSize = 15 * 1024;
  std::vector<BYTE> buffer(bufferSize);
  IP_ADAPTER_ADDRESSES* addresses = reinterpret_cast<IP_ADAPTER_ADDRESSES*>(buffer.data());
  ULONG result = GetAdaptersAddresses(AF_UNSPEC, GAA_FLAG_SKIP_ANYCAST | GAA_FLAG_SKIP_MULTICAST | GAA_FLAG_SKIP_DNS_SERVER, nullptr, addresses, &bufferSize);
  if (result == ERROR_BUFFER_OVERFLOW) {
    buffer.resize(bufferSize);
    addresses = reinterpret_cast<IP_ADAPTER_ADDRESSES*>(buffer.data());
    result = GetAdaptersAddresses(AF_UNSPEC, GAA_FLAG_SKIP_ANYCAST | GAA_FLAG_SKIP_MULTICAST | GAA_FLAG_SKIP_DNS_SERVER, nullptr, addresses, &bufferSize);
  }
  if (result != NO_ERROR) return L"";

  std::wstring fallback;
  for (IP_ADAPTER_ADDRESSES* adapter = addresses; adapter; adapter = adapter->Next) {
    const bool isUsableType = adapter->IfType == IF_TYPE_ETHERNET_CSMACD || adapter->IfType == IF_TYPE_IEEE80211;
    if (!isUsableType || adapter->PhysicalAddressLength != 6) continue;
    const std::wstring mac = FormatMacAddress(adapter->PhysicalAddress, adapter->PhysicalAddressLength);
    if (mac.empty()) continue;
    if (fallback.empty()) fallback = mac;
    if (adapter->OperStatus == IfOperStatusUp) return mac;
  }
  return fallback;
}

std::wstring BuildDeviceInfoPayloadJson(const lumesync::StudentConfig& config) {
  wchar_t computerName[MAX_COMPUTERNAME_LENGTH + 1] = {};
  DWORD size = MAX_COMPUTERNAME_LENGTH + 1;
  std::wstring deviceName;
  if (GetComputerNameW(computerName, &size) && size > 0) {
    deviceName.assign(computerName, size);
  }
  std::wostringstream json;
  json << L"{"
       << L"\"mac\":\"" << lumesync::JsonEscape(GetPrimaryMacAddress()) << L"\","
       << L"\"deviceName\":\"" << lumesync::JsonEscape(deviceName) << L"\","
       << L"\"clientId\":\"" << lumesync::JsonEscape(config.clientId) << L"\""
       << L"}";
  return json.str();
}

std::wstring BuildInlineOfflineHtml(const lumesync::StudentConfig& config) {
  std::wostringstream html;
  html << LR"HTML(<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>无法连接教师端</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: "Segoe UI", "Microsoft YaHei UI", sans-serif; background: linear-gradient(180deg, #0f172a, #020617); color: #e2e8f0; min-height: 100vh; display: flex; align-items: center; justify-content: center; }
    .card { width: min(560px, calc(100vw - 48px)); padding: 36px 32px; border-radius: 24px; background: rgba(15,23,42,0.88); border: 1px solid rgba(255,255,255,0.08); box-shadow: 0 24px 80px rgba(0,0,0,0.38); }
    .badge { display:inline-flex; align-items:center; gap:10px; margin-bottom:18px; font-size:12px; font-weight:700; letter-spacing:.18em; color:#93c5fd; text-transform:uppercase; }
    .dot { width:10px; height:10px; border-radius:999px; background:#f59e0b; box-shadow:0 0 0 8px rgba(245,158,11,.14); }
    h1 { font-size: 28px; font-weight: 800; color: #f8fafc; margin-bottom: 12px; }
    p { line-height: 1.75; color: #94a3b8; font-size: 14px; }
    .url { margin-top: 16px; padding: 14px 16px; border-radius: 16px; background: rgba(2,6,23,0.55); border: 1px solid rgba(255,255,255,0.08); color: #bfdbfe; font-family: Consolas, monospace; word-break: break-all; }
    .actions { margin-top: 22px; display: flex; gap: 12px; flex-wrap: wrap; }
    button { border: none; border-radius: 14px; padding: 12px 18px; cursor: pointer; font-weight: 700; }
    .primary { background: #2563eb; color: #fff; }
    .ghost { background: rgba(255,255,255,0.08); color: #e2e8f0; border: 1px solid rgba(255,255,255,0.1); }
    .tips { margin-top: 18px; font-size: 12px; color: #64748b; }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge"><span class="dot"></span> LumeSync Student</div>
    <h1>无法连接到教师端</h1>
    <p>学生端已启动，但当前无法连接教师端服务。请检查教师机地址、端口以及局域网连通性。</p>
    <div class="url">)HTML";
  html << L"http://" << lumesync::JsonEscape(config.teacherIp) << L":" << config.port;
  html << LR"HTML(</div>
    <div class="actions">
      <button class="primary" onclick="window.studentHost?.manualRetry?.()">立即重试</button>
      <button class="ghost" onclick="window.studentHost?.toggleDevTools?.()">打开调试面板</button>
    </div>
    <div class="tips">如果这是本机联调，请把教师机地址改为 127.0.0.1；如需修改配置，请使用独立管理员窗口启动参数 <code>--admin-window</code>。</div>
  </div>
</body>
</html>)HTML";
  return html.str();
}

void NavigateInlineHtml(ICoreWebView2* webview, const std::wstring& html) {
#if LUMESYNC_HAS_WEBVIEW2
  if (!webview) return;
  webview->NavigateToString(html.c_str());
#else
  (void)webview;
  (void)html;
#endif
}


std::optional<std::wstring> CaptureScreenAsJpegDataUrl(int maxWidth, int quality) {
  const int targetMaxWidth = std::max(160, std::min(maxWidth > 0 ? maxWidth : 320, 1280));
  const int jpegQuality = std::max(30, std::min(quality > 0 ? quality : 70, 95));

  const int screenX = GetSystemMetrics(SM_XVIRTUALSCREEN);
  const int screenY = GetSystemMetrics(SM_YVIRTUALSCREEN);
  const int screenWidth = GetSystemMetrics(SM_CXVIRTUALSCREEN);
  const int screenHeight = GetSystemMetrics(SM_CYVIRTUALSCREEN);
  if (screenWidth <= 0 || screenHeight <= 0) {
    return std::nullopt;
  }

  const int scaledWidth = std::min(targetMaxWidth, screenWidth);
  const int scaledHeight = std::max(1, static_cast<int>(std::lround(static_cast<double>(screenHeight) * scaledWidth / screenWidth)));

  HDC screenDc = GetDC(nullptr);
  if (!screenDc) return std::nullopt;

  HDC sourceDc = CreateCompatibleDC(screenDc);
  HDC scaledDc = CreateCompatibleDC(screenDc);
  HBITMAP sourceBitmap = CreateCompatibleBitmap(screenDc, screenWidth, screenHeight);
  HBITMAP scaledBitmap = CreateCompatibleBitmap(screenDc, scaledWidth, scaledHeight);

  if (!sourceDc || !scaledDc || !sourceBitmap || !scaledBitmap) {
    if (sourceBitmap) DeleteObject(sourceBitmap);
    if (scaledBitmap) DeleteObject(scaledBitmap);
    if (sourceDc) DeleteDC(sourceDc);
    if (scaledDc) DeleteDC(scaledDc);
    ReleaseDC(nullptr, screenDc);
    return std::nullopt;
  }

  HGDIOBJ oldSource = SelectObject(sourceDc, sourceBitmap);
  HGDIOBJ oldScaled = SelectObject(scaledDc, scaledBitmap);

  bool ok = BitBlt(sourceDc, 0, 0, screenWidth, screenHeight, screenDc, screenX, screenY, SRCCOPY | CAPTUREBLT) != FALSE;
  if (ok) {
    SetStretchBltMode(scaledDc, HALFTONE);
    SetBrushOrgEx(scaledDc, 0, 0, nullptr);
    ok = StretchBlt(scaledDc, 0, 0, scaledWidth, scaledHeight, sourceDc, 0, 0, screenWidth, screenHeight, SRCCOPY) != FALSE;
  }

  SelectObject(sourceDc, oldSource);
  SelectObject(scaledDc, oldScaled);
  DeleteDC(sourceDc);
  DeleteDC(scaledDc);
  ReleaseDC(nullptr, screenDc);
  DeleteObject(sourceBitmap);

  if (!ok) {
    DeleteObject(scaledBitmap);
    return std::nullopt;
  }

  auto jpegClsid = FindEncoderClsid(L"image/jpeg");
  if (!jpegClsid) {
    DeleteObject(scaledBitmap);
    return std::nullopt;
  }

  Bitmap bitmap(scaledBitmap, nullptr);

  ComPtr<IStream> stream;
  if (CreateStreamOnHGlobal(nullptr, TRUE, &stream) != S_OK || !stream) {
    DeleteObject(scaledBitmap);
    return std::nullopt;
  }

  EncoderParameters encoderParams{};
  encoderParams.Count = 1;
  encoderParams.Parameter[0].Guid = EncoderQuality;
  encoderParams.Parameter[0].Type = EncoderParameterValueTypeLong;
  encoderParams.Parameter[0].NumberOfValues = 1;
  ULONG qualityValue = static_cast<ULONG>(jpegQuality);
  encoderParams.Parameter[0].Value = &qualityValue;

  if (bitmap.Save(stream.Get(), &(*jpegClsid), &encoderParams) != Ok) {
    DeleteObject(scaledBitmap);
    return std::nullopt;
  }
  DeleteObject(scaledBitmap);


  STATSTG stats{};
  if (stream->Stat(&stats, STATFLAG_NONAME) != S_OK || stats.cbSize.QuadPart <= 0) {
    return std::nullopt;
  }

  LARGE_INTEGER seekTo{};
  stream->Seek(seekTo, STREAM_SEEK_SET, nullptr);
  std::vector<BYTE> bytes(static_cast<size_t>(stats.cbSize.QuadPart));
  ULONG bytesRead = 0;
  if (stream->Read(bytes.data(), static_cast<ULONG>(bytes.size()), &bytesRead) != S_OK || bytesRead == 0) {
    return std::nullopt;
  }
  bytes.resize(bytesRead);

  auto encoded = Base64Encode(bytes.data(), static_cast<DWORD>(bytes.size()));
  if (!encoded) {
    return std::nullopt;
  }

  return L"data:image/jpeg;base64," + *encoded;
}

class StudentShellApp;
StudentShellApp* g_app = nullptr;
constexpr wchar_t kMainWindowClassName[] = L"LumeSyncStudentShellWindow";
constexpr wchar_t kAdminWindowClassName[] = L"LumeSyncStudentAdminWindow";
constexpr wchar_t kMainInstanceMutex[] = L"Global\\LumeSyncStudentShell.Main";
constexpr wchar_t kAdminInstanceMutex[] = L"Global\\LumeSyncStudentShell.Admin";

const GdiplusScope g_gdiplusScope;

constexpr UINT WM_TRAY_ICON = WM_APP + 40;
constexpr UINT WM_BOOTSTRAP_RESULT = WM_APP + 41;
constexpr UINT_PTR kRetryTimerId = 1;
constexpr UINT_PTR kHeartbeatTimerId = 2;
constexpr UINT_PTR kFocusTimerId = 3;
constexpr UINT kTrayAdmin = 1001;
constexpr UINT kTrayShow = 1002;
constexpr UINT kTrayExit = 1003;
constexpr UINT kAdminLoginPassword = 2001;
constexpr UINT kAdminLoginSubmit = 2002;
constexpr UINT kAdminIp = 2010;
constexpr UINT kAdminPort = 2011;
constexpr UINT kAdminAutostart = 2012;
constexpr UINT kAdminNewPassword = 2013;
constexpr UINT kAdminConfirmPassword = 2014;
constexpr UINT kAdminSave = 2015;
constexpr UINT kAdminClose = 2016;
constexpr UINT kAdminBack = 2017;

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

std::filesystem::path ExeDir() {
  return ExePath().parent_path();
}

bool HasArg(const std::wstring& wanted) {
  int argc = 0;
  LPWSTR* argv = CommandLineToArgvW(GetCommandLineW(), &argc);
  if (!argv) return false;

  bool found = false;
  for (int i = 1; i < argc; ++i) {
    if (wanted == argv[i]) {
      found = true;
      break;
    }
  }

  LocalFree(argv);
  return found;
}

bool ActivateExistingInstance(bool adminMode) {
  HWND existing = FindWindowW(adminMode ? kAdminWindowClassName : kMainWindowClassName, nullptr);
  if (!existing) {
    return false;
  }

  ShowWindow(existing, SW_RESTORE);
  SetForegroundWindow(existing);
  return true;
}

HANDLE AcquireInstanceMutex(bool adminMode) {
  const wchar_t* mutexName = adminMode ? kAdminInstanceMutex : kMainInstanceMutex;
  HANDLE mutex = CreateMutexW(nullptr, TRUE, mutexName);
  if (!mutex) {
    return nullptr;
  }

  if (GetLastError() == ERROR_ALREADY_EXISTS) {
    CloseHandle(mutex);
    return nullptr;
  }

  return mutex;
}

void EnableDpiAwareness() {
  if (!SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2)) {
    SetProcessDPIAware();
  }
}

std::wstring QuotePath(const std::filesystem::path& path) {
  return L"\"" + path.wstring() + L"\"";
}

std::wstring ToFileUrl(const std::filesystem::path& path) {
  std::wstring value = std::filesystem::absolute(path).wstring();
  std::replace(value.begin(), value.end(), L'\\', L'/');
  if (value.rfind(L"//", 0) == 0) {
    return L"file:" + value;
  }
  return L"file:///" + value;
}

RECT CenteredWindowRect(int width, int height) {
  RECT workArea = {};
  SystemParametersInfoW(SPI_GETWORKAREA, 0, &workArea, 0);
  const int availableWidth = workArea.right - workArea.left;
  const int availableHeight = workArea.bottom - workArea.top;
  const int x = workArea.left + std::max(0, (availableWidth - width) / 2);
  const int y = workArea.top + std::max(0, (availableHeight - height) / 2);
  return RECT{x, y, x + width, y + height};
}

RECT DefaultShellWindowRect() {
  RECT workArea = {};
  SystemParametersInfoW(SPI_GETWORKAREA, 0, &workArea, 0);
  const int availableWidth = workArea.right - workArea.left;
  const int availableHeight = workArea.bottom - workArea.top;
  const int width = std::min(std::max(1440, availableWidth * 85 / 100), availableWidth);
  const int height = std::min(std::max(900, availableHeight * 85 / 100), availableHeight);
  return CenteredWindowRect(width, height);
}

std::optional<std::filesystem::path> FindUiAsset(const std::wstring& fileName) {
  const std::vector<std::filesystem::path> candidates = {
      ExeDir() / L"ui" / L"student-host" / L"dist" / fileName,
      ExeDir() / L"resources" / L"ui" / L"student-host" / L"dist" / fileName,
      std::filesystem::current_path() / L"ui" / L"student-host" / L"dist" / fileName,
      std::filesystem::current_path().parent_path() / L"ui" / L"student-host" / L"dist" / fileName,
  };

  for (const auto& candidate : candidates) {
    if (std::filesystem::exists(candidate)) {
      return candidate;
    }
  }

  return std::nullopt;
}

bool TryNavigateLocalPage(ICoreWebView2* webview, const std::wstring& fileName) {
#if LUMESYNC_HAS_WEBVIEW2
  if (!webview) {
    lumesync::AppendLog(L"shell", L"TryNavigateLocalPage called without WebView: " + fileName);
    return false;
  }
  const auto asset = FindUiAsset(fileName);
  if (!asset) {
    lumesync::AppendLog(L"shell", L"UI asset missing: " + fileName);
    return false;
  }
  lumesync::AppendLog(L"shell", L"Navigating local page: " + asset->wstring());
  webview->Navigate(ToFileUrl(*asset).c_str());
  return true;
#else
  (void)webview;
  (void)fileName;
  return false;
#endif
}

std::wstring BuildWebView2BrowserArguments(const lumesync::StudentConfig& config) {
  const int port = config.port > 0 ? config.port : 3000;
  std::wostringstream secureOrigins;
  secureOrigins << L"http://" << config.teacherIp << L":" << port
                << L",http://localhost:" << port
                << L",http://127.0.0.1:" << port;

  std::wostringstream args;
  args << L"--use-fake-ui-for-media-stream "
       << L"--unsafely-treat-insecure-origin-as-secure=" << secureOrigins.str();
  return args.str();
}

void ShowTaskbar(bool show) {
  if (HWND taskbar = FindWindowW(L"Shell_TrayWnd", nullptr)) {
    ShowWindow(taskbar, show ? SW_SHOW : SW_HIDE);
  }
  if (HWND secondaryTaskbar = FindWindowW(L"Shell_SecondaryTrayWnd", nullptr)) {
    ShowWindow(secondaryTaskbar, show ? SW_SHOW : SW_HIDE);
  }
}

struct BootstrapSessionResult {
  bool ok = false;
  std::wstring token;
  std::wstring expiresAt;
  std::wstring serverTime;
  std::wstring error;
};

struct BootstrapUiResult {
  bool ok = false;
  std::wstring error;
  std::wstring token;
  std::wstring expiresAt;
  std::wstring serverTime;
};

std::wstring WinHttpReadAll(HINTERNET request) {
  std::string body;
  DWORD available = 0;
  do {
    available = 0;
    if (!WinHttpQueryDataAvailable(request, &available)) {
      return L"";
    }
    if (available == 0) {
      break;
    }
    std::string chunk(available, '\0');
    DWORD read = 0;
    if (!WinHttpReadData(request, chunk.data(), available, &read)) {
      return L"";
    }
    chunk.resize(read);
    body += chunk;
  } while (available > 0);
  return lumesync::Utf8Decode(body);
}

BootstrapSessionResult BootstrapViewerSession(const lumesync::StudentConfig& config) {
  BootstrapSessionResult result;
  lumesync::AppendLog(L"shell", L"BootstrapViewerSession start teacher=" + config.teacherIp + L":" + std::to_wstring(config.port) + L" clientId=" + config.clientId);
  HINTERNET session = WinHttpOpen(L"LumeSyncStudent/1.0", WINHTTP_ACCESS_TYPE_AUTOMATIC_PROXY, WINHTTP_NO_PROXY_NAME, WINHTTP_NO_PROXY_BYPASS, 0);
  if (!session) {
    result.error = L"WinHttpOpen failed";
    lumesync::AppendLog(L"shell", L"BootstrapViewerSession error: WinHttpOpen failed");
    return result;
  }

  HINTERNET connect = WinHttpConnect(session, config.teacherIp.c_str(), static_cast<INTERNET_PORT>(config.port), 0);
  if (!connect) {
    result.error = L"WinHttpConnect failed";
    lumesync::AppendLog(L"shell", L"BootstrapViewerSession error: WinHttpConnect failed");
    WinHttpCloseHandle(session);
    return result;
  }

  HINTERNET request = WinHttpOpenRequest(connect, L"POST", L"/api/session/bootstrap", nullptr, WINHTTP_NO_REFERER, WINHTTP_DEFAULT_ACCEPT_TYPES, 0);
  if (!request) {
    result.error = L"WinHttpOpenRequest failed";
    lumesync::AppendLog(L"shell", L"BootstrapViewerSession error: WinHttpOpenRequest failed");
    WinHttpCloseHandle(connect);
    WinHttpCloseHandle(session);
    return result;
  }

  const std::wstring payload = L"{\"role\":\"viewer\",\"clientId\":\"" + lumesync::JsonEscape(config.clientId) + L"\"}";
  const std::wstring headers = L"Content-Type: application/json\r\n";
  const std::string payloadUtf8 = lumesync::Utf8Encode(payload);
  const BOOL sent = WinHttpSendRequest(
      request,
      headers.c_str(),
      static_cast<DWORD>(headers.size()),
      payloadUtf8.empty() ? WINHTTP_NO_REQUEST_DATA : const_cast<char*>(payloadUtf8.data()),
      static_cast<DWORD>(payloadUtf8.size()),
      static_cast<DWORD>(payloadUtf8.size()),
      0);
  if (!sent || !WinHttpReceiveResponse(request, nullptr)) {
    result.error = L"bootstrap request failed";
    lumesync::AppendLog(L"shell", L"BootstrapViewerSession error: bootstrap request failed");
    WinHttpCloseHandle(request);
    WinHttpCloseHandle(connect);
    WinHttpCloseHandle(session);
    return result;
  }

  DWORD statusCode = 0;
  DWORD statusSize = sizeof(statusCode);
  WinHttpQueryHeaders(request, WINHTTP_QUERY_STATUS_CODE | WINHTTP_QUERY_FLAG_NUMBER, WINHTTP_HEADER_NAME_BY_INDEX, &statusCode, &statusSize, WINHTTP_NO_HEADER_INDEX);
  const std::wstring response = WinHttpReadAll(request);

  WinHttpCloseHandle(request);
  WinHttpCloseHandle(connect);
  WinHttpCloseHandle(session);

  if (statusCode < 200 || statusCode >= 300) {
    result.error = lumesync::JsonStringField(response, L"error").value_or(L"bootstrap http error");
    return result;
  }

  const bool success = lumesync::JsonBoolField(response, L"success").value_or(false);
  const std::wstring role = lumesync::JsonStringField(response, L"role").value_or(L"");
  const std::wstring clientId = lumesync::JsonStringField(response, L"clientId").value_or(L"");
  result.token = lumesync::JsonStringField(response, L"token").value_or(L"");
  result.expiresAt = lumesync::JsonStringField(response, L"expiresAt").value_or(L"");
  result.serverTime = lumesync::JsonStringField(response, L"serverTime").value_or(L"");

  if (!success || role != L"viewer" || clientId != config.clientId || result.token.empty()) {
    result.error = L"bootstrap payload invalid";
    return result;
  }

  result.ok = true;
  return result;
}

std::wstring HostApiScript() {
  return LR"JS(
(() => {
  if (!window.chrome?.webview || window.studentHost?.__native) return;
  function hideScrollbars() {
    if (document.getElementById("lumesync-hide-scrollbars")) return;
    const style = document.createElement("style");
    style.id = "lumesync-hide-scrollbars";
    style.textContent = `
      html, body {
        scrollbar-width: none !important;
        -ms-overflow-style: none !important;
        user-select: none !important;
        -webkit-user-select: none !important;
      }
      * {
        user-select: none !important;
        -webkit-user-select: none !important;
        -webkit-user-drag: none !important;
      }
      html::-webkit-scrollbar, body::-webkit-scrollbar, *::-webkit-scrollbar { width: 0 !important; height: 0 !important; display: none !important; }
    `;
    (document.head || document.documentElement).appendChild(style);
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", hideScrollbars, { once: true });
  } else {
    hideScrollbars();
  }
  document.addEventListener("selectstart", (event) => event.preventDefault(), true);
  document.addEventListener("dragstart", (event) => event.preventDefault(), true);
  let nextId = 1;
  const pending = new Map();
  function rpc(action, payload) {
    const id = `rpc-${Date.now()}-${nextId++}`;
    window.chrome.webview.postMessage({ kind: "rpc", id, action, payload: payload ?? {} });
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      window.setTimeout(() => {
        if (!pending.has(id)) return;
        pending.delete(id);
        reject(new Error(`Native RPC timed out: ${action}`));
      }, 10000);
    });
  }
  function send(action, payload) {
    window.chrome.webview.postMessage({ kind: "event", action, payload: payload ?? {} });
  }
  window.chrome.webview.addEventListener("message", (event) => {
    const message = event.data || {};
    if (message.kind !== "rpc-result" || !pending.has(message.id)) return;
    const pendingCall = pending.get(message.id);
    pending.delete(message.id);
    if (message.ok === false) pendingCall.reject(new Error(message.error || "Native RPC failed"));
    else pendingCall.resolve(message.payload);
  });
  const api = {
    __native: true,
    classStarted: (options) => send("classStarted", options || {}),
    classEnded: () => send("classEnded"),
    setFullscreen: (enable) => send("setFullscreen", { enable: !!enable }),
    manualRetry: () => send("manualRetry"),
    setAdminPassword: (hash) => send("setAdminPassword", { hash }),
    powerControl: (payload) => rpc("powerControl", payload || {}),
    toggleDevTools: () => send("toggleDevTools"),
    takeScreenshot: (options) => rpc("takeScreenshot", options || {}),
    getConfig: () => rpc("getConfig"),
    saveConfig: (config) => rpc("saveConfig", config || {}),
    verifyPassword: (password) => rpc("verifyPassword", { password }),
    getAutostart: () => rpc("getAutostart"),
    setAutostart: (enable) => rpc("setAutostart", { enable: !!enable }),
    getRole: () => Promise.resolve("viewer"),
    getSession: () => rpc("getSession"),
    bootstrapSession: () => rpc("bootstrapSession"),
    getDeviceInfo: () => rpc("getDeviceInfo"),
    getSettings: () => Promise.resolve(null),
    saveSettings: () => Promise.resolve(null),
    importCourse: () => Promise.resolve(null),
    exportCourse: () => Promise.resolve(null),
    openLogDir: () => Promise.resolve(null),
    getLogDir: () => Promise.resolve(null),
    selectSubmissionDir: () => Promise.resolve(null),
    minimizeWindow: () => send("minimizeWindow"),
    maximizeWindow: () => send("maximizeWindow"),
    closeWindow: () => send("closeWindow")
  };
  window.studentHost = api;
  window.electronAPI = Object.assign({}, window.electronAPI || {}, api);
})();
)JS";
}

class StudentShellApp {
 public:
  StudentShellApp(HINSTANCE instance, bool adminMode)
      : instance_(instance), adminMode_(adminMode), config_(lumesync::LoadConfig()) {
    forceFullscreen_ = config_.forceFullscreen;
    g_app = this;
  }

  ~StudentShellApp() {
    g_app = nullptr;
  }

  bool Initialize(int nCmdShow) {
    lumesync::AppendLog(L"shell", adminMode_ ? L"Initialize admin window" : L"Initialize main window");
    const wchar_t* className = adminMode_ ? kAdminWindowClassName : kMainWindowClassName;

    WNDCLASSEXW wc = {};
    wc.cbSize = sizeof(wc);
    wc.hInstance = instance_;
    wc.lpfnWndProc = &StudentShellApp::WndProc;
    wc.hCursor = LoadCursor(nullptr, IDC_ARROW);
    appIcon_ = LoadIconW(instance_, MAKEINTRESOURCEW(IDI_LUMESYNC_STUDENT));
    if (!appIcon_) {
      appIcon_ = LoadIconW(nullptr, MAKEINTRESOURCEW(32512));
    }
    wc.hIcon = appIcon_;
    wc.hIconSm = appIcon_;
    wc.hbrBackground = reinterpret_cast<HBRUSH>(COLOR_WINDOW + 1);
    wc.lpszClassName = className;

    if (!RegisterClassExW(&wc) && GetLastError() != ERROR_CLASS_ALREADY_EXISTS) {
      return false;
    }

    const DWORD style = adminMode_ ? WS_OVERLAPPED | WS_CAPTION | WS_SYSMENU | WS_MINIMIZEBOX : WS_OVERLAPPEDWINDOW;
    const RECT windowRect = adminMode_ ? CenteredWindowRect(640, 720) : DefaultShellWindowRect();

    hwnd_ = CreateWindowExW(
        0,
        className,
        adminMode_ ? L"LumeSync Student Admin" : L"LumeSync Student",
        style,
        windowRect.left,
        windowRect.top,
        windowRect.right - windowRect.left,
        windowRect.bottom - windowRect.top,
        nullptr,
        nullptr,
        instance_,
        this);

    if (!hwnd_) {
      return false;
    }

    if (adminMode_) {
      CreateNativeAdminLogin();
    } else {
      CreateTrayIcon();
      keyboardHook_ = SetWindowsHookExW(WH_KEYBOARD_LL, &StudentShellApp::KeyboardHookProc, instance_, 0);
      SetTimer(hwnd_, kHeartbeatTimerId, 1000, nullptr);
      SetTimer(hwnd_, kFocusTimerId, 750, nullptr);
    }

    ShowWindow(hwnd_, adminMode_ ? SW_SHOW : nCmdShow);
    UpdateWindow(hwnd_);
    if (!adminMode_) {
      InitializeBrowser();
    }
    return true;
  }

  int Run() {
    MSG msg;
    while (GetMessageW(&msg, nullptr, 0, 0) > 0) {
      TranslateMessage(&msg);
      DispatchMessageW(&msg);
    }
    return static_cast<int>(msg.wParam);
  }

  bool IsClassActive() const {
    return classActive_;
  }

  bool IsFullscreenLocked() const {
    return classActive_ && forceFullscreen_;
  }

 private:
  static LRESULT CALLBACK WndProc(HWND hwnd, UINT message, WPARAM wParam, LPARAM lParam) {
    StudentShellApp* app = nullptr;
    if (message == WM_NCCREATE) {
      auto* create = reinterpret_cast<CREATESTRUCTW*>(lParam);
      app = reinterpret_cast<StudentShellApp*>(create->lpCreateParams);
      app->hwnd_ = hwnd;
      SetWindowLongPtrW(hwnd, GWLP_USERDATA, reinterpret_cast<LONG_PTR>(app));
    } else {
      app = reinterpret_cast<StudentShellApp*>(GetWindowLongPtrW(hwnd, GWLP_USERDATA));
    }

    if (app) {
      return app->HandleMessage(message, wParam, lParam);
    }

    return DefWindowProcW(hwnd, message, wParam, lParam);
  }

  static LRESULT CALLBACK KeyboardHookProc(int code, WPARAM wParam, LPARAM lParam) {
    if (code >= 0 && g_app && g_app->IsFullscreenLocked()) {
      const auto* key = reinterpret_cast<KBDLLHOOKSTRUCT*>(lParam);
      const bool keyDown = wParam == WM_KEYDOWN || wParam == WM_SYSKEYDOWN;
      if (keyDown) {
        const bool alt = (GetAsyncKeyState(VK_MENU) & 0x8000) != 0;
        const bool ctrl = (GetAsyncKeyState(VK_CONTROL) & 0x8000) != 0;
        if (key->vkCode == VK_LWIN || key->vkCode == VK_RWIN) return 1;
        if (alt && (key->vkCode == VK_TAB || key->vkCode == VK_F4 || key->vkCode == VK_SPACE)) return 1;
        if (ctrl && key->vkCode == VK_ESCAPE) return 1;
      }
    }

    return CallNextHookEx(nullptr, code, wParam, lParam);
  }

  LRESULT HandleMessage(UINT message, WPARAM wParam, LPARAM lParam) {
    switch (message) {
      case WM_SIZE:
        if (!adminMode_) {
          ResizeBrowser();
        }
        return 0;
      case WM_TIMER:
        OnTimer(wParam);
        return 0;
      case WM_CLOSE:
        if (!adminMode_ && classActive_) {
          ApplyClassMode();
          return 0;
        }
        if (!adminMode_) {
          ShowWindow(hwnd_, SW_HIDE);
          return 0;
        }
        DestroyWindow(hwnd_);
        return 0;
      case WM_COMMAND:
        if (adminMode_) {
          OnAdminCommand(LOWORD(wParam));
        } else {
          OnCommand(LOWORD(wParam));
        }
        return 0;
      case WM_PAINT:
        if (adminMode_) {
          DrawAdminChrome();
          return 0;
        }
        break;
      case WM_CTLCOLORSTATIC:
        if (adminMode_) {
          return AdminStaticColor(reinterpret_cast<HDC>(wParam));
        }
        break;
      case WM_CTLCOLOREDIT:
        if (adminMode_) {
          return AdminEditColor(reinterpret_cast<HDC>(wParam));
        }
        break;
      case WM_TRAY_ICON:
        if (lParam == WM_RBUTTONUP || lParam == WM_LBUTTONDBLCLK) {
          ShowTrayMenu();
        }
        return 0;
      case WM_BOOTSTRAP_RESULT: {
        std::unique_ptr<BootstrapUiResult> result(reinterpret_cast<BootstrapUiResult*>(lParam));
        ApplyBootstrapResult(std::move(result));
        return 0;
      }
      case WM_DESTROY:
        Shutdown();
        if (adminMode_) {
          PostQuitMessage(0);
        }
        return 0;
      default:
        return DefWindowProcW(hwnd_, message, wParam, lParam);
    }
    return DefWindowProcW(hwnd_, message, wParam, lParam);
  }

  void InitializeBrowser() {
#if LUMESYNC_HAS_WEBVIEW2
    lumesync::AppendLog(L"shell", L"InitializeBrowser start");
    using CreateEnvironmentFn = HRESULT(STDAPICALLTYPE*)(
        PCWSTR,
        PCWSTR,
        ICoreWebView2EnvironmentOptions*,
        ICoreWebView2CreateCoreWebView2EnvironmentCompletedHandler*);

    webviewLoader_ = LoadLibraryW(L"WebView2Loader.dll");
    if (!webviewLoader_) {
      lumesync::AppendLog(L"shell", L"WebView2Loader.dll is missing; cannot create WebView2 environment");
      return;
    }

    auto* createEnvironment = reinterpret_cast<CreateEnvironmentFn>(
        GetProcAddress(webviewLoader_, "CreateCoreWebView2EnvironmentWithOptions"));
    if (!createEnvironment) {
      lumesync::AppendLog(L"shell", L"WebView2Loader.dll does not export CreateCoreWebView2EnvironmentWithOptions");
      return;
    }

    const auto dataFolder = (lumesync::ProgramDataDir() / L"webview2").wstring();
    config_ = lumesync::LoadConfig();
    auto options = Make<CoreWebView2EnvironmentOptions>();
    const std::wstring browserArguments = BuildWebView2BrowserArguments(config_);
    options->put_AdditionalBrowserArguments(browserArguments.c_str());
    lumesync::AppendLog(L"shell", L"WebView2 browser arguments: " + browserArguments);

    createEnvironment(
        nullptr,
        dataFolder.c_str(),
        options.Get(),
        Callback<ICoreWebView2CreateCoreWebView2EnvironmentCompletedHandler>(
            [this](HRESULT result, ICoreWebView2Environment* environment) -> HRESULT {
              if (FAILED(result) || environment == nullptr) {
                lumesync::AppendLog(L"shell", L"WebView2 environment creation failed");
                return S_OK;
              }

              webviewEnvironment_ = environment;
              return webviewEnvironment_->CreateCoreWebView2Controller(
                  hwnd_,
                  Callback<ICoreWebView2CreateCoreWebView2ControllerCompletedHandler>(
                      [this](HRESULT controllerResult, ICoreWebView2Controller* controller) -> HRESULT {
                        if (FAILED(controllerResult) || controller == nullptr) {
                          lumesync::AppendLog(L"shell", L"WebView2 controller creation failed");
                          return S_OK;
                        }

                        webviewController_ = controller;
                        webviewController_->get_CoreWebView2(&webview_);
                        ResizeBrowser();
                        RegisterBrowserEvents();
                        return S_OK;
                      })
                      .Get());
            })
            .Get());
#else
    lumesync::AppendLog(L"shell", L"Built without WebView2 SDK; using fallback window");
#endif
  }

  HWND CreateControl(
      const wchar_t* className,
      const wchar_t* text,
      DWORD style,
      int x,
      int y,
      int width,
      int height,
      UINT id,
      DWORD exStyle = 0) {
    HWND control = CreateWindowExW(
        exStyle,
        className,
        text,
        style | WS_CHILD,
        x,
        y,
        width,
        height,
        hwnd_,
        reinterpret_cast<HMENU>(static_cast<UINT_PTR>(id)),
        instance_,
        nullptr);
    if (control) {
      SendMessageW(control, WM_SETFONT, reinterpret_cast<WPARAM>(adminFont_), TRUE);
    }
    return control;
  }

  void CreateNativeAdminLogin() {
    adminBackgroundBrush_ = CreateSolidBrush(RGB(239, 244, 248));
    adminCardBrush_ = CreateSolidBrush(RGB(255, 255, 255));
    adminEditBrush_ = CreateSolidBrush(RGB(255, 255, 255));
    adminFont_ = CreateFontW(-16, 0, 0, 0, FW_NORMAL, FALSE, FALSE, FALSE, DEFAULT_CHARSET, OUT_DEFAULT_PRECIS, CLIP_DEFAULT_PRECIS, CLEARTYPE_QUALITY, DEFAULT_PITCH | FF_DONTCARE, L"Microsoft YaHei UI");
    adminTitleFont_ = CreateFontW(-25, 0, 0, 0, FW_SEMIBOLD, FALSE, FALSE, FALSE, DEFAULT_CHARSET, OUT_DEFAULT_PRECIS, CLIP_DEFAULT_PRECIS, CLEARTYPE_QUALITY, DEFAULT_PITCH | FF_DONTCARE, L"Microsoft YaHei UI");
    adminHintFont_ = CreateFontW(-13, 0, 0, 0, FW_NORMAL, FALSE, FALSE, FALSE, DEFAULT_CHARSET, OUT_DEFAULT_PRECIS, CLIP_DEFAULT_PRECIS, CLEARTYPE_QUALITY, DEFAULT_PITCH | FF_DONTCARE, L"Microsoft YaHei UI");
    const int left = 110;

    adminTitle_ = CreateControl(L"STATIC", L"LumeSync 学生端管理", WS_VISIBLE | SS_CENTER, 80, 76, 480, 34, 0);
    SendMessageW(adminTitle_, WM_SETFONT, reinterpret_cast<WPARAM>(adminTitleFont_), TRUE);
    adminSubtitle_ = CreateControl(L"STATIC", L"验证管理员身份后可修改连接与启动设置", WS_VISIBLE | SS_CENTER, 90, 116, 460, 22, 0);
    SendMessageW(adminSubtitle_, WM_SETFONT, reinterpret_cast<WPARAM>(adminHintFont_), TRUE);
    adminLoginLabel_ = CreateControl(L"STATIC", L"管理员密码", WS_VISIBLE, left, 196, 420, 22, 0);
    adminLoginPassword_ = CreateControl(
        L"EDIT",
        L"",
        WS_VISIBLE | WS_TABSTOP | ES_PASSWORD | ES_AUTOHSCROLL,
        left,
        224,
        420,
        38,
        kAdminLoginPassword,
        WS_EX_CLIENTEDGE);
    adminMessage_ = CreateControl(L"STATIC", L"", WS_VISIBLE | SS_CENTER, left, 278, 420, 24, 0);
    SendMessageW(adminMessage_, WM_SETFONT, reinterpret_cast<WPARAM>(adminHintFont_), TRUE);
    adminLoginButton_ = CreateControl(
        L"BUTTON",
        L"验证",
        WS_VISIBLE | WS_TABSTOP | BS_DEFPUSHBUTTON,
        left,
        328,
        420,
        42,
        kAdminLoginSubmit);

    loginControls_ = {adminTitle_, adminSubtitle_, adminLoginLabel_, adminLoginPassword_, adminMessage_, adminLoginButton_};
    CreateNativeAdminConfig();
    ShowAdminConfig(false);
    SetFocus(adminLoginPassword_);
  }

  void CreateNativeAdminConfig() {
    const int left = 90;
    const int labelWidth = 150;
    const int inputLeft = 270;
    const int inputWidth = 260;

    configTitle_ = CreateControl(L"STATIC", L"系统配置", WS_VISIBLE | SS_CENTER, 80, 58, 480, 32, 0);
    SendMessageW(configTitle_, WM_SETFONT, reinterpret_cast<WPARAM>(adminTitleFont_), TRUE);
    adminIpLabel_ = CreateControl(L"STATIC", L"教师机 IP 地址", WS_VISIBLE, left, 124, labelWidth, 22, 0);
    adminIpEdit_ = CreateControl(L"EDIT", L"", WS_VISIBLE | WS_TABSTOP | ES_AUTOHSCROLL, inputLeft, 120, inputWidth, 36, kAdminIp, WS_EX_CLIENTEDGE);
    adminPortLabel_ = CreateControl(L"STATIC", L"端口号", WS_VISIBLE, left, 174, labelWidth, 22, 0);
    adminPortEdit_ = CreateControl(L"EDIT", L"", WS_VISIBLE | WS_TABSTOP | ES_NUMBER | ES_AUTOHSCROLL, inputLeft, 170, inputWidth, 36, kAdminPort, WS_EX_CLIENTEDGE);
    adminAutostartCheck_ = CreateControl(L"BUTTON", L"开机自动启动", WS_VISIBLE | WS_TABSTOP | BS_AUTOCHECKBOX, left, 228, 260, 26, kAdminAutostart);
    adminNewPasswordLabel_ = CreateControl(L"STATIC", L"新管理员密码", WS_VISIBLE, left, 292, labelWidth, 22, 0);
    adminNewPasswordEdit_ = CreateControl(L"EDIT", L"", WS_VISIBLE | WS_TABSTOP | ES_PASSWORD | ES_AUTOHSCROLL, inputLeft, 288, inputWidth, 36, kAdminNewPassword, WS_EX_CLIENTEDGE);
    adminConfirmPasswordLabel_ = CreateControl(L"STATIC", L"确认新密码", WS_VISIBLE, left, 342, labelWidth, 22, 0);
    adminConfirmPasswordEdit_ = CreateControl(L"EDIT", L"", WS_VISIBLE | WS_TABSTOP | ES_PASSWORD | ES_AUTOHSCROLL, inputLeft, 338, inputWidth, 36, kAdminConfirmPassword, WS_EX_CLIENTEDGE);
    adminConfigMessage_ = CreateControl(L"STATIC", L"", WS_VISIBLE | SS_CENTER, left, 394, 440, 24, 0);
    SendMessageW(adminConfigMessage_, WM_SETFONT, reinterpret_cast<WPARAM>(adminHintFont_), TRUE);
    adminSaveButton_ = CreateControl(L"BUTTON", L"保存设置", WS_VISIBLE | WS_TABSTOP | BS_DEFPUSHBUTTON, left, 446, 440, 40, kAdminSave);
    adminCloseButton_ = CreateControl(L"BUTTON", L"关闭窗口", WS_VISIBLE | WS_TABSTOP, left, 500, 214, 38, kAdminClose);
    adminBackButton_ = CreateControl(L"BUTTON", L"返回验证", WS_VISIBLE | WS_TABSTOP, left + 226, 500, 214, 38, kAdminBack);

    configControls_ = {
        configTitle_,
        adminIpLabel_,
        adminIpEdit_,
        adminPortLabel_,
        adminPortEdit_,
        adminAutostartCheck_,
        adminNewPasswordLabel_,
        adminNewPasswordEdit_,
        adminConfirmPasswordLabel_,
        adminConfirmPasswordEdit_,
        adminConfigMessage_,
        adminSaveButton_,
        adminCloseButton_,
        adminBackButton_};
  }

  void ShowAdminLogin(bool show) {
    for (HWND control : loginControls_) {
      if (control) ShowWindow(control, show ? SW_SHOW : SW_HIDE);
    }
    if (adminMode_) InvalidateRect(hwnd_, nullptr, TRUE);
  }

  void ShowAdminConfig(bool show) {
    for (HWND control : configControls_) {
      if (control) ShowWindow(control, show ? SW_SHOW : SW_HIDE);
    }
    if (adminMode_) InvalidateRect(hwnd_, nullptr, TRUE);
  }

  void DrawAdminChrome() {
    PAINTSTRUCT ps;
    HDC hdc = BeginPaint(hwnd_, &ps);
    RECT client;
    GetClientRect(hwnd_, &client);

    FillRect(hdc, &client, adminBackgroundBrush_);
    RECT card = {32, 24, client.right - 32, client.bottom - 28};

    HBRUSH oldBrush = reinterpret_cast<HBRUSH>(SelectObject(hdc, adminCardBrush_));
    HPEN border = CreatePen(PS_SOLID, 1, RGB(218, 226, 236));
    HPEN oldPen = reinterpret_cast<HPEN>(SelectObject(hdc, border));
    RoundRect(hdc, card.left, card.top, card.right, card.bottom, 20, 20);
    SelectObject(hdc, oldPen);
    SelectObject(hdc, oldBrush);
    DeleteObject(border);

    HBRUSH accent = CreateSolidBrush(RGB(37, 99, 235));
    RECT accentRect = {card.left + 24, card.top + 20, card.left + 92, card.top + 24};
    FillRect(hdc, &accentRect, accent);
    DeleteObject(accent);

    EndPaint(hwnd_, &ps);
  }

  LRESULT AdminStaticColor(HDC hdc) {
    SetBkMode(hdc, TRANSPARENT);
    SetTextColor(hdc, RGB(30, 41, 59));
    return reinterpret_cast<LRESULT>(adminCardBrush_);
  }

  LRESULT AdminEditColor(HDC hdc) {
    SetBkMode(hdc, OPAQUE);
    SetBkColor(hdc, RGB(255, 255, 255));
    SetTextColor(hdc, RGB(15, 23, 42));
    return reinterpret_cast<LRESULT>(adminEditBrush_);
  }

  std::wstring ControlText(HWND control) {
    if (!control) return L"";
    const int length = GetWindowTextLengthW(control);
    std::wstring text(static_cast<std::size_t>(length + 1), L'\0');
    GetWindowTextW(control, text.data(), length + 1);
    text.resize(static_cast<std::size_t>(length));
    return text;
  }

  void SetControlText(HWND control, const std::wstring& text) {
    if (control) {
      SetWindowTextW(control, text.c_str());
    }
  }

  bool VerifyAdminPassword(const std::wstring& password) {
    config_ = lumesync::LoadConfig();
    const std::wstring expected = config_.adminPasswordHash.empty() ? lumesync::DefaultAdminPasswordHash() : config_.adminPasswordHash;
    return lumesync::Sha256Hex(password) == expected;
  }

  void LoadAdminConfigControls() {
    config_ = lumesync::LoadConfig();
    SetControlText(adminIpEdit_, config_.teacherIp);
    SetControlText(adminPortEdit_, std::to_wstring(config_.port));
    SendMessageW(adminAutostartCheck_, BM_SETCHECK, config_.autoStart ? BST_CHECKED : BST_UNCHECKED, 0);
    SetControlText(adminNewPasswordEdit_, L"");
    SetControlText(adminConfirmPasswordEdit_, L"");
    SetControlText(adminConfigMessage_, L"");
  }

  void OnAdminCommand(UINT command) {
    if (command == kAdminLoginSubmit) {
      const std::wstring password = ControlText(adminLoginPassword_);
      if (password.empty()) {
        SetControlText(adminMessage_, L"请输入管理员密码");
        return;
      }
      if (!VerifyAdminPassword(password)) {
        SetControlText(adminMessage_, L"密码错误");
        SetControlText(adminLoginPassword_, L"");
        SetFocus(adminLoginPassword_);
        return;
      }
      SetControlText(adminMessage_, L"");
      ShowAdminLogin(false);
      LoadAdminConfigControls();
      ShowAdminConfig(true);
      SetFocus(adminIpEdit_);
    } else if (command == kAdminSave) {
      SaveAdminConfigFromControls();
    } else if (command == kAdminClose) {
      DestroyWindow(hwnd_);
    } else if (command == kAdminBack) {
      ShowAdminConfig(false);
      ShowAdminLogin(true);
      SetControlText(adminLoginPassword_, L"");
      SetControlText(adminMessage_, L"");
      SetFocus(adminLoginPassword_);
    }
  }

  void SaveAdminConfigFromControls() {
    std::wstring ip = ControlText(adminIpEdit_);
    const std::wstring portText = ControlText(adminPortEdit_);
    const std::wstring newPassword = ControlText(adminNewPasswordEdit_);
    const std::wstring confirmPassword = ControlText(adminConfirmPasswordEdit_);

    if (ip.empty()) {
      SetControlText(adminConfigMessage_, L"请输入教师机 IP");
      return;
    }

    int port = 3000;
    try {
      port = std::stoi(portText);
    } catch (...) {
      SetControlText(adminConfigMessage_, L"端口号无效");
      return;
    }

    if (port <= 0 || port > 65535) {
      SetControlText(adminConfigMessage_, L"端口号必须在 1 到 65535 之间");
      return;
    }

    if (!newPassword.empty() && newPassword != confirmPassword) {
      SetControlText(adminConfigMessage_, L"两次输入的新密码不一致");
      return;
    }

    config_ = lumesync::LoadConfig();
    config_.teacherIp = ip;
    config_.port = port;
    config_.autoStart = SendMessageW(adminAutostartCheck_, BM_GETCHECK, 0, 0) == BST_CHECKED;
    if (!newPassword.empty()) {
      config_.adminPasswordHash = lumesync::Sha256Hex(newPassword);
    }

    if (!lumesync::SaveConfig(config_)) {
      SetControlText(adminConfigMessage_, L"保存失败，请检查权限");
      return;
    }

    SetControlText(adminNewPasswordEdit_, L"");
    SetControlText(adminConfirmPasswordEdit_, L"");
    SetControlText(adminConfigMessage_, L"保存成功");
  }

  void RegisterBrowserEvents() {
#if LUMESYNC_HAS_WEBVIEW2
    if (!webview_) return;

    ComPtr<ICoreWebView2Settings> webviewSettings;
    if (SUCCEEDED(webview_->get_Settings(&webviewSettings)) && webviewSettings) {
      webviewSettings->put_AreDefaultContextMenusEnabled(FALSE);
    }

    const HRESULT scriptResult = webview_->AddScriptToExecuteOnDocumentCreated(
        HostApiScript().c_str(),
        Callback<ICoreWebView2AddScriptToExecuteOnDocumentCreatedCompletedHandler>(
            [this](HRESULT, LPCWSTR) -> HRESULT {
              NavigateInitial();
              return S_OK;
            })
            .Get());
    if (FAILED(scriptResult)) {
      NavigateInitial();
    }

    EventRegistrationToken token = {};
    webview_->add_WebMessageReceived(
        Callback<ICoreWebView2WebMessageReceivedEventHandler>(
            [this](ICoreWebView2*, ICoreWebView2WebMessageReceivedEventArgs* args) -> HRESULT {
              LPWSTR raw = nullptr;
              if (SUCCEEDED(args->get_WebMessageAsJson(&raw)) && raw != nullptr) {
                HandleWebMessage(raw);
                CoTaskMemFree(raw);
              }
              return S_OK;
            })
            .Get(),
        &token);

    webview_->add_NavigationCompleted(
        Callback<ICoreWebView2NavigationCompletedEventHandler>(
            [this](ICoreWebView2*, ICoreWebView2NavigationCompletedEventArgs* args) -> HRESULT {
              BOOL success = FALSE;
              args->get_IsSuccess(&success);
              if (!adminMode_ && !success && !offlinePageLoaded_) {
                LoadOfflinePage();
              } else if (!adminMode_ && success && !offlinePageLoaded_) {
                KillTimer(hwnd_, kRetryTimerId);
              }
              return S_OK;
            })
            .Get(),
        &token);

    webview_->add_PermissionRequested(
        Callback<ICoreWebView2PermissionRequestedEventHandler>(
            [](ICoreWebView2*, ICoreWebView2PermissionRequestedEventArgs* args) -> HRESULT {
              args->put_State(COREWEBVIEW2_PERMISSION_STATE_ALLOW);
              return S_OK;
            })
            .Get(),
        &token);
#endif
  }

  void ResizeBrowser() {
#if LUMESYNC_HAS_WEBVIEW2
    if (!webviewController_) return;
    RECT bounds;
    GetClientRect(hwnd_, &bounds);
    webviewController_->put_Bounds(bounds);
#endif
  }

  void NavigateInitial() {
    if (adminMode_) {
      NavigateLocalPage(L"admin.html");
      return;
    }
    LoadOfflinePage();
    StartBootstrapAsync();
  }

  void StartBootstrapAsync() {
    if (bootstrapInFlight_.exchange(true)) {
      lumesync::AppendLog(L"shell", L"StartBootstrapAsync skipped: bootstrap already in flight");
      return;
    }
    config_ = lumesync::LoadConfig();
    const bool hadClientId = !config_.clientId.empty();
    lumesync::EnsureClientId(config_);
    if (!hadClientId) {
      lumesync::SaveConfig(config_);
    }
    const auto configCopy = config_;
    const HWND targetHwnd = hwnd_;
    lumesync::AppendLog(L"shell", L"StartBootstrapAsync queued for teacher=" + configCopy.teacherIp + L":" + std::to_wstring(configCopy.port));
    std::thread([targetHwnd, configCopy]() {
      auto* uiResult = new BootstrapUiResult();
      const BootstrapSessionResult result = BootstrapViewerSession(configCopy);
      uiResult->ok = result.ok;
      uiResult->error = result.error;
      uiResult->token = result.token;
      uiResult->expiresAt = result.expiresAt;
      uiResult->serverTime = result.serverTime;
      PostMessageW(targetHwnd, WM_BOOTSTRAP_RESULT, 0, reinterpret_cast<LPARAM>(uiResult));
    }).detach();
  }

  void ApplyBootstrapResult(std::unique_ptr<BootstrapUiResult> result) {
    bootstrapInFlight_ = false;
    config_ = lumesync::LoadConfig();
    if (!result || !result->ok) {
      config_.sessionToken.clear();
      config_.sessionExpiresAt.clear();
      config_.sessionServerTime.clear();
      lumesync::SaveConfig(config_);
      lumesync::AppendLog(L"shell", L"Session bootstrap failed: " + (result ? result->error : L"unknown error"));
      LoadOfflinePage();
      return;
    }
    config_.sessionToken = result->token;
    config_.sessionExpiresAt = result->expiresAt;
    config_.sessionServerTime = result->serverTime;
    lumesync::SaveConfig(config_);
    offlinePageLoaded_ = false;
    lumesync::AppendLog(L"shell", L"Session bootstrap succeeded for clientId=" + config_.clientId);
    lumesync::AppendLog(L"shell", L"ApplyBootstrapResult navigating to teacher page");
#if LUMESYNC_HAS_WEBVIEW2
    if (webview_) {
      KillTimer(hwnd_, kRetryTimerId);
      webview_->Navigate(lumesync::BuildTeacherUrl(config_).c_str());
    }
#endif
  }

  bool BootstrapSession() {
    config_ = lumesync::LoadConfig();
    const bool hadClientId = !config_.clientId.empty();
    lumesync::EnsureClientId(config_);
    if (!hadClientId) {
      lumesync::SaveConfig(config_);
    }

    const BootstrapSessionResult result = BootstrapViewerSession(config_);
    if (!result.ok) {
      config_.sessionToken.clear();
      config_.sessionExpiresAt.clear();
      config_.sessionServerTime.clear();
      lumesync::SaveConfig(config_);
      lumesync::AppendLog(L"shell", L"Session bootstrap failed: " + result.error);
      return false;
    }

    config_.sessionToken = result.token;
    config_.sessionExpiresAt = result.expiresAt;
    config_.sessionServerTime = result.serverTime;
    lumesync::SaveConfig(config_);
    lumesync::AppendLog(L"shell", L"Session bootstrap succeeded for clientId=" + config_.clientId);
    return true;
  }

  std::wstring SessionPayloadJson() {
    config_ = lumesync::LoadConfig();
    if (config_.clientId.empty() || config_.sessionToken.empty()) {
      return L"null";
    }

    std::wostringstream json;
    json << L"{"
         << L"\"role\":\"viewer\","
         << L"\"clientId\":\"" << lumesync::JsonEscape(config_.clientId) << L"\","
         << L"\"token\":\"" << lumesync::JsonEscape(config_.sessionToken) << L"\"";
    if (!config_.sessionExpiresAt.empty()) {
      json << L",\"expiresAt\":\"" << lumesync::JsonEscape(config_.sessionExpiresAt) << L"\"";
    }
    if (!config_.sessionServerTime.empty()) {
      json << L",\"serverTime\":\"" << lumesync::JsonEscape(config_.sessionServerTime) << L"\"";
    }
    json << L"}";
    return json.str();
  }

  void NavigateTeacher() {
#if LUMESYNC_HAS_WEBVIEW2
    if (!webview_) {
      lumesync::AppendLog(L"shell", L"NavigateTeacher skipped: webview not ready");
      return;
    }
    config_ = lumesync::LoadConfig();
    lumesync::AppendLog(L"shell", L"NavigateTeacher target=" + lumesync::BuildTeacherUrl(config_));
    StartBootstrapAsync();
#endif
  }

  void NavigateLocalPage(const std::wstring& fileName) {
#if LUMESYNC_HAS_WEBVIEW2
    if (!webview_) return;
    TryNavigateLocalPage(webview_.Get(), fileName);
#endif
  }

  void LoadOfflinePage() {
    offlinePageLoaded_ = true;
    lumesync::AppendLog(L"shell", L"LoadOfflinePage start");
#if LUMESYNC_HAS_WEBVIEW2
    if (webview_) {
      if (!TryNavigateLocalPage(webview_.Get(), L"offline.html")) {
        config_ = lumesync::LoadConfig();
        lumesync::AppendLog(L"shell", L"LoadOfflinePage fallback to inline HTML for teacher=" + config_.teacherIp + L":" + std::to_wstring(config_.port));
        NavigateInlineHtml(webview_.Get(), BuildInlineOfflineHtml(config_));
      }
    } else {
      lumesync::AppendLog(L"shell", L"LoadOfflinePage skipped local navigation: webview not ready");
    }
#endif
    SetTimer(hwnd_, kRetryTimerId, 5000, nullptr);
  }

  void HandleWebMessage(const std::wstring& json) {
    const auto action = lumesync::JsonStringField(json, L"action");
    if (!action) return;

    const auto kind = lumesync::JsonStringField(json, L"kind").value_or(L"event");
    const auto id = lumesync::JsonStringField(json, L"id").value_or(L"");
    const auto payload = lumesync::JsonObjectField(json, L"payload").value_or(L"{}");

    if (kind == L"rpc") {
      HandleRpc(id, *action, payload);
    } else {
      HandleEvent(*action, payload);
    }
  }

  void HandleEvent(const std::wstring& action, const std::wstring& payload) {
    if (action == L"classStarted") {
      if (auto force = lumesync::JsonBoolField(payload, L"forceFullscreen")) {
        forceFullscreen_ = *force;
      }
      classActive_ = true;
      ApplyClassMode();
      SaveRuntimeState();
    } else if (action == L"classEnded") {
      classActive_ = false;
      RestoreNormalMode();
      SaveRuntimeState();
    } else if (action == L"setFullscreen") {
      if (auto enable = lumesync::JsonBoolField(payload, L"enable")) {
        forceFullscreen_ = *enable;
        if (classActive_) ApplyClassMode();
        SaveRuntimeState();
      }
    } else if (action == L"manualRetry") {
      StartBootstrapAsync();
    } else if (action == L"toggleDevTools") {
      OpenDevTools();
    } else if (action == L"minimizeWindow") {
      if (!classActive_) ShowWindow(hwnd_, SW_MINIMIZE);
    } else if (action == L"maximizeWindow") {
      if (!classActive_) ShowWindow(hwnd_, IsZoomed(hwnd_) ? SW_RESTORE : SW_MAXIMIZE);
    } else if (action == L"closeWindow") {
      if (!classActive_) ShowWindow(hwnd_, SW_HIDE);
    } else if (action == L"setAdminPassword") {
      if (auto hash = lumesync::JsonStringField(payload, L"hash"); hash && !hash->empty()) {
        config_ = lumesync::LoadConfig();
        config_.adminPasswordHash = *hash;
        lumesync::SaveConfig(config_);
      }
    }
  }

  void HandleRpc(const std::wstring& id, const std::wstring& action, const std::wstring& payload) {
    if (action == L"getConfig") {
      config_ = lumesync::LoadConfig();
      std::wostringstream response;
      response << L"{\"teacherIp\":\"" << lumesync::JsonEscape(config_.teacherIp)
               << L"\",\"port\":" << config_.port
               << L",\"forceFullscreen\":" << (config_.forceFullscreen ? L"true" : L"false")
               << L",\"autoStart\":" << (config_.autoStart ? L"true" : L"false")
               << L",\"guardEnabled\":" << (config_.guardEnabled ? L"true" : L"false")
               << L",\"clientId\":\"" << lumesync::JsonEscape(config_.clientId) << L"\""
               << L",\"sessionToken\":\"" << lumesync::JsonEscape(config_.sessionToken) << L"\""
               << L",\"sessionExpiresAt\":\"" << lumesync::JsonEscape(config_.sessionExpiresAt) << L"\""
               << L",\"sessionServerTime\":\"" << lumesync::JsonEscape(config_.sessionServerTime) << L"\""
               << L"}";
      SendRpcResult(id, true, response.str());
    } else if (action == L"saveConfig") {
      if (lumesync::JsonBoolField(payload, L"_quit").value_or(false)) {
        if (!classActive_) PostQuitMessage(0);
        SendRpcResult(id, true, L"true");
        return;
      }

      config_ = lumesync::LoadConfig();
      if (auto value = lumesync::JsonStringField(payload, L"teacherIp"); value && !value->empty()) config_.teacherIp = *value;
      if (auto value = lumesync::JsonIntField(payload, L"port")) config_.port = *value;
      if (auto value = lumesync::JsonStringField(payload, L"adminPasswordHash"); value && !value->empty()) config_.adminPasswordHash = *value;
      if (auto value = lumesync::JsonBoolField(payload, L"forceFullscreen")) config_.forceFullscreen = *value;
      if (auto value = lumesync::JsonBoolField(payload, L"guardEnabled")) config_.guardEnabled = *value;
      lumesync::EnsureClientId(config_);

      forceFullscreen_ = config_.forceFullscreen;
      const bool saved = lumesync::SaveConfig(config_);
      if (!adminMode_ && saved) NavigateTeacher();
      SendRpcResult(id, saved, saved ? L"true" : L"false");
    } else if (action == L"verifyPassword") {
      config_ = lumesync::LoadConfig();
      const std::wstring password = lumesync::JsonStringField(payload, L"password").value_or(L"");
      const bool ok = lumesync::Sha256Hex(password) == (config_.adminPasswordHash.empty() ? lumesync::DefaultAdminPasswordHash() : config_.adminPasswordHash);
      SendRpcResult(id, true, ok ? L"{\"ok\":true}" : L"{\"ok\":false}");
    } else if (action == L"getAutostart") {
      config_ = lumesync::LoadConfig();
      SendRpcResult(id, true, config_.autoStart ? L"true" : L"false");
    } else if (action == L"setAutostart") {
      config_ = lumesync::LoadConfig();
      config_.autoStart = lumesync::JsonBoolField(payload, L"enable").value_or(config_.autoStart);
      const bool saved = lumesync::SaveConfig(config_);
      SendRpcResult(id, saved, saved ? L"{\"success\":true}" : L"{\"success\":false,\"error\":\"save failed\"}");
    } else if (action == L"getRole") {
      SendRpcResult(id, true, L"\"viewer\"");
    } else if (action == L"getSession") {
      SendRpcResult(id, true, SessionPayloadJson());
    } else if (action == L"bootstrapSession") {
      const bool ok = BootstrapSession();
      SendRpcResult(id, ok, ok ? SessionPayloadJson() : L"null", ok ? L"" : L"bootstrap failed");
    } else if (action == L"getDeviceInfo") {
      config_ = lumesync::LoadConfig();
      SendRpcResult(id, true, BuildDeviceInfoPayloadJson(config_));
    } else if (action == L"powerControl") {
      const std::wstring requestedAction = lumesync::JsonStringField(payload, L"action").value_or(L"");
      std::wstring error;
      const bool ok = ExecutePowerControl(requestedAction, error);
      if (ok) {
        SendRpcResult(id, true, L"{\"success\":true}");
      } else {
        SendRpcResult(id, false, L"{\"success\":false,\"error\":\"" + lumesync::JsonEscape(error) + L"\"}", error);
      }
    } else if (action == L"takeScreenshot") {
      if (!g_gdiplusScope.Ready()) {
        SendRpcResult(id, false, L"null", L"gdiplus unavailable");
        return;
      }
      const int maxWidth = lumesync::JsonIntField(payload, L"maxWidth").value_or(320);
      const int quality = lumesync::JsonIntField(payload, L"quality").value_or(70);
      auto dataUrl = CaptureScreenAsJpegDataUrl(maxWidth, quality);
      if (!dataUrl) {
        SendRpcResult(id, false, L"null", L"capture failed");
        return;
      }
      const int screenWidth = GetSystemMetrics(SM_CXVIRTUALSCREEN);
      const int screenHeight = GetSystemMetrics(SM_CYVIRTUALSCREEN);
      const int finalWidth = std::min(std::max(160, maxWidth > 0 ? maxWidth : 320), std::max(1, screenWidth));
      const int finalHeight = std::max(1, static_cast<int>(std::lround(static_cast<double>(screenHeight) * finalWidth / std::max(1, screenWidth))));
      SendRpcResult(id, true, BuildScreenshotPayloadJson(*dataUrl, finalWidth, finalHeight));
    } else {
      SendRpcResult(id, false, L"null", L"unknown action");
    }
  }

  void SendRpcResult(const std::wstring& id, bool ok, const std::wstring& payloadJson, const std::wstring& error = L"") {
#if LUMESYNC_HAS_WEBVIEW2
    if (!webview_ || id.empty()) return;
    std::wostringstream response;
    response << L"{\"kind\":\"rpc-result\",\"id\":\"" << lumesync::JsonEscape(id)
             << L"\",\"ok\":" << (ok ? L"true" : L"false")
             << L",\"payload\":" << payloadJson;
    if (!error.empty()) {
      response << L",\"error\":\"" << lumesync::JsonEscape(error) << L"\"";
    }
    response << L"}";
    webview_->PostWebMessageAsJson(response.str().c_str());
#endif
  }

  void ApplyClassMode() {
    if (!hwnd_) return;
    ShowWindow(hwnd_, SW_SHOW);
    if (!forceFullscreen_) {
      // Fullscreen can be disabled while class is active; restore normal shell window.
      ShowTaskbar(true);
      SetWindowLongPtrW(hwnd_, GWL_STYLE, WS_OVERLAPPEDWINDOW | WS_VISIBLE);
      const RECT windowRect = DefaultShellWindowRect();
      SetWindowPos(
          hwnd_,
          HWND_NOTOPMOST,
          windowRect.left,
          windowRect.top,
          windowRect.right - windowRect.left,
          windowRect.bottom - windowRect.top,
          SWP_FRAMECHANGED | SWP_SHOWWINDOW);
      SetForegroundWindow(hwnd_);
      return;
    }

    HMONITOR monitor = MonitorFromWindow(hwnd_, MONITOR_DEFAULTTONEAREST);
    MONITORINFO info = { sizeof(info) };
    GetMonitorInfoW(monitor, &info);

    SetWindowLongPtrW(hwnd_, GWL_STYLE, WS_POPUP | WS_VISIBLE);
    SetWindowPos(
        hwnd_,
        HWND_TOPMOST,
        info.rcMonitor.left,
        info.rcMonitor.top,
        info.rcMonitor.right - info.rcMonitor.left,
        info.rcMonitor.bottom - info.rcMonitor.top,
        SWP_FRAMECHANGED | SWP_SHOWWINDOW);
    ShowTaskbar(false);
    SetForegroundWindow(hwnd_);
  }

  void RestoreNormalMode() {
    if (!hwnd_) return;
    ShowTaskbar(true);
    SetWindowLongPtrW(hwnd_, GWL_STYLE, WS_OVERLAPPEDWINDOW | WS_VISIBLE);
    const RECT windowRect = DefaultShellWindowRect();
    SetWindowPos(
        hwnd_,
        HWND_NOTOPMOST,
        windowRect.left,
        windowRect.top,
        windowRect.right - windowRect.left,
        windowRect.bottom - windowRect.top,
        SWP_FRAMECHANGED | SWP_SHOWWINDOW);
    SetForegroundWindow(hwnd_);
  }

  void SaveRuntimeState() {
    lumesync::StudentState state;
    state.classActive = classActive_;
    state.forceFullscreen = forceFullscreen_;
    state.heartbeatUtcMs = lumesync::UnixTimeMs();
    state.shellPid = GetCurrentProcessId();
    lumesync::SaveState(state);
  }

  void OnTimer(WPARAM timerId) {
    if (timerId == kRetryTimerId) {
      StartBootstrapAsync();
    } else if (timerId == kHeartbeatTimerId) {
      SaveRuntimeState();
    } else if (timerId == kFocusTimerId && classActive_ && forceFullscreen_) {
      if (GetForegroundWindow() != hwnd_) {
        ShowWindow(hwnd_, SW_SHOW);
        SetForegroundWindow(hwnd_);
      }
    }
  }

  void CreateTrayIcon() {
    tray_ = {};
    tray_.cbSize = sizeof(tray_);
    tray_.hWnd = hwnd_;
    tray_.uID = 1;
    tray_.uFlags = NIF_MESSAGE | NIF_ICON | NIF_TIP;
    tray_.uCallbackMessage = WM_TRAY_ICON;
    tray_.hIcon = appIcon_ ? appIcon_ : LoadIconW(nullptr, MAKEINTRESOURCEW(32512));
    wcscpy_s(tray_.szTip, L"LumeSync Student");
    Shell_NotifyIconW(NIM_ADD, &tray_);
  }

  void ShowTrayMenu() {
    POINT cursor;
    GetCursorPos(&cursor);
    HMENU menu = CreatePopupMenu();
    AppendMenuW(menu, MF_STRING, kTrayShow, L"Show Window");
    AppendMenuW(menu, MF_STRING, kTrayAdmin, L"Admin Settings...");
    AppendMenuW(menu, MF_SEPARATOR, 0, nullptr);
    AppendMenuW(menu, MF_STRING | (classActive_ ? MF_GRAYED : 0), kTrayExit, L"Exit");

    SetForegroundWindow(hwnd_);
    TrackPopupMenu(menu, TPM_BOTTOMALIGN | TPM_LEFTALIGN, cursor.x, cursor.y, 0, hwnd_, nullptr);
    DestroyMenu(menu);
  }

  void OnCommand(UINT command) {
    if (command == kTrayShow) {
      ShowWindow(hwnd_, SW_SHOW);
      SetForegroundWindow(hwnd_);
    } else if (command == kTrayAdmin) {
      LaunchAdminWindow();
    } else if (command == kTrayExit && !classActive_) {
      DestroyWindow(hwnd_);
      PostQuitMessage(0);
    }
  }

  void LaunchAdminWindow() {
    const std::wstring command = QuotePath(ExePath()) + L" --admin-window";
    STARTUPINFOW startup = { sizeof(startup) };
    PROCESS_INFORMATION process = {};
    std::wstring mutableCommand = command;
    if (CreateProcessW(nullptr, mutableCommand.data(), nullptr, nullptr, FALSE, 0, nullptr, nullptr, &startup, &process)) {
      CloseHandle(process.hThread);
      CloseHandle(process.hProcess);
    }
  }

  bool ExecutePowerControl(const std::wstring& action, std::wstring& error) {
    std::wstring flag;
    bool force = false;
    if (action == L"shutdown") {
      flag = L"/s";
    } else if (action == L"restart") {
      flag = L"/r";
    } else if (action == L"force-shutdown") {
      flag = L"/s";
      force = true;
    } else if (action == L"force-restart") {
      flag = L"/r";
      force = true;
    } else {
      error = L"unsupported action";
      return false;
    }

    wchar_t systemDir[MAX_PATH] = {};
    const UINT length = GetSystemDirectoryW(systemDir, MAX_PATH);
    const std::wstring shutdownExe = (length > 0 && length < MAX_PATH)
        ? (std::wstring(systemDir) + L"\\shutdown.exe")
        : L"shutdown.exe";
    std::wstring command = QuotePath(shutdownExe) + L" " + flag + (force ? L" /f" : L"") + L" /t 0";

    STARTUPINFOW startup = { sizeof(startup) };
    PROCESS_INFORMATION process = {};
    std::wstring mutableCommand = command;
    if (!CreateProcessW(nullptr, mutableCommand.data(), nullptr, nullptr, FALSE, CREATE_NO_WINDOW, nullptr, nullptr, &startup, &process)) {
      error = L"CreateProcess failed: " + std::to_wstring(GetLastError());
      lumesync::AppendLog(L"shell", L"Power control failed action=" + action + L" error=" + error);
      return false;
    }
    CloseHandle(process.hThread);
    CloseHandle(process.hProcess);
    lumesync::AppendLog(L"shell", L"Power control accepted action=" + action);
    return true;
  }

  void OpenDevTools() {
#if LUMESYNC_HAS_WEBVIEW2
    if (webview_) {
      webview_->OpenDevToolsWindow();
    }
#endif
  }

  void Shutdown() {
    Shell_NotifyIconW(NIM_DELETE, &tray_);
    if (keyboardHook_) {
      UnhookWindowsHookEx(keyboardHook_);
      keyboardHook_ = nullptr;
    }
    if (!adminMode_) {
      ShowTaskbar(true);
    }
#if LUMESYNC_HAS_WEBVIEW2
    if (webviewLoader_) {
      FreeLibrary(webviewLoader_);
      webviewLoader_ = nullptr;
    }
#endif
    if (adminFont_) DeleteObject(adminFont_);
    if (adminTitleFont_) DeleteObject(adminTitleFont_);
    if (adminHintFont_) DeleteObject(adminHintFont_);
    if (adminBackgroundBrush_) DeleteObject(adminBackgroundBrush_);
    if (adminCardBrush_) DeleteObject(adminCardBrush_);
    if (adminEditBrush_) DeleteObject(adminEditBrush_);
  }

  HINSTANCE instance_ = nullptr;
  HWND hwnd_ = nullptr;
  bool adminMode_ = false;
  bool classActive_ = false;
  bool forceFullscreen_ = true;
  bool offlinePageLoaded_ = false;
  std::atomic<bool> bootstrapInFlight_{false};
  HHOOK keyboardHook_ = nullptr;
  HICON appIcon_ = nullptr;
  HFONT adminFont_ = nullptr;
  HFONT adminTitleFont_ = nullptr;
  HFONT adminHintFont_ = nullptr;
  HBRUSH adminBackgroundBrush_ = nullptr;
  HBRUSH adminCardBrush_ = nullptr;
  HBRUSH adminEditBrush_ = nullptr;
  HWND adminTitle_ = nullptr;
  HWND adminSubtitle_ = nullptr;
  HWND adminLoginLabel_ = nullptr;
  HWND adminLoginPassword_ = nullptr;
  HWND adminMessage_ = nullptr;
  HWND adminLoginButton_ = nullptr;
  HWND configTitle_ = nullptr;
  HWND adminIpLabel_ = nullptr;
  HWND adminIpEdit_ = nullptr;
  HWND adminPortLabel_ = nullptr;
  HWND adminPortEdit_ = nullptr;
  HWND adminAutostartCheck_ = nullptr;
  HWND adminNewPasswordLabel_ = nullptr;
  HWND adminNewPasswordEdit_ = nullptr;
  HWND adminConfirmPasswordLabel_ = nullptr;
  HWND adminConfirmPasswordEdit_ = nullptr;
  HWND adminConfigMessage_ = nullptr;
  HWND adminSaveButton_ = nullptr;
  HWND adminCloseButton_ = nullptr;
  HWND adminBackButton_ = nullptr;
  std::vector<HWND> loginControls_;
  std::vector<HWND> configControls_;
  NOTIFYICONDATAW tray_ = {};
  lumesync::StudentConfig config_;

#if LUMESYNC_HAS_WEBVIEW2
  HMODULE webviewLoader_ = nullptr;
  ComPtr<ICoreWebView2Environment> webviewEnvironment_;
  ComPtr<ICoreWebView2Controller> webviewController_;
  ComPtr<ICoreWebView2> webview_;
#endif
};

}  // namespace

int APIENTRY wWinMain(HINSTANCE instance, HINSTANCE, LPWSTR, int nCmdShow) {
  EnableDpiAwareness();
  lumesync::EnsureRuntimeDirectories();
  lumesync::AppendLog(L"shell", L"Student shell starting");

  const bool adminMode = HasArg(L"--admin-window");
  HANDLE instanceMutex = AcquireInstanceMutex(adminMode);
  if (!instanceMutex) {
    lumesync::AppendLog(L"shell", adminMode ? L"Admin instance already running" : L"Main instance already running");
    ActivateExistingInstance(adminMode);
    return 0;
  }

  StudentShellApp app(instance, adminMode);
  if (!app.Initialize(nCmdShow)) {
    lumesync::AppendLog(L"shell", L"Failed to initialize shell window");
    ReleaseMutex(instanceMutex);
    CloseHandle(instanceMutex);
    return 1;
  }

  const int result = app.Run();
  ReleaseMutex(instanceMutex);
  CloseHandle(instanceMutex);
  return result;
}
