; ============================================================
; 萤火课堂 Student - Custom NSIS Script
; Password check via customUnInit (runs before file deletion).
; ============================================================

!include LogicLib.nsh

; ── Install: register Windows service only ──
!macro customInstall
    DetailPrint "Registering student daemon service..."
    nsExec::ExecToLog '"$INSTDIR\LumeSync Student.exe" --register-service'
    DetailPrint "Cleaning up old autostart entries..."
    ; 清理旧的注册表启动项（如果有）
    DeleteRegValue HKLM "SOFTWARE\Microsoft\Windows\CurrentVersion\Run" "SyncClassroomStudent"
    DeleteRegValue HKLM "SOFTWARE\Microsoft\Windows\CurrentVersion\Run" "LumeSyncStudent"
    ; 清理旧的任务计划（如果有）
    nsExec::ExecToLog 'schtasks /delete /tn SyncClassroomStudentAutostart /f'
    nsExec::ExecToLog 'schtasks /delete /tn LumeSyncStudentAutostart /f'
!macroend

; ── customUnInit: password check BEFORE any files are removed ─
!macro customUnInit
    ; Write VBScript to temp file to show InputBox
    FileOpen $R8 "$TEMP\sc_getpwd.vbs" w
    FileWrite $R8 'Dim pwd$\r$\n'
    FileWrite $R8 'pwd = InputBox("Enter admin password to uninstall LumeSync Student:", "LumeSync Student")$\r$\n'
    FileWrite $R8 'If pwd = "" Then WScript.Quit 1$\r$\n'
    FileWrite $R8 'Set fso = CreateObject("Scripting.FileSystemObject")$\r$\n'
    FileWrite $R8 'Set f = fso.OpenTextFile("$TEMP\sc_pwd.tmp", 2, True)$\r$\n'
    FileWrite $R8 'f.Write pwd$\r$\n'
    FileWrite $R8 'f.Close$\r$\n'
    FileWrite $R8 'WScript.Quit 0'
    FileClose $R8

    ExecWait 'wscript.exe //NoLogo "$TEMP\sc_getpwd.vbs"' $R7
    Delete "$TEMP\sc_getpwd.vbs"

    ${If} $R7 != 0
        Delete "$TEMP\sc_pwd.tmp"
        Quit
    ${EndIf}

    ; Verify password
    StrCpy $R6 "1"
    ${If} ${FileExists} "$INSTDIR\resources\verify-password.exe"
        ExecWait '"$INSTDIR\resources\verify-password.exe" --file "$TEMP\sc_pwd.tmp" --config "$APPDATA\LumeSync Student\config.json"' $R6
    ${Else}
        FileOpen $R5 "$TEMP\sc_pwd.tmp" r
        FileRead $R5 $R0
        FileClose $R5
        ${If} $R0 == "admin123"
            StrCpy $R6 "0"
        ${EndIf}
    ${EndIf}

    Delete "$TEMP\sc_pwd.tmp"

    ${If} $R6 != "0"
        MessageBox MB_OK|MB_ICONEXCLAMATION "Incorrect password. Uninstall cancelled."
        Quit
    ${EndIf}
!macroend

; ── customUnInstall: stop/delete service after files are removed ─
!macro customUnInstall
    DetailPrint "Stopping daemon service..."
    nsExec::ExecToLog 'sc stop "SyncClassroomStudent"'
    nsExec::ExecToLog 'sc delete "SyncClassroomStudent"'
    nsExec::ExecToLog 'sc stop "LumeSyncStudent"'
    nsExec::ExecToLog 'sc delete "LumeSyncStudent"'
    DetailPrint "Cleaning up autostart entries..."
    ; 清理任务计划（如果有）
    nsExec::ExecToLog 'schtasks /delete /tn SyncClassroomStudentAutostart /f'
    nsExec::ExecToLog 'schtasks /delete /tn LumeSyncStudentAutostart /f'
    ; 清理注册表启动项（如果有）
    DeleteRegValue HKLM "SOFTWARE\Microsoft\Windows\CurrentVersion\Run" "SyncClassroomStudent"
    DeleteRegValue HKLM "SOFTWARE\Microsoft\Windows\CurrentVersion\Run" "LumeSyncStudent"
!macroend
