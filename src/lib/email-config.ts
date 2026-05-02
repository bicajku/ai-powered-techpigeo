/**
 * Admin client for the app-wide email configuration.
 * Calls /api/sentinel/admin/email-config and the test endpoint.
 */
import { getEnvConfig } from "@/lib/env-config"

export type EmailProvider = "graph" | "smtp"

export interface EmailConfigSmtpView {
  host: string
  port: number | null
  secure: boolean
  user: string
  hasPassword: boolean
}
export interface EmailConfigImapView {
  host: string
  port: number | null
  secure: boolean
  user: string
  hasPassword: boolean
}
export interface EmailConfigGraphView {
  tenantId: string
  clientId: string
  hasClientSecret: boolean
  senderEmail: string
  senderName: string
}

export interface EmailConfigView {
  provider: EmailProvider
  fromEmail: string
  fromName: string
  replyTo: string
  adminNotificationEmail: string
  smtp: EmailConfigSmtpView
  imap: EmailConfigImapView
  graph: EmailConfigGraphView
  updatedBy?: string | null
  updatedAt?: number | null
}

export interface EmailConfigStatus {
  configured: boolean
  activeProvider: string | null
  hasDbConfig: boolean
  envGraphConfigured: boolean
}

export interface EmailConfigSavePayload {
  provider: EmailProvider
  fromEmail?: string
  fromName?: string
  replyTo?: string
  adminNotificationEmail?: string
  smtp?: {
    host?: string
    port?: number | null
    secure?: boolean
    user?: string
    /** undefined = leave existing; "" = clear stored secret. */
    password?: string
  }
  imap?: {
    host?: string
    port?: number | null
    secure?: boolean
    user?: string
    password?: string
  }
  graph?: {
    tenantId?: string
    clientId?: string
    clientSecret?: string
    senderEmail?: string
    senderName?: string
  }
}

function getBaseUrl() {
  const cfg = getEnvConfig()
  return cfg.backendApiBaseUrl ? cfg.backendApiBaseUrl.replace(/\/$/, "") : ""
}

function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" }
  const token = typeof localStorage !== "undefined" ? localStorage.getItem("sentinel-auth-token") : null
  if (token) headers.Authorization = `Bearer ${token}`
  try {
    const csrf = document.cookie.split(";").map((c) => c.trim()).find((c) => c.startsWith("__csrf="))
    if (csrf) headers["X-CSRF-Token"] = csrf.slice("__csrf=".length)
  } catch {
    // ignore
  }
  return headers
}

async function parseJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(text || `Request failed with ${res.status}`)
  }
  return res.json() as Promise<T>
}

export async function fetchEmailConfig(): Promise<{ config: EmailConfigView | null; status: EmailConfigStatus }> {
  const res = await fetch(`${getBaseUrl()}/api/sentinel/admin/email-config`, {
    method: "GET",
    headers: getAuthHeaders(),
    credentials: "include",
  })
  const data = await parseJson<{ ok: boolean; config: EmailConfigView | null; status: EmailConfigStatus }>(res)
  return { config: data.config, status: data.status }
}

export async function saveEmailConfig(payload: EmailConfigSavePayload): Promise<{ config: EmailConfigView | null; status: EmailConfigStatus }> {
  const res = await fetch(`${getBaseUrl()}/api/sentinel/admin/email-config`, {
    method: "PUT",
    headers: getAuthHeaders(),
    credentials: "include",
    body: JSON.stringify(payload),
  })
  const data = await parseJson<{ ok: boolean; config: EmailConfigView | null; status: EmailConfigStatus }>(res)
  return { config: data.config, status: data.status }
}

export interface EmailTestResult {
  ok: boolean
  error?: string
  code?: string | null
}

export async function testEmailConnectivity(
  mode: "smtp" | "imap" | "graph",
  config: EmailConfigSavePayload
): Promise<EmailTestResult> {
  const res = await fetch(`${getBaseUrl()}/api/sentinel/admin/email-config/test`, {
    method: "POST",
    headers: getAuthHeaders(),
    credentials: "include",
    body: JSON.stringify({ mode, config }),
  })
  const data = await parseJson<{ ok: boolean; result: EmailTestResult }>(res)
  return data.result
}

export async function sendTestEmail(to: string, override?: EmailConfigSavePayload | null): Promise<{ ok: boolean; sentTo: string }> {
  const res = await fetch(`${getBaseUrl()}/api/sentinel/admin/email-config/test`, {
    method: "POST",
    headers: getAuthHeaders(),
    credentials: "include",
    body: JSON.stringify({ mode: "send", to, config: override || null }),
  })
  const data = await parseJson<{ ok: boolean; sentTo: string }>(res)
  return { ok: data.ok, sentTo: data.sentTo }
}
