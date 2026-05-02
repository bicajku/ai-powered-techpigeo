/**
 * Email Studio — admin-only marketing/announcement email engine.
 *
 * Capabilities:
 *   • Brand identity management (single-row table; AI uses it as system prompt context).
 *   • AI-drafted email generation via the existing multi-provider llm-service.mjs.
 *   • Reusable templates (saved drafts).
 *   • Audience filtering (tier, status, sign-up source, activity, deleted-exclusion, opt-out).
 *   • Campaigns with frozen recipient list, throttled background worker, and per-recipient audit.
 *   • Per-user marketing opt-out + signed unsubscribe tokens.
 *
 * Reuses backend/mail-service.mjs renderBrandedShell + sendMail (so logo/header/footer
 * stay consistent with transactional templates).
 */

import crypto from "node:crypto"
import { getSql, isDbConfigured } from "./db.mjs"
import { renderBrandedShell, renderBrandedCtaButton, BRAND, safeSend } from "./mail-service.mjs"
import { generateWithFallback } from "./llm-service.mjs"

// ─────────────────────── Constants ───────────────────────

const VALID_INTENTS = new Set([
  "marketing",
  "product",
  "launch",
  "upgrade",
  "welcome",
  "bonus",
  "re-engagement",
  "newsletter",
  "announcement",
])

const VALID_TIERS = new Set(["BASIC", "PRO", "TEAM", "ENTERPRISE"])

const SPAM_TRIGGER_REGEX =
  /\b(free|claim now|act now|limited time|risk[- ]free|guaranteed|100%|cash|earn \$|click here|winner|congratulations|prize|urgent)\b/gi

const DEFAULT_THROTTLE_MS = 1500
const SCHEDULER_INTERVAL_MS = 60_000

// ─────────────────────── Brand identity ───────────────────────

export async function getBrandIdentity() {
  if (!isDbConfigured()) return defaultBrandIdentity()
  const sql = getSql()
  try {
    const rows = await sql`SELECT * FROM email_brand_identity WHERE id = 1 LIMIT 1`
    if (!rows[0]) return defaultBrandIdentity()
    return mapBrandRow(rows[0])
  } catch (err) {
    console.warn("[email-studio] getBrandIdentity failed:", err?.message)
    return defaultBrandIdentity()
  }
}

export async function saveBrandIdentity(input) {
  if (!isDbConfigured()) throw new Error("Database not configured")
  const sql = getSql()
  const safe = sanitizeBrandInput(input)
  const rows = await sql`
    INSERT INTO email_brand_identity (
      id, brand_name, tagline, voice_description, primary_color, accent_color,
      logo_url, founder_name, founder_title, support_email, updated_at
    ) VALUES (
      1, ${safe.brandName}, ${safe.tagline}, ${safe.voiceDescription},
      ${safe.primaryColor}, ${safe.accentColor},
      ${safe.logoUrl}, ${safe.founderName}, ${safe.founderTitle}, ${safe.supportEmail}, now()
    )
    ON CONFLICT (id) DO UPDATE SET
      brand_name = EXCLUDED.brand_name,
      tagline = EXCLUDED.tagline,
      voice_description = EXCLUDED.voice_description,
      primary_color = EXCLUDED.primary_color,
      accent_color = EXCLUDED.accent_color,
      logo_url = EXCLUDED.logo_url,
      founder_name = EXCLUDED.founder_name,
      founder_title = EXCLUDED.founder_title,
      support_email = EXCLUDED.support_email,
      updated_at = now()
    RETURNING *
  `
  return mapBrandRow(rows[0])
}

function defaultBrandIdentity() {
  return {
    brandName: "Novus Sparks AI",
    tagline: "Enterprise agentic AI platform",
    voiceDescription:
      "Warm, confident, founder-personal. Technical but approachable. Speaks in first person as the founder.",
    primaryColor: BRAND.primary,
    accentColor: BRAND.accent,
    logoUrl: `${BRAND.appBaseUrl}/icons/email-header.png?v=2`,
    founderName: BRAND.founderName,
    founderTitle: BRAND.founderTitle,
    supportEmail: BRAND.supportEmail,
    updatedAt: null,
  }
}

function mapBrandRow(row) {
  return {
    brandName: row.brand_name,
    tagline: row.tagline,
    voiceDescription: row.voice_description,
    primaryColor: row.primary_color,
    accentColor: row.accent_color,
    logoUrl: row.logo_url || `${BRAND.appBaseUrl}/icons/email-header.png?v=2`,
    founderName: row.founder_name,
    founderTitle: row.founder_title,
    supportEmail: row.support_email,
    updatedAt: row.updated_at,
  }
}

function sanitizeBrandInput(input) {
  const def = defaultBrandIdentity()
  return {
    brandName: trimOrFallback(input?.brandName, def.brandName, 80),
    tagline: trimOrFallback(input?.tagline, def.tagline, 200),
    voiceDescription: trimOrFallback(input?.voiceDescription, def.voiceDescription, 1000),
    primaryColor: validHex(input?.primaryColor) || def.primaryColor,
    accentColor: validHex(input?.accentColor) || def.accentColor,
    logoUrl: validUrl(input?.logoUrl) || def.logoUrl,
    founderName: trimOrFallback(input?.founderName, def.founderName, 80),
    founderTitle: trimOrFallback(input?.founderTitle, def.founderTitle, 120),
    supportEmail: validEmail(input?.supportEmail) || def.supportEmail,
  }
}

function trimOrFallback(value, fallback, max) {
  if (typeof value !== "string") return fallback
  const t = value.trim()
  return t ? t.slice(0, max) : fallback
}
function validHex(v) {
  return typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v.trim()) ? v.trim() : null
}
function validUrl(v) {
  if (typeof v !== "string") return null
  try {
    const u = new URL(v.trim())
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null
  } catch {
    return null
  }
}
function validEmail(v) {
  return typeof v === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()) ? v.trim() : null
}

// ─────────────────────── AI email drafting ───────────────────────

/**
 * Generate a subject + body HTML draft with the configured LLM provider chain.
 * Returns: { subject, bodyHtml, headline, tagline, ctaLabel, ctaUrl, provider, model, raw }.
 */
export async function generateEmailDraft({
  prompt,
  intent = "marketing",
  audienceSummary = "",
  tone = "founder-personal",
  ctaLabel = "Open my workspace",
  ctaUrl = `${BRAND.appBaseUrl}/dashboard`,
}) {
  const safePrompt = String(prompt || "").trim()
  if (!safePrompt) throw new Error("Prompt is required")
  if (safePrompt.length > 4000) throw new Error("Prompt too long (max 4000 chars)")
  const safeIntent = VALID_INTENTS.has(intent) ? intent : "marketing"

  const brand = await getBrandIdentity()

  const systemPrompt = buildSystemPrompt(brand, safeIntent, audienceSummary, tone, ctaLabel, ctaUrl)
  const fullPrompt = `${systemPrompt}\n\nADMIN REQUEST:\n${safePrompt}\n\nReturn ONLY valid JSON. No markdown fences, no commentary.`

  const result = await generateWithFallback({
    prompt: fullPrompt,
    providers: ["copilot", "deepseek", "groq", "gemini"],
  })

  const parsed = parseDraftJson(result.text)
  return {
    subject: parsed.subject,
    bodyHtml: parsed.body_html,
    headline: parsed.headline || parsed.subject,
    tagline: parsed.tagline || "",
    ctaLabel: parsed.cta_label || ctaLabel,
    ctaUrl: parsed.cta_url || ctaUrl,
    provider: result.provider,
    model: result.model,
    spamScore: scoreSpamRisk(parsed.subject, parsed.body_html),
  }
}

function buildSystemPrompt(brand, intent, audienceSummary, tone, ctaLabel, ctaUrl) {
  return [
    `You are the official email copywriter for ${brand.brandName}.`,
    `Brand voice: ${brand.voiceDescription}`,
    `Tone for this email: ${tone}.`,
    `Founder: ${brand.founderName} (${brand.founderTitle}).`,
    `Audience: ${audienceSummary || "all users"}.`,
    `Intent: ${intent}.`,
    "",
    "STRICT RULES:",
    `1. Output ONLY this JSON shape:`,
    `   { "subject": "...", "headline": "...", "tagline": "...", "body_html": "...", "cta_label": "...", "cta_url": "..." }`,
    `2. subject: under 60 characters. NO emojis. NO spam triggers (free, claim, act now, 100%, urgent, !!).`,
    `3. headline: short (under 60 chars), goes in the email banner.`,
    `4. tagline: optional one-line subhead under the headline (keep brief).`,
    `5. body_html: clean inline HTML. Use <p>, <ul>, <li>, <strong>, <em> only. No <html>, <head>, <style>, <script>, <iframe>.`,
    `6. body_html must end with: a brief sign-off paragraph then "Warmly, ${brand.founderName}".`,
    `   (The system automatically appends the branded shell, signature, and CTA — do NOT include them.)`,
    `7. Address recipient as "Hi {{firstName}}," at the start.`,
    `8. cta_label: short verb-led CTA (default "${ctaLabel}").`,
    `9. cta_url: default to "${ctaUrl}" unless the request implies a different destination.`,
    `10. Personalization variables you may use: {{firstName}}, {{fullName}}, {{tier}}, {{appUrl}}.`,
  ].join("\n")
}

function parseDraftJson(rawText) {
  if (!rawText) throw new Error("AI returned empty response")
  let cleaned = rawText.trim()
  // Strip markdown code fences if the model added them despite instructions.
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "")
  // Find first { and last } — handles models that add prose around JSON.
  const start = cleaned.indexOf("{")
  const end = cleaned.lastIndexOf("}")
  if (start === -1 || end === -1) throw new Error("AI response did not contain JSON")
  const slice = cleaned.slice(start, end + 1)
  let parsed
  try {
    parsed = JSON.parse(slice)
  } catch {
    throw new Error("AI returned invalid JSON")
  }
  if (!parsed.subject || !parsed.body_html) {
    throw new Error("AI response missing required fields (subject, body_html)")
  }
  return {
    subject: String(parsed.subject).slice(0, 200).trim(),
    headline: parsed.headline ? String(parsed.headline).slice(0, 200).trim() : null,
    tagline: parsed.tagline ? String(parsed.tagline).slice(0, 200).trim() : null,
    body_html: sanitizeBodyHtml(String(parsed.body_html)),
    cta_label: parsed.cta_label ? String(parsed.cta_label).slice(0, 80).trim() : null,
    cta_url: parsed.cta_url ? String(parsed.cta_url).slice(0, 500).trim() : null,
  }
}

/**
 * Strip dangerous tags/attributes from AI-produced HTML before storage.
 * Allow only safe inline tags + href/src attributes.
 */
function sanitizeBodyHtml(html) {
  let out = html
  // Drop script/style/iframe/object/embed/link/meta/form blocks entirely.
  out = out.replace(/<\/?(script|style|iframe|object|embed|link|meta|form|input|button|svg)\b[^>]*>/gi, "")
  // Drop on*= event handlers.
  out = out.replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, "")
  out = out.replace(/\son[a-z]+\s*=\s*'[^']*'/gi, "")
  // Drop javascript: URLs.
  out = out.replace(/href\s*=\s*"javascript:[^"]*"/gi, 'href="#"')
  out = out.replace(/href\s*=\s*'javascript:[^']*'/gi, "href='#'")
  return out.trim()
}

function scoreSpamRisk(subject, bodyHtml) {
  let score = 10
  const subj = String(subject || "")
  const body = String(bodyHtml || "")
  const subjTriggers = (subj.match(SPAM_TRIGGER_REGEX) || []).length
  const bodyTriggers = (body.match(SPAM_TRIGGER_REGEX) || []).length
  if (subj.length > 65) score -= 1
  if (/!{2,}/.test(subj)) score -= 2
  if (/[A-Z]{6,}/.test(subj)) score -= 2
  score -= Math.min(4, subjTriggers * 2)
  score -= Math.min(3, bodyTriggers)
  // Image-heavy bodies look promotional.
  const imgCount = (body.match(/<img\b/gi) || []).length
  if (imgCount > 4) score -= 1
  return Math.max(0, Math.min(10, score))
}

// ─────────────────────── Templates ───────────────────────

export async function listTemplates() {
  if (!isDbConfigured()) return []
  const sql = getSql()
  const rows = await sql`
    SELECT id, name, category, subject, body_html, variables, created_by, created_at, updated_at
    FROM email_templates
    ORDER BY updated_at DESC
    LIMIT 200
  `
  return rows.map(mapTemplateRow)
}

export async function saveTemplate(input, createdBy) {
  if (!isDbConfigured()) throw new Error("Database not configured")
  const sql = getSql()
  const id = Number.isFinite(Number(input?.id)) ? Number(input.id) : null
  const name = trimOrFallback(input?.name, "Untitled template", 200)
  const category = trimOrFallback(input?.category, "marketing", 60)
  const subject = trimOrFallback(input?.subject, "", 200)
  const body_html = sanitizeBodyHtml(String(input?.bodyHtml || input?.body_html || ""))
  const variables = Array.isArray(input?.variables) ? input.variables : []
  if (!subject || !body_html) throw new Error("subject and bodyHtml are required")

  if (id) {
    const rows = await sql`
      UPDATE email_templates
      SET name = ${name}, category = ${category}, subject = ${subject},
          body_html = ${body_html}, variables = ${JSON.stringify(variables)}::jsonb,
          updated_at = now()
      WHERE id = ${id}
      RETURNING *
    `
    if (!rows[0]) throw new Error("Template not found")
    return mapTemplateRow(rows[0])
  }
  const rows = await sql`
    INSERT INTO email_templates (name, category, subject, body_html, variables, created_by)
    VALUES (${name}, ${category}, ${subject}, ${body_html}, ${JSON.stringify(variables)}::jsonb, ${createdBy || null})
    RETURNING *
  `
  return mapTemplateRow(rows[0])
}

export async function deleteTemplate(id) {
  if (!isDbConfigured()) throw new Error("Database not configured")
  const sql = getSql()
  await sql`DELETE FROM email_templates WHERE id = ${Number(id)}`
  return { ok: true }
}

function mapTemplateRow(row) {
  return {
    id: Number(row.id),
    name: row.name,
    category: row.category,
    subject: row.subject,
    bodyHtml: row.body_html,
    variables: Array.isArray(row.variables) ? row.variables : [],
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

// ─────────────────────── Audience filtering ───────────────────────

/**
 * Build the WHERE clause + return matching users for a given audience filter.
 * Filter shape: {
 *   tiers?: ["BASIC","PRO",...],
 *   onlyActive?: boolean (default true),
 *   excludeDeleted?: boolean (default true),
 *   excludeOptedOut?: boolean (default true),
 *   sources?: ["email","google","github","microsoft"],
 *   createdAfter?: ISO date,
 *   createdBefore?: ISO date,
 *   inactiveSince?: ISO date  // last_login_at < this
 * }
 */
export async function resolveAudience(filter = {}) {
  if (!isDbConfigured()) return []
  const sql = getSql()
  const tiers = Array.isArray(filter.tiers) ? filter.tiers.filter((t) => VALID_TIERS.has(t)) : []
  const onlyActive = filter.onlyActive !== false
  const excludeDeleted = filter.excludeDeleted !== false
  const excludeOptedOut = filter.excludeOptedOut !== false
  const sources = Array.isArray(filter.sources) ? filter.sources.filter((s) =>
    ["email", "google", "github", "microsoft"].includes(s),
  ) : []

  // Build with template literals — neon serverless supports ${} interpolation.
  // We collect predicates and OR/AND-compose at the end.
  const rows = await sql`
    WITH base AS (
      SELECT u.id, u.email, u.full_name AS "fullName", u.created_at, u.last_login_at,
             u.google_id, u.github_id, u.microsoft_id, u.password_hash,
             u.is_active, u.marketing_opt_out,
             COALESCE(s.tier, 'BASIC') AS tier
      FROM sentinel_users u
      LEFT JOIN LATERAL (
        SELECT tier FROM sentinel_user_subscriptions
        WHERE user_id = u.id AND status = 'ACTIVE'
        ORDER BY assigned_at DESC LIMIT 1
      ) s ON TRUE
    )
    SELECT id, email, "fullName", tier
    FROM base
    WHERE email IS NOT NULL
      AND email NOT LIKE 'deleted+%@novussparks.invalid'
      AND (${onlyActive}::BOOLEAN = FALSE OR is_active = TRUE)
      AND (${excludeOptedOut}::BOOLEAN = FALSE OR marketing_opt_out = FALSE)
      AND (
        ${tiers.length === 0}::BOOLEAN OR tier = ANY(${tiers})
      )
      AND (
        ${sources.length === 0}::BOOLEAN
        OR (${sources.includes("google")}::BOOLEAN AND google_id IS NOT NULL)
        OR (${sources.includes("github")}::BOOLEAN AND github_id IS NOT NULL)
        OR (${sources.includes("microsoft")}::BOOLEAN AND microsoft_id IS NOT NULL)
        OR (${sources.includes("email")}::BOOLEAN AND password_hash IS NOT NULL AND password_hash <> '')
      )
      AND (${filter.createdAfter || null}::TIMESTAMPTZ IS NULL OR created_at >= ${filter.createdAfter || null}::TIMESTAMPTZ)
      AND (${filter.createdBefore || null}::TIMESTAMPTZ IS NULL OR created_at <= ${filter.createdBefore || null}::TIMESTAMPTZ)
      AND (${filter.inactiveSince || null}::TIMESTAMPTZ IS NULL OR last_login_at < ${filter.inactiveSince || null}::TIMESTAMPTZ)
      AND (
        ${excludeDeleted}::BOOLEAN = FALSE
        OR NOT EXISTS (SELECT 1 FROM sentinel_deleted_emails d WHERE d.email = base.email)
      )
    ORDER BY email ASC
    LIMIT 5000
  `
  return rows
}

// ─────────────────────── Campaigns ───────────────────────

export async function createCampaign(input, createdBy) {
  if (!isDbConfigured()) throw new Error("Database not configured")
  const sql = getSql()
  const subject = trimOrFallback(input?.subject, "", 200)
  const bodyHtml = sanitizeBodyHtml(String(input?.bodyHtml || ""))
  if (!subject || !bodyHtml) throw new Error("subject and bodyHtml are required")
  const name = trimOrFallback(input?.name, subject, 200)
  const intent = VALID_INTENTS.has(input?.intent) ? input.intent : "marketing"
  const audienceFilter = input?.audienceFilter && typeof input.audienceFilter === "object" ? input.audienceFilter : {}
  const templateId = Number.isFinite(Number(input?.templateId)) ? Number(input.templateId) : null
  const scheduledFor = input?.scheduledFor ? new Date(input.scheduledFor).toISOString() : null

  const audience = await resolveAudience(audienceFilter)

  const rows = await sql`
    INSERT INTO email_campaigns (
      template_id, name, subject, body_html, intent, audience_filter, status, scheduled_for,
      total_recipients, created_by
    ) VALUES (
      ${templateId}, ${name}, ${subject}, ${bodyHtml}, ${intent},
      ${JSON.stringify(audienceFilter)}::jsonb,
      ${scheduledFor ? "scheduled" : "draft"},
      ${scheduledFor},
      ${audience.length},
      ${createdBy || null}
    )
    RETURNING id
  `
  const campaignId = Number(rows[0].id)

  // Freeze recipient list.
  if (audience.length) {
    // Batch insert in chunks of 500.
    for (let i = 0; i < audience.length; i += 500) {
      const chunk = audience.slice(i, i + 500)
      const values = chunk.map((u) => sql`(${campaignId}, ${u.id}, ${u.email}, ${u.fullName || null})`)
      // neon serverless does not support multi-row VALUES via tagged template easily;
      // do per-row inserts (5000 max recipients keeps this manageable).
      for (const u of chunk) {
        await sql`
          INSERT INTO email_campaign_recipients (campaign_id, user_id, email, full_name)
          VALUES (${campaignId}, ${u.id}, ${u.email}, ${u.fullName || null})
          ON CONFLICT (campaign_id, user_id) DO NOTHING
        `
      }
      void values
    }
  }

  return getCampaign(campaignId)
}

export async function listCampaigns(limit = 50) {
  if (!isDbConfigured()) return []
  const sql = getSql()
  const rows = await sql`
    SELECT id, template_id, name, subject, intent, audience_filter, status, scheduled_for,
           total_recipients, sent_count, failed_count, skipped_count,
           created_by, created_at, started_at, completed_at
    FROM email_campaigns
    ORDER BY created_at DESC
    LIMIT ${Math.max(1, Math.min(Number(limit) || 50, 200))}
  `
  return rows.map(mapCampaignRow)
}

export async function getCampaign(id) {
  if (!isDbConfigured()) return null
  const sql = getSql()
  const rows = await sql`SELECT * FROM email_campaigns WHERE id = ${Number(id)} LIMIT 1`
  if (!rows[0]) return null
  return mapCampaignRow(rows[0])
}

export async function getCampaignRecipients(id, limit = 100) {
  if (!isDbConfigured()) return []
  const sql = getSql()
  const rows = await sql`
    SELECT id, user_id, email, full_name AS "fullName", status, sent_at, error
    FROM email_campaign_recipients
    WHERE campaign_id = ${Number(id)}
    ORDER BY status DESC, email ASC
    LIMIT ${Math.max(1, Math.min(Number(limit) || 100, 1000))}
  `
  return rows
}

function mapCampaignRow(row) {
  return {
    id: Number(row.id),
    templateId: row.template_id ? Number(row.template_id) : null,
    name: row.name,
    subject: row.subject,
    bodyHtml: row.body_html,
    intent: row.intent,
    audienceFilter: row.audience_filter || {},
    status: row.status,
    scheduledFor: row.scheduled_for,
    totalRecipients: Number(row.total_recipients || 0),
    sentCount: Number(row.sent_count || 0),
    failedCount: Number(row.failed_count || 0),
    skippedCount: Number(row.skipped_count || 0),
    createdBy: row.created_by,
    createdAt: row.created_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
  }
}

export async function cancelCampaign(id) {
  if (!isDbConfigured()) throw new Error("Database not configured")
  const sql = getSql()
  await sql`
    UPDATE email_campaigns
    SET status = 'cancelled', completed_at = now()
    WHERE id = ${Number(id)} AND status IN ('draft','scheduled','sending')
  `
  return getCampaign(id)
}

// ─────────────────────── Send pipeline ───────────────────────

/**
 * Render a personalized email for a single recipient using the branded shell.
 */
export function renderCampaignEmail({ campaign, recipient, brand, unsubscribeUrl }) {
  const firstName = (recipient.fullName || recipient.email || "").split(/[\s@]/)[0] || "there"
  const ctx = {
    firstName,
    fullName: recipient.fullName || firstName,
    email: recipient.email,
    tier: recipient.tier || "BASIC",
    appUrl: BRAND.appBaseUrl,
  }
  const subject = applyVariables(campaign.subject, ctx)
  const bodyPersonalized = applyVariables(campaign.bodyHtml, ctx)
  const html = renderBrandedShell({
    preheader: subject,
    headline: brand.brandName,
    tagline: brand.tagline,
    body: `${bodyPersonalized}\n${renderBrandedCtaButton("Open my workspace", `${BRAND.appBaseUrl}/dashboard`)}`,
    unsubscribeUrl,
    logoUrl: brand.logoUrl,
    brandName: brand.brandName,
  })
  const text = stripHtmlForText(bodyPersonalized)
  return { subject, html, text }
}

function applyVariables(template, ctx) {
  return String(template || "").replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => {
    const v = ctx[key]
    return v == null ? "" : String(v)
  })
}

function stripHtmlForText(html) {
  return String(html || "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

/**
 * Send a single test email for a campaign draft (no recipient row needed).
 */
export async function sendCampaignTest({ campaign, toEmail }) {
  const brand = await getBrandIdentity()
  const fakeRecipient = { email: toEmail, fullName: "Test recipient", tier: "ADMIN" }
  const { subject, html, text } = renderCampaignEmail({
    campaign,
    recipient: fakeRecipient,
    brand,
    unsubscribeUrl: `${BRAND.appBaseUrl}/unsubscribe?test=1`,
  })
  return safeSend("studio-test", { to: toEmail, subject: `[TEST] ${subject}`, html, text })
}

/**
 * Drive the send loop for one campaign. Idempotent — only processes pending recipients.
 * Throttles between sends.
 */
export async function processCampaign(campaignId, { throttleMs = DEFAULT_THROTTLE_MS } = {}) {
  if (!isDbConfigured()) return { ok: false, error: "DB not configured" }
  const sql = getSql()
  const campaign = await getCampaign(campaignId)
  if (!campaign) return { ok: false, error: "Campaign not found" }
  if (!["scheduled", "sending", "draft"].includes(campaign.status)) {
    return { ok: false, error: `Campaign status is ${campaign.status}` }
  }

  await sql`
    UPDATE email_campaigns
    SET status = 'sending', started_at = COALESCE(started_at, now())
    WHERE id = ${campaignId}
  `

  const brand = await getBrandIdentity()

  while (true) {
    const batch = await sql`
      SELECT id, user_id, email, full_name AS "fullName"
      FROM email_campaign_recipients
      WHERE campaign_id = ${campaignId} AND status = 'pending'
      ORDER BY id ASC
      LIMIT 25
    `
    if (!batch.length) break

    for (const r of batch) {
      // Respect opt-out captured AFTER campaign was created.
      const optedOut = await isUserOptedOut(r.user_id)
      if (optedOut) {
        await sql`
          UPDATE email_campaign_recipients SET status = 'skipped', error = 'opted_out'
          WHERE id = ${r.id}
        `
        await sql`UPDATE email_campaigns SET skipped_count = skipped_count + 1 WHERE id = ${campaignId}`
        continue
      }

      const unsubUrl = buildUnsubscribeUrl(r.user_id, r.email)
      const { subject, html, text } = renderCampaignEmail({
        campaign,
        recipient: r,
        brand,
        unsubscribeUrl: unsubUrl,
      })
      const result = await safeSend(`campaign-${campaignId}`, {
        to: r.email,
        subject,
        html,
        text,
      })
      if (result.ok) {
        await sql`
          UPDATE email_campaign_recipients SET status = 'sent', sent_at = now(), error = NULL
          WHERE id = ${r.id}
        `
        await sql`UPDATE email_campaigns SET sent_count = sent_count + 1 WHERE id = ${campaignId}`
      } else {
        const errText = result.error || (result.skipped ? "skipped" : "unknown error")
        await sql`
          UPDATE email_campaign_recipients SET status = 'failed', error = ${errText}
          WHERE id = ${r.id}
        `
        await sql`UPDATE email_campaigns SET failed_count = failed_count + 1 WHERE id = ${campaignId}`
      }
      if (throttleMs > 0) await sleep(throttleMs)
    }
  }

  await sql`
    UPDATE email_campaigns SET status = 'completed', completed_at = now()
    WHERE id = ${campaignId}
  `
  return { ok: true }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

// ─────────────────────── Opt-out + unsubscribe tokens ───────────────────────

function getUnsubSecret() {
  return (
    process.env.UNSUB_TOKEN_SECRET ||
    process.env.SESSION_SECRET ||
    process.env.JWT_SECRET ||
    "novussparks-unsub-default"
  )
}

export function buildUnsubscribeUrl(userId, email) {
  const payload = `${userId}:${(email || "").toLowerCase()}`
  const sig = crypto
    .createHmac("sha256", getUnsubSecret())
    .update(payload)
    .digest("base64url")
    .slice(0, 24)
  const token = Buffer.from(payload, "utf8").toString("base64url")
  return `${BRAND.appBaseUrl}/unsubscribe?t=${token}&s=${sig}`
}

export function verifyUnsubscribeToken(token, signature) {
  if (!token || !signature) return null
  let payload
  try {
    payload = Buffer.from(String(token), "base64url").toString("utf8")
  } catch {
    return null
  }
  const expectedSig = crypto
    .createHmac("sha256", getUnsubSecret())
    .update(payload)
    .digest("base64url")
    .slice(0, 24)
  // Constant-time compare.
  const a = Buffer.from(expectedSig)
  const b = Buffer.from(String(signature))
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null
  const [userId, email] = payload.split(":")
  if (!userId || !email) return null
  return { userId, email }
}

export async function applyOptOut(userId, email) {
  if (!isDbConfigured()) throw new Error("Database not configured")
  const sql = getSql()
  if (userId) {
    await sql`UPDATE sentinel_users SET marketing_opt_out = TRUE WHERE id = ${userId}`
  } else if (email) {
    await sql`UPDATE sentinel_users SET marketing_opt_out = TRUE WHERE email = ${String(email).toLowerCase()}`
  }
  return { ok: true }
}

export async function isUserOptedOut(userId) {
  if (!isDbConfigured()) return false
  try {
    const sql = getSql()
    const rows = await sql`SELECT marketing_opt_out FROM sentinel_users WHERE id = ${userId} LIMIT 1`
    return Boolean(rows[0]?.marketing_opt_out)
  } catch {
    return false
  }
}

// ─────────────────────── Background scheduler ───────────────────────

let _schedulerStarted = false
let _runningCampaigns = new Set()

/**
 * Boot a setInterval worker that picks up scheduled campaigns whose time has
 * arrived, and resumes any "sending" campaigns left behind by a dyno restart.
 * Idempotent — call once at server startup.
 */
export function startCampaignScheduler() {
  if (_schedulerStarted) return
  _schedulerStarted = true
  console.log("[email-studio] campaign scheduler started")
  setInterval(() => {
    void tickScheduler().catch((err) => {
      console.warn("[email-studio] scheduler tick error:", err?.message)
    })
  }, SCHEDULER_INTERVAL_MS)
  // Run once immediately so a freshly-restarted dyno resumes ASAP.
  setTimeout(() => void tickScheduler().catch(() => {}), 5_000)
}

async function tickScheduler() {
  if (!isDbConfigured()) return
  const sql = getSql()
  const now = new Date().toISOString()

  // 1. Resume any in-flight 'sending' campaigns that died mid-loop.
  const stuck = await sql`
    SELECT id FROM email_campaigns WHERE status = 'sending'
  `
  // 2. Pick up scheduled campaigns whose time arrived.
  const due = await sql`
    SELECT id FROM email_campaigns
    WHERE status = 'scheduled' AND (scheduled_for IS NULL OR scheduled_for <= ${now}::TIMESTAMPTZ)
  `
  const queue = [...stuck.map((r) => Number(r.id)), ...due.map((r) => Number(r.id))]
  for (const id of queue) {
    if (_runningCampaigns.has(id)) continue
    _runningCampaigns.add(id)
    // Fire and forget — we don't await, so multiple campaigns can run concurrently.
    processCampaign(id)
      .catch((err) => console.error(`[email-studio] processCampaign(${id}) failed:`, err?.message))
      .finally(() => _runningCampaigns.delete(id))
  }
}

/**
 * Trigger a campaign immediately (from admin "Send now" button).
 */
export async function sendCampaignNow(campaignId) {
  if (_runningCampaigns.has(campaignId)) {
    return { ok: true, alreadyRunning: true }
  }
  _runningCampaigns.add(campaignId)
  // Fire and forget — admin gets immediate response.
  processCampaign(campaignId)
    .catch((err) => console.error(`[email-studio] sendCampaignNow(${campaignId}) failed:`, err?.message))
    .finally(() => _runningCampaigns.delete(campaignId))
  return { ok: true, queued: true }
}
