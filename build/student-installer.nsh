; ========================================================
; SyncClassroom 学生端 - NSIS 自定义脚本
; 卸载时弹出密码验证对话框，验证失败则中止卸载
; ========================================================

; 安装完成后注册 Windows 服务
!macro customInstall
    DetailPrint "正在注册学生端守护服务..."
    nsExec::ExecToLog '"$INSTDIR\SyncClassroom 学生端.exe" --register-service'
!macroend

; 卸载完成后停止并删除服务
!macro customUnInstall
    DetailPrint "正在停止守护服务..."
    nsExec::ExecToLog 'sc stop "SyncClassroomStudent"'
    nsExec::ExecToLog 'sc delete "SyncClassroomStudent"'
!macroend

; ── 卸载初始化：密码验证 ──────────────────────────────────
; electron-builder 会将此文件 !include 进生成的 NSIS 脚本
; un.onInit 在卸载程序启动时立即执行，验证失败直接 Quit

Function un.onInit
    ; 创建对话框
    nsDialogs::Create 1018
    Pop $0
    ${If} $0 == error
        MessageBox MB_OK|MB_ICONSTOP "无法创建卸载验证对话框。"
        Quit
    ${EndIf}

    ${NSD_CreateLabel} 0 0 100% 30u "卸载 SyncClassroom 学生端需要管理员密码验证："
    Pop $1

    ${NSD_CreatePassword} 0 35u 100% 14u ""
    Pop $2

    ${NSD_CreateButton} 0 55u 48% 14u "确认卸载"
    Pop $3

    ${NSD_CreateButton} 52% 55u 48% 14u "取消"
    Pop $4

    ; 取消按钮直接退出
    GetFunctionAddress $5 un.CancelUninstall
    nsDialogs::OnClick $4 $5

    nsDialogs::Show

    ; 读取密码
    ${NSD_GetText} $2 $R0

    ; 调用验证工具
    StrCpy $R1 "$INSTDIR\resources\verify-password.exe"
    StrCpy $R2 "$APPDATA\SyncClassroom 学生端\config.json"

    ${If} ${FileExists} $R1
        ; 写临时文件传递密码（避免命令行可见）
        FileOpen $R3 "$TEMP\sc_uninstall_pwd.tmp" w
        FileWrite $R3 $R0
        FileClose $R3
        ExecWait '"$R1" --file "$TEMP\sc_uninstall_pwd.tmp" --config "$R2"' $R4
        Delete "$TEMP\sc_uninstall_pwd.tmp"
        ${If} $R4 != 0
            MessageBox MB_OK|MB_ICONEXCLAMATION "密码错误，卸载已取消。"
            Quit
        ${EndIf}
    ${Else}
        ; verify-password.exe 不存在时回退到明文比对默认密码
        ${If} $R0 != "admin123"
            MessageBox MB_OK|MB_ICONEXCLAMATION "密码错误，卸载已取消。"
            Quit
        ${EndIf}
    ${EndIf}
FunctionEnd

Function un.CancelUninstall
    Quit
FunctionEnd
