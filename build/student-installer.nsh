; ============================================================
; SyncClassroom Student - Custom NSIS Script
; Password verification via MUI_CUSTOMFUNCTION_UNGUIINIT hook.
; ============================================================

!include LogicLib.nsh

; ── Install: register Windows service ───────────────────────
!macro customInstall
    DetailPrint "Registering student daemon service..."
    nsExec::ExecToLog '"$INSTDIR\SyncClassroom Student.exe" --register-service'
!macroend

; ── customUnInstall: stop/delete service after files are removed ─
!macro customUnInstall
    DetailPrint "Stopping daemon service..."
    nsExec::ExecToLog 'sc stop "SyncClassroomStudent"'
    nsExec::ExecToLog 'sc delete "SyncClassroomStudent"'
!macroend

; ── Define custom function for MUI uninstaller GUI init ─
!ifdef BUILD_UNINSTALLER

!define MUI_CUSTOMFUNCTION_UNGUIINIT un.PasswordCheck

Function un.PasswordCheck
    ; Write VBScript to show password InputBox
    FileOpen $R8 "$TEMP\sc_getpwd.vbs" w
    FileWrite $R8 'Dim pwd$\r$\npwd = InputBox("Enter admin password to uninstall SyncClassroom Student:", "SyncClassroom Student")$\r$\nIf pwd = "" Then WScript.Quit 1$\r$\nSet fso = CreateObject("Scripting.FileSystemObject")$\r$\nSet f = fso.OpenTextFile("$TEMP\sc_pwd.tmp", 2, True)$\r$\nf.Write pwd$\r$\nf.Close$\r$\nWScript.Quit 0'
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
        Quit
    ${EndIf}
FunctionEnd

!endif
