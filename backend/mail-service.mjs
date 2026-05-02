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

async function sendDbGraphMail(graph, { to, subject, html, text, fromName }) {
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
          name: fromName || graph.senderName || "NovusSparks",
        },
      },
    },
    saveToSentItems: true,
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

async function sendSmtpMail(cfg, { to, subject, html, text }) {
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
    replyTo: cfg.replyTo || undefined,
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
export async function sendMail({ to, subject, html, text }) {
  const active = await resolveActiveProvider()
  if (!active) throw new Error("No mail provider is configured")

  const fromName = active.cfg?.fromName || active.cfg?.graph?.senderName || "NovusSparks"

  if (active.kind === "smtp-db") {
    return sendSmtpMail(active.cfg, { to, subject, html, text })
  }
  if (active.kind === "graph-db") {
    return sendDbGraphMail(active.cfg.graph, { to, subject, html, text, fromName })
  }
  // env Graph fallback uses graph-mailer.mjs directly
  return sendEnvGraphMail({ to, subject, html, text })
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

/**
 * Welcome email — also announces the 10-credit / 7-day BASIC trial bonus.
 */
export async function sendWelcomeEmail({ to, fullName }) {
  const safeName = escapeHtml(fullName || "there")
  const dashLink = `${APP_BASE_URL}/dashboard`
  const text =
    `Hi ${fullName || "there"},\n\n` +
    `Welcome to NovusSparks. As a thank-you for joining, we've added 10 free Pro credits ` +
    `and a 7-day BASIC trial to your account — they're already active.\n\n` +
    `Open your dashboard to start: ${dashLink}\n\n— NovusSparks Team`

  const html = `
    <div style="font-family: Arial, sans-serif; color: #1c1414; line-height: 1.55;">
      <h2 style="margin: 0 0 12px; color: #0f766e;">Welcome to NovusSparks</h2>
      <p>Hi ${safeName},</p>
      <p>Your account is active and we've added a welcome bonus:</p>
      <ul style="padding-left: 20px;">
        <li><strong>10 free Pro credits</strong> ready to spend</li>
        <li><strong>7-day BASIC trial</strong> — full access to premium modules</li>
      </ul>
      <p style="margin: 20px 0;">
        <a href="${escapeHtml(dashLink)}"
           style="display: inline-block; background: #0f766e; color: #fff; text-decoration: none; padding: 10px 16px; border-radius: 6px;">
          Claim my bonus &amp; open dashboard
        </a>
      </p>
      <p>Thanks for joining us.</p>
      <p style="margin-top: 20px;">— NovusSparks Team</p>
    </div>
  `
  return safeSend("welcome", { to, subject: "Welcome to NovusSparks — your bonus credits are ready", html, text })
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
