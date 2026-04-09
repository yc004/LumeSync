# @lumesync/server (Core Runtime)

This package is the **core runtime service** only:

- Socket session/control event bus
- Runtime classroom state sync
- Render engine static hosting

It does **not** manage courses/files/layout/submissions.

## Start

```bash
node packages/server/index.js
```

## API

- `GET /api/health`
- `GET /api/runtime-status`
- `GET /api/students`
- `GET /api/student-log`

Deprecated core data-plane routes return `410 Gone`:

- `/api/courses`
- `/api/course-status`
- `/api/refresh-courses`
- `/api/components-manifest`

Use teacher service data-plane APIs instead (`/api/teacher/*`).

## Env

- `PORT`: server port, default `3000`
- `LUMESYNC_ENGINE_SRC_DIR`: override engine source static directory
