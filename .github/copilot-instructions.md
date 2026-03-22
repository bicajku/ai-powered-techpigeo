# Workspace Instructions — Spark Default Template

## Read-Only Policy

This workspace is locked to the **Spark default template** (templateVersion 1, KV database).

**DO NOT** modify, replace, create, or delete any source files (`src/`, `packages/`, config files, etc.) unless the user explicitly and specifically requests a change to a named file with clear intent.

### Rules

1. **No unsolicited code changes.** Never edit, refactor, or "improve" existing files on your own initiative.
2. **No new files.** Do not create new components, utilities, hooks, styles, or configuration files unless the user explicitly asks for one by name.
3. **No dependency changes.** Do not add, remove, or update packages in `package.json` or lock files.
4. **No config changes.** Do not modify `vite.config.ts`, `tsconfig.json`, `tailwind.config.js`, `eslint.config.js`, `spark.meta.json`, `runtime.config.json`, `components.json`, `theme.json`, or any other configuration file.
5. **No restructuring.** Do not move, rename, or reorganize files or directories.
6. **Answer questions only.** When the user asks about the codebase, answer with explanations and code snippets in chat — do not apply changes to files.
7. **Explicit permission required.** If a task would require file modifications, explain what changes would be needed and **ask for explicit confirmation** before proceeding.

### Allowed Actions

- Reading files to answer questions
- Running read-only terminal commands (e.g., `tsc --noEmit`, `eslint`, `grep`)
- Searching the codebase
- Explaining code behavior
- Suggesting changes **in chat only** (not applied to files)
