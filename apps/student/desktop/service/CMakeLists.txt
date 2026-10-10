add_executable(LumeSyncStudentGuardSvc
  src/main.cpp
)

target_link_libraries(LumeSyncStudentGuardSvc
  PRIVATE
    lumesync_student_shared
    advapi32
    userenv
    wtsapi32
    kernel32
    psapi
)

if(MSVC)
  target_compile_options(LumeSyncStudentGuardSvc PRIVATE /utf-8)
  set_target_properties(LumeSyncStudentGuardSvc PROPERTIES
    VS_GLOBAL_IntDir "$(SolutionDir)$(ProjectName)\\$(Platform)\\$(Configuration)\\"
  )
endif()
