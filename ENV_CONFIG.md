# Environment Variable Configuration Guide

This guide explains how to configure environment variables for the NovusSparks AI platform.

## Quick Start

1. **Copy the example file**:
   ```bash
   cp .env.example .env.local
   ```

2. **Fill in your credentials**:
   Open `.env.local` and add your API keys and database URLs.

3. **Restart the development server**:
   ```bash
   npm run dev
   ```

## Configuration Files

- **`.env.example`**: Template file with all available variables (committed to git)
- **`.env.local`**: Your local configuration (never committed to git)
- **`src/lib/env-config.ts`**: Type-safe configuration loader

## Required Variables

### Database

```bash
# Neon PostgreSQL Database URL
VITE_NEON_DATABASE_URL=postgresql://user:password@host/database?sslmode=require
```

Get your Neon database URL from [console.neon.tech](https://console.neon.tech).

### AI Providers

```bash
# Google Gemini API Key
VITE_GEMINI_API_KEY=your-gemini-api-key-here
```

Get your Gemini API key from [AI Studio](https://aistudio.google.com/app/apikey).

## Optional Variables

### GitHub Copilot (Advanced Features)

```bash
VITE_GITHUB_COPILOT_TOKEN=ghp_your_token_here
```

Only needed for advanced Copilot integration features.

### Feature Flags

Control which features are enabled:

```bash
VITE_ENABLE_SENTINEL_BRAIN=true
VITE_ENABLE_NGO_MODULE=true
VITE_ENABLE_PLAGIARISM_CHECKER=true
VITE_ENABLE_HUMANIZER=true
```

### Platform Migration Flags

Use these flags for staged migration away from Spark runtime:

```bash
VITE_BACKEND_API_BASE_URL=http://127.0.0.1:8787
VITE_USE_BACKEND_LLM=false
VITE_USE_BACKEND_STORAGE=false
VITE_USE_BACKEND_AUTH=false
```

- `VITE_USE_BACKEND_LLM=true` routes LLM calls via backend endpoint `/api/llm/generate`.
- Keep storage/auth flags disabled until their migration phases are implemented.

> **⚠️ SECURITY — `VITE_BACKEND_API_KEY` must NOT be used in production.**
>
> `VITE_*` variables are bundled into client-side JavaScript assets and are
> effectively public — anyone can extract them from the browser. Setting
> `VITE_BACKEND_API_KEY` in a production environment is a security violation:
>
> - The production build will **fail with an error** if `VITE_BACKEND_API_KEY`
>   is present in the environment.
> - The frontend **never** sends `x-api-key` or `x-backend-api-key` headers
>   from browser code, regardless of this variable.
> - Backend secrets (`BACKEND_API_KEY`, `GEMINI_API_KEY`, etc.) **must remain
>   server-side only** (Heroku Config Vars, GitHub Secrets, etc.).
>
> **Preferred auth flow:** JWT bearer token (`sentinel-auth-token` in
> `localStorage`) and/or httpOnly cookie session + `X-CSRF-Token` header.
> Enable server-side auth with `BACKEND_REQUIRE_AUTH=true` on the backend.

Phase 3 adds backend provider diagnostics endpoint:

- `GET /api/providers/status`
- used by Admin Dashboard for non-secret provider readiness visibility.

### Rate Limits

Customize monthly budget limits per plan tier:

```bash
VITE_BASIC_PLAN_BUDGET_CENTS=500     # $5.00
VITE_PRO_PLAN_BUDGET_CENTS=2000      # $20.00
VITE_TEAM_PLAN_BUDGET_CENTS=5000     # $50.00
```

### Development Settings

```bash
# Enable debug logging
VITE_SPARK_DEBUG=true

# Enable verbose error messages
VITE_VERBOSE_ERRORS=true

# Mock AI responses (no API calls)
VITE_MOCK_AI_RESPONSES=false
```

## Using Environment Variables in Code

### Import the configuration module

```typescript
import { getEnvConfig, isFeatureEnabled } from "@/lib/env-config"
```

### Access configuration values

```typescript
const config = getEnvConfig()

// Check database configuration
if (config.neonDatabaseUrl) {
  console.log("Database is configured")
}

// Check feature flags
if (isFeatureEnabled("enableSentinelBrain")) {
  // Show Sentinel Brain UI
}

// Access rate limits
const budget = config.basicPlanBudgetCents / 100 // Convert to dollars
```

### Get secure values (for logging)

```typescript
import { getSecureConfig } from "@/lib/env-config"

// This returns a masked value safe for logs
const apiKey = getSecureConfig("geminiApiKey", true)
// Returns: "***CONFIGURED***"
```

## Environment Variable Validation

The application validates environment variables on startup:

```typescript
import { validateEnvConfig, loadEnvConfig } from "@/lib/env-config"

const config = loadEnvConfig()
const missingVars = validateEnvConfig(config)

if (missingVars.length > 0) {
  console.warn("Missing required variables:", missingVars)
}
```

## Debugging Configuration

Enable debug mode to see configuration summary on startup:

```bash
VITE_SPARK_DEBUG=true
```

This will log:
- Which variables are configured
- Feature flags status
- Rate limits
- Theme settings
- Missing optional variables

## Security Best Practices

1. **Never commit `.env.local`** - It's already in `.gitignore`
2. **Never commit API keys or secrets** to version control
3. **Never set `VITE_BACKEND_API_KEY` in production** — it will be bundled into
   client assets and exposed publicly. The production build will fail if it is set.
4. **Keep backend secrets server-side only** (`BACKEND_API_KEY`, `GEMINI_API_KEY`,
   `BRIGHT_DATA_API_KEY`, etc. must only be set as server environment variables,
   never as `VITE_*` variables).
5. **Use JWT/cookie session auth** — the frontend authenticates via bearer token
   (`sentinel-auth-token`) and/or httpOnly cookie + CSRF header.
6. **Use the secret-store module** for runtime secret management
7. **Rotate credentials regularly** especially for production
8. **Use different credentials** for development and production

## Secret Storage

The application uses a two-tier secret storage system:

1. **Environment variables** (`.env.local`) - Configuration at build/startup time
2. **Secret store** (`secret-store.ts`) - Runtime encrypted storage in localStorage + KV

For maximum security, sensitive values are:
- Encrypted with AES-GCM in the browser
- Stored in localStorage for fast access
- Persisted to KV (Neon-backed) for cross-session durability
- Never logged or exposed in plain text

## Production Deployment

For production deployments:

1. Set environment variables in your hosting platform (Vercel, Netlify, etc.)
2. Use platform-specific secret management (Vercel Secrets, GitHub Secrets, etc.)
3. Enable production mode settings:
   ```bash
   VITE_SPARK_DEBUG=false
   VITE_VERBOSE_ERRORS=false
   VITE_ENABLE_PERFORMANCE_MONITORING=true
   ```

## Troubleshooting

### "Missing environment variable" warnings

These are informational warnings. The app will work with reduced functionality. Add the missing variables to `.env.local` to enable full features.

### Changes not taking effect

1. Restart the development server after changing `.env.local`
2. Clear browser cache and localStorage
3. Check that variable names are prefixed with `VITE_`

### TypeScript errors about env variables

The `env-config.ts` module provides type-safe access. Import and use:

```typescript
import { getEnvConfig } from "@/lib/env-config"
const config = getEnvConfig()
```

Instead of accessing `import.meta.env` directly.

## Support

For issues or questions about environment configuration:

1. Check this README
2. Review `.env.example` for all available options
3. Check the [main README](./README.md) for general setup
4. Contact [NovusSparks](https://novussparks.com) for enterprise support

## License

This configuration system is part of the NovusSparks AI platform and follows the same license as the main application.
