; ============================================================
; SyncClassroom Student - Custom NSIS Script
; Requires admin password to uninstall.
; ============================================================

!include LogicLib.nsh

; ── Install: register Windows service ───────────────────────
!macro customInstall
    DetailPrint "Registering student daemon service..."
    nsExec::ExecToLog '"$INSTDIR\SyncClassroom Student.exe" --register-service'
!macroend

; ── Uninstall: password verification then stop/delete service ─
!macro customUnInstall
    ; Write a VBScript that shows a password InputBox and saves result to temp file
    FileOpen $R8 "$TEMP\sc_getpwd.vbs" w
    FileWrite $R8 "Dim pwd"
    FileWriteByte $R8 "13"
    FileWriteByte $R8 "10"
    FileWrite $R8 "pwd = InputBox(""Enter admin password to uninstall SyncClassroom Student:"", ""SyncClassroom Student"")"
    FileWriteByte $R8 "13"
    FileWriteByte $R8 "10"
    FileWrite $R8 "If pwd = """" Then WScript.Quit 1"
    FileWriteByte $R8 "13"
    FileWriteByte $R8 "10"
    FileWrite $R8 "Set fso = CreateObject(""Scripting.FileSystemObject"")"
    FileWriteByte $R8 "13"
    FileWriteByte $R8 "10"
    FileWrite $R8 "Set f = fso.OpenTextFile(""$TEMP\sc_pwd.tmp"", 2, True)"
    FileWriteByte $R8 "13"
    FileWriteByte $R8 "10"
    FileWrite $R8 "f.Write pwd"
    FileWriteByte $R8 "13"
    FileWriteByte $R8 "10"
    FileWrite $R8 "f.Close"
    FileWriteByte $R8 "13"
    FileWriteByte $R8 "10"
    FileWrite $R8 "WScript.Quit 0"
    FileClose $R8

    ExecWait 'wscript.exe //NoLogo "$TEMP\sc_getpwd.vbs"' $R7
    Delete "$TEMP\sc_getpwd.vbs"

    ${If} $R7 != 0
        Delete "$TEMP\sc_pwd.tmp"
        Abort
    ${EndIf}

    ; Verify password
    StrCpy $R6 "1"
    ${If} ${FileExists} "$INSTDIR\resources\verify-password.exe"
        ExecWait '"$INSTDIR\resources\verify-password.exe" --file "$TEMP\sc_pwd.tmp" --config "$APPDATA\SyncClassroom Student\config.json"' $R6
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
        Abort
    ${EndIf}

    DetailPrint "Stopping daemon service..."
    nsExec::ExecToLog 'sc stop "SyncClassroomStudent"'
    nsExec::ExecToLog 'sc delete "SyncClassroomStudent"'
!macroend
