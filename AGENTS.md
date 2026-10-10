# LumeSync agent instructions

## Python environment

- Use Conda for Python projects. Prefer a project-owned `environment.yml` with an explicit environment name and Python version.
- Do not create `venv` or `.venv` unless the user explicitly requests one. If the target environment is not active, run Python commands with `conda run -n <environment> ...`.

## Client UI work

- For any UI design or UI code in `apps/teacher`, `apps/student`, `apps/editor`, `apps/classroom-hub/projector`, `docs-site`, or `website`, read [`docs/design/client-ui-standard.md`](docs/design/client-ui-standard.md) before changing the interface. Treat its **MUST** requirements as the project acceptance criteria. Product and accessibility behavior take precedence over a visual mockup.
- Use the semantic design tokens in `packages/ui-foundations/tokens.css`. Do not add a new unreviewed color, type scale, spacing scale, or interaction pattern to one client. Add or revise the standard and tokens together when a new case is justified.
- Preserve each client's platform conventions and task context. Apply the client-specific rules in the standard; do not mechanically copy one client's layout into another.
- For every UI change, describe the user task, screen states, keyboard/focus path, loading/error/recovery path, and viewport behavior. Inspect the result at the standard's required sizes and verify contrast, keyboard use, and reduced motion. If a legacy screen cannot yet comply, record the gap in `docs/design/ui-migration.md`; do not claim it complies.
- Do not silently restyle an unrelated legacy screen during a functional change. New screens and materially changed screens must meet the standard; existing screens migrate by the tracked plan.
