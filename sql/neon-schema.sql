-- =============================================================================
-- Neon (Serverless Postgres) – Full Schema
-- Project: ai-powered-techpigeo  (Sentinel SAAS Platform)
-- Generated from: src/lib/sentinel-brain.ts, src/lib/kv-sync.ts,
--                  src/lib/platform-connectors.ts
-- =============================================================================
-- Run this script against your Neon database to create all required tables
-- and extensions used by the application.
-- =============================================================================

-- ─── Extensions ──────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS vector;          -- pgvector for embeddings

-- ─── 1. brain_documents ─────────────────────────────────────────────────────
-- Tracks source documents ingested into the Sentinel Brain knowledge base.
-- Source: src/lib/sentinel-brain.ts

CREATE TABLE IF NOT EXISTS brain_documents (
    id           SERIAL       PRIMARY KEY,
    title        TEXT         NOT NULL,
    source_url   TEXT,
    source_type  TEXT         NOT NULL DEFAULT 'manual',   -- article | doc | github_repo | note | manual
    status       TEXT         NOT NULL DEFAULT 'pending',  -- pending | processing | indexed | failed
    chunks_count INTEGER      NOT NULL DEFAULT 0,
    created_by   INTEGER,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- ─── 2. sentinel_brain ──────────────────────────────────────────────────────
-- Knowledge chunks with 768-dimensional vector embeddings for semantic search.
-- Source: src/lib/sentinel-brain.ts

CREATE TABLE IF NOT EXISTS sentinel_brain (
    id           SERIAL       PRIMARY KEY,
    content      TEXT         NOT NULL,
    embedding    vector(768),
    sector       TEXT,
    metadata     JSONB,
    document_id  INTEGER      REFERENCES brain_documents(id) ON DELETE CASCADE,
    chunk_index  INTEGER,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- ─── 3. query_log ───────────────────────────────────────────────────────────
-- Logs every query sent through the Sentinel query pipeline.
-- Source: src/lib/sentinel-brain.ts

CREATE TABLE IF NOT EXISTS query_log (
    id              SERIAL       PRIMARY KEY,
    user_id         INTEGER,
    query_text      TEXT         NOT NULL,
    query_embedding vector(768),
    module          TEXT,
    response_json   JSONB,
    providers_used  TEXT[],
    brain_hits      INTEGER      NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- ─── 4. generation_cache ────────────────────────────────────────────────────
-- Caches AI-generated responses to avoid redundant LLM calls (TTL: 30 days).
-- Source: src/lib/sentinel-brain.ts

CREATE TABLE IF NOT EXISTS generation_cache (
    id            SERIAL       PRIMARY KEY,
    query_hash    TEXT         UNIQUE NOT NULL,
    query_text    TEXT         NOT NULL,
    provider      TEXT         NOT NULL,
    response_json JSONB        NOT NULL,
    model_used    TEXT,
    hit_count     INTEGER      NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    expires_at    TIMESTAMPTZ  NOT NULL DEFAULT (now() + interval '30 days')
    -- NOTE: The 30-day TTL must stay in sync with the UPSERT in
    --       src/lib/sentinel-brain.ts → cacheGeneration()
);

-- ─── 5. kv_store ────────────────────────────────────────────────────────────
-- Generic key-value store synced bi-directionally with localStorage.
-- Source: src/lib/kv-sync.ts

CREATE TABLE IF NOT EXISTS kv_store (
    key        TEXT         PRIMARY KEY,
    value      JSONB        NOT NULL,
    updated_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- ─── 6. platform_connectors ─────────────────────────────────────────────────
-- External API connectors managed by the Sentinel platform.
-- Source: src/lib/platform-connectors.ts

CREATE TABLE IF NOT EXISTS platform_connectors (
    id                SERIAL       PRIMARY KEY,
    name              TEXT         NOT NULL,
    platform_type     TEXT         NOT NULL DEFAULT 'rest_api',    -- rest_api | graphql | webhook | oauth2 | custom
    base_url          TEXT         NOT NULL,
    auth_type         TEXT         NOT NULL DEFAULT 'none',        -- api_key | bearer | basic | oauth2 | none
    auth_config       JSONB        NOT NULL DEFAULT '{}',
    headers           JSONB        NOT NULL DEFAULT '{}',
    enabled           BOOLEAN      NOT NULL DEFAULT true,
    description       TEXT         NOT NULL DEFAULT '',
    sector            TEXT,
    health_status     TEXT         NOT NULL DEFAULT 'unknown',     -- healthy | degraded | down | unknown
    last_health_check TIMESTAMPTZ,
    created_by        INTEGER,
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- ─── 7. chat_threads ───────────────────────────────────────────────────────────
-- Conversational threads for multi-turn RAG chat.

CREATE TABLE IF NOT EXISTS chat_threads (
    id           BIGSERIAL    PRIMARY KEY,
    user_id      INTEGER,
    module       TEXT         NOT NULL DEFAULT 'general',
    title        TEXT         NOT NULL DEFAULT 'New Chat',
    status       TEXT         NOT NULL DEFAULT 'active',   -- active | archived
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_threads_user_updated
  ON chat_threads (user_id, updated_at DESC);

-- ─── 8. chat_messages ──────────────────────────────────────────────────────────
-- Stores user/assistant messages linked to a thread.

CREATE TABLE IF NOT EXISTS chat_messages (
    id               BIGSERIAL    PRIMARY KEY,
    thread_id        BIGINT       NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,
    role             TEXT         NOT NULL,                -- user | assistant | system
    content          TEXT         NOT NULL,
    provider         TEXT,
    model_used       TEXT,
    providers_used   TEXT[],
    brain_hits       INTEGER      NOT NULL DEFAULT 0,
    metadata         JSONB,
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_thread_created
  ON chat_messages (thread_id, created_at ASC);

-- ─── 9. retrieval_traces ───────────────────────────────────────────────────────
-- Per-response retrieval transparency and debugging traces.

CREATE TABLE IF NOT EXISTS retrieval_traces (
    id                  BIGSERIAL    PRIMARY KEY,
    thread_id           BIGINT       REFERENCES chat_threads(id) ON DELETE SET NULL,
    message_id          BIGINT       REFERENCES chat_messages(id) ON DELETE SET NULL,
    query_text          TEXT         NOT NULL,
    module              TEXT,
    provider            TEXT,
    model_used          TEXT,
    selected_chunks     JSONB        NOT NULL DEFAULT '[]'::jsonb,
    total_candidates    INTEGER      NOT NULL DEFAULT 0,
    avg_similarity      DOUBLE PRECISION,
    retrieval_latency_ms INTEGER,
    generation_latency_ms INTEGER,
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_retrieval_traces_thread_created
  ON retrieval_traces (thread_id, created_at DESC);

-- =============================================================================
-- End of schema
-- =============================================================================
