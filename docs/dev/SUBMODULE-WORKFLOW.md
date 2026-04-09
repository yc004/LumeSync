# Submodule Workflow

## Goal

Keep local workspace structure and cloud structure aligned without export/sync scripts.

## Layout

- `repos/core`
- `repos/teacher`
- `repos/student`
- `repos/editor-plugin`

Each folder is a real Git repository (submodule), linked to its GitHub remote.

## Clone

```bash
git clone --recurse-submodules https://github.com/yc004/SyncClassroom.git
cd SyncClassroom
git submodule update --init --recursive
```

## Daily Development

1. Enter target repo: `cd repos/<name>`
2. Commit and push directly in that repo.
3. Optional: update root submodule pointers and push root repo.

## Update Submodules

```bash
git submodule update --remote --merge --recursive
```
