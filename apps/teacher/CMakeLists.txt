cmake_minimum_required(VERSION 3.24)

project(LumeSyncTeacherNative LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

set(WEBVIEW2_PACKAGE_ROOT "" CACHE PATH "Path to the Microsoft.Web.WebView2 NuGet package root")

if(NOT WEBVIEW2_PACKAGE_ROOT AND DEFINED ENV{USERPROFILE})
  file(GLOB _webview2_packages "$ENV{USERPROFILE}/.nuget/packages/microsoft.web.webview2/*")
  if(_webview2_packages)
    list(SORT _webview2_packages COMPARE NATURAL ORDER DESCENDING)
    list(GET _webview2_packages 0 WEBVIEW2_PACKAGE_ROOT)
  endif()
endif()

if(WEBVIEW2_PACKAGE_ROOT AND EXISTS "${WEBVIEW2_PACKAGE_ROOT}/build/native/include/WebView2.h")
  set(WEBVIEW2_INCLUDE_DIR "${WEBVIEW2_PACKAGE_ROOT}/build/native/include" CACHE PATH "WebView2 include directory" FORCE)
  set(WEBVIEW2_LOADER_DLL "${WEBVIEW2_PACKAGE_ROOT}/build/native/x64/WebView2Loader.dll" CACHE FILEPATH "WebView2 loader DLL" FORCE)
  message(STATUS "Using WebView2 SDK: ${WEBVIEW2_PACKAGE_ROOT}")
else()
  message(WARNING "WebView2 SDK package was not found. LumeSyncTeacherShell will compile in fallback mode.")
endif()

add_subdirectory(native/shared)
add_subdirectory(native/shell)
