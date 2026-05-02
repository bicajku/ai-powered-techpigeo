/**
 * Unified Mail Service — provider abstraction for transactional email.
 *
 * Resolution order (per call):
 *   1. DB-stored config (`app_email_config` row) — provider = 'graph' | 'smtp'.
 *   2. Env-only fallback to Microsoft Graph (M365_*) when DB has no config.
 *   3. Returns "not configured" when neither is set; callers must degrade gracefully.
 *
 * Always-on fallback policy: every send call is best-effort and never throws
 * past `safeSend`. Failures are logged so registration/auth flows continue.
 */

import nodemailer from "nodemailer"
import {
  isGraphMailConfigured as isEnvGraphConfigured,
  sendGraphMail as sendEnvGraphMail,
} from "./graph-mailer.mjs"
import { getEmailConfigInternal } from "./db.mjs"

const GRAPH_BASE_URL = "https://graph.microsoft.com/v1.0"

// ─────────────────────────── HTML helper ────────────────────────────────

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
}

// ─────────────────────────── Provider: Graph (DB) ───────────────────────

const graphTokenCache = new Map() // clientId -> { token, expiresAt }

async function getDbGraphAccessToken(graph) {
  const key = `${graph.tenantId}:${graph.clientId}`
  const cached = graphTokenCache.get(key)
  const now = Date.now()
  if (cached && cached.expiresAt > now + 60_000) return cached.token

  const tokenUrl = `https://login.microsoftonline.com/${graph.tenantId}/oauth2/v2.0/token`
  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: graph.clientId,
      client_secret: graph.clientSecret,
      scope: "https://graph.microsoft.com/.default",
    }),
  })

  if (!response.ok) {
    const detail = await response.text().catch(() => "")
    throw new Error(`Graph token request failed (${response.status}): ${detail}`)
  }

  const data = await response.json()
  if (!data.access_token) throw new Error("Graph token response missing access_token")

  graphTokenCache.set(key, {
    token: data.access_token,
    expiresAt: now + Math.max(60, Number(data.expires_in || 3600)) * 1000,
  })
  return data.access_token
}

async function sendDbGraphMail(graph, { to, subject, html, text, fromName, replyTo, headers }) {
  const token = await getDbGraphAccessToken(graph)
  const senderEmail = graph.senderEmail
  const endpoint = `${GRAPH_BASE_URL}/users/${encodeURIComponent(senderEmail)}/sendMail`

  const payload = {
    message: {
      subject,
      body: { contentType: "HTML", content: html },
      toRecipients: [{ emailAddress: { address: to } }],
      from: {
        emailAddress: {
          address: senderEmail,
          name: fromName || graph.senderName || "Novus Sparks AI",
        },
      },
    },
    saveToSentItems: true,
  }
  if (replyTo) {
    payload.message.replyTo = [{ emailAddress: { address: replyTo } }]
  }
  if (headers && typeof headers === "object") {
    // Microsoft Graph rejects standard internet headers (List-Unsubscribe,
    // Auto-Submitted, etc.) with InvalidInternetMessageHeader unless the name
    // starts with "x-". Standard deliverability headers can only be set via
    // SMTP. For Graph sends we keep just the x-prefixed headers and rely on
    // the in-email <a href> unsubscribe link as the user-facing opt-out path.
    const safeEntries = Object.entries(headers)
      .filter(([name, value]) => name && value != null && /^x-/i.test(name))
      .map(([name, value]) => ({ name, value: String(value) }))
    if (safeEntries.length) payload.message.internetMessageHeaders = safeEntries
  }
  if (text && text.trim()) payload.message.bodyPreview = text.slice(0, 255)

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
  if (!response.ok) {
    const detail = await response.text().catch(() => "")
    throw new Error(`Graph sendMail failed (${response.status}): ${detail}`)
  }
}

// ─────────────────────────── Provider: SMTP (DB) ────────────────────────

function buildSmtpTransport(smtp) {
  if (!smtp?.host || !smtp?.port) throw new Error("SMTP host and port are required")
  return nodemailer.createTransport({
    host: smtp.host,
    port: Number(smtp.port),
    secure: smtp.secure !== false && Number(smtp.port) === 465,
    requireTLS: smtp.secure !== false && Number(smtp.port) !== 465,
    auth: smtp.user
      ? { user: smtp.user, pass: smtp.password || "" }
      : undefined,
    tls: { minVersion: "TLSv1.2" },
  })
}

async function sendSmtpMail(cfg, { to, subject, html, text, replyTo, headers }) {
  const transporter = buildSmtpTransport(cfg.smtp)
  const fromEmail = cfg.fromEmail || cfg.smtp.user || ""
  if (!fromEmail) throw new Error("SMTP fromEmail is not configured")
  const fromHeader = cfg.fromName ? `${cfg.fromName} <${fromEmail}>` : fromEmail
  await transporter.sendMail({
    from: fromHeader,
    to,
    subject,
    text: text || undefined,
    html,
    replyTo: replyTo || cfg.replyTo || undefined,
    headers: headers || undefined,
  })
}

// ─────────────────────────── Active provider resolution ─────────────────

/**
 * Resolve the active mail provider.
 * Returns null when nothing is configured.
 */
async function resolveActiveProvider() {
  const dbCfg = await getEmailConfigInternal().catch(() => null)

  if (dbCfg) {
    if (dbCfg.provider === "smtp" && dbCfg.smtp?.host && dbCfg.smtp?.port) {
      return { kind: "smtp-db", cfg: dbCfg }
    }
    if (
      dbCfg.provider === "graph" &&
      dbCfg.graph?.tenantId &&
      dbCfg.graph?.clientId &&
      dbCfg.graph?.clientSecret &&
      dbCfg.graph?.senderEmail
    ) {
      return { kind: "graph-db", cfg: dbCfg }
    }
  }

  if (isEnvGraphConfigured()) return { kind: "graph-env", cfg: null }

  return null
}

export async function isMailConfigured() {
  const active = await resolveActiveProvider()
  return Boolean(active)
}

export async function getActiveMailStatus() {
  const dbCfg = await getEmailConfigInternal().catch(() => null)
  const active = await resolveActiveProvider()
  return {
    configured: Boolean(active),
    activeProvider: active?.kind || null,
    hasDbConfig: Boolean(dbCfg),
    envGraphConfigured: isEnvGraphConfigured(),
  }
}

// ─────────────────────────── Public send helpers ────────────────────────

/**
 * Send an arbitrary message through the active provider.
 * Throws when no provider is configured or the underlying transport fails.
 */
export async function sendMail({ to, subject, html, text, replyTo, headers }) {
  const active = await resolveActiveProvider()
  if (!active) throw new Error("No mail provider is configured")

  const fromName = active.cfg?.fromName || active.cfg?.graph?.senderName || "Novus Sparks AI"

  // Always attach deliverability headers so transactional mail clears Gmail/Yahoo
  // bulk-sender requirements (RFC 8058 one-click unsubscribe + reputation hints).
  const mergedHeaders = buildDeliverabilityHeaders(headers)
  const resolvedReplyTo = replyTo || active.cfg?.replyTo || SUPPORT_EMAIL

  if (active.kind === "smtp-db") {
    return sendSmtpMail(active.cfg, { to, subject, html, text, replyTo: resolvedReplyTo, headers: mergedHeaders })
  }
  if (active.kind === "graph-db") {
    return sendDbGraphMail(active.cfg.graph, { to, subject, html, text, fromName, replyTo: resolvedReplyTo, headers: mergedHeaders })
  }
  // env Graph fallback uses graph-mailer.mjs directly
  return sendEnvGraphMail({ to, subject, html, text, replyTo: resolvedReplyTo, headers: mergedHeaders })
}

/**
 * Build the standard set of deliverability headers attached to every send.
 * - List-Unsubscribe + List-Unsubscribe-Post: required by Gmail/Yahoo bulk sender
 *   policy (Feb 2024) for one-click unsubscribe (RFC 8058).
 * - X-Entity-Ref-ID: random per-message ID prevents Gmail threading-as-promo.
 * - Auto-Submitted: marks transactional mail; reduces auto-reply loops.
 */
function buildDeliverabilityHeaders(extra) {
  const unsubMailto = `mailto:${SUPPORT_EMAIL}?subject=unsubscribe`
  const unsubUrl = `${APP_BASE_URL}/unsubscribe?email=`
  const baseHeaders = {
    "List-Unsubscribe": `<${unsubMailto}>, <${unsubUrl}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    "Auto-Submitted": "auto-generated",
    "X-Entity-Ref-ID": cryptoRandomId(),
  }
  return { ...baseHeaders, ...(extra || {}) }
}

function cryptoRandomId() {
  // Lightweight per-message ID without pulling crypto module at top level.
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/**
 * Best-effort wrapper. Logs failures and returns { ok, skipped, error } so
 * callers (signup, password reset, invites) never throw because of email.
 */
export async function safeSend(label, args) {
  try {
    if (!(await isMailConfigured())) {
      console.warn(`[mail/${label}] no provider configured — skipping send to ${args?.to}`)
      return { ok: false, skipped: true }
    }
    await sendMail(args)
    console.log(`[mail/${label}] sent to ${args.to}`)
    return { ok: true }
  } catch (err) {
    console.error(`[mail/${label}] send FAILED:`, err?.message)
    return { ok: false, error: err?.message || String(err) }
  }
}

// ─────────────────────────── Templates ──────────────────────────────────

const APP_BASE_URL = process.env.APP_PUBLIC_URL || "https://novussparks.com"
const FOUNDER_NAME = "Umer Lone"
const FOUNDER_TITLE = "Founder — Novus Sparks AI"
const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || "agentic@novussparks.com"
const BRAND_PRIMARY = "#0f766e"
const BRAND_PRIMARY_DARK = "#115e59"
const BRAND_ACCENT = "#f59e0b"

/**
 * Inline SVG signature for Umer Lone — renders in most modern mail clients
 * (Apple Mail, Gmail web, iOS Mail, Outlook 365 web). Outlook desktop falls
 * back to the cursive text below it.
 */
const SIGNATURE_SVG = `
  <svg xmlns="http://www.w3.org/2000/svg" width="220" height="60" viewBox="0 0 220 60" aria-label="Umer Lone signature">
    <text x="0" y="42"
          font-family="'Brush Script MT','Lucida Handwriting','Segoe Script',cursive"
          font-size="38" fill="#0f766e" font-style="italic">Umer Lone</text>
  </svg>
`

/**
 * Branded signature block — used at the bottom of every transactional email.
 * Combines an SVG signature, founder name, title, and a subtle brand stripe.
 */
function renderSignatureBlock() {
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
           style="margin-top: 28px; border-top: 1px solid #e2e8f0; padding-top: 20px;">
      <tr>
        <td style="font-family: Arial, Helvetica, sans-serif; color: #0f172a;">
          <div style="font-family: 'Brush Script MT','Lucida Handwriting','Segoe Script',cursive;
                      font-size: 30px; color: ${BRAND_PRIMARY}; line-height: 1; margin-bottom: 4px;">
            ${SIGNATURE_SVG}
          </div>
          <div style="font-size: 15px; font-weight: 700; color: #0f172a; margin-top: 6px;">
            ${escapeHtml(FOUNDER_NAME)}
          </div>
          <div style="font-size: 13px; color: #475569; margin-top: 2px;">
            ${escapeHtml(FOUNDER_TITLE)}
          </div>
          <div style="font-size: 12px; color: #64748b; margin-top: 10px;">
            ${escapeHtml(SUPPORT_EMAIL)} &nbsp;·&nbsp;
            <a href="${escapeHtml(APP_BASE_URL)}" style="color: ${BRAND_PRIMARY}; text-decoration: none;">novussparks.com</a>
          </div>
        </td>
      </tr>
    </table>
  `
}

/**
 * Common HTML wrapper — gradient header (with logo), white card, footer.
 * Compatible with Gmail, Apple Mail, Outlook 365, and most webmail clients.
 *
 * @param {Object} args
 * @param {string} args.headline
 * @param {string} [args.preheader]
 * @param {string} [args.tagline]
 * @param {string} args.body
 * @param {string} [args.unsubscribeUrl]  Per-recipient one-click unsubscribe URL
 *                                       (appears in footer for marketing campaigns).
 * @param {string} [args.logoUrl]         Override logo URL (defaults to brand icon).
 * @param {string} [args.brandName]       Header brand line (defaults to "Novus Sparks · AI").
 */
function renderEmailShell({ preheader, headline, tagline, body, unsubscribeUrl, logoUrl, brandName }) {
  // Full-width branded banner. Override per-call via `logoUrl` if needed.
  // The ?v= query string busts client caches when the banner is replaced.
  const bannerSrc = logoUrl || `${APP_BASE_URL}/icons/email-header.jpg?v=3`
  const brandLine = brandName || "Novus Sparks · AI"
  const unsubFooter = unsubscribeUrl
    ? `<br/><a href="${escapeHtml(unsubscribeUrl)}" style="color:#7dd3fc; text-decoration:underline;">Unsubscribe</a> from marketing emails.`
    : ""
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(headline)}</title>
  </head>
  <body style="margin:0; padding:0; background:#f1f5f9; font-family: Arial, Helvetica, sans-serif; color:#0f172a;">
    <span style="display:none; visibility:hidden; opacity:0; height:0; width:0; overflow:hidden;">
      ${escapeHtml(preheader || "")}
    </span>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f1f5f9; padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"
                 style="max-width:600px; width:100%; background:#ffffff; border-radius:14px; overflow:hidden;
                        box-shadow:0 4px 14px rgba(15,23,42,0.06);">
            <!-- Header / brand banner image (full-width, edge-to-edge) -->
            <tr>
              <td style="padding:0; background:#0b1830;">
                <a href="${escapeHtml(APP_BASE_URL)}" style="display:block; line-height:0; text-decoration:none;">
                  <img src="${escapeHtml(bannerSrc)}" alt="${escapeHtml(brandLine)}"
                       width="600"
                       style="display:block; width:100%; max-width:600px; height:auto; border:0; outline:none; text-decoration:none;" />
                </a>
              </td>
            </tr>
            <!-- Headline strip under the banner -->
            <tr>
              <td style="background:#ffffff; padding:24px 36px 0; color:#0f172a;">
                <div style="font-size:22px; font-weight:700; line-height:1.25; color:#0f172a;">
                  ${escapeHtml(headline)}
                </div>
                ${tagline ? `<div style="font-size:14px; color:#475569; margin-top:6px;">${escapeHtml(tagline)}</div>` : ""}
              </td>
            </tr>
            <!-- Body -->
            <tr>
              <td style="padding:18px 36px 12px; color:#0f172a; font-size:15px; line-height:1.65;">
                ${body}
                ${renderSignatureBlock()}
              </td>
            </tr>
            <!-- Footer -->
            <tr>
              <td style="background:#0b3d3a; color:#cbd5e1; padding:18px 36px; font-size:11px; line-height:1.5;">
                © ${new Date().getFullYear()} Novus Sparks AI · Crafted by humans &amp; agents.<br/>
                You received this because you created an account at novussparks.com.
                If this wasn't you, please contact
                <a href="mailto:${escapeHtml(SUPPORT_EMAIL)}" style="color:#7dd3fc; text-decoration:none;">
                  ${escapeHtml(SUPPORT_EMAIL)}
                </a>.${unsubFooter}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`
}

function renderCtaButton(label, href) {
  const safeLabel = escapeHtml(label)
  const safeHref = escapeHtml(href)
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin: 22px 0;">
      <tr>
        <td bgcolor="${BRAND_PRIMARY}" style="border-radius:8px;">
          <a href="${safeHref}"
             style="display:inline-block; padding:13px 26px; font-family:Arial,Helvetica,sans-serif;
                    font-size:15px; font-weight:600; color:#ffffff; text-decoration:none; border-radius:8px;">
            ${safeLabel} →
          </a>
        </td>
      </tr>
    </table>
  `
}

/**
 * Welcome email — beautifully branded, founder-signed.
 */
export async function sendWelcomeEmail({ to, fullName }) {
  const safeName = escapeHtml(fullName || "there")
  const dashLink = `${APP_BASE_URL}/dashboard`

  const text =
    `Hi ${fullName || "there"},\n\n` +
    `Welcome to Novus Sparks AI — I'm thrilled you're here.\n\n` +
    `Novus Sparks is an enterprise-grade agentic AI platform that brings together ` +
    `multi-LLM intelligence (Copilot, DeepSeek, Gemini, Groq, Spark) under one secure roof. ` +
    `You can chat, build agents, run sentinel queries, and orchestrate workflows in minutes.\n\n` +
    `Open your workspace: ${dashLink}\n\n` +
    `A separate email with your welcome bonus is on its way.\n\n` +
    `Warmly,\n${FOUNDER_NAME}\n${FOUNDER_TITLE}\n${SUPPORT_EMAIL}`

  const body = `
    <p style="margin:0 0 14px; font-size:17px;">Hi ${safeName},</p>
    <p style="margin:0 0 14px;">
      Welcome to <strong>Novus Sparks AI</strong> — I'm genuinely thrilled you're here.
    </p>
    <p style="margin:0 0 14px;">
      Novus Sparks is an enterprise-grade <strong>agentic AI platform</strong> that brings
      together best-in-class language models — <em>Copilot, DeepSeek, Gemini, Groq, and Spark</em> —
      under one secure, governable roof. In minutes you can:
    </p>
    <ul style="margin:0 0 18px 0; padding-left:22px;">
      <li style="margin-bottom:6px;">Chat with the model that fits the task — automatic fallback across providers.</li>
      <li style="margin-bottom:6px;">Spin up <strong>autonomous agents</strong> with memory, tools, and policies.</li>
      <li style="margin-bottom:6px;">Run <strong>Sentinel</strong> queries with full audit, routing, and budget controls.</li>
      <li style="margin-bottom:6px;">Invite your team and govern access with enterprise RBAC.</li>
    </ul>
    ${renderCtaButton("Open my workspace", dashLink)}
    <p style="margin:0 0 8px;">
      A second email is on its way with your <strong>welcome bonus</strong> — keep an eye on your inbox.
    </p>
    <p style="margin:18px 0 0;">If you ever need anything, just reply to this email — it lands directly with our team.</p>
  `

  const html = renderEmailShell({
    preheader: "Welcome to Novus Sparks AI — your workspace is ready.",
    headline: `Welcome to Novus Sparks, ${fullName ? fullName.split(" ")[0] : "founder"} 👋`,
    tagline: "Your enterprise agentic AI workspace is now live.",
    body,
  })

  return safeSend("welcome", {
    to,
    subject: "Welcome to Novus Sparks AI — your workspace is ready",
    html,
    text,
  })
}

/**
 * Welcome-back email — sent when a previously-deleted account re-signs up.
 * Acknowledges the return without offering the welcome bonus (one-time bonus only).
 */
export async function sendWelcomeBackEmail({ to, fullName }) {
  const safeName = escapeHtml(fullName || "there")
  const dashLink = `${APP_BASE_URL}/dashboard`

  const text =
    `Hi ${fullName || "there"},\n\n` +
    `Welcome back to Novus Sparks AI — it's wonderful to see you again.\n\n` +
    `Your new workspace is ready and your account has been fully restored. ` +
    `Note: the one-time welcome bonus only applies to first-time signups, so ` +
    `it isn't included this round — but everything else is exactly where you left it.\n\n` +
    `Open your workspace: ${dashLink}\n\n` +
    `If there's anything we can do to make your return smoother, just reply to this email.\n\n` +
    `Warmly,\n${FOUNDER_NAME}\n${FOUNDER_TITLE}\n${SUPPORT_EMAIL}`

  const body = `
    <p style="margin:0 0 14px; font-size:17px;">Hi ${safeName},</p>
    <p style="margin:0 0 14px;">
      Welcome back to <strong>Novus Sparks AI</strong> — it's wonderful to see you again.
    </p>
    <p style="margin:0 0 14px;">
      Your new workspace is ready and your account has been fully restored. You can pick up
      right where you left off across <em>Copilot, DeepSeek, Gemini, Groq, and Spark</em>.
    </p>
    <p style="margin:0 0 14px; padding:12px 14px; background:#f8fafc; border-left:3px solid ${BRAND_PRIMARY}; border-radius:4px; color:#475569; font-size:14px;">
      <strong>Heads up:</strong> the one-time welcome bonus is reserved for first-time
      signups, so it isn't attached to this returning account. Everything else is unchanged.
    </p>
    ${renderCtaButton("Open my workspace", dashLink)}
    <p style="margin:18px 0 0;">
      If there's anything we can do to make your return smoother, just reply to this email.
    </p>
  `

  const html = renderEmailShell({
    preheader: "Welcome back to Novus Sparks AI — your workspace is ready.",
    headline: `Welcome back, ${fullName ? fullName.split(" ")[0] : "founder"} 👋`,
    tagline: "Your enterprise agentic AI workspace is ready again.",
    body,
  })

  return safeSend("welcome-back", {
    to,
    subject: "Welcome back to Novus Sparks AI",
    html,
    text,
  })
}

/**
 * Bonus claim email — sent right after the welcome email on signup.
 * Highlights the 10 Pro credits + 7-day BASIC trial and links to the claim flow.
 */
export async function sendBonusClaimEmail({ to, fullName }) {
  const safeName = escapeHtml(fullName || "there")
  const claimLink = `${APP_BASE_URL}/dashboard?claim=welcome-bonus`

  const text =
    `Hi ${fullName || "there"},\n\n` +
    `As a thank-you for joining Novus Sparks AI, your account has been credited with:\n` +
    `• 10 free Pro credits — ready to spend on any model\n` +
    `• 7-day BASIC trial — full access to premium agentic modules\n\n` +
    `Claim now: ${claimLink}\n\n` +
    `These bonuses are already attached to your account — clicking the button above ` +
    `simply opens the bonus tray inside your dashboard.\n\n` +
    `Warmly,\n${FOUNDER_NAME}\n${FOUNDER_TITLE}\n${SUPPORT_EMAIL}`

  const body = `
    <p style="margin:0 0 14px; font-size:17px;">Hi ${safeName},</p>
    <p style="margin:0 0 14px;">
      As a small thank-you for joining <strong>Novus Sparks AI</strong>, I've personally
      attached a welcome bonus to your account. Consider it our handshake.
    </p>

    <!-- Bonus card -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
           style="margin:18px 0; border:1px solid #99f6e4; background:#f0fdfa; border-radius:12px;">
      <tr>
        <td style="padding:22px 24px;">
          <div style="font-size:12px; letter-spacing:2px; text-transform:uppercase; color:${BRAND_PRIMARY}; font-weight:700;">
            Your Welcome Bonus
          </div>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:14px;">
            <tr>
              <td style="padding:10px 0; border-bottom:1px solid #ccfbf1;">
                <span style="display:inline-block; width:34px; height:34px; line-height:34px; text-align:center;
                             background:${BRAND_ACCENT}; color:#fff; border-radius:50%; font-weight:700;">10</span>
                <span style="margin-left:12px; font-weight:600;">Pro credits</span>
                <span style="color:#475569;"> — spend on any model (Copilot, DeepSeek, Gemini, Groq).</span>
              </td>
            </tr>
            <tr>
              <td style="padding:12px 0;">
                <span style="display:inline-block; width:34px; height:34px; line-height:34px; text-align:center;
                             background:${BRAND_PRIMARY}; color:#fff; border-radius:50%; font-weight:700;">7d</span>
                <span style="margin-left:12px; font-weight:600;">BASIC trial</span>
                <span style="color:#475569;"> — unlock premium agents, Sentinel routing, and team workspaces.</span>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    ${renderCtaButton("Claim my bonus", claimLink)}

    <p style="margin:14px 0 0; color:#475569; font-size:13px;">
      Already credited — the button just opens the bonus tray. No coupon code needed.
    </p>

    <p style="margin:18px 0 0;">
      I'd love to hear what you build first. Reply to this email anytime.
    </p>
  `

  const html = renderEmailShell({
    preheader: "Your 10 Pro credits + 7-day BASIC trial are ready to claim.",
    headline: "Your welcome bonus is ready 🎁",
    tagline: "10 Pro credits · 7-day BASIC trial · already attached to your account.",
    body,
  })

  return safeSend("bonus-claim", {
    to,
    subject: "Your Novus Sparks account is ready — getting started",
    html,
    text,
  })
}

export async function sendPasswordResetEmail({ to, fullName, resetCode, expiresMinutes = 15 }) {
  const safeName = escapeHtml(fullName || "there")
  const safeCode = escapeHtml(resetCode)
  const html = `
    <div style="font-family: Arial, sans-serif; color: #1c1414; line-height: 1.55;">
      <h2 style="margin: 0 0 12px; color: #0f766e;">Reset your password</h2>
      <p>Hi ${safeName},</p>
      <p>Use this code to reset your password:</p>
      <p style="font-size: 26px; letter-spacing: 3px; font-weight: 700; margin: 12px 0;">${safeCode}</p>
      <p>This code expires in ${expiresMinutes} minutes.</p>
      <p>If you did not request this, you can ignore this email.</p>
    </div>
  `
  const text = `Hi ${fullName || "there"}, your password reset code is ${resetCode}. It expires in ${expiresMinutes} minutes.`
  return safeSend("password-reset", { to, subject: "Your NovusSparks password reset code", html, text })
}

export async function sendNewUserAdminNotification({ adminEmail, newUserEmail, newUserName, source = "signup" }) {
  if (!adminEmail) return { ok: false, skipped: true }
  const safeName = escapeHtml(newUserName || "Unknown")
  const safeEmail = escapeHtml(newUserEmail)
  const safeSource = escapeHtml(source)
  const timestamp = new Date().toISOString()
  const html = `
    <div style="font-family: Arial, sans-serif; color: #1c1414; line-height: 1.55;">
      <h2 style="margin: 0 0 12px; color: #0f766e;">New User Registration</h2>
      <p>A new user has registered on NovusSparks.</p>
      <table style="border-collapse: collapse; margin: 12px 0;">
        <tr><td style="padding: 4px 12px 4px 0; font-weight: 600;">Name:</td><td style="padding: 4px 0;">${safeName}</td></tr>
        <tr><td style="padding: 4px 12px 4px 0; font-weight: 600;">Email:</td><td style="padding: 4px 0;">${safeEmail}</td></tr>
        <tr><td style="padding: 4px 12px 4px 0; font-weight: 600;">Source:</td><td style="padding: 4px 0;">${safeSource}</td></tr>
        <tr><td style="padding: 4px 12px 4px 0; font-weight: 600;">Time:</td><td style="padding: 4px 0;">${timestamp}</td></tr>
      </table>
    </div>
  `
  const text = `New user: ${newUserName || "Unknown"} <${newUserEmail}> via ${source} at ${timestamp}`
  return safeSend("admin-notify", { to: adminEmail, subject: `New user registered: ${newUserEmail}`, html, text })
}

export async function sendInviteEmail({ to, inviterName, inviteLink, organizationName }) {
  const safeInviter = escapeHtml(inviterName || "A NovusSparks admin")
  const safeOrg = escapeHtml(organizationName || "NovusSparks")
  const safeLink = escapeHtml(inviteLink)
  const html = `
    <div style="font-family: Arial, sans-serif; color: #1c1414; line-height: 1.55;">
      <h2 style="margin: 0 0 12px; color: #0f766e;">You're invited</h2>
      <p>${safeInviter} invited you to join <strong>${safeOrg}</strong>.</p>
      <p>
        <a href="${safeLink}" style="display: inline-block; margin-top: 8px; background: #0f766e; color: #fff; text-decoration: none; padding: 10px 14px; border-radius: 6px;">
          Accept Invitation
        </a>
      </p>
      <p style="margin-top: 12px;">If the button does not work, paste this link in your browser:</p>
      <p><a href="${safeLink}">${safeLink}</a></p>
    </div>
  `
  const text = `${inviterName || "A NovusSparks admin"} invited you to join ${organizationName || "NovusSparks"}. Open: ${inviteLink}`
  return safeSend("invite", { to, subject: `You're invited to ${organizationName || "NovusSparks"}`, html, text })
}

// ─────────────────────────── Admin: connectivity tests ──────────────────

/**
 * Verify SMTP credentials by opening a transport and running `verify()`.
 * Returns { ok, error?, code? } — never throws.
 */
export async function testSmtpConfig(smtp) {
  try {
    const transporter = buildSmtpTransport(smtp)
    await transporter.verify()
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err?.message || String(err), code: err?.code || null }
  }
}

/**
 * Verify Graph credentials by requesting a token (not sending mail).
 */
export async function testGraphConfig(graph) {
  try {
    if (!graph?.tenantId || !graph?.clientId || !graph?.clientSecret || !graph?.senderEmail) {
      return { ok: false, error: "tenantId, clientId, clientSecret, and senderEmail are required" }
    }
    await getDbGraphAccessToken(graph)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err?.message || String(err) }
  }
}

/**
 * Verify IMAP credentials by performing a TLS LOGIN handshake. Uses a tiny
 * inline IMAP client (no extra dependency) — checks `* OK ... LOGIN OK` only.
 */
export async function testImapConfig(imap) {
  if (!imap?.host || !imap?.port || !imap?.user) {
    return { ok: false, error: "host, port, and user are required" }
  }
  const tls = await import("node:tls")
  const net = await import("node:net")
  const useTls = imap.secure !== false
  const port = Number(imap.port)
  const password = String(imap.password || "")

  return await new Promise((resolve) => {
    let buffer = ""
    let stage = "greet"
    const tag = "a1"
    const finish = (result, socket) => {
      try { socket?.end?.() } catch { /* noop */ }
      resolve(result)
    }
    const onData = (socket) => (chunk) => {
      buffer += chunk.toString("utf8")
      if (stage === "greet" && /\* OK/i.test(buffer)) {
        stage = "login"
        buffer = ""
        const safeUser = password.includes('"') ? imap.user : imap.user
        socket.write(`${tag} LOGIN "${String(safeUser).replaceAll('"', '\\"')}" "${password.replaceAll('"', '\\"')}"\r\n`)
        return
      }
      if (stage === "login") {
        if (new RegExp(`^${tag} OK`, "im").test(buffer)) {
          finish({ ok: true }, socket)
        } else if (new RegExp(`^${tag} (NO|BAD)`, "im").test(buffer)) {
          const line = buffer.split(/\r?\n/).find((l) => l.startsWith(`${tag} `)) || "IMAP login failed"
          finish({ ok: false, error: line.trim() }, socket)
        }
      }
    }
    const connector = useTls ? tls.connect : net.createConnection
    const opts = useTls
      ? { host: imap.host, port, servername: imap.host }
      : { host: imap.host, port }
    const socket = connector(opts, () => { /* connected */ })
    socket.setTimeout(8000)
    socket.on("data", onData(socket))
    socket.on("error", (err) => finish({ ok: false, error: err?.message || String(err) }, socket))
    socket.on("timeout", () => finish({ ok: false, error: "IMAP connection timed out" }, socket))
    socket.on("end", () => {
      if (stage !== "done") finish({ ok: false, error: "IMAP connection closed before LOGIN completed" }, socket)
    })
  })
}

/**
 * Send a one-off test email using the supplied (override) config or the
 * currently active provider when no override is provided.
 */
export async function sendTestEmail({ to, override = null, subject, body }) {
  const subj = subject || "NovusSparks email configuration test"
  const text = body || `This is a test message from NovusSparks sent at ${new Date().toISOString()}.`
  const html = `<div style="font-family:Arial,sans-serif">
    <h3 style="color:#0f766e;margin:0 0 8px;">NovusSparks email test</h3>
    <p>${escapeHtml(text)}</p>
  </div>`

  if (override) {
    if (override.provider === "smtp") {
      await sendSmtpMail({
        fromEmail: override.fromEmail || override.smtp?.user || "",
        fromName: override.fromName || "NovusSparks",
        replyTo: override.replyTo || "",
        smtp: override.smtp,
      }, { to, subject: subj, html, text })
      return { ok: true }
    }
    if (override.provider === "graph") {
      await sendDbGraphMail(override.graph, {
        to, subject: subj, html, text,
        fromName: override.fromName || override.graph?.senderName || "NovusSparks",
      })
      return { ok: true }
    }
    return { ok: false, error: "Unknown provider in override" }
  }

  await sendMail({ to, subject: subj, html, text })
  return { ok: true }
}

// ─────────────────────────── Re-exports for Email Studio ─────────────────
// These let backend/email-studio.mjs render branded campaign emails using the
// exact same shell + CTA helpers as transactional templates.
export const renderBrandedShell = renderEmailShell
export const renderBrandedCtaButton = renderCtaButton
export const BRAND = {
  primary: BRAND_PRIMARY,
  primaryDark: BRAND_PRIMARY_DARK,
  accent: BRAND_ACCENT,
  founderName: FOUNDER_NAME,
  founderTitle: FOUNDER_TITLE,
  supportEmail: SUPPORT_EMAIL,
  appBaseUrl: APP_BASE_URL,
}
