; ============================================================
; SyncClassroom Student - Custom NSIS Script
; Password check via customUnInit (runs before file deletion).
; ============================================================

!include LogicLib.nsh

; ── Install: register Windows service + autostart registry ──
!macro customInstall
    DetailPrint "Registering student daemon service..."
    nsExec::ExecToLog '"$INSTDIR\SyncClassroom Student.exe" --register-service'
    DetailPrint "Adding autostart registry entry..."
    WriteRegStr HKLM "SOFTWARE\Microsoft\Windows\CurrentVersion\Run" "SyncClassroomStudent" '"$INSTDIR\SyncClassroom Student.exe"'
!macroend

; ── customUnInit: password check BEFORE any files are removed ─
!macro customUnInit
    ; Write VBScript to temp file to show InputBox
    FileOpen $R8 "$TEMP\sc_getpwd.vbs" w
    FileWrite $R8 'Dim pwd$\r$\n'
    FileWrite $R8 'pwd = InputBox("Enter admin password to uninstall SyncClassroom Student:", "SyncClassroom Student")$\r$\n'
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
!macroend

; ── customUnInstall: stop/delete service after files are removed ─
!macro customUnInstall
    DetailPrint "Stopping daemon service..."
    nsExec::ExecToLog 'sc stop "SyncClassroomStudent"'
    nsExec::ExecToLog 'sc delete "SyncClassroomStudent"'
    DetailPrint "Removing autostart registry entry..."
    DeleteRegValue HKLM "SOFTWARE\Microsoft\Windows\CurrentVersion\Run" "SyncClassroomStudent"
!macroend
