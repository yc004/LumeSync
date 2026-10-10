add_library(lumesync_teacher_shared STATIC
  src/shared.cpp
)

target_include_directories(lumesync_teacher_shared
  PUBLIC
    ${CMAKE_CURRENT_SOURCE_DIR}/include
)

target_link_libraries(lumesync_teacher_shared
  PUBLIC
    bcrypt
    ole32
    shell32
)

if(MSVC)
  target_compile_options(lumesync_teacher_shared PRIVATE /utf-8)
  set_target_properties(lumesync_teacher_shared PROPERTIES
    VS_GLOBAL_IntDir "$(SolutionDir)$(ProjectName)\\$(Platform)\\$(Configuration)\\"
  )
endif()
