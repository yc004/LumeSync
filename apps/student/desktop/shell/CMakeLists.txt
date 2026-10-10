add_executable(LumeSyncStudentShell WIN32
  src/main.cpp
  src/shell.rc
)

target_link_libraries(LumeSyncStudentShell
  PRIVATE
    lumesync_student_shared
    user32
    gdi32
    shell32
    ole32
    advapi32
    crypt32
    gdiplus
    oleaut32
    winhttp
)

if(WEBVIEW2_INCLUDE_DIR)
  target_include_directories(LumeSyncStudentShell PRIVATE "${WEBVIEW2_INCLUDE_DIR}")
endif()

if(WEBVIEW2_LOADER_DLL AND EXISTS "${WEBVIEW2_LOADER_DLL}")
  add_custom_command(TARGET LumeSyncStudentShell POST_BUILD
    COMMAND ${CMAKE_COMMAND} -E copy_if_different
      "${WEBVIEW2_LOADER_DLL}"
      "$<TARGET_FILE_DIR:LumeSyncStudentShell>/WebView2Loader.dll"
    VERBATIM
  )
endif()

if(MSVC)
  target_compile_options(LumeSyncStudentShell PRIVATE /utf-8)
  set_target_properties(LumeSyncStudentShell PROPERTIES
    VS_GLOBAL_IntDir "$(SolutionDir)$(ProjectName)\\$(Platform)\\$(Configuration)\\"
  )
endif()
