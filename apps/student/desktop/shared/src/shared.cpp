#include "lumesync/shared.h"

#include <windows.h>
#include <bcrypt.h>
#include <shlobj.h>

#include <chrono>
#include <fstream>
#include <iomanip>
#include <random>
#include <regex>
#include <sstream>
#include <vector>

namespace lumesync {
namespace {

constexpr wchar_t kDefaultAdminHash[] =
    L"240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9";

std::filesystem::path KnownFolder(REFKNOWNFOLDERID folderId) {
  PWSTR rawPath = nullptr;
  if (FAILED(SHGetKnownFolderPath(folderId, KF_FLAG_DEFAULT, nullptr, &rawPath)) || rawPath == nullptr) {
    return std::filesystem::current_path();
  }

  std::filesystem::path path(rawPath);
  CoTaskMemFree(rawPath);
  return path;
}

std::wstring ReadTextFile(const std::filesystem::path& path) {
  std::ifstream input(path, std::ios::binary);
  if (!input) {
    return L"";
  }

  std::ostringstream buffer;
  buffer << input.rdbuf();
  return Utf8Decode(buffer.str());
}

bool WriteTextFile(const std::filesystem::path& path, const std::wstring& text) {
  try {
    std::filesystem::create_directories(path.parent_path());
    std::ofstream output(path, std::ios::binary | std::ios::trunc);
    if (!output) {
      return false;
    }
    output << Utf8Encode(text);
    return true;
  } catch (...) {
    return false;
  }
}

std::wstring JsonUnescape(std::wstring value) {
  std::wstring out;
  out.reserve(value.size());

  for (std::size_t i = 0; i < value.size(); ++i) {
    if (value[i] == L'\\' && i + 1 < value.size()) {
      const wchar_t next = value[++i];
      switch (next) {
        case L'"': out.push_back(L'"'); break;
        case L'\\': out.push_back(L'\\'); break;
        case L'n': out.push_back(L'\n'); break;
        case L'r': out.push_back(L'\r'); break;
        case L't': out.push_back(L'\t'); break;
        default: out.push_back(next); break;
      }
    } else {
      out.push_back(value[i]);
    }
  }

  return out;
}

std::wstring FieldPattern(const std::wstring& key, const std::wstring& suffix) {
  return L"\"" + key + L"\"\\s*:\\s*" + suffix;
}

std::wstring BoolText(bool value) {
  return value ? L"true" : L"false";
}

std::wstring RandomHex(std::size_t length) {
  static constexpr wchar_t kHex[] = L"0123456789abcdef";
  std::random_device device;
  std::mt19937 generator(device());
  std::uniform_int_distribution<int> distribution(0, 15);

  std::wstring value;
  value.reserve(length);
  for (std::size_t index = 0; index < length; ++index) {
    value.push_back(kHex[distribution(generator)]);
  }
  return value;
}

}  // namespace

std::wstring DefaultAdminPasswordHash() {
  return kDefaultAdminHash;
}

std::filesystem::path ProgramDataDir() {
  return KnownFolder(FOLDERID_ProgramData) / L"LumeSync Student";
}

std::filesystem::path ConfigPath() {
  return ProgramDataDir() / L"config.json";
}

std::filesystem::path StatePath() {
  return ProgramDataDir() / L"state.json";
}

std::filesystem::path LogPath(const std::wstring& component) {
  return ProgramDataDir() / L"logs" / (component + L".log");
}

void EnsureRuntimeDirectories() {
  std::filesystem::create_directories(ProgramDataDir());
  std::filesystem::create_directories(ProgramDataDir() / L"logs");
}

StudentConfig LoadConfig() {
  EnsureRuntimeDirectories();
  StudentConfig config;
  config.adminPasswordHash = DefaultAdminPasswordHash();

  const std::wstring raw = ReadTextFile(ConfigPath());
  if (raw.empty()) {
    SaveConfig(config);
    return config;
  }

  if (auto value = JsonStringField(raw, L"teacherIp")) config.teacherIp = *value;
  if (auto value = JsonIntField(raw, L"port")) config.port = *value;
  if (auto value = JsonStringField(raw, L"adminPasswordHash"); value && !value->empty()) {
    config.adminPasswordHash = *value;
  }
  if (auto value = JsonBoolField(raw, L"forceFullscreen")) config.forceFullscreen = *value;
  if (auto value = JsonBoolField(raw, L"autoStart")) config.autoStart = *value;
  if (auto value = JsonBoolField(raw, L"guardEnabled")) config.guardEnabled = *value;
  if (auto value = JsonStringField(raw, L"clientId")) config.clientId = *value;
  if (auto value = JsonStringField(raw, L"sessionToken")) config.sessionToken = *value;
  if (auto value = JsonStringField(raw, L"sessionExpiresAt")) config.sessionExpiresAt = *value;
  if (auto value = JsonStringField(raw, L"sessionServerTime")) config.sessionServerTime = *value;

  if (config.port <= 0 || config.port > 65535) {
    config.port = 3000;
  }

  if (config.teacherIp.empty()) {
    config.teacherIp = L"192.168.1.100";
  }

  return config;
}

bool SaveConfig(const StudentConfig& config) {
  std::wostringstream json;
  json << L"{\n"
       << L"  \"teacherIp\": \"" << JsonEscape(config.teacherIp) << L"\",\n"
       << L"  \"port\": " << config.port << L",\n"
       << L"  \"adminPasswordHash\": \"" << JsonEscape(config.adminPasswordHash.empty() ? DefaultAdminPasswordHash() : config.adminPasswordHash) << L"\",\n"
       << L"  \"forceFullscreen\": " << BoolText(config.forceFullscreen) << L",\n"
       << L"  \"autoStart\": " << BoolText(config.autoStart) << L",\n"
       << L"  \"guardEnabled\": " << BoolText(config.guardEnabled) << L",\n"
       << L"  \"clientId\": \"" << JsonEscape(config.clientId) << L"\",\n"
       << L"  \"sessionToken\": \"" << JsonEscape(config.sessionToken) << L"\",\n"
       << L"  \"sessionExpiresAt\": \"" << JsonEscape(config.sessionExpiresAt) << L"\",\n"
       << L"  \"sessionServerTime\": \"" << JsonEscape(config.sessionServerTime) << L"\"\n"
       << L"}\n";

  return WriteTextFile(ConfigPath(), json.str());
}

StudentState LoadState() {
  StudentState state;
  const std::wstring raw = ReadTextFile(StatePath());
  if (raw.empty()) {
    return state;
  }

  if (auto value = JsonBoolField(raw, L"classActive")) state.classActive = *value;
  if (auto value = JsonBoolField(raw, L"forceFullscreen")) state.forceFullscreen = *value;
  if (auto value = JsonIntField(raw, L"shellPid")) state.shellPid = static_cast<std::uint32_t>(*value);
  if (auto value = JsonStringField(raw, L"heartbeatUtcMs")) {
    try {
      state.heartbeatUtcMs = std::stoull(*value);
    } catch (...) {
      state.heartbeatUtcMs = 0;
    }
  }

  return state;
}

bool SaveState(const StudentState& state) {
  std::wostringstream json;
  json << L"{\n"
       << L"  \"classActive\": " << BoolText(state.classActive) << L",\n"
       << L"  \"forceFullscreen\": " << BoolText(state.forceFullscreen) << L",\n"
       << L"  \"heartbeatUtcMs\": \"" << state.heartbeatUtcMs << L"\",\n"
       << L"  \"shellPid\": " << state.shellPid << L"\n"
       << L"}\n";

  return WriteTextFile(StatePath(), json.str());
}

std::wstring BuildTeacherUrl(const StudentConfig& config) {
  std::wostringstream url;
  url << L"http://" << config.teacherIp << L":" << config.port << L"/student.html";
  return url.str();
}

std::wstring BuildSessionBootstrapUrl(const StudentConfig& config) {
  std::wostringstream url;
  url << L"http://" << config.teacherIp << L":" << config.port << L"/api/session/bootstrap";
  return url.str();
}

std::wstring EnsureClientId(StudentConfig& config) {
  if (!config.clientId.empty()) {
    return config.clientId;
  }
  config.clientId = L"student-" + RandomHex(24);
  return config.clientId;
}

std::wstring Sha256Hex(const std::wstring& input) {
  BCRYPT_ALG_HANDLE algorithm = nullptr;
  BCRYPT_HASH_HANDLE hash = nullptr;
  DWORD objectLength = 0;
  DWORD hashLength = 0;
  DWORD bytesRead = 0;

  const std::string utf8 = Utf8Encode(input);
  if (FAILED(BCryptOpenAlgorithmProvider(&algorithm, BCRYPT_SHA256_ALGORITHM, nullptr, 0))) {
    return L"";
  }

  BCryptGetProperty(algorithm, BCRYPT_OBJECT_LENGTH, reinterpret_cast<PUCHAR>(&objectLength), sizeof(objectLength), &bytesRead, 0);
  BCryptGetProperty(algorithm, BCRYPT_HASH_LENGTH, reinterpret_cast<PUCHAR>(&hashLength), sizeof(hashLength), &bytesRead, 0);

  std::vector<UCHAR> object(objectLength);
  std::vector<UCHAR> digest(hashLength);
  if (FAILED(BCryptCreateHash(algorithm, &hash, object.data(), objectLength, nullptr, 0, 0)) ||
      FAILED(BCryptHashData(hash, reinterpret_cast<PUCHAR>(const_cast<char*>(utf8.data())), static_cast<ULONG>(utf8.size()), 0)) ||
      FAILED(BCryptFinishHash(hash, digest.data(), hashLength, 0))) {
    if (hash) BCryptDestroyHash(hash);
    BCryptCloseAlgorithmProvider(algorithm, 0);
    return L"";
  }

  BCryptDestroyHash(hash);
  BCryptCloseAlgorithmProvider(algorithm, 0);

  std::wostringstream hex;
  hex << std::hex << std::setfill(L'0');
  for (const UCHAR part : digest) {
    hex << std::setw(2) << static_cast<int>(part);
  }
  return hex.str();
}

std::uint64_t UnixTimeMs() {
  const auto now = std::chrono::system_clock::now().time_since_epoch();
  return static_cast<std::uint64_t>(std::chrono::duration_cast<std::chrono::milliseconds>(now).count());
}

void AppendLog(const std::wstring& component, const std::wstring& message) {
  try {
    EnsureRuntimeDirectories();
    std::ofstream output(LogPath(component), std::ios::binary | std::ios::app);
    output << Utf8Encode(L"[" + std::to_wstring(UnixTimeMs()) + L"] " + message + L"\n");
  } catch (...) {
  }
}

std::string Utf8Encode(const std::wstring& input) {
  if (input.empty()) {
    return {};
  }

  const int size = WideCharToMultiByte(CP_UTF8, 0, input.data(), static_cast<int>(input.size()), nullptr, 0, nullptr, nullptr);
  std::string output(size, '\0');
  WideCharToMultiByte(CP_UTF8, 0, input.data(), static_cast<int>(input.size()), output.data(), size, nullptr, nullptr);
  return output;
}

std::wstring Utf8Decode(const std::string& input) {
  if (input.empty()) {
    return {};
  }

  const int size = MultiByteToWideChar(CP_UTF8, 0, input.data(), static_cast<int>(input.size()), nullptr, 0);
  std::wstring output(size, L'\0');
  MultiByteToWideChar(CP_UTF8, 0, input.data(), static_cast<int>(input.size()), output.data(), size);
  return output;
}

std::wstring JsonEscape(const std::wstring& input) {
  std::wstring output;
  output.reserve(input.size() + 8);

  for (const wchar_t ch : input) {
    switch (ch) {
      case L'\\': output += L"\\\\"; break;
      case L'"': output += L"\\\""; break;
      case L'\n': output += L"\\n"; break;
      case L'\r': output += L"\\r"; break;
      case L'\t': output += L"\\t"; break;
      default: output.push_back(ch); break;
    }
  }

  return output;
}

std::optional<std::wstring> JsonStringField(const std::wstring& json, const std::wstring& key) {
  const std::wregex pattern(FieldPattern(key, L"\"((?:\\\\.|[^\"\\\\])*)\""));
  std::wsmatch match;
  if (!std::regex_search(json, match, pattern) || match.size() < 2) {
    return std::nullopt;
  }

  return JsonUnescape(match[1].str());
}

std::optional<int> JsonIntField(const std::wstring& json, const std::wstring& key) {
  const std::wregex pattern(FieldPattern(key, L"(-?\\d+)"));
  std::wsmatch match;
  if (!std::regex_search(json, match, pattern) || match.size() < 2) {
    return std::nullopt;
  }

  try {
    return std::stoi(match[1].str());
  } catch (...) {
    return std::nullopt;
  }
}

std::optional<bool> JsonBoolField(const std::wstring& json, const std::wstring& key) {
  const std::wregex pattern(FieldPattern(key, L"(true|false)"));
  std::wsmatch match;
  if (!std::regex_search(json, match, pattern) || match.size() < 2) {
    return std::nullopt;
  }

  return match[1].str() == L"true";
}

std::optional<std::wstring> JsonObjectField(const std::wstring& json, const std::wstring& key) {
  const std::wstring needle = L"\"" + key + L"\"";
  const std::size_t keyPos = json.find(needle);
  if (keyPos == std::wstring::npos) {
    return std::nullopt;
  }

  const std::size_t colon = json.find(L':', keyPos + needle.size());
  if (colon == std::wstring::npos) {
    return std::nullopt;
  }

  std::size_t start = json.find_first_not_of(L" \t\r\n", colon + 1);
  if (start == std::wstring::npos) {
    return std::nullopt;
  }

  if (json[start] != L'{') {
    const std::size_t end = json.find_first_of(L",}", start);
    return json.substr(start, end == std::wstring::npos ? std::wstring::npos : end - start);
  }

  int depth = 0;
  bool inString = false;
  bool escaped = false;
  for (std::size_t i = start; i < json.size(); ++i) {
    const wchar_t ch = json[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch == L'\\') {
        escaped = true;
      } else if (ch == L'"') {
        inString = false;
      }
      continue;
    }

    if (ch == L'"') {
      inString = true;
    } else if (ch == L'{') {
      ++depth;
    } else if (ch == L'}') {
      --depth;
      if (depth == 0) {
        return json.substr(start, i - start + 1);
      }
    }
  }

  return std::nullopt;
}

}  // namespace lumesync
