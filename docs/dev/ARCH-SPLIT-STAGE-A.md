# Stage A Migration Status (Monorepo)

This repository now uses a **teacher-owned content model**:

- `repos/teacher` is the source of truth for course/files/layout/submissions APIs.
- `repos/core` is reduced to **core runtime** (socket/session control + render runtime only).
- `repos/core` contains runtime control and render engine integration.

## Run

```bash
cd repos/core && npm start
cd repos/teacher && npm run start
cd repos/student && npm run start
```

## API ownership

- Teacher data plane: `/api/*` and `/api/teacher/*` from `repos/teacher`.
- Core runtime control plane: health/runtime status + socket runtime in `repos/core`.

## Notes

- Core no longer scans courses, manages folders, or writes submission/layout files.
- Student clients should connect to teacher-hosted runtime endpoint.
- Deprecated core data-plane routes now return `410 Gone` and no longer provide shim data.
- Split/export workflow has been archived in `docs/dev/REPO-SPLIT-GUIDE.md`.
- Root `electron/` legacy entry directory has been removed; use submodule app entries under `repos/teacher` and `repos/student`.
- Active cross-repo collaboration workflow is now `git submodule` based; see `docs/dev/SUBMODULE-WORKFLOW.md`.
