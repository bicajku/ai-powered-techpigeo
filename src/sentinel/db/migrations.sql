-- ============================================================
-- Sentinel SAAS Platform - PostgreSQL Schema (Neon)
-- Run this against your Neon database to set up all tables.
-- ============================================================

-- ─────────────────────────── Extensions ──────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─────────────────────────── Enums ───────────────────────────────
DO $$ BEGIN
  CREATE TYPE sentinel_role AS ENUM (
    'SENTINEL_COMMANDER', 'ORG_ADMIN', 'TEAM_ADMIN', 'TEAM_MEMBER', 'USER'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE subscription_tier AS ENUM (
    'BASIC', 'PRO', 'TEAMS', 'ENTERPRISE'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE subscription_status AS ENUM (
    'ACTIVE', 'PENDING', 'EXPIRED', 'CANCELLED'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE module_access_level AS ENUM (
    'READ', 'READ_WRITE', 'FULL'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE export_format AS ENUM ('PDF', 'DOCX', 'XLSX');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE document_type AS ENUM (
    'PROPOSAL', 'TEMPLATE', 'REPORT', 'DATA_FILE'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE audit_action AS ENUM (
    'LOGIN', 'LOGOUT', 'CREATE', 'READ', 'UPDATE', 'DELETE',
    'EXPORT', 'UPLOAD', 'ASSIGN_ROLE', 'ASSIGN_SUBSCRIPTION'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─────────────────────────── Users ───────────────────────────────
CREATE TABLE IF NOT EXISTS sentinel_users (
  id              TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  email           TEXT        NOT NULL UNIQUE,
  full_name       TEXT        NOT NULL,
  password_hash   TEXT        NOT NULL,
  role            sentinel_role NOT NULL DEFAULT 'USER',
  organization_id TEXT,
  avatar_url      TEXT,
  is_active       BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at   TIMESTAMPTZ,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sentinel_users_email ON sentinel_users (email);
CREATE INDEX IF NOT EXISTS idx_sentinel_users_org ON sentinel_users (organization_id);

-- ─────────────────────────── Organizations ───────────────────────
CREATE TABLE IF NOT EXISTS sentinel_organizations (
  id              TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  name            TEXT        NOT NULL,
  subscription_id TEXT,
  tier            subscription_tier NOT NULL DEFAULT 'BASIC',
  admin_user_id   TEXT        NOT NULL REFERENCES sentinel_users(id) ON DELETE RESTRICT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE sentinel_users
  ADD CONSTRAINT fk_users_org FOREIGN KEY (organization_id)
    REFERENCES sentinel_organizations(id) ON DELETE SET NULL
    DEFERRABLE INITIALLY DEFERRED;

-- ─────────────────────────── Subscriptions ───────────────────────
CREATE TABLE IF NOT EXISTS sentinel_subscriptions (
  id                  TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  tier                subscription_tier NOT NULL,
  description         TEXT,
  pricing_monthly     NUMERIC(10,2) NOT NULL DEFAULT 0,
  pricing_yearly      NUMERIC(10,2) NOT NULL DEFAULT 0,
  features            JSONB       NOT NULL DEFAULT '[]',
  max_members         INTEGER,    -- NULL = unlimited
  includes_ngo_saas   BOOLEAN     NOT NULL DEFAULT FALSE,
  requires_approval   BOOLEAN     NOT NULL DEFAULT FALSE,
  status              TEXT        NOT NULL DEFAULT 'ACTIVE',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────── User Subscriptions ──────────────────
CREATE TABLE IF NOT EXISTS sentinel_user_subscriptions (
  id              TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  user_id         TEXT        NOT NULL REFERENCES sentinel_users(id) ON DELETE CASCADE,
  subscription_id TEXT        REFERENCES sentinel_subscriptions(id),
  tier            subscription_tier NOT NULL,
  status          subscription_status NOT NULL DEFAULT 'ACTIVE',
  assigned_by     TEXT        NOT NULL REFERENCES sentinel_users(id),
  assigned_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at      TIMESTAMPTZ,
  organization_id TEXT        REFERENCES sentinel_organizations(id),
  auto_renew      BOOLEAN     NOT NULL DEFAULT TRUE,
  pro_credits     INTEGER     NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_subs_user ON sentinel_user_subscriptions (user_id);
CREATE INDEX IF NOT EXISTS idx_user_subs_status ON sentinel_user_subscriptions (status);

-- ─────────────────────────── Organization Branding ───────────────
CREATE TABLE IF NOT EXISTS sentinel_org_branding (
  id                  TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  organization_id     TEXT        NOT NULL UNIQUE REFERENCES sentinel_organizations(id) ON DELETE CASCADE,
  name                TEXT        NOT NULL,
  logo_url            TEXT,
  primary_color       TEXT        NOT NULL DEFAULT '#1e1b4b',
  secondary_color     TEXT        NOT NULL DEFAULT '#4f46e5',
  accent_color        TEXT,
  phone               TEXT,
  email               TEXT,
  office_address      TEXT,
  website             TEXT,
  use_custom_branding BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────── Projects ────────────────────────────
CREATE TABLE IF NOT EXISTS sentinel_projects (
  id              TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  organization_id TEXT        NOT NULL REFERENCES sentinel_organizations(id) ON DELETE CASCADE,
  name            TEXT        NOT NULL,
  description     TEXT,
  modules_enabled JSONB       NOT NULL DEFAULT '[]',
  created_by      TEXT        NOT NULL REFERENCES sentinel_users(id),
  status          TEXT        NOT NULL DEFAULT 'ACTIVE',
  branding_id     TEXT        REFERENCES sentinel_org_branding(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_projects_org ON sentinel_projects (organization_id);

-- ─────────────────────────── Project Members ─────────────────────
CREATE TABLE IF NOT EXISTS sentinel_project_members (
  project_id  TEXT        NOT NULL REFERENCES sentinel_projects(id) ON DELETE CASCADE,
  user_id     TEXT        NOT NULL REFERENCES sentinel_users(id) ON DELETE CASCADE,
  added_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (project_id, user_id)
);

-- ─────────────────────────── Module Permissions ──────────────────
CREATE TABLE IF NOT EXISTS sentinel_module_permissions (
  id              TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  user_id         TEXT        NOT NULL REFERENCES sentinel_users(id) ON DELETE CASCADE,
  organization_id TEXT        NOT NULL REFERENCES sentinel_organizations(id) ON DELETE CASCADE,
  module_name     TEXT        NOT NULL,
  access_level    module_access_level NOT NULL DEFAULT 'READ',
  granted_by      TEXT        NOT NULL REFERENCES sentinel_users(id),
  granted_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at      TIMESTAMPTZ,
  UNIQUE (user_id, organization_id, module_name)
);

CREATE INDEX IF NOT EXISTS idx_module_perms_user ON sentinel_module_permissions (user_id);

-- ─────────────────────────── Team Admins ─────────────────────────
CREATE TABLE IF NOT EXISTS sentinel_team_admins (
  id              TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  user_id         TEXT        NOT NULL REFERENCES sentinel_users(id) ON DELETE CASCADE,
  organization_id TEXT        NOT NULL REFERENCES sentinel_organizations(id) ON DELETE CASCADE,
  subscription_id TEXT        NOT NULL REFERENCES sentinel_subscriptions(id),
  can_add_members BOOLEAN     NOT NULL DEFAULT TRUE,
  can_assign_modules BOOLEAN  NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, organization_id)
);

-- ─────────────────────────── NGO Documents ───────────────────────
CREATE TABLE IF NOT EXISTS sentinel_ngo_documents (
  id              TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  project_id      TEXT        NOT NULL REFERENCES sentinel_projects(id) ON DELETE CASCADE,
  organization_id TEXT        NOT NULL REFERENCES sentinel_organizations(id) ON DELETE CASCADE,
  document_type   document_type NOT NULL,
  title           TEXT        NOT NULL,
  file_name       TEXT        NOT NULL,
  file_url        TEXT        NOT NULL,
  file_type       TEXT        NOT NULL,
  file_size_bytes BIGINT,
  content         TEXT,
  ai_processed_data JSONB,
  uploaded_by     TEXT        NOT NULL REFERENCES sentinel_users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ngo_docs_project ON sentinel_ngo_documents (project_id);

-- ─────────────────────────── NGO Outputs ─────────────────────────
CREATE TABLE IF NOT EXISTS sentinel_ngo_outputs (
  id              TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  project_id      TEXT        NOT NULL REFERENCES sentinel_projects(id) ON DELETE CASCADE,
  document_id     TEXT        REFERENCES sentinel_ngo_documents(id) ON DELETE SET NULL,
  tab_name        TEXT        NOT NULL,
  output_type     TEXT        NOT NULL,
  title           TEXT        NOT NULL,
  generated_data  TEXT        NOT NULL,
  export_formats  JSONB       NOT NULL DEFAULT '[]',
  branding_config_id TEXT     REFERENCES sentinel_org_branding(id),
  created_by      TEXT        NOT NULL REFERENCES sentinel_users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version         INTEGER     NOT NULL DEFAULT 1
);

-- ─────────────────────────── Project Summaries ───────────────────
CREATE TABLE IF NOT EXISTS sentinel_project_summaries (
  id                   TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  project_id           TEXT        NOT NULL REFERENCES sentinel_projects(id) ON DELETE CASCADE,
  organization_id      TEXT        NOT NULL REFERENCES sentinel_organizations(id) ON DELETE CASCADE,
  title                TEXT        NOT NULL,
  content              TEXT        NOT NULL,
  objectives           JSONB,
  target_beneficiaries TEXT,
  budget_overview      TEXT,
  timeline             TEXT,
  impact_metrics       JSONB,
  created_by           TEXT        NOT NULL REFERENCES sentinel_users(id),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version              INTEGER     NOT NULL DEFAULT 1
);

-- ─────────────────────────── NGO Reports ─────────────────────────
CREATE TABLE IF NOT EXISTS sentinel_ngo_reports (
  id              TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  project_id      TEXT        NOT NULL REFERENCES sentinel_projects(id) ON DELETE CASCADE,
  organization_id TEXT        NOT NULL REFERENCES sentinel_organizations(id) ON DELETE CASCADE,
  title           TEXT        NOT NULL,
  report_type     TEXT        NOT NULL DEFAULT 'CUSTOM',
  sections        JSONB       NOT NULL DEFAULT '[]',
  branding_id     TEXT        REFERENCES sentinel_org_branding(id),
  generated_by    TEXT        NOT NULL REFERENCES sentinel_users(id),
  generated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  exported_formats JSONB      NOT NULL DEFAULT '[]'
);

-- ─────────────────────────── Audit Logs ──────────────────────────
CREATE TABLE IF NOT EXISTS sentinel_audit_logs (
  id          TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  user_id     TEXT        NOT NULL,
  action      audit_action NOT NULL,
  resource    TEXT        NOT NULL,
  resource_id TEXT,
  metadata    JSONB,
  ip_address  TEXT,
  timestamp   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  success     BOOLEAN     NOT NULL DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON sentinel_audit_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_ts ON sentinel_audit_logs (timestamp DESC);

-- ─────────────────────────── Subscription Upgrade Requests ───────
CREATE TABLE IF NOT EXISTS sentinel_upgrade_requests (
  id              TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  user_id         TEXT        NOT NULL REFERENCES sentinel_users(id) ON DELETE CASCADE,
  from_tier       subscription_tier,
  to_tier         subscription_tier NOT NULL,
  status          TEXT        NOT NULL DEFAULT 'PENDING',
  message         TEXT,
  reviewed_by     TEXT        REFERENCES sentinel_users(id),
  reviewed_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════════
-- Phase 5.2 Migration: Report State Machine + Digital Signatures
-- ═══════════════════════════════════════════════════════════════════

-- Report state enum
DO $$ BEGIN
  CREATE TYPE report_status AS ENUM (
    'DRAFT', 'SUBMITTED', 'APPROVED_SIGNED', 'PUBLISHED'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Add new audit actions for report workflow
DO $$ BEGIN
  ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'SUBMIT';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'APPROVE';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'SIGN';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'PUBLISH';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'REVERT';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Add state machine columns to sentinel_ngo_reports
ALTER TABLE sentinel_ngo_reports
  ADD COLUMN IF NOT EXISTS status          TEXT NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN IF NOT EXISTS submitted_by    TEXT REFERENCES sentinel_users(id),
  ADD COLUMN IF NOT EXISTS submitted_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_by     TEXT REFERENCES sentinel_users(id),
  ADD COLUMN IF NOT EXISTS approved_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS signature_hash  TEXT,
  ADD COLUMN IF NOT EXISTS signed_by       TEXT REFERENCES sentinel_users(id),
  ADD COLUMN IF NOT EXISTS signed_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS published_by    TEXT REFERENCES sentinel_users(id),
  ADD COLUMN IF NOT EXISTS published_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_by      TEXT REFERENCES sentinel_users(id);

-- Index on report status for workflow queries
CREATE INDEX IF NOT EXISTS idx_ngo_reports_status ON sentinel_ngo_reports (status);
CREATE INDEX IF NOT EXISTS idx_ngo_reports_org_status
  ON sentinel_ngo_reports (organization_id, status);

-- Report state transition audit trail (separate from global audit_logs for fast queries)
CREATE TABLE IF NOT EXISTS report_state_transitions (
  id            TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  report_id     TEXT        NOT NULL REFERENCES sentinel_ngo_reports(id) ON DELETE CASCADE,
  from_status   TEXT        NOT NULL,
  to_status     TEXT        NOT NULL,
  transitioned_by TEXT      NOT NULL,
  comment       TEXT,
  signature_hash TEXT,
  timestamp     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_report_transitions_report
  ON report_state_transitions (report_id, timestamp DESC);

-- ============================================================
-- Phase 3 Migration: Per-Tenant Per-Module Subscription Records
-- ============================================================

-- Module subscription status (distinct from user subscription_status)
DO $$ BEGIN
  CREATE TYPE module_subscription_status AS ENUM (
    'ACTIVE', 'TRIAL', 'GRACE_PERIOD', 'EXPIRED', 'CANCELLED', 'SUSPENDED'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Org-level module subscription: the authoritative record that
-- "Organization X has subscribed to Module Y at tier Z with N seats"
CREATE TABLE IF NOT EXISTS sentinel_org_module_subscriptions (
  id              TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  organization_id TEXT        NOT NULL REFERENCES sentinel_organizations(id) ON DELETE CASCADE,
  module_name     TEXT        NOT NULL,
  tier            subscription_tier NOT NULL DEFAULT 'BASIC',
  status          module_subscription_status NOT NULL DEFAULT 'ACTIVE',
  max_seats       INTEGER     NOT NULL DEFAULT 1,
  starts_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at      TIMESTAMPTZ,                          -- NULL = no expiry
  auto_renew      BOOLEAN     NOT NULL DEFAULT FALSE,
  grace_period_days INTEGER   NOT NULL DEFAULT 7,        -- days after expiry before EXPIRED
  provisioned_by  TEXT        REFERENCES sentinel_users(id),
  provisioned_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  cancelled_at    TIMESTAMPTZ,
  cancelled_by    TEXT        REFERENCES sentinel_users(id),
  metadata        JSONB       DEFAULT '{}',              -- extra config per module
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Each org can have at most one active/trial/grace subscription per module
  CONSTRAINT uq_org_module_active UNIQUE (organization_id, module_name)
);

-- Fast lookups: all subscriptions for an org, active subscriptions, expiring soon
CREATE INDEX IF NOT EXISTS idx_org_mod_sub_org
  ON sentinel_org_module_subscriptions (organization_id);
CREATE INDEX IF NOT EXISTS idx_org_mod_sub_status
  ON sentinel_org_module_subscriptions (status);
CREATE INDEX IF NOT EXISTS idx_org_mod_sub_expires
  ON sentinel_org_module_subscriptions (expires_at)
  WHERE expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_org_mod_sub_module
  ON sentinel_org_module_subscriptions (module_name, status);
