const GRAPH_BASE_URL = "https://graph.microsoft.com/v1.0"

const GRAPH_TENANT_ID = process.env.M365_TENANT_ID || ""
const GRAPH_CLIENT_ID = process.env.M365_CLIENT_ID || ""
const GRAPH_CLIENT_SECRET = process.env.M365_CLIENT_SECRET || ""
const GRAPH_SENDER_EMAIL = process.env.M365_SENDER_EMAIL || ""
const GRAPH_SENDER_NAME = process.env.M365_SENDER_NAME || "NovusSparks"

let cachedAccessToken = null
let cachedAccessTokenExpiresAt = 0

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
}

export function isGraphMailConfigured() {
  return Boolean(
    GRAPH_TENANT_ID && GRAPH_CLIENT_ID && GRAPH_CLIENT_SECRET && GRAPH_SENDER_EMAIL
  )
}

async function getGraphAccessToken() {
  const now = Date.now()
  if (cachedAccessToken && cachedAccessTokenExpiresAt > now + 60000) {
    return cachedAccessToken
  }

  const tokenUrl = `https://login.microsoftonline.com/${GRAPH_TENANT_ID}/oauth2/v2.0/token`
  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: GRAPH_CLIENT_ID,
      client_secret: GRAPH_CLIENT_SECRET,
      scope: "https://graph.microsoft.com/.default",
    }),
  })

  if (!response.ok) {
    const detail = await response.text().catch(() => "")
    throw new Error(`Graph token request failed (${response.status}): ${detail}`)
  }

  const data = await response.json()
  if (!data.access_token) {
    throw new Error("Graph token response missing access_token")
  }

  cachedAccessToken = data.access_token
  cachedAccessTokenExpiresAt = now + Math.max(60, Number(data.expires_in || 3600)) * 1000
  return cachedAccessToken
}

export async function sendGraphMail({ to, subject, html, text }) {
  if (!isGraphMailConfigured()) {
    throw new Error("Microsoft Graph mail is not configured")
  }

  const token = await getGraphAccessToken()
  const endpoint = `${GRAPH_BASE_URL}/users/${encodeURIComponent(GRAPH_SENDER_EMAIL)}/sendMail`

  const payload = {
    message: {
      subject,
      body: {
        contentType: "HTML",
        content: html,
      },
      toRecipients: [{ emailAddress: { address: to } }],
      from: {
        emailAddress: {
          address: GRAPH_SENDER_EMAIL,
          name: GRAPH_SENDER_NAME,
        },
      },
    },
    saveToSentItems: true,
  }

  if (text && text.trim()) {
    payload.message.bodyPreview = text.slice(0, 255)
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const detail = await response.text().catch(() => "")
    throw new Error(`Graph sendMail failed (${response.status}): ${detail}`)
  }
}

export async function sendWelcomeEmail({ to, fullName }) {
  const safeName = escapeHtml(fullName || "there")
  await sendGraphMail({
    to,
    subject: "Welcome to NovusSparks",
    text: `Hi ${fullName || "there"}, welcome to NovusSparks. Your account is ready.`,
    html: `
      <div style="font-family: Arial, sans-serif; color: #1c1414; line-height: 1.55;">
        <h2 style="margin: 0 0 12px; color: #0f766e;">Welcome to NovusSparks</h2>
        <p>Hi ${safeName},</p>
        <p>Your account is now active. You can start building with NovusSparks right away.</p>
        <p>Thanks for joining us.</p>
        <p style="margin-top: 20px;">- NovusSparks Team</p>
      </div>
    `,
  })
}

export async function sendPasswordResetEmail({ to, fullName, resetCode, expiresMinutes = 15 }) {
  const safeName = escapeHtml(fullName || "there")
  const safeCode = escapeHtml(resetCode)
  await sendGraphMail({
    to,
    subject: "Your NovusSparks password reset code",
    text: `Hi ${fullName || "there"}, your password reset code is ${resetCode}. It expires in ${expiresMinutes} minutes.`,
    html: `
      <div style="font-family: Arial, sans-serif; color: #1c1414; line-height: 1.55;">
        <h2 style="margin: 0 0 12px; color: #0f766e;">Reset your password</h2>
        <p>Hi ${safeName},</p>
        <p>Use this code to reset your password:</p>
        <p style="font-size: 26px; letter-spacing: 3px; font-weight: 700; margin: 12px 0;">${safeCode}</p>
        <p>This code expires in ${expiresMinutes} minutes.</p>
        <p>If you did not request this, you can ignore this email.</p>
      </div>
    `,
  })
}

export async function sendNewUserAdminNotification({ adminEmail, newUserEmail, newUserName, source = "signup" }) {
  const safeName = escapeHtml(newUserName || "Unknown")
  const safeEmail = escapeHtml(newUserEmail)
  const safeSource = escapeHtml(source)
  const timestamp = new Date().toISOString()
  await sendGraphMail({
    to: adminEmail,
    subject: `New user registered: ${newUserEmail}`,
    text: `A new user has registered on NovusSparks.\n\nName: ${newUserName || "Unknown"}\nEmail: ${newUserEmail}\nSource: ${source}\nTime: ${timestamp}`,
    html: `
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
    `,
  })
}

export async function sendInviteEmail({ to, inviterName, inviteLink, organizationName }) {
  const safeInviter = escapeHtml(inviterName || "A NovusSparks admin")
  const safeOrg = escapeHtml(organizationName || "NovusSparks")
  const safeLink = escapeHtml(inviteLink)
  await sendGraphMail({
    to,
    subject: `You're invited to ${safeOrg}`,
    text: `${inviterName || "A NovusSparks admin"} invited you to join ${organizationName || "NovusSparks"}. Open: ${inviteLink}`,
    html: `
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
    `,
  })
}
