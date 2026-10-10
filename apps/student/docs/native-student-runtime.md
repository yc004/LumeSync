# Native Student Runtime

This repository uses a native Windows runtime based on C++ and WebView2.

## Architecture

- `LumeSyncStudentShell.exe`: foreground Win32/WebView2 host.
- `LumeSyncStudentGuardSvc.exe`: Windows service that launches/restarts shell based on policy.
- `ui/student-host`: TypeScript local admin/offline pages compiled into `ui/student-host/dist`.
- `shared/protocol/student-host.ts`: browser bridge contract for host APIs.

## Build

```powershell
pnpm install
pnpm run build:host-ui
pnpm run build:native:configure
pnpm run build:native
pnpm run package:student-native
pnpm run package:student-native-installer
```

## Runtime Files

- Config: `%ProgramData%\LumeSync Student\config.json`
- State: `%ProgramData%\LumeSync Student\state.json`
- Logs: `%ProgramData%\LumeSync Student\logs\shell.log`, `service.log`
- Local pages: `ui/student-host/dist/admin.html`, `offline.html`
- Native package staging: `dist/student-native`
- Native installer: `dist/installer/LumeSync Student Native Setup 1.0.0.exe`

## Deployment

Run installer as administrator:

```powershell
dist\installer\LumeSync Student Native Setup 1.0.0.exe
```

The installer deploys shell, service, WebView2 loader, local UI assets, and registers the guard service.
