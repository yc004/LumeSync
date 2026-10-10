#pragma once

#include <cstdint>
#include <filesystem>
#include <optional>
#include <string>

namespace lumesync {

struct TeacherConfig {
  std::wstring teacherIp = L"127.0.0.1";
  int port = 3000;
  std::wstring adminPasswordHash;
  std::wstring clientId;
  std::wstring sessionToken;
  std::wstring sessionExpiresAt;
  std::wstring sessionServerTime;
};

struct TeacherWindowSettings {
  bool forceFullscreen = true;
  bool syncFollow = true;
  bool allowInteract = true;
  bool syncInteraction = false;
  bool podiumAtTop = true;
  double renderScale = 0.96;
  double uiScale = 1.0;
  bool alertJoin = true;
  bool alertLeave = true;
  bool alertFullscreenExit = true;
  bool alertTabHidden = true;
  bool monitorEnabled = false;
  double monitorIntervalSec = 1.0;
};

std::wstring DefaultAdminPasswordHash();
std::filesystem::path ProgramDataDir();
std::filesystem::path ConfigPath();
std::filesystem::path SettingsPath();
std::filesystem::path LogPath(const std::wstring& component);
void EnsureRuntimeDirectories();

TeacherConfig LoadConfig();
bool SaveConfig(const TeacherConfig& config);
TeacherWindowSettings LoadWindowSettings();
bool SaveWindowSettings(const TeacherWindowSettings& settings);

std::wstring BuildTeacherUrl(const TeacherConfig& config);
std::wstring BuildSessionBootstrapUrl(const TeacherConfig& config);
std::wstring EnsureClientId(TeacherConfig& config);
std::wstring Sha256Hex(const std::wstring& input);
std::uint64_t UnixTimeMs();
void AppendLog(const std::wstring& component, const std::wstring& message);

std::string Utf8Encode(const std::wstring& input);
std::wstring Utf8Decode(const std::string& input);
std::wstring JsonEscape(const std::wstring& input);
std::optional<std::wstring> JsonStringField(const std::wstring& json, const std::wstring& key);
std::optional<int> JsonIntField(const std::wstring& json, const std::wstring& key);
std::optional<bool> JsonBoolField(const std::wstring& json, const std::wstring& key);
std::optional<double> JsonDoubleField(const std::wstring& json, const std::wstring& key);
std::optional<std::wstring> JsonObjectField(const std::wstring& json, const std::wstring& key);

}  // namespace lumesync
