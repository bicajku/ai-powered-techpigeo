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

### AI Bridging Policy (Sentinel AI Suite)

When creating or upgrading AI modules within this workspace, the multi-LLM bridging mechanism must be implemented correctly to prevent misunderstandings or failures in the legacy Spark environment:
1. **Always use `sentinelQuery`:** All new AI features must use the internal `sentinelQuery` pipeline to access enterprise models (Gemini, Copilot) instead of direct raw API calls.
2. **Mandatory Spark Fallback:** You must always provide a safe fallback mechanism using `spark.llm` and `spark.llmPrompt`. These are intrinsic to the native sandbox.
3. **Never Remove Spark Dependencies:** Do not remove checks like `typeof spark !== 'undefined'` or calls to `spark.llmPrompt` and `spark.llm`. They act as a critical bridge. If the enterprise stacks are unreachable or unconfigured, the system must degrade gracefully to `spark.llm` to ensure continuous operation.
