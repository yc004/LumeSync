#pragma once

#include <cstdint>
#include <filesystem>
#include <optional>
#include <string>

namespace lumesync {

struct StudentConfig {
  std::wstring teacherIp = L"192.168.1.100";
  int port = 3000;
  std::wstring adminPasswordHash;
  bool forceFullscreen = true;
  bool autoStart = true;
  bool guardEnabled = true;
  std::wstring clientId;
  std::wstring sessionToken;
  std::wstring sessionExpiresAt;
  std::wstring sessionServerTime;
};

struct StudentState {
  bool classActive = false;
  bool forceFullscreen = true;
  std::uint64_t heartbeatUtcMs = 0;
  std::uint32_t shellPid = 0;
};

std::wstring DefaultAdminPasswordHash();
std::filesystem::path ProgramDataDir();
std::filesystem::path ConfigPath();
std::filesystem::path StatePath();
std::filesystem::path LogPath(const std::wstring& component);
void EnsureRuntimeDirectories();

StudentConfig LoadConfig();
bool SaveConfig(const StudentConfig& config);
StudentState LoadState();
bool SaveState(const StudentState& state);

std::wstring BuildTeacherUrl(const StudentConfig& config);
std::wstring BuildSessionBootstrapUrl(const StudentConfig& config);
std::wstring EnsureClientId(StudentConfig& config);
std::wstring Sha256Hex(const std::wstring& input);
std::uint64_t UnixTimeMs();
void AppendLog(const std::wstring& component, const std::wstring& message);

std::string Utf8Encode(const std::wstring& input);
std::wstring Utf8Decode(const std::string& input);
std::wstring JsonEscape(const std::wstring& input);
std::optional<std::wstring> JsonStringField(const std::wstring& json, const std::wstring& key);
std::optional<int> JsonIntField(const std::wstring& json, const std::wstring& key);
std::optional<bool> JsonBoolField(const std::wstring& json, const std::wstring& key);
std::optional<std::wstring> JsonObjectField(const std::wstring& json, const std::wstring& key);

}  // namespace lumesync
