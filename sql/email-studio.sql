-- ============================================================================
-- Email Studio schema — Neon Postgres
-- ----------------------------------------------------------------------------
-- Idempotent. Safe to re-run. Mirrors what backend/db.mjs ensureSentinelTables()
-- creates automatically on server start, so running this manually is OPTIONAL —
-- use it for a fresh Neon branch or to provision before first deploy.
--
-- Usage:
--   psql "$NEON_DATABASE_URL" -f sql/email-studio.sql
-- or paste into the Neon SQL editor.
-- ============================================================================

BEGIN;

-- ── 1. Marketing opt-out flag on existing users table ──────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sentinel_users' AND column_name = 'marketing_opt_out'
  ) THEN
    ALTER TABLE sentinel_users
      ADD COLUMN marketing_opt_out BOOLEAN NOT NULL DEFAULT FALSE;
  END IF;
END $$;

-- ── 2. Brand identity (single-row) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS email_brand_identity (
  id                INTEGER PRIMARY KEY DEFAULT 1,
  brand_name        TEXT NOT NULL DEFAULT 'Novus Sparks AI',
  tagline           TEXT,
  voice_description TEXT NOT NULL DEFAULT
    'Warm, confident, founder-personal. Technical but approachable.',
  primary_color     TEXT NOT NULL DEFAULT '#0f766e',
  accent_color      TEXT NOT NULL DEFAULT '#f59e0b',
  logo_url          TEXT,
  founder_name      TEXT NOT NULL DEFAULT 'Umer Lone',
  founder_title     TEXT NOT NULL DEFAULT 'Founder — Novus Sparks AI',
  support_email     TEXT NOT NULL DEFAULT 'agentic@novussparks.com',
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (id = 1)
);

INSERT INTO email_brand_identity (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;

-- ── 3. Reusable email templates ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS email_templates (
  id          BIGSERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  category    TEXT NOT NULL DEFAULT 'marketing',
  subject     TEXT NOT NULL,
  body_html   TEXT NOT NULL,
  variables   JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 4. Campaigns (one per send-out) ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS email_campaigns (
  id                BIGSERIAL PRIMARY KEY,
  template_id       BIGINT REFERENCES email_templates(id) ON DELETE SET NULL,
  name              TEXT NOT NULL DEFAULT 'Untitled campaign',
  subject           TEXT NOT NULL,
  body_html         TEXT NOT NULL,
  intent            TEXT NOT NULL DEFAULT 'marketing',
  audience_filter   JSONB NOT NULL DEFAULT '{}'::jsonb,
  status            TEXT NOT NULL DEFAULT 'draft',
                    -- draft | scheduled | sending | completed | cancelled
  scheduled_for     TIMESTAMPTZ,
  total_recipients  INTEGER NOT NULL DEFAULT 0,
  sent_count        INTEGER NOT NULL DEFAULT 0,
  failed_count      INTEGER NOT NULL DEFAULT 0,
  skipped_count     INTEGER NOT NULL DEFAULT 0,
  created_by        TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at        TIMESTAMPTZ,
  completed_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_email_campaigns_status_scheduled
  ON email_campaigns (status, scheduled_for);

-- ── 5. Per-campaign recipient list (frozen at create-time, resumable) ──────
CREATE TABLE IF NOT EXISTS email_campaign_recipients (
  id           BIGSERIAL PRIMARY KEY,
  campaign_id  BIGINT NOT NULL REFERENCES email_campaigns(id) ON DELETE CASCADE,
  user_id      TEXT NOT NULL,
  email        TEXT NOT NULL,
  full_name    TEXT,
  status       TEXT NOT NULL DEFAULT 'pending',
               -- pending | sent | failed | skipped
  sent_at      TIMESTAMPTZ,
  error        TEXT,
  UNIQUE (campaign_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_email_recipients_campaign_status
  ON email_campaign_recipients (campaign_id, status);

COMMIT;

-- ── Verify ─────────────────────────────────────────────────────────────────
-- SELECT table_name FROM information_schema.tables
-- WHERE table_name LIKE 'email_%' ORDER BY table_name;
--
-- SELECT * FROM email_brand_identity;
