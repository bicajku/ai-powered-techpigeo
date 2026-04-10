/**
 * Backend Neon Database Client
 *
 * Server-side Neon client for the Sentinel SAAS schema.
 * Uses NEON_DATABASE_URL env var directly (no client-side secret store).
 * Provides query helpers for auth, users, subscriptions, permissions, and audit logs.
 */

import { neon } from "@neondatabase/serverless"
import crypto from "node:crypto"

// ─────────────────────────── Client Setup ────────────────────────

let _sql = null

export function getSql() {
  if (_sql) return _sql
  const url = process.env.NEON_DATABASE_URL
  if (!url) {
    throw new Error(
      "NEON_DATABASE_URL not configured. Set it in environment to enable Sentinel auth."
    )
  }
  _sql = neon(url)
  return _sql
}

export function isDbConfigured() {
  return Boolean(process.env.NEON_DATABASE_URL)
}

// ─────────────────────────── Schema Bootstrap ────────────────────

/**
 * Ensure the sentinel_users table has the password_hash column.
 * This is a lightweight idempotent check — the full schema should
 * be bootstrapped via sql/neon-schema.sql or sentinel-brain.ts.
 */
export async function ensureSentinelTables() {
  if (!isDbConfigured()) return

  try {
    const sql = getSql()
    // Just verify sentinel_users table exists by selecting 1 row
    await sql`SELECT 1 FROM sentinel_users LIMIT 1`

    // Migrate sentinel_users to support OAuth
    await sql`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.tables WHERE table_name = 'sentinel_users'
        ) THEN
          -- Make password_hash nullable for OAuth
          ALTER TABLE sentinel_users ALTER COLUMN password_hash DROP NOT NULL;
          
          -- Add OAuth IDs
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sentinel_users' AND column_name = 'google_id') THEN
            ALTER TABLE sentinel_users ADD COLUMN google_id TEXT UNIQUE;
          END IF;
          
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sentinel_users' AND column_name = 'github_id') THEN
            ALTER TABLE sentinel_users ADD COLUMN github_id TEXT UNIQUE;
          END IF;
        END IF;
      END $$
    `

    // Ensure RAG chat tables exist for threaded conversations.
    await sql`
      CREATE TABLE IF NOT EXISTS chat_threads (
        id BIGSERIAL PRIMARY KEY,
        user_id TEXT,
        module TEXT NOT NULL DEFAULT 'general',
        title TEXT NOT NULL DEFAULT 'New Chat',
        status TEXT NOT NULL DEFAULT 'active',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `

    /* Migrate existing INTEGER user_id to TEXT for UUID support */
    await sql`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'chat_threads' AND column_name = 'user_id' AND data_type = 'integer'
        ) THEN
          ALTER TABLE chat_threads ALTER COLUMN user_id TYPE TEXT USING user_id::TEXT;
        END IF;
      END $$
    `

    await sql`
      CREATE INDEX IF NOT EXISTS idx_chat_threads_user_updated
      ON chat_threads (user_id, updated_at DESC)
    `

    await sql`
      CREATE TABLE IF NOT EXISTS chat_messages (
        id BIGSERIAL PRIMARY KEY,
        thread_id BIGINT NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        provider TEXT,
        model_used TEXT,
        providers_used TEXT[],
        brain_hits INTEGER NOT NULL DEFAULT 0,
        metadata JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `

    await sql`
      CREATE INDEX IF NOT EXISTS idx_chat_messages_thread_created
      ON chat_messages (thread_id, created_at ASC)
    `

    await sql`
      CREATE TABLE IF NOT EXISTS retrieval_traces (
        id BIGSERIAL PRIMARY KEY,
        thread_id BIGINT REFERENCES chat_threads(id) ON DELETE SET NULL,
        message_id BIGINT REFERENCES chat_messages(id) ON DELETE SET NULL,
        query_text TEXT NOT NULL,
        module TEXT,
        provider TEXT,
        model_used TEXT,
        selected_chunks JSONB NOT NULL DEFAULT '[]'::jsonb,
        total_candidates INTEGER NOT NULL DEFAULT 0,
        avg_similarity DOUBLE PRECISION,
        retrieval_latency_ms INTEGER,
        generation_latency_ms INTEGER,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `

    await sql`
      CREATE INDEX IF NOT EXISTS idx_retrieval_traces_thread_created
      ON retrieval_traces (thread_id, created_at DESC)
    `

    // User Style Profile tables (Phase 1 - Personalization)
    await sql`
      CREATE TABLE IF NOT EXISTS user_style_profiles (
        id SERIAL PRIMARY KEY,
        user_id TEXT NOT NULL UNIQUE,
        preferred_industries JSONB NOT NULL DEFAULT '[]'::jsonb,
        dominant_tone TEXT NOT NULL DEFAULT 'professional',
        audience_level TEXT NOT NULL DEFAULT 'intermediate',
        frequent_edits JSONB NOT NULL DEFAULT '[]'::jsonb,
        avg_quality_score NUMERIC(5,2) NOT NULL DEFAULT 75,
        total_generations INTEGER NOT NULL DEFAULT 0,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `

    await sql`
      CREATE INDEX IF NOT EXISTS idx_user_style_profiles_user_id
        ON user_style_profiles (user_id)
    `

    await sql`
      CREATE INDEX IF NOT EXISTS idx_user_style_profiles_updated_at
        ON user_style_profiles (updated_at DESC)
    `

    await sql`
      CREATE TABLE IF NOT EXISTS generation_insights (
        id BIGSERIAL PRIMARY KEY,
        user_id TEXT NOT NULL,
        concept_mode TEXT NOT NULL,
        tone_preference TEXT NOT NULL,
        audience_level TEXT NOT NULL,
        estimated_satisfaction NUMERIC(3,2) NOT NULL DEFAULT 0.5,
        sections_edited JSONB NOT NULL DEFAULT '[]'::jsonb,
        quality_score NUMERIC(5,2),
        cost_cents INTEGER,
        provider_used TEXT,
        model_used TEXT,
        query_preview TEXT,
        was_saved BOOLEAN NOT NULL DEFAULT false,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        tracked_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `

    await sql`
      CREATE INDEX IF NOT EXISTS idx_generation_insights_user_id
        ON generation_insights (user_id)
    `

    await sql`
      CREATE INDEX IF NOT EXISTS idx_generation_insights_user_tracked
        ON generation_insights (user_id, tracked_at DESC)
    `

    await sql`
      CREATE INDEX IF NOT EXISTS idx_generation_insights_concept_mode
        ON generation_insights (user_id, concept_mode)
    `

    await sql`
      CREATE TABLE IF NOT EXISTS user_style_feedback (
        id BIGSERIAL PRIMARY KEY,
        user_id TEXT NOT NULL,
        generation_id BIGINT REFERENCES generation_insights(id) ON DELETE SET NULL,
        quality_rating INTEGER NOT NULL CHECK (quality_rating >= 1 AND quality_rating <= 5),
        tone_fit INTEGER CHECK (tone_fit IS NULL OR (tone_fit >= 1 AND tone_fit <= 5)),
        audience_match INTEGER CHECK (audience_match IS NULL OR (audience_match >= 1 AND audience_match <= 5)),
        originality INTEGER CHECK (originality IS NULL OR (originality >= 1 AND originality <= 5)),
        comment TEXT,
        used_in_production BOOLEAN DEFAULT false,
        outcome_metric TEXT,
        outcome_value NUMERIC(10,2),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `

    await sql`
      CREATE INDEX IF NOT EXISTS idx_user_style_feedback_user_id
        ON user_style_feedback (user_id)
    `

    await sql`
      CREATE INDEX IF NOT EXISTS idx_user_style_feedback_generation_id
        ON user_style_feedback (generation_id)
    `

    await sql`
      CREATE TABLE IF NOT EXISTS sentinel_provider_routing (
        module_name TEXT PRIMARY KEY,
        provider_order TEXT[] NOT NULL DEFAULT ARRAY['copilot','spark','groq','gemini','sentinel'],
        web_provider_order TEXT[] NOT NULL DEFAULT ARRAY['searchcans','serpapi','duckduckgo','sentinel'],
        enabled_providers JSONB NOT NULL DEFAULT '{"copilot":true,"groq":true,"spark":true,"gemini":true,"sentinel":true}'::jsonb,
        enabled_web_providers JSONB NOT NULL DEFAULT '{"searchcans":true,"serpapi":true,"duckduckgo":true,"sentinel":true}'::jsonb,
        daily_budget_usd NUMERIC(12,4) NOT NULL DEFAULT 25,
        monthly_budget_usd NUMERIC(12,4) NOT NULL DEFAULT 300,
        provider_daily_caps JSONB NOT NULL DEFAULT '{}'::jsonb,
        timeout_ms INTEGER NOT NULL DEFAULT 30000,
        updated_by TEXT,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `

    await sql`
      CREATE TABLE IF NOT EXISTS sentinel_provider_usage (
        id BIGSERIAL PRIMARY KEY,
        provider TEXT NOT NULL,
        module_name TEXT NOT NULL DEFAULT 'global',
        kind TEXT NOT NULL DEFAULT 'generation',
        model TEXT,
        request_count INTEGER NOT NULL DEFAULT 1,
        input_tokens INTEGER,
        output_tokens INTEGER,
        total_tokens INTEGER,
        estimated_cost_usd NUMERIC(12,6) NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'ok',
        error TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `

    await sql`
      CREATE INDEX IF NOT EXISTS idx_provider_usage_created
      ON sentinel_provider_usage (created_at DESC)
    `

    await sql`
      CREATE INDEX IF NOT EXISTS idx_provider_usage_provider_module
      ON sentinel_provider_usage (provider, module_name, created_at DESC)
    `

    await sql`
      INSERT INTO sentinel_provider_routing (module_name)
      VALUES ('global')
      ON CONFLICT (module_name) DO NOTHING
    `

    await sql`
      UPDATE sentinel_provider_routing
      SET provider_order = ARRAY['copilot','spark','groq','gemini','sentinel'],
          updated_at = now()
      WHERE module_name = 'global'
        AND provider_order = ARRAY['copilot','groq','spark','gemini','sentinel']
    `

    // Skills registry (shadow-mode capable)
    await sql`
      CREATE TABLE IF NOT EXISTS sentinel_skills_registry (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        version TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        file_name TEXT NOT NULL,
        stored_zip_path TEXT NOT NULL,
        manifest_path TEXT,
        frontmatter JSONB NOT NULL DEFAULT '{}'::jsonb,
        entries_count INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'validated',
        uploaded_by TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `

    await sql`
      CREATE INDEX IF NOT EXISTS idx_sentinel_skills_registry_created
      ON sentinel_skills_registry (created_at DESC)
    `

    await sql`
      CREATE TABLE IF NOT EXISTS sentinel_skills_bindings (
        module_name TEXT PRIMARY KEY,
        skill_id TEXT NOT NULL REFERENCES sentinel_skills_registry(id) ON DELETE CASCADE,
        enabled BOOLEAN NOT NULL DEFAULT true,
        mode TEXT NOT NULL DEFAULT 'shadow',
        rollout_percent INTEGER NOT NULL DEFAULT 0,
        updated_by TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `

    await sql`
      CREATE INDEX IF NOT EXISTS idx_sentinel_skills_bindings_skill
      ON sentinel_skills_bindings (skill_id)
    `

    await sql`
      CREATE TABLE IF NOT EXISTS sentinel_skills_execution_logs (
        id TEXT PRIMARY KEY,
        module_name TEXT NOT NULL,
        skill_id TEXT REFERENCES sentinel_skills_registry(id) ON DELETE SET NULL,
        skill_name TEXT,
        mode TEXT NOT NULL DEFAULT 'shadow',
        changed BOOLEAN NOT NULL DEFAULT false,
        ai_signal_before INTEGER,
        ai_signal_after INTEGER,
        actor TEXT,
        input_preview TEXT,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `

    await sql`
      CREATE INDEX IF NOT EXISTS idx_sentinel_skills_execution_logs_module_created
      ON sentinel_skills_execution_logs (module_name, created_at DESC)
    `

    console.log("[db] Sentinel tables verified")
  } catch (err) {
    console.warn("[db] Sentinel tables not found — run migrations first:", err.message)
  }
}

function normalizeRoutingRow(row) {
  const providerOrder = Array.isArray(row.provider_order)
    ? row.provider_order
    : ["copilot", "spark", "groq", "gemini", "sentinel"]

  const webProviderOrder = Array.isArray(row.web_provider_order)
    ? row.web_provider_order
    : ["searchcans", "serpapi", "duckduckgo", "sentinel"]

  const enabledProviders = typeof row.enabled_providers === "string"
    ? JSON.parse(row.enabled_providers)
    : (row.enabled_providers || {})

  const enabledWebProviders = typeof row.enabled_web_providers === "string"
    ? JSON.parse(row.enabled_web_providers)
    : (row.enabled_web_providers || {})

  const providerDailyCaps = typeof row.provider_daily_caps === "string"
    ? JSON.parse(row.provider_daily_caps)
    : (row.provider_daily_caps || {})

  return {
    moduleName: row.module_name,
    providerOrder,
    webProviderOrder,
    enabledProviders,
    enabledWebProviders,
    dailyBudgetUsd: Number(row.daily_budget_usd || 0),
    monthlyBudgetUsd: Number(row.monthly_budget_usd || 0),
    providerDailyCaps,
    timeoutMs: Number(row.timeout_ms || 30000),
    updatedBy: row.updated_by || null,
    updatedAt: row.updated_at ? new Date(row.updated_at).getTime() : Date.now(),
  }
}

export async function listProviderRoutingConfigs() {
  const sql = getSql()
  const rows = await sql`
    SELECT *
    FROM sentinel_provider_routing
    ORDER BY CASE WHEN module_name = 'global' THEN 0 ELSE 1 END, module_name ASC
  `
  return rows.map(normalizeRoutingRow)
}

export async function getProviderRoutingConfig(moduleName = "global") {
  const sql = getSql()

  const rows = await sql`
    SELECT *
    FROM sentinel_provider_routing
    WHERE module_name = ${moduleName}
    LIMIT 1
  `
  if (rows[0]) return normalizeRoutingRow(rows[0])

  const fallback = await sql`
    SELECT *
    FROM sentinel_provider_routing
    WHERE module_name = 'global'
    LIMIT 1
  `
  return fallback[0] ? normalizeRoutingRow(fallback[0]) : {
    moduleName: "global",
    providerOrder: ["copilot", "spark", "groq", "gemini", "sentinel"],
    webProviderOrder: ["searchcans", "serpapi", "duckduckgo", "sentinel"],
    enabledProviders: { copilot: true, groq: true, spark: true, gemini: true, sentinel: true },
    enabledWebProviders: { searchcans: true, serpapi: true, duckduckgo: true, sentinel: true },
    dailyBudgetUsd: 25,
    monthlyBudgetUsd: 300,
    providerDailyCaps: {},
    timeoutMs: 30000,
    updatedBy: null,
    updatedAt: Date.now(),
  }
}

export async function upsertProviderRoutingConfig(config) {
  const sql = getSql()

  const moduleName = config.moduleName || "global"
  const providerOrder = Array.isArray(config.providerOrder) && config.providerOrder.length > 0
    ? config.providerOrder
    : ["copilot", "spark", "groq", "gemini", "sentinel"]
  const webProviderOrder = Array.isArray(config.webProviderOrder) && config.webProviderOrder.length > 0
    ? config.webProviderOrder
    : ["searchcans", "serpapi", "duckduckgo", "sentinel"]
  const enabledProviders = config.enabledProviders || { copilot: true, groq: true, spark: true, gemini: true, sentinel: true }
  const enabledWebProviders = config.enabledWebProviders || { searchcans: true, serpapi: true, duckduckgo: true, sentinel: true }
  const providerDailyCaps = config.providerDailyCaps || {}
  const timeoutMs = Math.max(5000, Math.min(Number(config.timeoutMs || 30000), 120000))
  const dailyBudgetUsd = Math.max(0, Number(config.dailyBudgetUsd || 0))
  const monthlyBudgetUsd = Math.max(0, Number(config.monthlyBudgetUsd || 0))

  const rows = await sql`
    INSERT INTO sentinel_provider_routing (
      module_name,
      provider_order,
      web_provider_order,
      enabled_providers,
      enabled_web_providers,
      daily_budget_usd,
      monthly_budget_usd,
      provider_daily_caps,
      timeout_ms,
      updated_by,
      updated_at
    )
    VALUES (
      ${moduleName},
      ${providerOrder},
      ${webProviderOrder},
      ${JSON.stringify(enabledProviders)}::jsonb,
      ${JSON.stringify(enabledWebProviders)}::jsonb,
      ${dailyBudgetUsd},
      ${monthlyBudgetUsd},
      ${JSON.stringify(providerDailyCaps)}::jsonb,
      ${timeoutMs},
      ${config.updatedBy || null},
      now()
    )
    ON CONFLICT (module_name) DO UPDATE SET
      provider_order = EXCLUDED.provider_order,
      web_provider_order = EXCLUDED.web_provider_order,
      enabled_providers = EXCLUDED.enabled_providers,
      enabled_web_providers = EXCLUDED.enabled_web_providers,
      daily_budget_usd = EXCLUDED.daily_budget_usd,
      monthly_budget_usd = EXCLUDED.monthly_budget_usd,
      provider_daily_caps = EXCLUDED.provider_daily_caps,
      timeout_ms = EXCLUDED.timeout_ms,
      updated_by = EXCLUDED.updated_by,
      updated_at = now()
    RETURNING *
  `

  return normalizeRoutingRow(rows[0])
}

export async function writeProviderUsage(entry) {
  const sql = getSql()
  await sql`
    INSERT INTO sentinel_provider_usage (
      provider,
      module_name,
      kind,
      model,
      request_count,
      input_tokens,
      output_tokens,
      total_tokens,
      estimated_cost_usd,
      status,
      error
    )
    VALUES (
      ${entry.provider},
      ${entry.moduleName || "global"},
      ${entry.kind || "generation"},
      ${entry.model || null},
      ${Math.max(1, Number(entry.requestCount || 1))},
      ${entry.inputTokens ?? null},
      ${entry.outputTokens ?? null},
      ${entry.totalTokens ?? null},
      ${Math.max(0, Number(entry.estimatedCostUsd || 0))},
      ${entry.status || "ok"},
      ${entry.error || null}
    )
  `
}

export async function getProviderUsageSummary({ days = 30 } = {}) {
  const sql = getSql()
  const safeDays = Math.max(1, Math.min(Number(days || 30), 365))

  const [byProvider, byModule, totals, dailyCosts] = await Promise.all([
    sql`
      SELECT
        provider,
        kind,
        COUNT(*)::INTEGER AS events,
        SUM(request_count)::INTEGER AS requests,
        SUM(COALESCE(total_tokens, 0))::BIGINT AS tokens,
        SUM(estimated_cost_usd)::NUMERIC(14,6) AS cost
      FROM sentinel_provider_usage
      WHERE created_at > NOW() - (${safeDays}::INTEGER || ' days')::INTERVAL
      GROUP BY provider, kind
      ORDER BY cost DESC, requests DESC
    `,
    sql`
      SELECT
        module_name AS "moduleName",
        COUNT(*)::INTEGER AS events,
        SUM(request_count)::INTEGER AS requests,
        SUM(COALESCE(total_tokens, 0))::BIGINT AS tokens,
        SUM(estimated_cost_usd)::NUMERIC(14,6) AS cost
      FROM sentinel_provider_usage
      WHERE created_at > NOW() - (${safeDays}::INTEGER || ' days')::INTERVAL
      GROUP BY module_name
      ORDER BY cost DESC, requests DESC
    `,
    sql`
      SELECT
        COUNT(*)::INTEGER AS events,
        SUM(request_count)::INTEGER AS requests,
        SUM(COALESCE(total_tokens, 0))::BIGINT AS tokens,
        SUM(estimated_cost_usd)::NUMERIC(14,6) AS cost,
        COUNT(*) FILTER (WHERE status = 'error')::INTEGER AS errors
      FROM sentinel_provider_usage
      WHERE created_at > NOW() - (${safeDays}::INTEGER || ' days')::INTERVAL
    `,
    sql`
      SELECT
        DATE(created_at) AS day,
        SUM(estimated_cost_usd)::NUMERIC(14,6) AS cost,
        SUM(request_count)::INTEGER AS requests
      FROM sentinel_provider_usage
      WHERE created_at > NOW() - (${safeDays}::INTEGER || ' days')::INTERVAL
      GROUP BY DATE(created_at)
      ORDER BY day ASC
    `,
  ])

  return {
    windowDays: safeDays,
    totals: {
      events: Number(totals[0]?.events || 0),
      requests: Number(totals[0]?.requests || 0),
      tokens: Number(totals[0]?.tokens || 0),
      cost: Number(totals[0]?.cost || 0),
      errors: Number(totals[0]?.errors || 0),
    },
    byProvider: byProvider.map((row) => ({
      provider: row.provider,
      kind: row.kind,
      events: Number(row.events || 0),
      requests: Number(row.requests || 0),
      tokens: Number(row.tokens || 0),
      cost: Number(row.cost || 0),
    })),
    byModule: byModule.map((row) => ({
      moduleName: row.moduleName,
      events: Number(row.events || 0),
      requests: Number(row.requests || 0),
      tokens: Number(row.tokens || 0),
      cost: Number(row.cost || 0),
    })),
    dailyCosts: dailyCosts.map((row) => ({
      day: row.day,
      cost: Number(row.cost || 0),
      requests: Number(row.requests || 0),
    })),
  }
}

export async function getProviderBudgetSnapshot({ moduleName = "global" } = {}) {
  const sql = getSql()
  const [dailyRows, monthlyRows] = await Promise.all([
    sql`
      SELECT COALESCE(SUM(estimated_cost_usd), 0)::NUMERIC(14,6) AS cost
      FROM sentinel_provider_usage
      WHERE module_name = ${moduleName}
        AND created_at >= date_trunc('day', now())
    `,
    sql`
      SELECT COALESCE(SUM(estimated_cost_usd), 0)::NUMERIC(14,6) AS cost
      FROM sentinel_provider_usage
      WHERE module_name = ${moduleName}
        AND created_at >= date_trunc('month', now())
    `,
  ])

  return {
    dailyCostUsd: Number(dailyRows[0]?.cost || 0),
    monthlyCostUsd: Number(monthlyRows[0]?.cost || 0),
  }
}

function normalizeSkillRegistryRow(row) {
  return {
    id: row.id,
    name: row.name,
    version: row.version,
    description: row.description || "",
    fileName: row.file_name,
    storedZipPath: row.stored_zip_path,
    manifestPath: row.manifest_path,
    frontmatter: typeof row.frontmatter === "string" ? JSON.parse(row.frontmatter) : (row.frontmatter || {}),
    entriesCount: Number(row.entries_count) || 0,
    status: row.status || "validated",
    uploadedBy: row.uploaded_by || null,
    createdAt: Number(row.createdAt) || Number(row.created_at) || 0,
    updatedAt: Number(row.updatedAt) || Number(row.updated_at) || 0,
  }
}

function normalizeSkillBindingRow(row) {
  return {
    moduleName: row.module_name,
    skillId: row.skill_id,
    enabled: Boolean(row.enabled),
    mode: row.mode || "shadow",
    rolloutPercent: Number(row.rollout_percent) || 0,
    updatedBy: row.updated_by || null,
    createdAt: Number(row.createdAt) || Number(row.created_at) || 0,
    updatedAt: Number(row.updatedAt) || Number(row.updated_at) || 0,
  }
}

function normalizeSkillExecutionLogRow(row) {
  return {
    id: row.id,
    moduleName: row.module_name,
    skillId: row.skill_id || null,
    skillName: row.skill_name || null,
    mode: row.mode || "shadow",
    changed: Boolean(row.changed),
    aiSignalBefore: row.ai_signal_before == null ? null : Number(row.ai_signal_before),
    aiSignalAfter: row.ai_signal_after == null ? null : Number(row.ai_signal_after),
    actor: row.actor || null,
    inputPreview: row.input_preview || "",
    metadata: typeof row.metadata === "string" ? JSON.parse(row.metadata) : (row.metadata || {}),
    createdAt: Number(row.createdAt) || Number(row.created_at) || 0,
  }
}

export async function createSkillRegistryEntry({
  id,
  name,
  version,
  description = "",
  fileName,
  storedZipPath,
  manifestPath = null,
  frontmatter = {},
  entriesCount = 0,
  status = "validated",
  uploadedBy = null,
}) {
  const sql = getSql()
  const skillId = id || `skill_${crypto.randomUUID()}`
  const rows = await sql`
    INSERT INTO sentinel_skills_registry
      (id, name, version, description, file_name, stored_zip_path, manifest_path, frontmatter, entries_count, status, uploaded_by)
    VALUES
      (${skillId}, ${name}, ${version}, ${description}, ${fileName}, ${storedZipPath}, ${manifestPath}, ${JSON.stringify(frontmatter)}, ${entriesCount}, ${status}, ${uploadedBy})
    RETURNING *,
      EXTRACT(EPOCH FROM created_at)::BIGINT * 1000 AS "createdAt",
      EXTRACT(EPOCH FROM updated_at)::BIGINT * 1000 AS "updatedAt"
  `
  return normalizeSkillRegistryRow(rows[0])
}

export async function listSkillRegistryEntries({ limit = 200 } = {}) {
  const sql = getSql()
  const rows = await sql.unsafe(
    `SELECT *,
        EXTRACT(EPOCH FROM created_at)::BIGINT * 1000 AS "createdAt",
        EXTRACT(EPOCH FROM updated_at)::BIGINT * 1000 AS "updatedAt"
     FROM sentinel_skills_registry
     ORDER BY created_at DESC
     LIMIT $1`,
    [Math.max(1, Math.min(500, Number(limit) || 200))]
  )
  return rows.map(normalizeSkillRegistryRow)
}

export async function getSkillRegistryEntryById(id) {
  const sql = getSql()
  const rows = await sql`
    SELECT *,
      EXTRACT(EPOCH FROM created_at)::BIGINT * 1000 AS "createdAt",
      EXTRACT(EPOCH FROM updated_at)::BIGINT * 1000 AS "updatedAt"
    FROM sentinel_skills_registry
    WHERE id = ${id}
    LIMIT 1
  `
  return rows.length > 0 ? normalizeSkillRegistryRow(rows[0]) : null
}

export async function upsertSkillBinding({
  moduleName,
  skillId,
  enabled = true,
  mode = "shadow",
  rolloutPercent = 0,
  updatedBy = null,
}) {
  const sql = getSql()
  const rows = await sql`
    INSERT INTO sentinel_skills_bindings
      (module_name, skill_id, enabled, mode, rollout_percent, updated_by)
    VALUES
      (${moduleName}, ${skillId}, ${enabled}, ${mode}, ${rolloutPercent}, ${updatedBy})
    ON CONFLICT (module_name) DO UPDATE SET
      skill_id = EXCLUDED.skill_id,
      enabled = EXCLUDED.enabled,
      mode = EXCLUDED.mode,
      rollout_percent = EXCLUDED.rollout_percent,
      updated_by = EXCLUDED.updated_by,
      updated_at = NOW()
    RETURNING *,
      EXTRACT(EPOCH FROM created_at)::BIGINT * 1000 AS "createdAt",
      EXTRACT(EPOCH FROM updated_at)::BIGINT * 1000 AS "updatedAt"
  `
  return normalizeSkillBindingRow(rows[0])
}

export async function getSkillBinding(moduleName) {
  const sql = getSql()
  const rows = await sql`
    SELECT *,
      EXTRACT(EPOCH FROM created_at)::BIGINT * 1000 AS "createdAt",
      EXTRACT(EPOCH FROM updated_at)::BIGINT * 1000 AS "updatedAt"
    FROM sentinel_skills_bindings
    WHERE module_name = ${moduleName}
    LIMIT 1
  `
  return rows.length > 0 ? normalizeSkillBindingRow(rows[0]) : null
}

export async function listSkillBindings({ moduleName } = {}) {
  const sql = getSql()
  const rows = moduleName
    ? await sql`
        SELECT *,
          EXTRACT(EPOCH FROM created_at)::BIGINT * 1000 AS "createdAt",
          EXTRACT(EPOCH FROM updated_at)::BIGINT * 1000 AS "updatedAt"
        FROM sentinel_skills_bindings
        WHERE module_name = ${moduleName}
        ORDER BY module_name ASC
      `
    : await sql`
        SELECT *,
          EXTRACT(EPOCH FROM created_at)::BIGINT * 1000 AS "createdAt",
          EXTRACT(EPOCH FROM updated_at)::BIGINT * 1000 AS "updatedAt"
        FROM sentinel_skills_bindings
        ORDER BY module_name ASC
      `
  return rows.map(normalizeSkillBindingRow)
}

export async function createSkillExecutionLog({
  id,
  moduleName,
  skillId = null,
  skillName = null,
  mode = "shadow",
  changed = false,
  aiSignalBefore = null,
  aiSignalAfter = null,
  actor = null,
  inputPreview = "",
  metadata = {},
}) {
  const sql = getSql()
  const rowId = id || `sklog_${crypto.randomUUID()}`
  const rows = await sql`
    INSERT INTO sentinel_skills_execution_logs
      (id, module_name, skill_id, skill_name, mode, changed, ai_signal_before, ai_signal_after, actor, input_preview, metadata)
    VALUES
      (${rowId}, ${moduleName}, ${skillId}, ${skillName}, ${mode}, ${changed}, ${aiSignalBefore}, ${aiSignalAfter}, ${actor}, ${inputPreview}, ${JSON.stringify(metadata)})
    RETURNING *, EXTRACT(EPOCH FROM created_at)::BIGINT * 1000 AS "createdAt"
  `
  return normalizeSkillExecutionLogRow(rows[0])
}

export async function listSkillExecutionLogs({ moduleName, limit = 50 } = {}) {
  const sql = getSql()
  const capped = Math.max(1, Math.min(500, Number(limit) || 50))
  const rows = moduleName
    ? await sql.unsafe(
        `SELECT *, EXTRACT(EPOCH FROM created_at)::BIGINT * 1000 AS "createdAt"
         FROM sentinel_skills_execution_logs
         WHERE module_name = $1
         ORDER BY created_at DESC
         LIMIT $2`,
        [moduleName, capped]
      )
    : await sql.unsafe(
        `SELECT *, EXTRACT(EPOCH FROM created_at)::BIGINT * 1000 AS "createdAt"
         FROM sentinel_skills_execution_logs
         ORDER BY created_at DESC
         LIMIT $1`,
        [capped]
      )
  return rows.map(normalizeSkillExecutionLogRow)
}

// ─────────────────────────── User Queries ────────────────────────

/**
 * Create a new user in the sentinel_users table.
 * Used by the /api/auth/register endpoint.
 *
 * @param {object} user
 * @param {string} user.id - User UUID
 * @param {string} user.email - Email (lowercased)
 * @param {string} user.fullName - Display name
 * @param {string} user.passwordHash - Pre-hashed password
 * @param {string} [user.role] - Sentinel role (default: 'USER')
 * @param {string|null} [user.organizationId] - Org ID (null for standalone users)
 * @returns {Promise<object|null>} Created user (without passwordHash) or null on conflict
 */
export async function createUser({ id, email, fullName, passwordHash, role = "USER", organizationId = null }) {
  const sql = getSql()
  const rows = await sql`
    INSERT INTO sentinel_users (id, email, full_name, password_hash, role, organization_id, is_active)
    VALUES (${id}, ${email.toLowerCase()}, ${fullName}, ${passwordHash}, ${role}, ${organizationId}, TRUE)
    ON CONFLICT (email) DO NOTHING
    RETURNING id, email, full_name AS "fullName", role, organization_id AS "organizationId",
              is_active AS "isActive",
              EXTRACT(EPOCH FROM created_at)::BIGINT * 1000 AS "createdAt",
              EXTRACT(EPOCH FROM last_login_at)::BIGINT * 1000 AS "lastLoginAt"
  `
  return rows[0] || null
}

export async function listUsersByRole(role, limit = 100) {
  const sql = getSql()
  const safeLimit = Math.max(1, Math.min(Number(limit) || 100, 500))
  const rows = await sql`
    SELECT id, email, full_name AS "fullName",
           role, organization_id AS "organizationId", avatar_url AS "avatarUrl",
           is_active AS "isActive",
           EXTRACT(EPOCH FROM created_at)::BIGINT * 1000 AS "createdAt",
           EXTRACT(EPOCH FROM last_login_at)::BIGINT * 1000 AS "lastLoginAt"
    FROM sentinel_users
    WHERE role = ${role} AND is_active = TRUE
    ORDER BY created_at DESC
    LIMIT ${safeLimit}
  `
  return rows
}

export async function countUsersByRole(role) {
  const sql = getSql()
  const rows = await sql`
    SELECT COUNT(*)::INTEGER AS count
    FROM sentinel_users
    WHERE role = ${role} AND is_active = TRUE
  `
  return Number(rows?.[0]?.count || 0)
}

/**
 * Get user by email for login.
 * Returns user + password_hash for verification.
 */
export async function getUserByEmailForLogin(email) {
  const sql = getSql()
  const rows = await sql`
    SELECT id, email, full_name AS "fullName", password_hash AS "passwordHash",
           role, organization_id AS "organizationId", avatar_url AS "avatarUrl",
           is_active AS "isActive",
           EXTRACT(EPOCH FROM created_at)::BIGINT * 1000 AS "createdAt",
           EXTRACT(EPOCH FROM last_login_at)::BIGINT * 1000 AS "lastLoginAt"
    FROM sentinel_users
    WHERE email = ${email.toLowerCase()}
    LIMIT 1
  `
  return rows[0] || null
}

/**
 * Get user by ID (no password_hash).
 */
export async function getUserById(userId) {
  const sql = getSql()
  const rows = await sql`
    SELECT id, email, full_name AS "fullName",
           role, organization_id AS "organizationId", avatar_url AS "avatarUrl",
           is_active AS "isActive",
           EXTRACT(EPOCH FROM created_at)::BIGINT * 1000 AS "createdAt",
           EXTRACT(EPOCH FROM last_login_at)::BIGINT * 1000 AS "lastLoginAt"
    FROM sentinel_users
    WHERE id = ${userId} AND is_active = TRUE
    LIMIT 1
  `
  return rows[0] || null
}

/**
 * Update last_login_at for a user.
 */
export async function updateLastLogin(userId) {
  const sql = getSql()
  await sql`UPDATE sentinel_users SET last_login_at = NOW() WHERE id = ${userId}`
}

/**
 * H2 fix: Update a user's password hash.
 * Used for re-hashing legacy SHA-256 passwords to bcrypt on login.
 *
 * @param {string} userId - User ID
 * @param {string} newHash - New bcrypt password hash
 */
export async function updatePasswordHash(userId, newHash) {
  const sql = getSql()
  await sql`UPDATE sentinel_users SET password_hash = ${newHash} WHERE id = ${userId}`
}

export async function updateUserRoleById(userId, role) {
  const sql = getSql()
  const rows = await sql`
    UPDATE sentinel_users
    SET role = ${role}, updated_at = NOW()
    WHERE id = ${userId}
    RETURNING id, email, full_name AS "fullName",
              role, organization_id AS "organizationId", avatar_url AS "avatarUrl",
              is_active AS "isActive",
              EXTRACT(EPOCH FROM created_at)::BIGINT * 1000 AS "createdAt",
              EXTRACT(EPOCH FROM last_login_at)::BIGINT * 1000 AS "lastLoginAt"
  `
  return rows[0] || null
}

export async function deactivateUserById(userId) {
  const sql = getSql()
  const rows = await sql`
    UPDATE sentinel_users
    SET is_active = FALSE, updated_at = NOW()
    WHERE id = ${userId}
    RETURNING id, email, full_name AS "fullName",
              role, organization_id AS "organizationId", avatar_url AS "avatarUrl",
              is_active AS "isActive",
              EXTRACT(EPOCH FROM created_at)::BIGINT * 1000 AS "createdAt",
              EXTRACT(EPOCH FROM last_login_at)::BIGINT * 1000 AS "lastLoginAt"
  `
  return rows[0] || null
}

export async function assignUserToOrganization(userId, organizationId, role) {
  const sql = getSql()
  const rows = await sql`
    UPDATE sentinel_users
    SET organization_id = ${organizationId},
        role = ${role},
        updated_at = NOW()
    WHERE id = ${userId}
    RETURNING id, email, full_name AS "fullName",
              role, organization_id AS "organizationId", avatar_url AS "avatarUrl",
              is_active AS "isActive",
              EXTRACT(EPOCH FROM created_at)::BIGINT * 1000 AS "createdAt",
              EXTRACT(EPOCH FROM last_login_at)::BIGINT * 1000 AS "lastLoginAt"
  `
  return rows[0] || null
}

export async function createOrganization({ name, adminUserId, tier = "ENTERPRISE" }) {
  const sql = getSql()
  const orgId = crypto.randomUUID()

  const rows = await sql`
    INSERT INTO sentinel_organizations (id, name, tier, admin_user_id)
    VALUES (${orgId}, ${name}, ${tier}, ${adminUserId})
    RETURNING id, name, subscription_id AS "subscriptionId",
              tier, admin_user_id AS "adminUserId",
              EXTRACT(EPOCH FROM created_at)::BIGINT * 1000 AS "createdAt",
              EXTRACT(EPOCH FROM updated_at)::BIGINT * 1000 AS "updatedAt"
  `

  await sql`
    UPDATE sentinel_users
    SET organization_id = ${orgId}, role = 'ORG_ADMIN', updated_at = NOW()
    WHERE id = ${adminUserId}
  `

  return rows[0] || null
}

// ─────────────────────────── Subscription Queries ────────────────

/**
 * Get the active subscription for a user.
 */
export async function getUserSubscription(userId) {
  const sql = getSql()
  const rows = await sql`
    SELECT id, user_id AS "userId", subscription_id AS "subscriptionId",
           tier, status, assigned_by AS "assignedBy",
           organization_id AS "organizationId", auto_renew AS "autoRenew",
           EXTRACT(EPOCH FROM assigned_at)::BIGINT * 1000 AS "assignedAt",
           EXTRACT(EPOCH FROM expires_at)::BIGINT * 1000 AS "expiresAt"
    FROM sentinel_user_subscriptions
    WHERE user_id = ${userId} AND status = 'ACTIVE'
    ORDER BY assigned_at DESC
    LIMIT 1
  `
  return rows[0] || null
}

// ─────────────────────────── Module Permission Queries ───────────

/**
 * Get all active module permissions for a user.
 */
export async function getUserModulePermissions(userId) {
  const sql = getSql()
  const rows = await sql`
    SELECT id, user_id AS "userId", organization_id AS "organizationId",
           module_name AS "moduleName", access_level AS "accessLevel",
           granted_by AS "grantedBy",
           EXTRACT(EPOCH FROM granted_at)::BIGINT * 1000 AS "grantedAt",
           EXTRACT(EPOCH FROM expires_at)::BIGINT * 1000 AS "expiresAt"
    FROM sentinel_module_permissions
    WHERE user_id = ${userId}
      AND (expires_at IS NULL OR expires_at > NOW())
  `
  return rows
}

/**
 * Grant or update a module permission.
 */
export async function grantModulePermission(perm) {
  const sql = getSql()
  await sql`
    INSERT INTO sentinel_module_permissions
      (id, user_id, organization_id, module_name, access_level, granted_by, expires_at)
    VALUES (${perm.id}, ${perm.userId}, ${perm.organizationId}, ${perm.moduleName},
            ${perm.accessLevel}, ${perm.grantedBy},
            ${perm.expiresAt ? new Date(perm.expiresAt).toISOString() : null})
    ON CONFLICT (user_id, organization_id, module_name)
    DO UPDATE SET access_level = EXCLUDED.access_level, expires_at = EXCLUDED.expires_at
  `
}

/**
 * Revoke a module permission.
 */
export async function revokeModulePermission(userId, organizationId, moduleName) {
  const sql = getSql()
  await sql`
    DELETE FROM sentinel_module_permissions
    WHERE user_id = ${userId}
      AND organization_id = ${organizationId}
      AND module_name = ${moduleName}
  `
}

// ─────────────────────────── Organization Queries ────────────────

/**
 * Get organization by ID.
 */
export async function getOrganization(orgId) {
  const sql = getSql()
  const rows = await sql`
    SELECT o.id, o.name, o.subscription_id AS "subscriptionId",
           o.tier, o.admin_user_id AS "adminUserId",
           EXTRACT(EPOCH FROM o.created_at)::BIGINT * 1000 AS "createdAt",
           EXTRACT(EPOCH FROM o.updated_at)::BIGINT * 1000 AS "updatedAt",
           COALESCE(
             array_agg(u.id) FILTER (WHERE u.id IS NOT NULL), '{}'
           ) AS "memberIds"
    FROM sentinel_organizations o
    LEFT JOIN sentinel_users u ON u.organization_id = o.id AND u.is_active = TRUE
    WHERE o.id = ${orgId}
    GROUP BY o.id
  `
  return rows[0] || null
}

/**
 * List users in an organization.
 */
export async function listOrgUsers(organizationId) {
  const sql = getSql()
  return sql`
    SELECT id, email, full_name AS "fullName",
           role, organization_id AS "organizationId",
           avatar_url AS "avatarUrl", is_active AS "isActive",
           EXTRACT(EPOCH FROM created_at)::BIGINT * 1000 AS "createdAt",
           EXTRACT(EPOCH FROM last_login_at)::BIGINT * 1000 AS "lastLoginAt"
    FROM sentinel_users
    WHERE organization_id = ${organizationId} AND is_active = TRUE
    ORDER BY created_at DESC
  `
}

// ─────────────────────────── Report Queries ──────────────────────

/**
 * Report SELECT column list (reused across queries).
 * Matches the new state-machine columns added in Phase 5.2 migration.
 */
const REPORT_COLUMNS = `
  id, project_id AS "projectId", organization_id AS "organizationId",
  title, report_type AS "reportType", sections, branding_id AS "brandingId",
  generated_by AS "generatedBy", status,
  submitted_by AS "submittedBy", approved_by AS "approvedBy",
  signature_hash AS "signatureHash", signed_by AS "signedBy",
  published_by AS "publishedBy", updated_by AS "updatedBy",
  exported_formats AS "exportedFormats",
  EXTRACT(EPOCH FROM generated_at)::BIGINT * 1000 AS "generatedAt",
  EXTRACT(EPOCH FROM submitted_at)::BIGINT * 1000 AS "submittedAt",
  EXTRACT(EPOCH FROM approved_at)::BIGINT * 1000 AS "approvedAt",
  EXTRACT(EPOCH FROM signed_at)::BIGINT * 1000 AS "signedAt",
  EXTRACT(EPOCH FROM published_at)::BIGINT * 1000 AS "publishedAt",
  EXTRACT(EPOCH FROM updated_at)::BIGINT * 1000 AS "updatedAt"
`

/**
 * Get a single report by ID.
 */
export async function getReportById(reportId) {
  const sql = getSql()
  const rows = await sql`
    SELECT ${sql.unsafe(REPORT_COLUMNS)}
    FROM sentinel_ngo_reports
    WHERE id = ${reportId}
    LIMIT 1
  `
  return rows[0] ? normalizeReport(rows[0]) : null
}

/**
 * List reports for a project, optionally filtered by status.
 */
export async function listReportsByProject(projectId, { status, limit = 50 } = {}) {
  const sql = getSql()
  if (status) {
    const rows = await sql`
      SELECT ${sql.unsafe(REPORT_COLUMNS)}
      FROM sentinel_ngo_reports
      WHERE project_id = ${projectId} AND status = ${status}
      ORDER BY generated_at DESC LIMIT ${limit}
    `
    return rows.map(normalizeReport)
  }
  const rows = await sql`
    SELECT ${sql.unsafe(REPORT_COLUMNS)}
    FROM sentinel_ngo_reports
    WHERE project_id = ${projectId}
    ORDER BY generated_at DESC LIMIT ${limit}
  `
  return rows.map(normalizeReport)
}

/**
 * List reports for an organization, optionally filtered by status.
 */
export async function listReportsByOrg(organizationId, { status, limit = 100 } = {}) {
  const sql = getSql()
  if (status) {
    const rows = await sql`
      SELECT ${sql.unsafe(REPORT_COLUMNS)}
      FROM sentinel_ngo_reports
      WHERE organization_id = ${organizationId} AND status = ${status}
      ORDER BY generated_at DESC LIMIT ${limit}
    `
    return rows.map(normalizeReport)
  }
  const rows = await sql`
    SELECT ${sql.unsafe(REPORT_COLUMNS)}
    FROM sentinel_ngo_reports
    WHERE organization_id = ${organizationId}
    ORDER BY generated_at DESC LIMIT ${limit}
  `
  return rows.map(normalizeReport)
}

/**
 * Create a new report in DRAFT status.
 */
export async function createReport(report) {
  const sql = getSql()
  await sql`
    INSERT INTO sentinel_ngo_reports
      (id, project_id, organization_id, title, report_type, sections,
       branding_id, generated_by, status, updated_by, exported_formats)
    VALUES (${report.id}, ${report.projectId}, ${report.organizationId},
            ${report.title}, ${report.reportType || 'CUSTOM'},
            ${JSON.stringify(report.sections || [])},
            ${report.brandingId || null}, ${report.generatedBy},
            'DRAFT', ${report.generatedBy},
            ${JSON.stringify(report.exportedFormats || [])})
  `
}

/**
 * Update report content (title, sections). Only allowed in DRAFT status.
 */
export async function updateReportContent(reportId, { title, sections, updatedBy }) {
  const sql = getSql()
  const rows = await sql`
    UPDATE sentinel_ngo_reports
    SET title = COALESCE(${title}, title),
        sections = COALESCE(${sections ? JSON.stringify(sections) : null}, sections),
        updated_by = ${updatedBy},
        updated_at = NOW()
    WHERE id = ${reportId} AND status = 'DRAFT'
    RETURNING id
  `
  return rows.length > 0
}

/**
 * Transition report from DRAFT -> SUBMITTED.
 */
export async function submitReport(reportId, submittedBy) {
  const sql = getSql()
  const rows = await sql`
    UPDATE sentinel_ngo_reports
    SET status = 'SUBMITTED',
        submitted_by = ${submittedBy},
        submitted_at = NOW(),
        updated_by = ${submittedBy},
        updated_at = NOW()
    WHERE id = ${reportId} AND status = 'DRAFT'
    RETURNING id
  `
  if (rows.length > 0) {
    await recordTransition(sql, reportId, 'DRAFT', 'SUBMITTED', submittedBy)
  }
  return rows.length > 0
}

/**
 * Transition report from SUBMITTED -> APPROVED_SIGNED.
 * Requires signature hash from the digital signature system.
 */
export async function approveAndSignReport(reportId, { approvedBy, signatureHash }) {
  const sql = getSql()
  const rows = await sql`
    UPDATE sentinel_ngo_reports
    SET status = 'APPROVED_SIGNED',
        approved_by = ${approvedBy},
        approved_at = NOW(),
        signed_by = ${approvedBy},
        signed_at = NOW(),
        signature_hash = ${signatureHash},
        updated_by = ${approvedBy},
        updated_at = NOW()
    WHERE id = ${reportId} AND status = 'SUBMITTED'
    RETURNING id
  `
  if (rows.length > 0) {
    await recordTransition(sql, reportId, 'SUBMITTED', 'APPROVED_SIGNED', approvedBy, null, signatureHash)
  }
  return rows.length > 0
}

/**
 * Transition report from APPROVED_SIGNED -> PUBLISHED.
 */
export async function publishReport(reportId, publishedBy) {
  const sql = getSql()
  const rows = await sql`
    UPDATE sentinel_ngo_reports
    SET status = 'PUBLISHED',
        published_by = ${publishedBy},
        published_at = NOW(),
        updated_by = ${publishedBy},
        updated_at = NOW()
    WHERE id = ${reportId} AND status = 'APPROVED_SIGNED'
    RETURNING id
  `
  if (rows.length > 0) {
    await recordTransition(sql, reportId, 'APPROVED_SIGNED', 'PUBLISHED', publishedBy)
  }
  return rows.length > 0
}

/**
 * Revert a SUBMITTED or APPROVED_SIGNED report back to DRAFT.
 * Clears all approval/signature data.
 */
export async function revertReport(reportId, revertedBy, comment) {
  const sql = getSql()
  // Get current status for transition log
  const current = await sql`SELECT status FROM sentinel_ngo_reports WHERE id = ${reportId}`
  const fromStatus = current[0]?.status
  if (!fromStatus || fromStatus === 'DRAFT' || fromStatus === 'PUBLISHED') {
    return false
  }

  const rows = await sql`
    UPDATE sentinel_ngo_reports
    SET status = 'DRAFT',
        submitted_by = NULL,
        submitted_at = NULL,
        approved_by = NULL,
        approved_at = NULL,
        signed_by = NULL,
        signed_at = NULL,
        signature_hash = NULL,
        published_by = NULL,
        published_at = NULL,
        updated_by = ${revertedBy},
        updated_at = NOW()
    WHERE id = ${reportId} AND status IN ('SUBMITTED', 'APPROVED_SIGNED')
    RETURNING id
  `
  if (rows.length > 0) {
    await recordTransition(sql, reportId, fromStatus, 'DRAFT', revertedBy, comment)
  }
  return rows.length > 0
}

/**
 * Delete a report. Only allowed if not PUBLISHED.
 */
export async function deleteReport(reportId) {
  const sql = getSql()
  const rows = await sql`
    DELETE FROM sentinel_ngo_reports
    WHERE id = ${reportId} AND status != 'PUBLISHED'
    RETURNING id
  `
  return rows.length > 0
}

/**
 * Get the state transition history for a report.
 */
export async function getReportTransitions(reportId) {
  const sql = getSql()
  return sql`
    SELECT id, report_id AS "reportId", from_status AS "fromStatus",
           to_status AS "toStatus", transitioned_by AS "transitionedBy",
           comment, signature_hash AS "signatureHash",
           EXTRACT(EPOCH FROM timestamp)::BIGINT * 1000 AS "timestamp"
    FROM report_state_transitions
    WHERE report_id = ${reportId}
    ORDER BY timestamp ASC
  `
}

/** Internal: record a state transition */
async function recordTransition(sql, reportId, fromStatus, toStatus, userId, comment, signatureHash) {
  const id = `rst_${crypto.randomUUID()}`
  await sql`
    INSERT INTO report_state_transitions
      (id, report_id, from_status, to_status, transitioned_by, comment, signature_hash)
    VALUES (${id}, ${reportId}, ${fromStatus}, ${toStatus}, ${userId},
            ${comment || null}, ${signatureHash || null})
  `
}

/** Normalize a report row (parse JSON columns) */
function normalizeReport(row) {
  return {
    ...row,
    sections: typeof row.sections === "string" ? JSON.parse(row.sections) : (row.sections || []),
    exportedFormats: typeof row.exportedFormats === "string"
      ? JSON.parse(row.exportedFormats)
      : (row.exportedFormats || []),
    generatedAt: Number(row.generatedAt) || null,
    submittedAt: row.submittedAt ? Number(row.submittedAt) : null,
    approvedAt: row.approvedAt ? Number(row.approvedAt) : null,
    signedAt: row.signedAt ? Number(row.signedAt) : null,
    publishedAt: row.publishedAt ? Number(row.publishedAt) : null,
    updatedAt: row.updatedAt ? Number(row.updatedAt) : null,
  }
}

// ─────────────────────────── Audit Log ───────────────────────────

/**
 * Write an audit log entry.
 */
export async function writeAuditLog(entry) {
  const sql = getSql()
  const id = `audit_${crypto.randomUUID()}`
  await sql`
    INSERT INTO sentinel_audit_logs
      (id, user_id, action, resource, resource_id, metadata, ip_address, success)
    VALUES (${id}, ${entry.userId}, ${entry.action}, ${entry.resource},
            ${entry.resourceId || null},
            ${entry.metadata ? JSON.stringify(entry.metadata) : null},
            ${entry.ipAddress || null}, ${entry.success ?? true})
  `
  return id
}

/**
 * Get recent audit logs (optionally filtered by user or action).
 * Kept for backward compatibility — delegates to getAuditLogsAdvanced.
 */
export async function getAuditLogs({ userId, action, limit = 100 } = {}) {
  return getAuditLogsAdvanced({ userId, action, limit })
}

const AUDIT_COLUMNS = `
  id, user_id AS "userId", action, resource,
  resource_id AS "resourceId", metadata, ip_address AS "ipAddress",
  success, EXTRACT(EPOCH FROM timestamp)::BIGINT * 1000 AS "timestamp"
`

/**
 * Advanced audit log query with full filtering, pagination, and date range.
 *
 * @param {object} opts
 * @param {string}  [opts.userId]     - Filter by acting user
 * @param {string}  [opts.action]     - Filter by action type (e.g. "LOGIN", "CREATE")
 * @param {string}  [opts.resource]   - Filter by resource type (e.g. "ngo-report", "module-permission")
 * @param {string}  [opts.resourceId] - Filter by specific resource ID
 * @param {boolean} [opts.success]    - Filter by success/failure
 * @param {number}  [opts.fromTs]     - Start of date range (epoch ms)
 * @param {number}  [opts.toTs]       - End of date range (epoch ms)
 * @param {number}  [opts.limit]      - Max rows (default 100, max 500)
 * @param {number}  [opts.offset]     - Offset for pagination (default 0)
 * @returns {Promise<{ logs: Array, total: number }>}
 */
export async function getAuditLogsAdvanced({
  userId, action, resource, resourceId, success,
  fromTs, toTs, limit = 100, offset = 0,
} = {}) {
  const sql = getSql()
  const conditions = []
  const params = []
  let paramIdx = 1

  if (userId) {
    conditions.push(`user_id = $${paramIdx++}`)
    params.push(userId)
  }
  if (action) {
    conditions.push(`action = $${paramIdx++}`)
    params.push(action)
  }
  if (resource) {
    conditions.push(`resource = $${paramIdx++}`)
    params.push(resource)
  }
  if (resourceId) {
    conditions.push(`resource_id = $${paramIdx++}`)
    params.push(resourceId)
  }
  if (success !== undefined) {
    conditions.push(`success = $${paramIdx++}`)
    params.push(success)
  }
  if (fromTs) {
    conditions.push(`timestamp >= to_timestamp($${paramIdx++}::DOUBLE PRECISION / 1000)`)
    params.push(fromTs)
  }
  if (toTs) {
    conditions.push(`timestamp <= to_timestamp($${paramIdx++}::DOUBLE PRECISION / 1000)`)
    params.push(toTs)
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : ""
  const safeLimit = Math.min(Math.max(limit, 1), 500)
  const safeOffset = Math.max(offset, 0)

  // Count total matching rows (for pagination)
  const countQuery = `SELECT COUNT(*)::INTEGER AS total FROM sentinel_audit_logs ${whereClause}`
  const countResult = await sql.unsafe(countQuery, params)
  const total = countResult[0]?.total || 0

  // Fetch page
  const dataQuery = `
    SELECT ${AUDIT_COLUMNS}
    FROM sentinel_audit_logs
    ${whereClause}
    ORDER BY timestamp DESC
    LIMIT $${paramIdx++} OFFSET $${paramIdx++}
  `
  const logs = await sql.unsafe(dataQuery, [...params, safeLimit, safeOffset])

  return { logs: logs.map(normalizeAuditLog), total }
}

/**
 * Get audit log aggregation stats.
 * Returns counts by action, resource, and time buckets.
 *
 * @param {object} opts
 * @param {number} [opts.fromTs] - Start epoch ms (default: 30 days ago)
 * @param {number} [opts.toTs]   - End epoch ms (default: now)
 * @param {string} [opts.userId] - Optionally scope to a single user
 * @returns {Promise<object>} { byAction, byResource, byDay, totalEvents, failedEvents }
 */
export async function getAuditStats({ fromTs, toTs, userId } = {}) {
  const sql = getSql()
  const defaultFrom = Date.now() - 30 * 24 * 60 * 60 * 1000
  const from = fromTs || defaultFrom
  const to = toTs || Date.now()

  // Build parameterized user filter (NEVER interpolate userId into SQL strings)
  const userFilterClause = userId ? "AND user_id = $3" : ""
  const baseParams = userId ? [from, to, userId] : [from, to]

  // Counts by action
  const byAction = await sql.unsafe(`
    SELECT action, COUNT(*)::INTEGER AS count
    FROM sentinel_audit_logs
    WHERE timestamp >= to_timestamp($1::DOUBLE PRECISION / 1000)
      AND timestamp <= to_timestamp($2::DOUBLE PRECISION / 1000)
      ${userFilterClause}
    GROUP BY action
    ORDER BY count DESC
  `, baseParams)

  // Counts by resource
  const byResource = await sql.unsafe(`
    SELECT resource, COUNT(*)::INTEGER AS count
    FROM sentinel_audit_logs
    WHERE timestamp >= to_timestamp($1::DOUBLE PRECISION / 1000)
      AND timestamp <= to_timestamp($2::DOUBLE PRECISION / 1000)
      ${userFilterClause}
    GROUP BY resource
    ORDER BY count DESC
  `, baseParams)

  // Counts by day (for timeline chart)
  const byDay = await sql.unsafe(`
    SELECT DATE(timestamp) AS day, COUNT(*)::INTEGER AS count
    FROM sentinel_audit_logs
    WHERE timestamp >= to_timestamp($1::DOUBLE PRECISION / 1000)
      AND timestamp <= to_timestamp($2::DOUBLE PRECISION / 1000)
      ${userFilterClause}
    GROUP BY DATE(timestamp)
    ORDER BY day ASC
  `, baseParams)

  // Total + failed counts
  const totals = await sql.unsafe(`
    SELECT
      COUNT(*)::INTEGER AS "totalEvents",
      COUNT(*) FILTER (WHERE success = false)::INTEGER AS "failedEvents"
    FROM sentinel_audit_logs
    WHERE timestamp >= to_timestamp($1::DOUBLE PRECISION / 1000)
      AND timestamp <= to_timestamp($2::DOUBLE PRECISION / 1000)
      ${userFilterClause}
  `, baseParams)

  return {
    byAction,
    byResource,
    byDay: byDay.map(r => ({ day: r.day, count: r.count })),
    totalEvents: totals[0]?.totalEvents || 0,
    failedEvents: totals[0]?.failedEvents || 0,
  }
}

/**
 * Get admin system overview stats.
 * Returns counts of users, orgs, subscriptions, reports, and module subscriptions.
 */
export async function getSystemStats() {
  const sql = getSql()

  const [users, orgs, subs, reports, modSubs, recentLogins] = await Promise.all([
    sql`SELECT COUNT(*)::INTEGER AS total,
               COUNT(*) FILTER (WHERE is_active = true)::INTEGER AS active
        FROM sentinel_users`,
    sql`SELECT COUNT(*)::INTEGER AS total FROM sentinel_organizations`,
    sql`SELECT
          COUNT(*)::INTEGER AS total,
          COUNT(*) FILTER (WHERE status = 'ACTIVE')::INTEGER AS active,
          COUNT(*) FILTER (WHERE status = 'EXPIRED')::INTEGER AS expired
        FROM sentinel_user_subscriptions`,
    sql`SELECT
          COUNT(*)::INTEGER AS total,
          COUNT(*) FILTER (WHERE status = 'DRAFT')::INTEGER AS drafts,
          COUNT(*) FILTER (WHERE status = 'SUBMITTED')::INTEGER AS submitted,
          COUNT(*) FILTER (WHERE status = 'APPROVED_SIGNED')::INTEGER AS "approvedSigned",
          COUNT(*) FILTER (WHERE status = 'PUBLISHED')::INTEGER AS published
        FROM sentinel_ngo_reports`,
    sql`SELECT
          COUNT(*)::INTEGER AS total,
          COUNT(*) FILTER (WHERE status = 'ACTIVE')::INTEGER AS active,
          COUNT(*) FILTER (WHERE status = 'TRIAL')::INTEGER AS trial,
          COUNT(*) FILTER (WHERE status = 'EXPIRED')::INTEGER AS expired,
          COUNT(*) FILTER (WHERE status = 'CANCELLED')::INTEGER AS cancelled
        FROM sentinel_org_module_subscriptions`,
    sql`SELECT COUNT(*)::INTEGER AS count
        FROM sentinel_audit_logs
        WHERE action = 'LOGIN'
          AND timestamp > NOW() - INTERVAL '7 days'`,
  ])

  return {
    users: { total: users[0]?.total || 0, active: users[0]?.active || 0 },
    organizations: { total: orgs[0]?.total || 0 },
    subscriptions: {
      total: subs[0]?.total || 0,
      active: subs[0]?.active || 0,
      expired: subs[0]?.expired || 0,
    },
    reports: {
      total: reports[0]?.total || 0,
      drafts: reports[0]?.drafts || 0,
      submitted: reports[0]?.submitted || 0,
      approvedSigned: reports[0]?.approvedSigned || 0,
      published: reports[0]?.published || 0,
    },
    moduleSubscriptions: {
      total: modSubs[0]?.total || 0,
      active: modSubs[0]?.active || 0,
      trial: modSubs[0]?.trial || 0,
      expired: modSubs[0]?.expired || 0,
      cancelled: modSubs[0]?.cancelled || 0,
    },
    recentLogins7d: recentLogins[0]?.count || 0,
  }
}

/** Normalize an audit log row */
function normalizeAuditLog(row) {
  return {
    ...row,
    metadata: typeof row.metadata === "string" ? JSON.parse(row.metadata) : (row.metadata || null),
    timestamp: Number(row.timestamp) || 0,
  }
}

// ────────────────────── Org Module Subscriptions (Phase 3) ───────

const ORG_MOD_SUB_COLUMNS = `
  id, organization_id AS "organizationId", module_name AS "moduleName",
  tier, status, max_seats AS "maxSeats",
  EXTRACT(EPOCH FROM starts_at)::BIGINT * 1000 AS "startsAt",
  CASE WHEN expires_at IS NOT NULL
       THEN EXTRACT(EPOCH FROM expires_at)::BIGINT * 1000
       ELSE NULL END AS "expiresAt",
  auto_renew AS "autoRenew",
  grace_period_days AS "gracePeriodDays",
  provisioned_by AS "provisionedBy",
  EXTRACT(EPOCH FROM provisioned_at)::BIGINT * 1000 AS "provisionedAt",
  CASE WHEN cancelled_at IS NOT NULL
       THEN EXTRACT(EPOCH FROM cancelled_at)::BIGINT * 1000
       ELSE NULL END AS "cancelledAt",
  cancelled_by AS "cancelledBy",
  metadata,
  EXTRACT(EPOCH FROM created_at)::BIGINT * 1000 AS "createdAt",
  EXTRACT(EPOCH FROM updated_at)::BIGINT * 1000 AS "updatedAt"
`

/**
 * Get a single org module subscription by org + module.
 * Returns null if not found.
 */
export async function getOrgModuleSubscription(orgId, moduleName) {
  const sql = getSql()
  const rows = await sql.unsafe(
    `SELECT ${ORG_MOD_SUB_COLUMNS}
     FROM sentinel_org_module_subscriptions
     WHERE organization_id = $1 AND module_name = $2
     LIMIT 1`,
    [orgId, moduleName]
  )
  return rows.length > 0 ? normalizeOrgModSub(rows[0]) : null
}

/**
 * List all module subscriptions for an org.
 * Optionally filter by status.
 */
export async function listOrgModuleSubscriptions(orgId, { status } = {}) {
  const sql = getSql()
  let rows
  if (status) {
    rows = await sql.unsafe(
      `SELECT ${ORG_MOD_SUB_COLUMNS}
       FROM sentinel_org_module_subscriptions
       WHERE organization_id = $1 AND status = $2
       ORDER BY module_name`,
      [orgId, status]
    )
  } else {
    rows = await sql.unsafe(
      `SELECT ${ORG_MOD_SUB_COLUMNS}
       FROM sentinel_org_module_subscriptions
       WHERE organization_id = $1
       ORDER BY module_name`,
      [orgId]
    )
  }
  return rows.map(normalizeOrgModSub)
}

/**
 * Create (provision) a new org module subscription.
 * Upserts: if the org already has a row for this module, it is updated.
 */
export async function createOrgModuleSubscription({
  organizationId, moduleName, tier = "BASIC", maxSeats = 1,
  expiresAt = null, autoRenew = false, gracePeriodDays = 7,
  provisionedBy, status = "ACTIVE", metadata = {}
}) {
  const sql = getSql()
  const id = `omsub_${crypto.randomUUID()}`
  const expiresTimestamp = expiresAt ? new Date(expiresAt).toISOString() : null
  const rows = await sql`
    INSERT INTO sentinel_org_module_subscriptions
      (id, organization_id, module_name, tier, status, max_seats,
       expires_at, auto_renew, grace_period_days, provisioned_by, metadata)
    VALUES (${id}, ${organizationId}, ${moduleName}, ${tier}, ${status},
            ${maxSeats}, ${expiresTimestamp}::TIMESTAMPTZ, ${autoRenew},
            ${gracePeriodDays}, ${provisionedBy}, ${JSON.stringify(metadata)})
    ON CONFLICT (organization_id, module_name) DO UPDATE SET
      tier = EXCLUDED.tier,
      status = EXCLUDED.status,
      max_seats = EXCLUDED.max_seats,
      expires_at = EXCLUDED.expires_at,
      auto_renew = EXCLUDED.auto_renew,
      grace_period_days = EXCLUDED.grace_period_days,
      provisioned_by = EXCLUDED.provisioned_by,
      metadata = EXCLUDED.metadata,
      updated_at = NOW()
    RETURNING id
  `
  return rows[0]?.id || id
}

/**
 * Update an existing org module subscription.
 * Accepts partial updates: tier, maxSeats, status, expiresAt, autoRenew, gracePeriodDays, metadata.
 */
export async function updateOrgModuleSubscription(orgId, moduleName, updates) {
  const sql = getSql()
  // Build SET clauses dynamically
  const setClauses = []
  const params = []
  let paramIdx = 1

  if (updates.tier !== undefined) {
    setClauses.push(`tier = $${paramIdx++}`)
    params.push(updates.tier)
  }
  if (updates.maxSeats !== undefined) {
    setClauses.push(`max_seats = $${paramIdx++}`)
    params.push(updates.maxSeats)
  }
  if (updates.status !== undefined) {
    setClauses.push(`status = $${paramIdx++}`)
    params.push(updates.status)
  }
  if (updates.expiresAt !== undefined) {
    setClauses.push(`expires_at = $${paramIdx++}::TIMESTAMPTZ`)
    params.push(updates.expiresAt ? new Date(updates.expiresAt).toISOString() : null)
  }
  if (updates.autoRenew !== undefined) {
    setClauses.push(`auto_renew = $${paramIdx++}`)
    params.push(updates.autoRenew)
  }
  if (updates.gracePeriodDays !== undefined) {
    setClauses.push(`grace_period_days = $${paramIdx++}`)
    params.push(updates.gracePeriodDays)
  }
  if (updates.metadata !== undefined) {
    setClauses.push(`metadata = $${paramIdx++}`)
    params.push(JSON.stringify(updates.metadata))
  }

  if (setClauses.length === 0) return false

  setClauses.push("updated_at = NOW()")
  params.push(orgId, moduleName)

  const query = `
    UPDATE sentinel_org_module_subscriptions
    SET ${setClauses.join(", ")}
    WHERE organization_id = $${paramIdx++} AND module_name = $${paramIdx++}
    RETURNING id
  `
  const rows = await sql.unsafe(query, params)
  return rows.length > 0
}

/**
 * Cancel an org module subscription.
 * Sets status to CANCELLED and records who/when.
 */
export async function cancelOrgModuleSubscription(orgId, moduleName, cancelledBy) {
  const sql = getSql()
  const rows = await sql`
    UPDATE sentinel_org_module_subscriptions
    SET status = 'CANCELLED',
        cancelled_at = NOW(),
        cancelled_by = ${cancelledBy},
        updated_at = NOW()
    WHERE organization_id = ${orgId}
      AND module_name = ${moduleName}
      AND status NOT IN ('CANCELLED')
    RETURNING id
  `
  return rows.length > 0
}

/**
 * Count active seats for an org+module.
 * "Seats used" = number of active (non-expired) module_permissions rows for this org+module.
 */
export async function countModuleSeats(orgId, moduleName) {
  const sql = getSql()
  const rows = await sql`
    SELECT COUNT(*)::INTEGER AS "usedSeats"
    FROM sentinel_module_permissions
    WHERE organization_id = ${orgId}
      AND module_name = ${moduleName}
      AND (expires_at IS NULL OR expires_at > NOW())
  `
  return rows[0]?.usedSeats || 0
}

/**
 * Check if seats are available for granting a new module permission.
 * Returns { available: boolean, usedSeats, maxSeats, subscription? }.
 */
export async function checkModuleSeatsAvailable(orgId, moduleName) {
  const sub = await getOrgModuleSubscription(orgId, moduleName)
  if (!sub) {
    return { available: false, usedSeats: 0, maxSeats: 0, reason: "No module subscription found" }
  }
  const activeStatuses = ["ACTIVE", "TRIAL", "GRACE_PERIOD"]
  if (!activeStatuses.includes(sub.status)) {
    return { available: false, usedSeats: 0, maxSeats: sub.maxSeats, reason: `Subscription status is ${sub.status}` }
  }
  // Check expiry (if not in grace period handling — the status already covers this)
  if (sub.expiresAt && sub.status !== "GRACE_PERIOD") {
    const now = Date.now()
    if (now > sub.expiresAt) {
      return { available: false, usedSeats: 0, maxSeats: sub.maxSeats, reason: "Subscription has expired" }
  }
}
  const usedSeats = await countModuleSeats(orgId, moduleName)
  return {
    available: usedSeats < sub.maxSeats,
    usedSeats,
    maxSeats: sub.maxSeats,
    subscription: sub,
  }
}

/**
 * Get subscriptions expiring within N days. Used for renewal notifications.
 */
export async function getExpiringSubscriptions(withinDays = 30) {
  const sql = getSql()
  const rows = await sql.unsafe(
    `SELECT ${ORG_MOD_SUB_COLUMNS}
     FROM sentinel_org_module_subscriptions
     WHERE status IN ('ACTIVE', 'TRIAL')
       AND expires_at IS NOT NULL
       AND expires_at <= NOW() + INTERVAL '1 day' * $1
       AND expires_at > NOW()
     ORDER BY expires_at ASC`,
    [withinDays]
  )
  return rows.map(normalizeOrgModSub)
}

/**
 * Transition expired subscriptions to GRACE_PERIOD or EXPIRED.
 * Call this periodically (cron / startup).
 * Returns count of rows transitioned.
 */
export async function processExpiredSubscriptions() {
  const sql = getSql()

  // Active/Trial -> GRACE_PERIOD (past expires_at but within grace)
  const toGrace = await sql`
    UPDATE sentinel_org_module_subscriptions
    SET status = 'GRACE_PERIOD', updated_at = NOW()
    WHERE status IN ('ACTIVE', 'TRIAL')
      AND expires_at IS NOT NULL
      AND expires_at < NOW()
      AND expires_at + (grace_period_days || ' days')::INTERVAL > NOW()
    RETURNING id
  `

  // GRACE_PERIOD -> EXPIRED (past grace period)
  const toExpired = await sql`
    UPDATE sentinel_org_module_subscriptions
    SET status = 'EXPIRED', updated_at = NOW()
    WHERE status = 'GRACE_PERIOD'
      AND expires_at IS NOT NULL
      AND expires_at + (grace_period_days || ' days')::INTERVAL <= NOW()
    RETURNING id
  `

  return { graced: toGrace.length, expired: toExpired.length }
}

/** Normalize an org module subscription row */
function normalizeOrgModSub(row) {
  return {
    ...row,
    metadata: typeof row.metadata === "string" ? JSON.parse(row.metadata) : (row.metadata || {}),
    startsAt: Number(row.startsAt) || null,
    expiresAt: row.expiresAt ? Number(row.expiresAt) : null,
    provisionedAt: Number(row.provisionedAt) || null,
    cancelledAt: row.cancelledAt ? Number(row.cancelledAt) : null,
    createdAt: Number(row.createdAt) || null,
    updatedAt: Number(row.updatedAt) || null,
    maxSeats: Number(row.maxSeats) || 1,
    gracePeriodDays: Number(row.gracePeriodDays) || 7,
  }
}

// ─────────────────────────── Proxy Query Execution ────────────────

/**
 * C4/C5 fix: Execute a parameterized SQL query through the backend.
 * Used by the frontend proxy endpoint to route DB queries through
 * the backend instead of direct browser-to-database connections.
 *
 * @param {string} query - The SQL query with $1, $2, etc. placeholders
 * @param {Array} params - Array of parameter values
 * @returns {Promise<Array>} Query result rows
 */
export async function executeProxyQuery(query, params = []) {
  const sql = getSql()
  // The frontend passes a Postgres parameterized string: "SELECT * FROM t WHERE id = $1"
  // Neon's tagged template literal function no longer accepts (string, array) directly.
  // We can use the exposed `.query` method (or cast it).
  // Error message said: "For a conventional function call with value placeholders ($1, $2, etc.), use sql.query(...)"
  
  if (typeof sql.query === 'function') {
    return await sql.query(query, params)
  } else {
    // If not available, we have to fake the template strings array
    // Since it's parameterized with $1, $2, this is hacky. But `sql.query` should exist.
    // As a fallback, we just call it as tagged template with single string.
    return await sql([query], ...params)
  }
}
