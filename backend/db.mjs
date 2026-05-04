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

          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sentinel_users' AND column_name = 'microsoft_id') THEN
            ALTER TABLE sentinel_users ADD COLUMN microsoft_id TEXT UNIQUE;
          END IF;
        END IF;
      END $$
    `

    // Track emails of deleted accounts so we can detect re-signups and skip the welcome bonus email.
    await sql`
      CREATE TABLE IF NOT EXISTS sentinel_deleted_emails (
        email TEXT PRIMARY KEY,
        original_user_id TEXT,
        deleted_by TEXT NOT NULL DEFAULT 'admin',
        reason TEXT,
        deleted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        rejoined_at TIMESTAMPTZ,
        rejoin_count INTEGER NOT NULL DEFAULT 0
      )
    `

    // ── Email Studio (admin marketing campaigns) ─────────────────────────
    // Marketing opt-out flag on user (transactional emails ignore this).
    await sql`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'sentinel_users' AND column_name = 'marketing_opt_out'
        ) THEN
          ALTER TABLE sentinel_users ADD COLUMN marketing_opt_out BOOLEAN NOT NULL DEFAULT FALSE;
        END IF;
      END $$
    `

    // Brand identity — drives AI voice + email visuals (single-row table).
    await sql`
      CREATE TABLE IF NOT EXISTS email_brand_identity (
        id INTEGER PRIMARY KEY DEFAULT 1,
        brand_name TEXT NOT NULL DEFAULT 'Novus Sparks AI',
        tagline TEXT,
        voice_description TEXT NOT NULL DEFAULT 'Warm, confident, founder-personal. Technical but approachable.',
        primary_color TEXT NOT NULL DEFAULT '#0f766e',
        accent_color TEXT NOT NULL DEFAULT '#f59e0b',
        logo_url TEXT,
        founder_name TEXT NOT NULL DEFAULT 'Umer Lone',
        founder_title TEXT NOT NULL DEFAULT 'Founder — Novus Sparks AI',
        support_email TEXT NOT NULL DEFAULT 'agentic@novussparks.com',
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CHECK (id = 1)
      )
    `
    await sql`
      INSERT INTO email_brand_identity (id) VALUES (1) ON CONFLICT (id) DO NOTHING
    `

    // Reusable templates (saved drafts).
    await sql`
      CREATE TABLE IF NOT EXISTS email_templates (
        id BIGSERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT 'marketing',
        subject TEXT NOT NULL,
        body_html TEXT NOT NULL,
        variables JSONB NOT NULL DEFAULT '[]'::jsonb,
        created_by TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `

    // Campaigns — one row per send-out.
    await sql`
      CREATE TABLE IF NOT EXISTS email_campaigns (
        id BIGSERIAL PRIMARY KEY,
        template_id BIGINT REFERENCES email_templates(id) ON DELETE SET NULL,
        name TEXT NOT NULL DEFAULT 'Untitled campaign',
        subject TEXT NOT NULL,
        body_html TEXT NOT NULL,
        intent TEXT NOT NULL DEFAULT 'marketing',
        audience_filter JSONB NOT NULL DEFAULT '{}'::jsonb,
        status TEXT NOT NULL DEFAULT 'draft',
        scheduled_for TIMESTAMPTZ,
        total_recipients INTEGER NOT NULL DEFAULT 0,
        sent_count INTEGER NOT NULL DEFAULT 0,
        failed_count INTEGER NOT NULL DEFAULT 0,
        skipped_count INTEGER NOT NULL DEFAULT 0,
        created_by TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        started_at TIMESTAMPTZ,
        completed_at TIMESTAMPTZ
      )
    `
    await sql`
      CREATE INDEX IF NOT EXISTS idx_email_campaigns_status_scheduled
        ON email_campaigns (status, scheduled_for)
    `

    // Frozen recipient list per campaign (idempotent + resumable).
    await sql`
      CREATE TABLE IF NOT EXISTS email_campaign_recipients (
        id BIGSERIAL PRIMARY KEY,
        campaign_id BIGINT NOT NULL REFERENCES email_campaigns(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL,
        email TEXT NOT NULL,
        full_name TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        sent_at TIMESTAMPTZ,
        error TEXT,
        UNIQUE (campaign_id, user_id)
      )
    `
    await sql`
      CREATE INDEX IF NOT EXISTS idx_email_recipients_campaign_status
        ON email_campaign_recipients (campaign_id, status)
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
        provider_order TEXT[] NOT NULL DEFAULT ARRAY['copilot','spark','groq','deepseek','gemini','sentinel'],
        web_provider_order TEXT[] NOT NULL DEFAULT ARRAY['searchcans','serpapi','duckduckgo','sentinel'],
        enabled_providers JSONB NOT NULL DEFAULT '{"copilot":true,"groq":true,"spark":true,"deepseek":true,"gemini":true,"sentinel":true}'::jsonb,
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

    // Append DeepSeek to existing routing rows (idempotent — no-op if already present)
    await sql`
      UPDATE sentinel_provider_routing
      SET provider_order = provider_order || ARRAY['deepseek']::TEXT[],
          updated_at = now()
      WHERE NOT ('deepseek' = ANY(provider_order))
    `
    await sql`
      UPDATE sentinel_provider_routing
      SET enabled_providers = enabled_providers || jsonb_build_object('deepseek', true),
          updated_at = now()
      WHERE NOT (enabled_providers ? 'deepseek')
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

    // App-wide email configuration (singleton row keyed by id='default').
    // Sensitive secrets (smtp_password_enc, imap_password_enc, graph_client_secret_enc)
    // are stored as base64(AES-256-GCM(JWT_SECRET-derived key)) — see encryptSecret/decryptSecret.
    await sql`
      CREATE TABLE IF NOT EXISTS app_email_config (
        id TEXT PRIMARY KEY DEFAULT 'default',
        provider TEXT NOT NULL DEFAULT 'graph',
        from_email TEXT,
        from_name TEXT,
        reply_to TEXT,
        admin_notification_email TEXT,
        smtp_host TEXT,
        smtp_port INTEGER,
        smtp_secure BOOLEAN NOT NULL DEFAULT true,
        smtp_user TEXT,
        smtp_password_enc TEXT,
        imap_host TEXT,
        imap_port INTEGER,
        imap_secure BOOLEAN NOT NULL DEFAULT true,
        imap_user TEXT,
        imap_password_enc TEXT,
        graph_tenant_id TEXT,
        graph_client_id TEXT,
        graph_client_secret_enc TEXT,
        graph_sender_email TEXT,
        graph_sender_name TEXT,
        updated_by TEXT,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `

    console.log("[db] Sentinel tables verified")
  } catch (err) {
    console.warn("[db] Sentinel tables not found — run migrations first:", err.message)
  }
}

function normalizeRoutingRow(row) {
  const providerOrder = Array.isArray(row.provider_order)
    ? row.provider_order
    : ["copilot", "spark", "groq", "deepseek", "gemini", "sentinel"]

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
    providerOrder: ["copilot", "spark", "groq", "deepseek", "gemini", "sentinel"],
    webProviderOrder: ["searchcans", "serpapi", "duckduckgo", "sentinel"],
    enabledProviders: { copilot: true, groq: true, spark: true, deepseek: true, gemini: true, sentinel: true },
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
    : ["copilot", "spark", "groq", "deepseek", "gemini", "sentinel"]
  const webProviderOrder = Array.isArray(config.webProviderOrder) && config.webProviderOrder.length > 0
    ? config.webProviderOrder
    : ["searchcans", "serpapi", "duckduckgo", "sentinel"]
  const enabledProviders = config.enabledProviders || { copilot: true, groq: true, spark: true, deepseek: true, gemini: true, sentinel: true }
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
 * Get user by email (no password_hash, for admin lookups).
 */
export async function getUserByEmail(email) {
  const sql = getSql()
  const rows = await sql`
    SELECT id, email, full_name AS "fullName",
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

/**
 * Hard delete a user. Cleans up all known dependent rows first; if any
 * unknown FK still blocks the delete (NOT NULL REFERENCES sentinel_users),
 * falls back to an anonymized soft delete (is_active=false, email scrambled)
 * so the operator always gets a successful, idempotent result.
 *
 * Returns: { id, email, fullName, mode: "hard" | "soft" }
 */
export async function deleteUserById(userId, options = {}) {
  const sql = getSql()
  const deletedBy = options.deletedBy === "self" ? "self" : "admin"
  const reason = typeof options.reason === "string" ? options.reason : null

  // Capture the email BEFORE any cleanup so we can record it for re-signup detection.
  let preservedEmail = null
  try {
    const pre = await sql`SELECT email FROM sentinel_users WHERE id = ${userId} LIMIT 1`
    if (pre[0]?.email) preservedEmail = String(pre[0].email).toLowerCase()
  } catch {
    // ignore — best effort
  }

  // Best-effort cleanup of dependent rows. Each table is wrapped in its own
  // try/catch so a missing table (different deploy stage) never aborts the rest.
  const cleanupTables = [
    // Subscriptions / billing
    "sentinel_user_subscriptions",
    "sentinel_module_permissions",
    "sentinel_credit_ledger",
    "sentinel_subscription_history",
    // Auth / sessions
    "sentinel_refresh_tokens",
    "sentinel_password_resets",
    "sentinel_oauth_identities",
    "sentinel_user_sessions",
    "sentinel_login_attempts",
    // App data tied to user
    "user_style_profiles",
    "user_style_samples",
    "user_style_history",
    // Audit / activity (best-effort: keep history if FK is restrictive)
    "sentinel_user_activity",
  ]

  for (const table of cleanupTables) {
    try {
      await sql.unsafe(`DELETE FROM ${table} WHERE user_id = $1`, [userId])
    } catch {
      // Table may not exist in this deploy or column may differ — ignore.
    }
  }

  // Null out optional "actor" references that allow NULL.
  const nullableActorRefs = [
    { table: "sentinel_provider_routing", column: "updated_by" },
    { table: "app_email_config", column: "updated_by" },
    { table: "sentinel_audit_log", column: "user_id" },
    { table: "audit_logs", column: "user_id" },
  ]
  for (const ref of nullableActorRefs) {
    try {
      await sql.unsafe(`UPDATE ${ref.table} SET ${ref.column} = NULL WHERE ${ref.column} = $1`, [userId])
    } catch {
      // Ignore — table or column may not exist.
    }
  }

  // Attempt the hard delete.
  try {
    const rows = await sql`
      DELETE FROM sentinel_users
      WHERE id = ${userId}
      RETURNING id, email, full_name AS "fullName"
    `
    if (rows[0]) {
      await recordDeletedEmail(preservedEmail, userId, deletedBy, reason).catch(() => {})
      return { ...rows[0], mode: "hard", originalEmail: preservedEmail }
    }
    return null
  } catch (err) {
    // Postgres FK violation = code 23503. Fall back to anonymized soft delete.
    const code = err?.code || err?.cause?.code
    if (code === "23503") {
      console.warn(
        `[db.deleteUserById] FK constraint blocked hard delete of ${userId}; performing anonymized soft delete.`,
        err?.detail || err?.message,
      )
      // INVARIANT[sticky-user-deletion]: soft delete MUST clear OAuth provider IDs
      // (google_id, github_id, microsoft_id) and set is_active = FALSE. Email is
      // also recorded in sentinel_deleted_emails by recordDeletedEmail below.
      // Removing any of these allows deleted users to log back in. See /memories/repo/policies.md.
      const anonEmail = `deleted+${userId.slice(0, 8)}@novussparks.invalid`
      const rows = await sql`
        UPDATE sentinel_users
        SET is_active = FALSE,
            email = ${anonEmail},
            full_name = 'Deleted User',
            password_hash = '',
            avatar_url = NULL,
            organization_id = NULL,
            google_id = NULL,
            github_id = NULL,
            microsoft_id = NULL,
            updated_at = NOW()
        WHERE id = ${userId}
        RETURNING id, email, full_name AS "fullName"
      `
      if (rows[0]) {
        await recordDeletedEmail(preservedEmail, userId, deletedBy, reason).catch(() => {})
        return { ...rows[0], mode: "soft", originalEmail: preservedEmail }
      }
      return null
    }
    console.error(`[db.deleteUserById] error deleting user ${userId}:`, err)
    throw err
  }
}

// After hard delete success, also record (the success path is above — splice in here):
async function recordDeletedEmail(email, userId, deletedBy, reason) {
  if (!email) return
  const sql = getSql()
  try {
    await sql`
      INSERT INTO sentinel_deleted_emails (email, original_user_id, deleted_by, reason)
      VALUES (${email}, ${userId}, ${deletedBy}, ${reason})
      ON CONFLICT (email) DO UPDATE
        SET original_user_id = EXCLUDED.original_user_id,
            deleted_by = EXCLUDED.deleted_by,
            reason = EXCLUDED.reason,
            deleted_at = now()
    `
  } catch (err) {
    console.warn("[db.recordDeletedEmail] failed:", err?.message)
  }
}

/**
 * Returns true if this email belongs to a previously-deleted account.
 * Used by signup flows to suppress the welcome-bonus email on re-signup.
 */
export async function wasEmailDeleted(email) {
  if (!email) return false
  try {
    const sql = getSql()
    const rows = await sql`
      SELECT 1 FROM sentinel_deleted_emails WHERE email = ${String(email).toLowerCase()} LIMIT 1
    `
    return rows.length > 0
  } catch (err) {
    console.warn("[db.wasEmailDeleted] check failed (defaulting to false):", err?.message)
    return false
  }
}

/**
 * Marks a previously-deleted email as rejoined (increments rejoin_count and stamps rejoined_at).
 * Idempotent — safe to call on every re-signup of a known deleted email.
 */
export async function markEmailRejoined(email) {
  if (!email) return
  try {
    const sql = getSql()
    await sql`
      UPDATE sentinel_deleted_emails
      SET rejoined_at = now(), rejoin_count = rejoin_count + 1
      WHERE email = ${String(email).toLowerCase()}
    `
  } catch (err) {
    console.warn("[db.markEmailRejoined] failed:", err?.message)
  }
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
           COALESCE(pro_credits, 0) AS "proCredits",
           EXTRACT(EPOCH FROM assigned_at)::BIGINT * 1000 AS "assignedAt",
           EXTRACT(EPOCH FROM expires_at)::BIGINT * 1000 AS "expiresAt"
    FROM sentinel_user_subscriptions
    WHERE user_id = ${userId} AND status = 'ACTIVE'
    ORDER BY assigned_at DESC
    LIMIT 1
  `
  return rows[0] || null
}

/**
 * List all active users with their latest subscription and org tier for admin panel.
 * Returns a flat list ordered by most-recent signup first.
 */
export async function listAllUsersWithSubscriptions(limit = 500) {
  const sql = getSql()
  const safeLimit = Math.max(1, Math.min(Number(limit) || 500, 2000))
  const rows = await sql`
    SELECT
      u.id,
      u.email,
      u.full_name        AS "fullName",
      u.role,
      u.organization_id  AS "organizationId",
      u.avatar_url       AS "avatarUrl",
      u.is_active        AS "isActive",
      EXTRACT(EPOCH FROM u.created_at)::BIGINT      * 1000 AS "createdAt",
      EXTRACT(EPOCH FROM u.last_login_at)::BIGINT   * 1000 AS "lastLoginAt",
      s.tier             AS "subTier",
      s.status           AS "subStatus",
      EXTRACT(EPOCH FROM s.assigned_at)::BIGINT     * 1000 AS "subAssignedAt",
      EXTRACT(EPOCH FROM s.expires_at)::BIGINT      * 1000 AS "subExpiresAt",
      s.pro_credits                                         AS "proCredits",
      o.tier             AS "orgTier"
    FROM sentinel_users u
    LEFT JOIN LATERAL (
      SELECT tier, status, assigned_at, expires_at, pro_credits
      FROM sentinel_user_subscriptions
      WHERE user_id = u.id AND status = 'ACTIVE'
      ORDER BY assigned_at DESC
      LIMIT 1
    ) s ON TRUE
    LEFT JOIN sentinel_organizations o ON o.id = u.organization_id
    WHERE u.is_active = TRUE
    ORDER BY u.created_at DESC
    LIMIT ${safeLimit}
  `
  return rows
}

/**
 * Seed welcome credits for a new user (10 credits, 7-day BASIC trial).
 * Called once right after user creation. No-op if a subscription already exists.
 */
export async function seedWelcomeCredits(userId, assignedBy) {
  const sql = getSql()

  // Only seed if no existing subscription
  const existing = await sql`
    SELECT id FROM sentinel_user_subscriptions
    WHERE user_id = ${userId}
    LIMIT 1
  `
  if (existing.length > 0) return

  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

  await sql`
    INSERT INTO sentinel_user_subscriptions
      (id, user_id, organization_id, tier, status, assigned_by, pro_credits, expires_at, auto_renew)
    VALUES
      (${crypto.randomUUID()}, ${userId}, NULL, 'BASIC', 'ACTIVE',
       ${assignedBy || userId}, 10, ${expiresAt}, false)
    ON CONFLICT DO NOTHING
  `
}

function normalizeSubscriptionTier(tier) {
  const raw = String(tier || "").trim().toUpperCase()
  if (raw === "TEAM") return "TEAMS"
  if (raw === "TEAMS") return "TEAMS"
  if (raw === "PRO") return "PRO"
  if (raw === "ENTERPRISE") return "ENTERPRISE"
  return "BASIC"
}

/**
 * Add credits to a user's latest active subscription.
 * If no active subscription exists, create a BASIC active record and seed credits.
 */
export async function addCreditsToUserSubscription(userId, creditsToAdd, assignedBy) {
  const sql = getSql()
  const amount = Number(creditsToAdd) || 0
  if (amount <= 0) {
    throw new Error("Credits must be greater than zero")
  }

  const existing = await sql`
    SELECT id, COALESCE(pro_credits, 0) AS "proCredits"
    FROM sentinel_user_subscriptions
    WHERE user_id = ${userId} AND status = 'ACTIVE'
    ORDER BY assigned_at DESC
    LIMIT 1
  `

  if (existing.length > 0) {
    const row = await sql`
      UPDATE sentinel_user_subscriptions
      SET pro_credits = GREATEST(0, COALESCE(pro_credits, 0) + ${amount}),
          updated_at = NOW()
      WHERE id = ${existing[0].id}
      RETURNING id, user_id AS "userId", tier, status,
                COALESCE(pro_credits, 0) AS "proCredits",
                EXTRACT(EPOCH FROM assigned_at)::BIGINT * 1000 AS "assignedAt",
                EXTRACT(EPOCH FROM expires_at)::BIGINT * 1000 AS "expiresAt"
    `
    return row[0] || null
  }

  const userRows = await sql`
    SELECT organization_id AS "organizationId"
    FROM sentinel_users
    WHERE id = ${userId} AND is_active = TRUE
    LIMIT 1
  `
  const orgId = userRows[0]?.organizationId || null

  const inserted = await sql`
    INSERT INTO sentinel_user_subscriptions
      (id, user_id, subscription_id, organization_id, tier, status, assigned_by, pro_credits, expires_at, auto_renew)
    VALUES
      (${crypto.randomUUID()}, ${userId}, NULL, ${orgId}, 'BASIC', 'ACTIVE', ${assignedBy || userId}, ${amount}, NULL, false)
    RETURNING id, user_id AS "userId", tier, status,
              COALESCE(pro_credits, 0) AS "proCredits",
              EXTRACT(EPOCH FROM assigned_at)::BIGINT * 1000 AS "assignedAt",
              EXTRACT(EPOCH FROM expires_at)::BIGINT * 1000 AS "expiresAt"
  `

  return inserted[0] || null
}

/**
 * Atomically deduct credits from a user's active subscription.
 * Returns { success, remainingCredits, error }.
 *
 *   - success=false, error='no_subscription'  → no active subscription
 *   - success=false, error='insufficient'     → not enough credits (no change)
 *   - success=true,  remainingCredits=number  → deduction applied
 */
export async function consumeUserCredits(userId, amount) {
  const sql = getSql()
  const value = Math.max(1, Math.floor(Number(amount) || 0))

  const rows = await sql`
    UPDATE sentinel_user_subscriptions
    SET pro_credits = COALESCE(pro_credits, 0) - ${value},
        updated_at  = NOW()
    WHERE id = (
      SELECT id FROM sentinel_user_subscriptions
      WHERE user_id = ${userId} AND status = 'ACTIVE'
      ORDER BY assigned_at DESC
      LIMIT 1
    )
      AND COALESCE(pro_credits, 0) >= ${value}
    RETURNING COALESCE(pro_credits, 0) AS "proCredits"
  `

  if (rows.length === 0) {
    const subRows = await sql`
      SELECT COALESCE(pro_credits, 0) AS "proCredits"
      FROM sentinel_user_subscriptions
      WHERE user_id = ${userId} AND status = 'ACTIVE'
      ORDER BY assigned_at DESC
      LIMIT 1
    `
    if (subRows.length === 0) {
      return { success: false, remainingCredits: 0, error: "no_subscription" }
    }
    return { success: false, remainingCredits: subRows[0].proCredits, error: "insufficient" }
  }

  return { success: true, remainingCredits: rows[0].proCredits }
}

/**
 * Set the plan tier on a user's latest active subscription.
 * If no active subscription exists, create one with the desired tier.
 */
export async function setUserSubscriptionPlan(userId, planTier, assignedBy) {
  const sql = getSql()
  const normalizedTier = normalizeSubscriptionTier(planTier)

  const existing = await sql`
    SELECT id
    FROM sentinel_user_subscriptions
    WHERE user_id = ${userId} AND status = 'ACTIVE'
    ORDER BY assigned_at DESC
    LIMIT 1
  `

  if (existing.length > 0) {
    const row = await sql`
      UPDATE sentinel_user_subscriptions
      SET tier = ${normalizedTier},
          updated_at = NOW()
      WHERE id = ${existing[0].id}
      RETURNING id, user_id AS "userId", tier, status,
                COALESCE(pro_credits, 0) AS "proCredits",
                EXTRACT(EPOCH FROM assigned_at)::BIGINT * 1000 AS "assignedAt",
                EXTRACT(EPOCH FROM expires_at)::BIGINT * 1000 AS "expiresAt"
    `
    return row[0] || null
  }

  const userRows = await sql`
    SELECT organization_id AS "organizationId"
    FROM sentinel_users
    WHERE id = ${userId} AND is_active = TRUE
    LIMIT 1
  `
  const orgId = userRows[0]?.organizationId || null

  const inserted = await sql`
    INSERT INTO sentinel_user_subscriptions
      (id, user_id, subscription_id, organization_id, tier, status, assigned_by, pro_credits, expires_at, auto_renew)
    VALUES
      (${crypto.randomUUID()}, ${userId}, NULL, ${orgId}, ${normalizedTier}, 'ACTIVE', ${assignedBy || userId}, 0, NULL, false)
    RETURNING id, user_id AS "userId", tier, status,
              COALESCE(pro_credits, 0) AS "proCredits",
              EXTRACT(EPOCH FROM assigned_at)::BIGINT * 1000 AS "assignedAt",
              EXTRACT(EPOCH FROM expires_at)::BIGINT * 1000 AS "expiresAt"
  `

  return inserted[0] || null
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

// ─────────────────────────── App Email Config (Singleton) ───────────────

/**
 * Derive a 32-byte AES-256-GCM key from JWT_SECRET so we can encrypt SMTP/IMAP/Graph
 * passwords at rest. Falls back to a dev key when JWT_SECRET is not set; the
 * encrypted blobs are non-portable across environments by design.
 */
function getEmailSecretKey() {
  const base = process.env.JWT_SECRET || process.env.BACKEND_JWT_SECRET || "novussparks-email-config-dev-key"
  return crypto.createHash("sha256").update(`email-config:${base}`).digest()
}

/** Encrypt a plaintext secret. Returns base64(iv|tag|ciphertext) or null. */
function encryptEmailSecret(plaintext) {
  if (plaintext === null || plaintext === undefined || plaintext === "") return null
  const key = getEmailSecretKey()
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv)
  const ct = Buffer.concat([cipher.update(String(plaintext), "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, ct]).toString("base64")
}

/** Decrypt a stored secret. Returns plaintext or "" when blob is missing/invalid. */
function decryptEmailSecret(stored) {
  if (!stored) return ""
  try {
    const buf = Buffer.from(String(stored), "base64")
    if (buf.length < 12 + 16) return ""
    const iv = buf.subarray(0, 12)
    const tag = buf.subarray(12, 28)
    const ct = buf.subarray(28)
    const key = getEmailSecretKey()
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv)
    decipher.setAuthTag(tag)
    const pt = Buffer.concat([decipher.update(ct), decipher.final()])
    return pt.toString("utf8")
  } catch {
    return ""
  }
}

/** Mask a secret for safe display (returns true/false flag instead of value). */
function emailConfigPublicShape(row) {
  if (!row) return null
  return {
    provider: row.provider || "graph",
    fromEmail: row.from_email || "",
    fromName: row.from_name || "",
    replyTo: row.reply_to || "",
    adminNotificationEmail: row.admin_notification_email || "",
    smtp: {
      host: row.smtp_host || "",
      port: row.smtp_port || null,
      secure: row.smtp_secure !== false,
      user: row.smtp_user || "",
      hasPassword: Boolean(row.smtp_password_enc),
    },
    imap: {
      host: row.imap_host || "",
      port: row.imap_port || null,
      secure: row.imap_secure !== false,
      user: row.imap_user || "",
      hasPassword: Boolean(row.imap_password_enc),
    },
    graph: {
      tenantId: row.graph_tenant_id || "",
      clientId: row.graph_client_id || "",
      hasClientSecret: Boolean(row.graph_client_secret_enc),
      senderEmail: row.graph_sender_email || "",
      senderName: row.graph_sender_name || "",
    },
    updatedBy: row.updated_by || null,
    updatedAt: row.updated_at ? new Date(row.updated_at).getTime() : null,
  }
}

/**
 * Returns the stored email config including plaintext secrets (for transport use).
 * NEVER expose this object to the client — use getEmailConfigPublic instead.
 */
export async function getEmailConfigInternal() {
  if (!isDbConfigured()) return null
  try {
    const sql = getSql()
    const rows = await sql`SELECT * FROM app_email_config WHERE id = 'default' LIMIT 1`
    const row = rows[0]
    if (!row) return null
    return {
      provider: row.provider || "graph",
      fromEmail: row.from_email || "",
      fromName: row.from_name || "",
      replyTo: row.reply_to || "",
      adminNotificationEmail: row.admin_notification_email || "",
      smtp: {
        host: row.smtp_host || "",
        port: row.smtp_port || null,
        secure: row.smtp_secure !== false,
        user: row.smtp_user || "",
        password: decryptEmailSecret(row.smtp_password_enc),
      },
      imap: {
        host: row.imap_host || "",
        port: row.imap_port || null,
        secure: row.imap_secure !== false,
        user: row.imap_user || "",
        password: decryptEmailSecret(row.imap_password_enc),
      },
      graph: {
        tenantId: row.graph_tenant_id || "",
        clientId: row.graph_client_id || "",
        clientSecret: decryptEmailSecret(row.graph_client_secret_enc),
        senderEmail: row.graph_sender_email || "",
        senderName: row.graph_sender_name || "",
      },
      updatedBy: row.updated_by || null,
      updatedAt: row.updated_at ? new Date(row.updated_at).getTime() : null,
    }
  } catch (err) {
    console.warn("[db/email-config] read failed:", err?.message)
    return null
  }
}

/** Safe-for-client view of the stored email config (no secrets). */
export async function getEmailConfigPublic() {
  if (!isDbConfigured()) return null
  try {
    const sql = getSql()
    const rows = await sql`SELECT * FROM app_email_config WHERE id = 'default' LIMIT 1`
    return emailConfigPublicShape(rows[0] || null)
  } catch (err) {
    console.warn("[db/email-config] read-public failed:", err?.message)
    return null
  }
}

/**
 * Upsert the singleton email config row. Sensitive fields:
 * - smtpPassword / imapPassword / graphClientSecret are encrypted before write.
 * - When passed as undefined the existing stored secret is preserved.
 * - When passed as empty string ("") the stored secret is cleared.
 */
export async function saveEmailConfig(input, actorUserId = null) {
  const sql = getSql()
  const existing = await sql`SELECT * FROM app_email_config WHERE id = 'default' LIMIT 1`
  const prev = existing[0] || {}

  const provider = input?.provider === "smtp" ? "smtp" : "graph"
  const smtp = input?.smtp || {}
  const imap = input?.imap || {}
  const graph = input?.graph || {}

  const smtpPasswordEnc = smtp.password === undefined
    ? (prev.smtp_password_enc || null)
    : encryptEmailSecret(smtp.password)
  const imapPasswordEnc = imap.password === undefined
    ? (prev.imap_password_enc || null)
    : encryptEmailSecret(imap.password)
  const graphClientSecretEnc = graph.clientSecret === undefined
    ? (prev.graph_client_secret_enc || null)
    : encryptEmailSecret(graph.clientSecret)

  await sql`
    INSERT INTO app_email_config (
      id, provider, from_email, from_name, reply_to, admin_notification_email,
      smtp_host, smtp_port, smtp_secure, smtp_user, smtp_password_enc,
      imap_host, imap_port, imap_secure, imap_user, imap_password_enc,
      graph_tenant_id, graph_client_id, graph_client_secret_enc,
      graph_sender_email, graph_sender_name,
      updated_by, updated_at
    ) VALUES (
      'default', ${provider},
      ${input?.fromEmail || null}, ${input?.fromName || null},
      ${input?.replyTo || null}, ${input?.adminNotificationEmail || null},
      ${smtp.host || null}, ${smtp.port ? Number(smtp.port) : null},
      ${smtp.secure !== false}, ${smtp.user || null}, ${smtpPasswordEnc},
      ${imap.host || null}, ${imap.port ? Number(imap.port) : null},
      ${imap.secure !== false}, ${imap.user || null}, ${imapPasswordEnc},
      ${graph.tenantId || null}, ${graph.clientId || null}, ${graphClientSecretEnc},
      ${graph.senderEmail || null}, ${graph.senderName || null},
      ${actorUserId}, NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
      provider = EXCLUDED.provider,
      from_email = EXCLUDED.from_email,
      from_name = EXCLUDED.from_name,
      reply_to = EXCLUDED.reply_to,
      admin_notification_email = EXCLUDED.admin_notification_email,
      smtp_host = EXCLUDED.smtp_host,
      smtp_port = EXCLUDED.smtp_port,
      smtp_secure = EXCLUDED.smtp_secure,
      smtp_user = EXCLUDED.smtp_user,
      smtp_password_enc = EXCLUDED.smtp_password_enc,
      imap_host = EXCLUDED.imap_host,
      imap_port = EXCLUDED.imap_port,
      imap_secure = EXCLUDED.imap_secure,
      imap_user = EXCLUDED.imap_user,
      imap_password_enc = EXCLUDED.imap_password_enc,
      graph_tenant_id = EXCLUDED.graph_tenant_id,
      graph_client_id = EXCLUDED.graph_client_id,
      graph_client_secret_enc = EXCLUDED.graph_client_secret_enc,
      graph_sender_email = EXCLUDED.graph_sender_email,
      graph_sender_name = EXCLUDED.graph_sender_name,
      updated_by = EXCLUDED.updated_by,
      updated_at = NOW()
  `

  return getEmailConfigPublic()
}

// ─────────────────────────── Usage Events (quotas/observability) ─────────────

let _usageEventsTableReady = false
async function ensureUsageEventsTable() {
  if (_usageEventsTableReady) return
  const sql = getSql()
  await sql`
    CREATE TABLE IF NOT EXISTS usage_events (
      id BIGSERIAL PRIMARY KEY,
      user_id TEXT NOT NULL,
      action TEXT NOT NULL,
      plan TEXT,
      words INTEGER NOT NULL DEFAULT 0,
      files INTEGER NOT NULL DEFAULT 0,
      submissions INTEGER NOT NULL DEFAULT 0,
      outcome TEXT NOT NULL DEFAULT 'allowed',
      reason TEXT,
      metadata JSONB,
      ip_address TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS idx_usage_events_user_created ON usage_events (user_id, created_at DESC)`
  await sql`CREATE INDEX IF NOT EXISTS idx_usage_events_action_created ON usage_events (action, created_at DESC)`
  await sql`CREATE INDEX IF NOT EXISTS idx_usage_events_outcome_created ON usage_events (outcome, created_at DESC)`
  _usageEventsTableReady = true
}

/**
 * Persist a usage/quota event for a single user. Used by both successful
 * actions and blocked attempts (outcome = 'blocked'). Best-effort: callers
 * may swallow errors so usage logging never blocks the user-facing flow.
 */
export async function recordUsageEvent({
  userId,
  action,
  plan = null,
  words = 0,
  files = 0,
  submissions = 0,
  outcome = "allowed",
  reason = null,
  metadata = null,
  ipAddress = null,
}) {
  if (!userId || !action) {
    throw new Error("recordUsageEvent requires userId and action")
  }
  await ensureUsageEventsTable()
  const sql = getSql()
  const rows = await sql`
    INSERT INTO usage_events
      (user_id, action, plan, words, files, submissions, outcome, reason, metadata, ip_address)
    VALUES
      (${String(userId)}, ${String(action)}, ${plan},
       ${Number(words) || 0}, ${Number(files) || 0}, ${Number(submissions) || 0},
       ${String(outcome)}, ${reason},
       ${metadata ? JSON.stringify(metadata) : null}, ${ipAddress})
    RETURNING id
  `
  return rows?.[0]?.id || null
}

/**
 * Aggregated per-user activity for the admin Global Dashboard.
 *
 * @param {object} opts
 * @param {number} [opts.sinceMs] - epoch ms lower bound (default: 24h ago)
 * @param {number} [opts.limit]   - max user rows (default: 100)
 */
export async function getUsageSummary({ sinceMs, limit = 100 } = {}) {
  await ensureUsageEventsTable()
  const sql = getSql()
  const since = sinceMs ? new Date(sinceMs) : new Date(Date.now() - 24 * 60 * 60 * 1000)
  const cap = Math.max(1, Math.min(Number(limit) || 100, 500))

  const perUser = await sql`
    SELECT
      ue.user_id AS "userId",
      MAX(u.email) AS email,
      MAX(u.full_name) AS "fullName",
      MAX(ue.plan) AS plan,
      COUNT(*) FILTER (WHERE ue.action = 'rag_chat_words' AND ue.outcome = 'allowed') AS "ragMessages",
      COALESCE(SUM(ue.words) FILTER (WHERE ue.action = 'rag_chat_words' AND ue.outcome = 'allowed'), 0) AS "ragWords",
      COUNT(*) FILTER (WHERE ue.action = 'rag_chat_file' AND ue.outcome = 'allowed') AS "ragFiles",
      COUNT(*) FILTER (WHERE ue.action = 'review_file' AND ue.outcome = 'allowed') AS "reviews",
      COUNT(*) FILTER (WHERE ue.action = 'humanizer_submission' AND ue.outcome = 'allowed') AS "humanizations",
      COALESCE(SUM(ue.words) FILTER (WHERE ue.action = 'humanizer_submission' AND ue.outcome = 'allowed'), 0) AS "humanizerWords",
      COUNT(*) FILTER (WHERE ue.outcome = 'blocked') AS "blockedAttempts",
      MAX(ue.created_at) AS "lastActivity"
    FROM usage_events ue
    LEFT JOIN sentinel_users u ON u.id = ue.user_id
    WHERE ue.created_at >= ${since.toISOString()}
    GROUP BY ue.user_id
    ORDER BY "lastActivity" DESC
    LIMIT ${cap}
  `

  const totals = await sql`
    SELECT
      COUNT(*)::INTEGER AS "totalEvents",
      COUNT(DISTINCT user_id)::INTEGER AS "activeUsers",
      COUNT(*) FILTER (WHERE outcome = 'blocked')::INTEGER AS "totalBlocked",
      COALESCE(SUM(words) FILTER (WHERE action = 'rag_chat_words' AND outcome = 'allowed'), 0)::INTEGER AS "totalRagWords",
      COALESCE(SUM(words) FILTER (WHERE action = 'humanizer_submission' AND outcome = 'allowed'), 0)::INTEGER AS "totalHumanizerWords",
      COUNT(*) FILTER (WHERE action = 'review_file' AND outcome = 'allowed')::INTEGER AS "totalReviews",
      COUNT(*) FILTER (WHERE action = 'rag_chat_file' AND outcome = 'allowed')::INTEGER AS "totalChatFiles"
    FROM usage_events
    WHERE created_at >= ${since.toISOString()}
  `

  return {
    sinceMs: since.getTime(),
    perUser: Array.isArray(perUser) ? perUser : [],
    totals: totals?.[0] || {},
  }
}

/**
 * Recent blocked attempts for the Policy Violations panel.
 */
export async function getPolicyViolations({ sinceMs, limit = 100 } = {}) {
  await ensureUsageEventsTable()
  const sql = getSql()
  const since = sinceMs ? new Date(sinceMs) : new Date(Date.now() - 24 * 60 * 60 * 1000)
  const cap = Math.max(1, Math.min(Number(limit) || 100, 500))

  const rows = await sql`
    SELECT
      ue.id,
      ue.user_id AS "userId",
      u.email,
      u.full_name AS "fullName",
      ue.action,
      ue.reason,
      ue.plan,
      ue.words,
      ue.files,
      ue.metadata,
      EXTRACT(EPOCH FROM ue.created_at)::BIGINT * 1000 AS "createdAt"
    FROM usage_events ue
    LEFT JOIN sentinel_users u ON u.id = ue.user_id
    WHERE ue.outcome = 'blocked' AND ue.created_at >= ${since.toISOString()}
    ORDER BY ue.created_at DESC
    LIMIT ${cap}
  `
  return Array.isArray(rows) ? rows : []
}
