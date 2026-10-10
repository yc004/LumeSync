Unicode true
RequestExecutionLevel admin

!include LogicLib.nsh
!include nsDialogs.nsh
!include WinMessages.nsh

!ifndef SOURCE_DIR
  !error "SOURCE_DIR is required"
!endif

!ifndef OUTPUT_FILE
  !define OUTPUT_FILE "LumeSync Teacher Native Setup.exe"
!endif

!define APP_NAME "LumeSync Teacher"
!define APP_PUBLISHER "LumeSync"
!define APP_EXE "LumeSyncTeacherShell.exe"
!define REG_UNINSTALL "Software\Microsoft\Windows\CurrentVersion\Uninstall\LumeSyncTeacherNative"

Name "${APP_NAME}"
OutFile "${OUTPUT_FILE}"
Caption "${APP_NAME} Installer"
InstallDir "$PROGRAMFILES64\LumeSync Teacher"
InstallDirRegKey HKLM "${REG_UNINSTALL}" "InstallLocation"
BrandingText " "
XPStyle on
ManifestDPIAware true
AutoCloseWindow true
ShowInstDetails nevershow
ShowUninstDetails show

Icon "icon-teacher.ico"
UninstallIcon "icon-teacher.ico"

Page custom ModernWelcomeCreate ModernWelcomeLeave
Page custom ModernDirectoryCreate ModernDirectoryLeave
Page instfiles
Page custom ModernFinishCreate ModernFinishLeave
UninstPage uninstConfirm
UninstPage instfiles
LoadLanguageFile "${NSISDIR}\Contrib\Language files\SimpChinese.nlf"

Var UiDialog
Var UiTitleFont
Var UiSubtitleFont
Var UiBodyFont
Var UiDirInput
Var UiBrowseButton
Var UiLaunchCheckbox

Function .onInit
  CreateFont $UiTitleFont "Segoe UI Semibold" 15 700
  CreateFont $UiSubtitleFont "Segoe UI" 11 500
  CreateFont $UiBodyFont "Segoe UI" 9 400
FunctionEnd

Function ModernWelcomeCreate
  nsDialogs::Create 1018
  Pop $UiDialog
  ${If} $UiDialog == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 0 0u 100% 100% ""
  Pop $0
  SetCtlColors $0 0x20263B 0x20263B

  ${NSD_CreateLabel} 14u 14u 220u 16u "LumeSync Teacher"
  Pop $1
  SendMessage $1 ${WM_SETFONT} $UiTitleFont 1
  SetCtlColors $1 0xFFFFFF 0x20263B

  ${NSD_CreateLabel} 14u 33u 220u 12u "Modern Classroom Console"
  Pop $2
  SendMessage $2 ${WM_SETFONT} $UiSubtitleFont 1
  SetCtlColors $2 0x9FB6FF 0x20263B

  ${NSD_CreateLabel} 14u 56u 220u 10u "- Fast launch for teacher desktop shell"
  Pop $3
  SendMessage $3 ${WM_SETFONT} $UiBodyFont 1
  SetCtlColors $3 0xE8ECFF 0x20263B

  ${NSD_CreateLabel} 14u 68u 220u 10u "- Automatic desktop and Start Menu shortcuts"
  Pop $4
  SendMessage $4 ${WM_SETFONT} $UiBodyFont 1
  SetCtlColors $4 0xE8ECFF 0x20263B

  ${NSD_CreateLabel} 14u 80u 220u 10u "- Safe cleanup of previous installations"
  Pop $5
  SendMessage $5 ${WM_SETFONT} $UiBodyFont 1
  SetCtlColors $5 0xE8ECFF 0x20263B

  ${NSD_CreateLabel} 14u 100u 220u 20u "Click Continue to select target path."
  Pop $6
  SendMessage $6 ${WM_SETFONT} $UiBodyFont 1
  SetCtlColors $6 0xD4DBFF 0x20263B

  GetDlgItem $7 $HWNDPARENT 1
  SendMessage $7 ${WM_SETTEXT} 0 "STR:Continue >"

  nsDialogs::Show
FunctionEnd

Function ModernWelcomeLeave
FunctionEnd

Function ModernDirectoryCreate
  nsDialogs::Create 1018
  Pop $UiDialog
  ${If} $UiDialog == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 0 0u 100% 100% ""
  Pop $0
  SetCtlColors $0 0x111827 0x111827

  ${NSD_CreateLabel} 14u 14u 230u 16u "Choose Installation Location"
  Pop $1
  SendMessage $1 ${WM_SETFONT} $UiTitleFont 1
  SetCtlColors $1 0xFFFFFF 0x111827

  ${NSD_CreateLabel} 14u 36u 250u 11u "Default path is recommended for system stability."
  Pop $2
  SendMessage $2 ${WM_SETFONT} $UiBodyFont 1
  SetCtlColors $2 0xC7D2FE 0x111827

  ${NSD_CreateLabel} 14u 58u 180u 10u "Install to:"
  Pop $3
  SendMessage $3 ${WM_SETFONT} $UiBodyFont 1
  SetCtlColors $3 0xE5E7EB 0x111827

  ${NSD_CreateText} 14u 70u 210u 12u "$INSTDIR"
  Pop $UiDirInput
  SendMessage $UiDirInput ${WM_SETFONT} $UiBodyFont 1

  ${NSD_CreateButton} 228u 70u 54u 12u "Browse..."
  Pop $UiBrowseButton
  SendMessage $UiBrowseButton ${WM_SETFONT} $UiBodyFont 1
  ${NSD_OnClick} $UiBrowseButton ModernDirectoryBrowse

  ${NSD_CreateLabel} 14u 92u 260u 28u "Installer will close running teacher processes and perform a clean update."
  Pop $4
  SendMessage $4 ${WM_SETFONT} $UiBodyFont 1
  SetCtlColors $4 0xD1D5DB 0x111827

  GetDlgItem $5 $HWNDPARENT 1
  SendMessage $5 ${WM_SETTEXT} 0 "STR:Install"

  nsDialogs::Show
FunctionEnd

Function ModernDirectoryBrowse
  nsDialogs::SelectFolderDialog "Select install folder" "$INSTDIR"
  Pop $0
  ${If} $0 != error
    StrCpy $INSTDIR $0
    ${NSD_SetText} $UiDirInput "$INSTDIR"
  ${EndIf}
FunctionEnd

Function ModernDirectoryLeave
  ${NSD_GetText} $UiDirInput $0
  StrCpy $INSTDIR $0
  ${If} $INSTDIR == ""
    MessageBox MB_ICONEXCLAMATION|MB_OK "Please select a valid install path."
    Abort
  ${EndIf}
FunctionEnd

Function ModernFinishCreate
  nsDialogs::Create 1018
  Pop $UiDialog
  ${If} $UiDialog == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 0 0u 100% 100% ""
  Pop $0
  SetCtlColors $0 0x1D2742 0x1D2742

  ${NSD_CreateLabel} 14u 20u 220u 16u "Setup Complete"
  Pop $1
  SendMessage $1 ${WM_SETFONT} $UiTitleFont 1
  SetCtlColors $1 0xFFFFFF 0x1D2742

  ${NSD_CreateLabel} 14u 44u 250u 11u "LumeSync Teacher has been installed successfully."
  Pop $2
  SendMessage $2 ${WM_SETFONT} $UiBodyFont 1
  SetCtlColors $2 0xDCE4FF 0x1D2742

  ${NSD_CreateLabel} 14u 60u 250u 11u "You can launch it from Desktop or Start Menu."
  Pop $3
  SendMessage $3 ${WM_SETFONT} $UiBodyFont 1
  SetCtlColors $3 0xDCE4FF 0x1D2742

  ${NSD_CreateCheckbox} 14u 84u 210u 10u "Launch LumeSync Teacher now"
  Pop $UiLaunchCheckbox
  SendMessage $UiLaunchCheckbox ${WM_SETFONT} $UiBodyFont 1
  ${NSD_Check} $UiLaunchCheckbox

  GetDlgItem $4 $HWNDPARENT 3
  EnableWindow $4 0
  ShowWindow $4 ${SW_HIDE}

  GetDlgItem $5 $HWNDPARENT 2
  EnableWindow $5 0
  ShowWindow $5 ${SW_HIDE}

  GetDlgItem $6 $HWNDPARENT 1
  SendMessage $6 ${WM_SETTEXT} 0 "STR:Done"

  nsDialogs::Show
FunctionEnd

Function ModernFinishLeave
  ${NSD_GetState} $UiLaunchCheckbox $0
  ${If} $0 == ${BST_CHECKED}
    ExecShell "" "$INSTDIR\${APP_EXE}"
  ${EndIf}
FunctionEnd

Section "Install" SecInstall
  SetShellVarContext all

  DetailPrint "Stopping running teacher processes..."
  nsExec::ExecToLog 'taskkill.exe /F /T /IM "${APP_EXE}"'
  nsExec::ExecToLog 'taskkill.exe /F /T /IM "LumeSync Teacher.exe"'
  Sleep 1000

  ${If} ${FileExists} "$INSTDIR"
    DetailPrint "Preparing existing installation directory..."
    nsExec::ExecToLog 'takeown.exe /F "$INSTDIR" /R /D Y'
    nsExec::ExecToLog 'icacls.exe "$INSTDIR" /setowner *S-1-5-32-544 /T /C'
    nsExec::ExecToLog 'icacls.exe "$INSTDIR" /inheritance:e /grant:r *S-1-5-18:(OI)(CI)F *S-1-5-32-544:(OI)(CI)F *S-1-1-0:(OI)(CI)RX /T /C'
    nsExec::ExecToLog 'attrib.exe -R -S -H "$INSTDIR\*" /S /D'
    RMDir /r /REBOOTOK "$INSTDIR\server"
    RMDir /r /REBOOTOK "$INSTDIR\public"
    RMDir /r /REBOOTOK "$INSTDIR\shared"
    RMDir /r /REBOOTOK "$INSTDIR\packages"
    RMDir /r /REBOOTOK "$INSTDIR\core"
    RMDir /r /REBOOTOK "$INSTDIR\node_modules"
    RMDir /r /REBOOTOK "$INSTDIR\common"
    Delete /REBOOTOK "$INSTDIR\node.exe"
    Delete /REBOOTOK "$INSTDIR\Uninstall.exe"
    Delete /REBOOTOK "$INSTDIR\${APP_EXE}"
    Delete /REBOOTOK "$INSTDIR\WebView2Loader.dll"
  ${EndIf}

  DetailPrint "Installing files..."
  SetOverwrite on
  SetOutPath "$INSTDIR"
  File /r "${SOURCE_DIR}\*.*"

  DetailPrint "Preparing shared configuration directory..."
  CreateDirectory "$COMMONFILES\LumeSync Teacher"
  CreateDirectory "$COMMONFILES\LumeSync Teacher\logs"
  CreateDirectory "$COMMONFILES\LumeSync Teacher\webview2"

  DetailPrint "Writing uninstaller..."
  WriteUninstaller "$INSTDIR\Uninstall.exe"

  DetailPrint "Creating shortcuts..."
  CreateDirectory "$SMPROGRAMS\LumeSync"
  CreateShortCut "$SMPROGRAMS\LumeSync\LumeSync Teacher.lnk" "$INSTDIR\${APP_EXE}"
  CreateShortCut "$DESKTOP\LumeSync Teacher.lnk" "$INSTDIR\${APP_EXE}"

  DetailPrint "Writing uninstall registry keys..."
  WriteRegStr HKLM "${REG_UNINSTALL}" "DisplayName" "${APP_NAME}"
  WriteRegStr HKLM "${REG_UNINSTALL}" "DisplayVersion" "1.0.0"
  WriteRegStr HKLM "${REG_UNINSTALL}" "Publisher" "${APP_PUBLISHER}"
  WriteRegStr HKLM "${REG_UNINSTALL}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKLM "${REG_UNINSTALL}" "DisplayIcon" "$INSTDIR\${APP_EXE}"
  WriteRegStr HKLM "${REG_UNINSTALL}" "UninstallString" '"$INSTDIR\Uninstall.exe"'
  WriteRegDWORD HKLM "${REG_UNINSTALL}" "NoModify" 1
  WriteRegDWORD HKLM "${REG_UNINSTALL}" "NoRepair" 1
SectionEnd

Section "Uninstall"
  SetShellVarContext all

  DetailPrint "Stopping teacher process..."
  nsExec::ExecToLog 'taskkill.exe /F /T /IM "${APP_EXE}"'

  DetailPrint "Removing shortcuts..."
  Delete "$SMPROGRAMS\LumeSync\LumeSync Teacher.lnk"
  Delete "$DESKTOP\LumeSync Teacher.lnk"
  RMDir "$SMPROGRAMS\LumeSync"

  DetailPrint "Removing application files..."
  RMDir /r "$INSTDIR"

  DetailPrint "Removing registry keys..."
  DeleteRegKey HKLM "${REG_UNINSTALL}"
SectionEnd
