; ============================================================
; SyncClassroom Student - Custom NSIS Script
; Requires admin password to uninstall.
; Uses only electron-builder supported macro hooks.
; ============================================================

!include LogicLib.nsh
!include nsDialogs.nsh

; ── Install: register Windows service ───────────────────────
!macro customInstall
    DetailPrint "Registering student daemon service..."
    nsExec::ExecToLog '"$INSTDIR\SyncClassroom Student.exe" --register-service'
!macroend

; ── Uninstall: password verification then stop/delete service ─
Var dlg
Var pwdField
Var enteredPwd
Var verifyResult

!macro customUnInstall
    ; --- Build password dialog ---
    nsDialogs::Create 1018
    Pop $dlg
    ${If} $dlg == error
        MessageBox MB_OK|MB_ICONSTOP "Cannot create uninstall dialog."
        Abort
    ${EndIf}

    ${NSD_CreateLabel} 0 0 100% 24u "Admin password required to uninstall SyncClassroom Student:"
    Pop $0

    ${NSD_CreatePassword} 0 28u 100% 14u ""
    Pop $pwdField

    ${NSD_CreateButton} 0 48u 45% 14u "Uninstall"
    Pop $0
    ; default button — dialog will close on click via Show return

    ${NSD_CreateButton} 55% 48u 45% 14u "Cancel"
    Pop $0
    GetFunctionAddress $1 _sc_CancelUninstall
    nsDialogs::OnClick $0 $1

    nsDialogs::Show

    ; --- Read entered password ---
    ${NSD_GetText} $pwdField $enteredPwd

    ; --- Verify via verify-password.exe if present ---
    StrCpy $verifyResult "1"
    ${If} ${FileExists} "$INSTDIR\resources\verify-password.exe"
        ; Write password to temp file to avoid command-line exposure
        FileOpen $R3 "$TEMP\sc_pwd.tmp" w
        FileWrite $R3 $enteredPwd
        FileClose $R3
        ExecWait '"$INSTDIR\resources\verify-password.exe" --file "$TEMP\sc_pwd.tmp" --config "$APPDATA\SyncClassroom Student\config.json"' $verifyResult
        Delete "$TEMP\sc_pwd.tmp"
    ${Else}
        ; Fallback: compare against default password
        ${If} $enteredPwd == "admin123"
            StrCpy $verifyResult "0"
        ${EndIf}
    ${EndIf}

    ${If} $verifyResult != "0"
        MessageBox MB_OK|MB_ICONEXCLAMATION "Incorrect password. Uninstall cancelled."
        Abort
    ${EndIf}

    ; --- Stop and remove service ---
    DetailPrint "Stopping daemon service..."
    nsExec::ExecToLog 'sc stop "SyncClassroomStudent"'
    nsExec::ExecToLog 'sc delete "SyncClassroomStudent"'
!macroend

Function _sc_CancelUninstall
    SendMessage $dlg ${WM_CLOSE} 0 0
FunctionEnd
