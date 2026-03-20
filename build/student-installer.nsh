; ============================================================
; SyncClassroom Student - Custom NSIS Script
; Requires admin password to uninstall.
; ============================================================

!include LogicLib.nsh
!include nsDialogs.nsh

; ── Install: register Windows service ───────────────────────
!macro customInstall
    DetailPrint "Registering student daemon service..."
    nsExec::ExecToLog '"$INSTDIR\SyncClassroom Student.exe" --register-service'
!macroend

; ── Uninstall: password verification then stop/delete service ─
Var un.dlg
Var un.pwdField
Var un.enteredPwd
Var un.verifyResult

!macro customUnInstall
    nsDialogs::Create 1018
    Pop $un.dlg
    ${If} $un.dlg == error
        MessageBox MB_OK|MB_ICONSTOP "Cannot create uninstall dialog."
        Abort
    ${EndIf}

    ${NSD_CreateLabel} 0 0 100% 24u "Enter admin password to uninstall SyncClassroom Student:"
    Pop $0

    ${NSD_CreatePassword} 0 28u 100% 14u ""
    Pop $un.pwdField

    ${NSD_CreateButton} 0 48u 45% 14u "Uninstall"
    Pop $0

    ${NSD_CreateButton} 55% 48u 45% 14u "Cancel"
    Pop $0
    GetFunctionAddress $1 un.CancelUninstallSC
    nsDialogs::OnClick $0 $1

    nsDialogs::Show

    ${NSD_GetText} $un.pwdField $un.enteredPwd

    StrCpy $un.verifyResult "1"
    ${If} ${FileExists} "$INSTDIR\resources\verify-password.exe"
        FileOpen $R3 "$TEMP\sc_pwd.tmp" w
        FileWrite $R3 $un.enteredPwd
        FileClose $R3
        ExecWait '"$INSTDIR\resources\verify-password.exe" --file "$TEMP\sc_pwd.tmp" --config "$APPDATA\SyncClassroom Student\config.json"' $un.verifyResult
        Delete "$TEMP\sc_pwd.tmp"
    ${Else}
        ${If} $un.enteredPwd == "admin123"
            StrCpy $un.verifyResult "0"
        ${EndIf}
    ${EndIf}

    ${If} $un.verifyResult != "0"
        MessageBox MB_OK|MB_ICONEXCLAMATION "Incorrect password. Uninstall cancelled."
        Abort
    ${EndIf}

    DetailPrint "Stopping daemon service..."
    nsExec::ExecToLog 'sc stop "SyncClassroomStudent"'
    nsExec::ExecToLog 'sc delete "SyncClassroomStudent"'
!macroend

; Guard with BUILD_UNINSTALLER so this function only exists in the
; uninstaller pass — prevents warning 6020 in the installer pass.
!ifdef BUILD_UNINSTALLER
Function un.CancelUninstallSC
    SendMessage $un.dlg ${WM_CLOSE} 0 0
FunctionEnd
!endif
