-- =============================================================================
-- Migration: User Style Profiles
-- Purpose: Add tables to track user generation history and infer style preferences
-- Created for: Feature #1 - User Style Profiler & Personalization Engine
-- =============================================================================

-- ─── 1. user_style_profiles ────────────────────────────────────────────────
-- Aggregated user style preferences inferred from generation history
-- Recomputed periodically based on generation_insights

CREATE TABLE IF NOT EXISTS user_style_profiles (
    id              SERIAL                PRIMARY KEY,
    user_id         TEXT                  NOT NULL UNIQUE,
    
    -- Top industries (JSON array of {industry, count})
    preferred_industries  JSONB            NOT NULL DEFAULT '[]'::jsonb,
    
    -- Dominant tone across generations
    dominant_tone   TEXT                  NOT NULL DEFAULT 'professional',
    
    -- Audience sophistication level
    audience_level  TEXT                  NOT NULL DEFAULT 'intermediate',
    
    -- Frequent edits pattern (which sections user modifies most)
    frequent_edits  JSONB                 NOT NULL DEFAULT '[]'::jsonb,
    
    -- Average generation quality score (0-100)
    avg_quality_score DECIMAL(5, 2)       NOT NULL DEFAULT 75,
    
    -- Total generations for this user
    total_generations INTEGER             NOT NULL DEFAULT 0,
    
    -- Last updated timestamp
    updated_at      TIMESTAMPTZ           NOT NULL DEFAULT now(),
    created_at      TIMESTAMPTZ           NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_style_profiles_user_id
    ON user_style_profiles (user_id);

CREATE INDEX IF NOT EXISTS idx_user_style_profiles_updated_at
    ON user_style_profiles (updated_at DESC);


-- ─── 2. generation_insights ────────────────────────────────────────────────
-- Track metadata for each generation to build user style profile
-- This is the raw data; user_style_profiles is the computed summary

CREATE TABLE IF NOT EXISTS generation_insights (
    id              BIGSERIAL             PRIMARY KEY,
    user_id         TEXT                  NOT NULL,
    
    -- Generation metadata
    concept_mode    TEXT                  NOT NULL,  -- SaaS, retail, healthcare, etc.
    tone_preference TEXT                  NOT NULL,  -- professional, casual, creative
    audience_level  TEXT                  NOT NULL,  -- beginner, intermediate, expert
    
    -- Quality signal from user behavior
    -- (how long they kept it, how much they edited, whether they saved it, etc.)
    estimated_satisfaction DECIMAL(3, 2) NOT NULL DEFAULT 0.5,  -- 0-1 scale
    
    -- Which sections did user modify the most? Store as JSON array
    sections_edited JSONB                 NOT NULL DEFAULT '[]'::jsonb,
    
    -- Final quality/satisfaction score assigned by platform
    quality_score   DECIMAL(5, 2),
    
    -- Generation cost in cents
    cost_cents      INTEGER,
    
    -- Provider used
    provider_used   TEXT,
    model_used      TEXT,
    
    -- Reference to the original query (truncated for storage)
    query_preview   TEXT,
    
    -- Whether the user saved this generation
    was_saved       BOOLEAN               NOT NULL DEFAULT false,
    
    -- Metadata for debugging/analysis
    metadata        JSONB                 NOT NULL DEFAULT '{}'::jsonb,
    
    generated_at    TIMESTAMPTZ           NOT NULL DEFAULT now(),
    tracked_at      TIMESTAMPTZ           NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_generation_insights_user_id
    ON generation_insights (user_id);

CREATE INDEX IF NOT EXISTS idx_generation_insights_user_tracked
    ON generation_insights (user_id, tracked_at DESC);

CREATE INDEX IF NOT EXISTS idx_generation_insights_concept_mode
    ON generation_insights (user_id, concept_mode);


-- ─── 3. user_style_feedback ────────────────────────────────────────────────
-- Explicit user feedback on generated strategies (optional UI for users to rate)
-- Used to train style model with ground truth

CREATE TABLE IF NOT EXISTS user_style_feedback (
    id              BIGSERIAL             PRIMARY KEY,
    user_id         TEXT                  NOT NULL,
    generation_id   BIGINT                REFERENCES generation_insights(id) ON DELETE SET NULL,
    
    -- Likert scale 1-5
    quality_rating  INTEGER               NOT NULL CHECK (quality_rating >= 1 AND quality_rating <= 5),
    
    -- Specific feedback on tone/style
    tone_fit        INTEGER               CHECK (tone_fit IS NULL OR (tone_fit >= 1 AND tone_fit <= 5)),
    audience_match  INTEGER               CHECK (audience_match IS NULL OR (audience_match >= 1 AND audience_match <= 5)),
    originality     INTEGER               CHECK (originality IS NULL OR (originality >= 1 AND originality <= 5)),
    
    -- Freeform feedback
    comment         TEXT,
    
    -- Whether they used this generation in production
    used_in_production BOOLEAN            DEFAULT false,
    
    -- Real-world outcome (if they reported it)
    outcome_metric  TEXT,  -- 'clicks', 'conversions', 'engagement_rate', etc.
    outcome_value   DECIMAL(10, 2),
    
    created_at      TIMESTAMPTZ           NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_style_feedback_user_id
    ON user_style_feedback (user_id);

CREATE INDEX IF NOT EXISTS idx_user_style_feedback_generation_id
    ON user_style_feedback (generation_id);


-- =============================================================================
-- End of migration
-- =============================================================================
