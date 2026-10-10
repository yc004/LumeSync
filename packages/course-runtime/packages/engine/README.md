# @lumesync/engine compatibility package

The browser render-engine source now lives in:

```text
src/browser/engine/
  runtime/
    globals.tsx
    sync-classroom.tsx
    resource-loader.tsx
    camera-manager.tsx
    app.tsx
  course-components/
    web-page-slide.tsx
    survey-slide.tsx
    vote-slide.tsx
```

This package directory is kept only for legacy package compatibility. New integrations should use `@lumesync/core/render-engine` and `getTeacherRenderEngineSources()`.

Teacher-only UI modules such as classroom view, course selector, settings panels, waiting rooms, and submissions browser are intentionally not part of core.
