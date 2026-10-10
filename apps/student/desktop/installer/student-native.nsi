Unicode true
RequestExecutionLevel admin

!include MUI2.nsh
!include LogicLib.nsh

!ifndef SOURCE_DIR
  !error "SOURCE_DIR is required"
!endif

!ifndef OUTPUT_FILE
  !define OUTPUT_FILE "LumeSync Student Native Setup.exe"
!endif

!define APP_NAME "LumeSync Student"
!define APP_PUBLISHER "LumeSync"
!define APP_EXE "LumeSyncStudentShell.exe"
!define SERVICE_EXE "LumeSyncStudentGuardSvc.exe"
!define SERVICE_NAME "LumeSyncStudentGuard"
!define REG_UNINSTALL "Software\Microsoft\Windows\CurrentVersion\Uninstall\LumeSyncStudentNative"

Name "${APP_NAME}"
OutFile "${OUTPUT_FILE}"
InstallDir "$PROGRAMFILES64\LumeSync Student"
InstallDirRegKey HKLM "${REG_UNINSTALL}" "InstallLocation"
BrandingText "LumeSync Student"
ShowInstDetails show
ShowUninstDetails show

!define MUI_ICON "..\..\shared\build\icon-student.ico"
!define MUI_UNICON "..\..\shared\build\icon-student.ico"
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "SimpChinese"

Function un.onInit
  SetShellVarContext all

  FileOpen $R8 "$TEMP\lumesync_getpwd.vbs" w
  FileWrite $R8 'Dim pwd$\r$\n'
  FileWrite $R8 'pwd = InputBox("Enter admin password to uninstall LumeSync Student:", "LumeSync Student")$\r$\n'
  FileWrite $R8 'If pwd = "" Then WScript.Quit 1$\r$\n'
  FileWrite $R8 'Set fso = CreateObject("Scripting.FileSystemObject")$\r$\n'
  FileWrite $R8 'Set f = fso.OpenTextFile("$TEMP\lumesync_uninstall_pwd.tmp", 2, True)$\r$\n'
  FileWrite $R8 'f.Write pwd$\r$\n'
  FileWrite $R8 'f.Close$\r$\n'
  FileWrite $R8 'WScript.Quit 0'
  FileClose $R8

  ExecWait 'wscript.exe //NoLogo "$TEMP\lumesync_getpwd.vbs"' $R7
  Delete "$TEMP\lumesync_getpwd.vbs"

  ${If} $R7 != 0
    Delete "$TEMP\lumesync_uninstall_pwd.tmp"
    Abort
  ${EndIf}

  StrCpy $R6 "1"
  ${If} ${FileExists} "$INSTDIR\verify-password.exe"
    ExecWait '"$INSTDIR\verify-password.exe" --file "$TEMP\lumesync_uninstall_pwd.tmp" --config "$APPDATA\LumeSync Student\config.json"' $R6
  ${Else}
    FileOpen $R5 "$TEMP\lumesync_uninstall_pwd.tmp" r
    FileRead $R5 $R0
    FileClose $R5
    ${If} $R0 == "admin123"
      StrCpy $R6 "0"
    ${EndIf}
  ${EndIf}

  Delete "$TEMP\lumesync_uninstall_pwd.tmp"

  ${If} $R6 != "0"
    MessageBox MB_OK|MB_ICONEXCLAMATION "Incorrect admin password. Uninstall cancelled."
    Abort
  ${EndIf}
FunctionEnd

Section "Install" SecInstall
  SetShellVarContext all

  DetailPrint "Stopping old student service..."
  nsExec::ExecToLog 'sc.exe failureflag "${SERVICE_NAME}" 0'
  nsExec::ExecToLog 'sc.exe failure "${SERVICE_NAME}" reset= 0 actions= ""'
  nsExec::ExecToLog 'sc.exe config "${SERVICE_NAME}" start= disabled'
  nsExec::ExecToLog 'sc.exe stop "${SERVICE_NAME}"'
  nsExec::ExecToLog 'sc.exe stop "LumeSyncStudent"'
  nsExec::ExecToLog 'sc.exe stop "SyncClassroomStudent"'
  Sleep 1500

  DetailPrint "Stopping running student processes..."
  nsExec::ExecToLog 'taskkill.exe /F /T /FI "SERVICES eq ${SERVICE_NAME}"'
  nsExec::ExecToLog 'taskkill.exe /F /T /IM "${APP_EXE}"'
  nsExec::ExecToLog 'taskkill.exe /F /T /IM "${SERVICE_EXE}"'
  nsExec::ExecToLog 'taskkill.exe /F /T /IM "LumeSync Student.exe"'
  Sleep 1500
  nsExec::ExecToLog 'taskkill.exe /F /T /FI "SERVICES eq ${SERVICE_NAME}"'
  nsExec::ExecToLog 'taskkill.exe /F /T /IM "${APP_EXE}"'
  nsExec::ExecToLog 'taskkill.exe /F /T /IM "${SERVICE_EXE}"'
  nsExec::ExecToLog 'taskkill.exe /F /T /IM "LumeSync Student.exe"'
  Sleep 1000

  DetailPrint "Deleting old student services..."
  nsExec::ExecToLog 'sc.exe delete "${SERVICE_NAME}"'
  nsExec::ExecToLog 'sc.exe delete "LumeSyncStudent"'
  nsExec::ExecToLog 'sc.exe delete "SyncClassroomStudent"'

  ${If} ${FileExists} "$INSTDIR"
    DetailPrint "Preparing existing installation directory..."
    nsExec::ExecToLog 'takeown.exe /F "$INSTDIR" /R /D Y'
    nsExec::ExecToLog 'takeown.exe /F "$INSTDIR\ui" /R /D Y'
    nsExec::ExecToLog 'icacls.exe "$INSTDIR" /setowner *S-1-5-32-544 /T /C'
    nsExec::ExecToLog 'icacls.exe "$INSTDIR" /inheritance:e /grant:r *S-1-5-18:(OI)(CI)F *S-1-5-32-544:(OI)(CI)F *S-1-1-0:(OI)(CI)RX /T /C'
    nsExec::ExecToLog 'icacls.exe "$INSTDIR\ui" /inheritance:e /grant:r *S-1-5-18:(OI)(CI)F *S-1-5-32-544:(OI)(CI)F *S-1-1-0:(OI)(CI)RX /T /C'
    nsExec::ExecToLog 'attrib.exe -R -S -H "$INSTDIR\*" /S /D'
    RMDir /r /REBOOTOK "$INSTDIR\ui"
    Delete /REBOOTOK "$INSTDIR\${APP_EXE}"
    Delete /REBOOTOK "$INSTDIR\${SERVICE_EXE}"
    Delete /REBOOTOK "$INSTDIR\WebView2Loader.dll"
    Delete /REBOOTOK "$INSTDIR\verify-password.exe"
  ${EndIf}

  DetailPrint "Installing files..."
  SetOverwrite on
  SetOutPath "$INSTDIR"
  File /r "${SOURCE_DIR}\*.*"

  DetailPrint "Hardening installation directory permissions..."
  nsExec::ExecToLog 'icacls.exe "$INSTDIR" /reset /T /C'
  nsExec::ExecToLog 'icacls.exe "$INSTDIR" /inheritance:e /T /C'
  nsExec::ExecToLog 'icacls.exe "$INSTDIR" /remove:g *S-1-5-32-545 *S-1-5-11 *S-1-5-4 *S-1-1-0 /T /C'
  nsExec::ExecToLog 'icacls.exe "$INSTDIR" /grant:r *S-1-5-18:(OI)(CI)F *S-1-5-32-544:(OI)(CI)F *S-1-5-32-545:(OI)(CI)RX *S-1-5-11:(OI)(CI)RX *S-1-5-4:(OI)(CI)RX *S-1-1-0:(OI)(CI)RX /T /C'
  nsExec::ExecToLog 'icacls.exe "$INSTDIR\${APP_EXE}" /grant:r *S-1-5-32-545:RX *S-1-5-11:RX *S-1-5-4:RX *S-1-1-0:RX /C'
  nsExec::ExecToLog 'icacls.exe "$INSTDIR\${SERVICE_EXE}" /grant:r *S-1-5-32-545:RX *S-1-5-11:RX *S-1-5-4:RX *S-1-1-0:RX /C'
  nsExec::ExecToLog 'icacls.exe "$INSTDIR\WebView2Loader.dll" /grant:r *S-1-5-32-545:R *S-1-5-11:R *S-1-5-4:R *S-1-1-0:R /C'

  DetailPrint "Preparing shared configuration directory..."
  CreateDirectory "$APPDATA\LumeSync Student"
  CreateDirectory "$APPDATA\LumeSync Student\logs"
  CreateDirectory "$APPDATA\LumeSync Student\webview2"
  nsExec::ExecToLog 'icacls.exe "$APPDATA\LumeSync Student" /grant *S-1-5-32-545:(OI)(CI)M /T /C'

  DetailPrint "Writing uninstaller..."
  WriteUninstaller "$INSTDIR\Uninstall.exe"

  DetailPrint "Creating shortcuts..."
  CreateDirectory "$SMPROGRAMS\LumeSync"
  CreateShortCut "$SMPROGRAMS\LumeSync\LumeSync Student.lnk" "$INSTDIR\${APP_EXE}"
  CreateShortCut "$SMPROGRAMS\LumeSync\LumeSync Student Admin.lnk" "$INSTDIR\${APP_EXE}" "--admin-window"

  DetailPrint "Registering guard service..."
  nsExec::ExecToLog 'sc.exe create "${SERVICE_NAME}" binPath= "\"$INSTDIR\${SERVICE_EXE}\"" start= auto DisplayName= "LumeSync Student Guard Service"'
  nsExec::ExecToLog 'sc.exe description "${SERVICE_NAME}" "Keeps the LumeSync student shell running on managed classroom devices."'
  nsExec::ExecToLog 'sc.exe failure "${SERVICE_NAME}" reset= 86400 actions= restart/1000/restart/3000/restart/5000'
  nsExec::ExecToLog 'sc.exe failureflag "${SERVICE_NAME}" 1'
  nsExec::ExecToLog 'sc.exe config "${SERVICE_NAME}" start= delayed-auto'
  nsExec::ExecToLog 'sc.exe sdset "${SERVICE_NAME}" D:(A;;CCLCSWRPWPDTLOCRRC;;;SY)(A;;CCLCSWRPWPDTLOCRRC;;;BA)(A;;CCLCSWLOCRRC;;;AU)S:(AU;FA;CCDCLCSWRPWPDTLOCRSDRCWDWO;;;WD)'
  nsExec::ExecToLog 'sc.exe start "${SERVICE_NAME}"'

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

  DetailPrint "Stopping guard service..."
  nsExec::ExecToLog 'sc.exe stop "${SERVICE_NAME}"'
  nsExec::ExecToLog 'sc.exe delete "${SERVICE_NAME}"'

  DetailPrint "Removing shortcuts..."
  Delete "$SMPROGRAMS\LumeSync\LumeSync Student.lnk"
  Delete "$SMPROGRAMS\LumeSync\LumeSync Student Admin.lnk"
  RMDir "$SMPROGRAMS\LumeSync"

  DetailPrint "Removing application files..."
  RMDir /r "$INSTDIR"

  DetailPrint "Removing registry keys..."
  DeleteRegKey HKLM "${REG_UNINSTALL}"
SectionEnd
