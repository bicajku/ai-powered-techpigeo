# Spark Exit - Phase 1 (Safe Foundation)

This phase introduces non-breaking migration primitives while keeping Spark as the default runtime.

## What was added

- New env flags in `src/lib/env-config.ts`:
  - `VITE_BACKEND_API_BASE_URL`
  - `VITE_USE_BACKEND_LLM`
  - `VITE_USE_BACKEND_STORAGE`
  - `VITE_USE_BACKEND_AUTH`
- New runtime adapter in `src/lib/platform-client.ts`:
  - `platformLlmPrompt(...)`
  - `platformLlm(...)`
  - `getPlatformKV()`

## What was migrated in code

- `src/lib/ngo-team.ts` now uses `getPlatformKV()` instead of direct `spark.kv`.
- `src/sentinel/api/db.ts` now uses `getPlatformKV()` for KV fallback.
- `src/lib/sentinel-query-pipeline.ts` now supports backend fallback provider (`backend`) when `VITE_USE_BACKEND_LLM=true`.

## Why this is safe

- All new flags are default-off.
- Spark runtime is still used when flags are off.
- No destructive schema or storage changes.
- Existing UI and module routes remain unchanged.

## Next step (Phase 2)

- Add backend endpoint `POST /api/llm/generate`.
- Enable `VITE_USE_BACKEND_LLM=true` in staging only.
- Validate module parity and response quality before production cutover.
