# Spark Exit - Phase 2 (Backend LLM Service)

Phase 2 adds a standalone backend endpoint for LLM generation while keeping Spark as default.

## New backend files

- `backend/server.mjs`
  - `POST /api/llm/generate`
  - `GET /health`
- `backend/llm-service.mjs`
  - provider fallback sequence (`copilot` -> `gemini` by default)

## Endpoint contract

### Request

```json
{
  "prompt": "string (required)",
  "model": "string (optional)",
  "parseJson": "boolean (optional)",
  "providers": ["copilot", "gemini"]
}
```

### Response

```json
{
  "text": "string",
  "raw": "object|string (only when parseJson=true)",
  "provider": "copilot|gemini",
  "model": "string"
}
```

## Run locally

Terminal 1:

```bash
node backend/server.mjs
```

Terminal 2:

```bash
npm run dev
```

## Staging rollout

1. Set `VITE_BACKEND_API_BASE_URL` to your backend URL.
2. Enable only `VITE_USE_BACKEND_LLM=true`.
3. Keep storage/auth flags off in this phase.
4. Validate parity against Spark path before production rollout.
