# Spark Exit - Phase 3.1 (Provider Status + Admin Visibility)

This slice hardens backend operations by exposing non-secret provider diagnostics and surfacing them in Admin UI.

## Phase 3.2 auth guard

- Backend now supports optional API key auth guard for:
  - `POST /api/llm/generate`
  - `GET /api/providers/status`
- Backend envs:
  - `BACKEND_REQUIRE_AUTH=true|false`
  - `BACKEND_API_KEY=<server-secret>`
- Frontend envs:
  - `VITE_USE_BACKEND_AUTH=true|false`
  - `VITE_BACKEND_API_KEY=<same-key-for-local-or-proxy-mode>`

When auth is enabled, frontend sends `x-backend-api-key` header.
For production, prefer server-to-server proxy patterns where browser does not hold long-lived backend keys.

## Phase 3.3 strict server-only mode

- Backend provider resolution now uses **server env only**:
  - Copilot: `GITHUB_TOKEN` or `GITHUB_MODELS_TOKEN`
  - Gemini: `GEMINI_API_KEY`
- Backend no longer reads `VITE_*` provider keys.
- Frontend query pipeline enforces backend-first execution when `VITE_USE_BACKEND_LLM=true`:
  - disables browser-side Gemini/Copilot execution in this mode
  - keeps Sentinel Brain retrieval context, but generation runs through backend

## Added backend endpoint

- `GET /api/providers/status`
  - Returns service health metadata and provider configuration state.
  - Does **not** return raw tokens/secrets.

### Example response

```json
{
  "ok": true,
  "service": "llm-backend",
  "version": "phase3",
  "runtime": {
    "host": "127.0.0.1",
    "port": 8787,
    "nodeVersion": "v20.x"
  },
  "defaultModel": "gpt-4o",
  "fallbackOrder": ["copilot", "gemini"],
  "providers": {
    "copilot": { "configured": true, "authSource": "GITHUB_MODELS_TOKEN" },
    "gemini": { "configured": false, "authSource": null }
  }
}
```

## Frontend integration

- Admin dashboard now fetches backend provider status and shows:
  - backend API URL
  - runtime version
  - per-provider configured/missing state
  - auth source variable name (not value)
  - fallback order

## Safety notes

- No secret values are returned.
- Existing generation behavior remains unchanged.
- This is additive and backward-compatible.
