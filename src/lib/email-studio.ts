/**
 * Admin client for the Email Studio (AI-drafted marketing campaigns).
 * All endpoints require SENTINEL_COMMANDER role.
 */
import { getEnvConfig } from "@/lib/env-config"

// ─────────────────────── Types ───────────────────────

export interface BrandIdentity {
  brandName: string
  tagline: string | null
  voiceDescription: string
  primaryColor: string
  accentColor: string
  logoUrl: string
  founderName: string
  founderTitle: string
  supportEmail: string
  updatedAt?: string | null
}

export interface AudienceFilter {
  tiers?: string[]
  onlyActive?: boolean
  excludeDeleted?: boolean
  excludeOptedOut?: boolean
  sources?: string[]
  createdAfter?: string | null
  createdBefore?: string | null
  inactiveSince?: string | null
}

export interface AudiencePreview {
  count: number
  sample: Array<{ email: string; fullName: string | null; tier: string }>
}

export interface EmailDraft {
  subject: string
  bodyHtml: string
  headline: string
  tagline: string
  ctaLabel: string
  ctaUrl: string
  provider: string
  model: string
  spamScore: number
}

export interface EmailTemplate {
  id: number
  name: string
  category: string
  subject: string
  bodyHtml: string
  variables: string[]
  createdBy: string | null
  createdAt: string
  updatedAt: string
}

export interface EmailCampaign {
  id: number
  templateId: number | null
  name: string
  subject: string
  bodyHtml?: string
  intent: string
  audienceFilter: AudienceFilter
  status: "draft" | "scheduled" | "sending" | "completed" | "cancelled"
  scheduledFor: string | null
  totalRecipients: number
  sentCount: number
  failedCount: number
  skippedCount: number
  createdBy: string | null
  createdAt: string
  startedAt: string | null
  completedAt: string | null
}

export interface CampaignRecipient {
  id: number
  user_id: string
  email: string
  fullName: string | null
  status: "pending" | "sent" | "failed" | "skipped"
  sent_at: string | null
  error: string | null
}

export interface GenerateDraftPayload {
  prompt: string
  intent?: string
  audienceSummary?: string
  tone?: string
  ctaLabel?: string
  ctaUrl?: string
}

export interface CreateCampaignPayload {
  name?: string
  subject: string
  bodyHtml: string
  intent?: string
  audienceFilter: AudienceFilter
  templateId?: number | null
  scheduledFor?: string | null
  sendImmediately?: boolean
}

// ─────────────────────── HTTP plumbing ───────────────────────

function getBaseUrl(): string {
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
    let msg = text || `Request failed with ${res.status}`
    try {
      const j = JSON.parse(text)
      if (j?.error) msg = j.error
    } catch {
      // ignore
    }
    throw new Error(msg)
  }
  return res.json() as Promise<T>
}

function api(path: string, init?: RequestInit) {
  return fetch(`${getBaseUrl()}/api/sentinel/admin/email-studio${path}`, {
    ...init,
    headers: { ...getAuthHeaders(), ...(init?.headers || {}) },
    credentials: "include",
  })
}

// ─────────────────────── API ───────────────────────

export async function fetchBrandIdentity(): Promise<BrandIdentity> {
  const res = await api("/brand", { method: "GET" })
  const data = await parseJson<{ ok: boolean; brand: BrandIdentity }>(res)
  return data.brand
}

export async function saveBrandIdentity(brand: Partial<BrandIdentity>): Promise<BrandIdentity> {
  const res = await api("/brand", { method: "PUT", body: JSON.stringify(brand) })
  const data = await parseJson<{ ok: boolean; brand: BrandIdentity }>(res)
  return data.brand
}

export async function generateEmailDraft(payload: GenerateDraftPayload): Promise<EmailDraft> {
  const res = await api("/generate", { method: "POST", body: JSON.stringify(payload) })
  const data = await parseJson<{ ok: boolean; draft: EmailDraft }>(res)
  return data.draft
}

export async function previewAudience(filter: AudienceFilter): Promise<AudiencePreview> {
  const res = await api("/audience", { method: "POST", body: JSON.stringify({ filter }) })
  const data = await parseJson<{ ok: boolean; count: number; sample: AudiencePreview["sample"] }>(res)
  return { count: data.count, sample: data.sample }
}

export async function sendStudioTest(payload: {
  subject: string
  bodyHtml: string
  intent?: string
  to?: string
}): Promise<{ ok: boolean; sentTo: string }> {
  const res = await api("/send-test", { method: "POST", body: JSON.stringify(payload) })
  const data = await parseJson<{ ok: boolean; sentTo: string }>(res)
  return data
}

export async function listTemplatesApi(): Promise<EmailTemplate[]> {
  const res = await api("/templates", { method: "GET" })
  const data = await parseJson<{ ok: boolean; templates: EmailTemplate[] }>(res)
  return data.templates
}

export async function saveTemplateApi(template: Partial<EmailTemplate>): Promise<EmailTemplate> {
  const res = await api("/templates", { method: "POST", body: JSON.stringify(template) })
  const data = await parseJson<{ ok: boolean; template: EmailTemplate }>(res)
  return data.template
}

export async function deleteTemplateApi(id: number): Promise<void> {
  const res = await api(`/templates/${id}`, { method: "DELETE" })
  await parseJson<{ ok: boolean }>(res)
}

export async function listCampaignsApi(limit = 50): Promise<EmailCampaign[]> {
  const res = await api(`/campaigns?limit=${limit}`, { method: "GET" })
  const data = await parseJson<{ ok: boolean; campaigns: EmailCampaign[] }>(res)
  return data.campaigns
}

export async function createCampaignApi(payload: CreateCampaignPayload): Promise<EmailCampaign> {
  const res = await api("/campaigns", { method: "POST", body: JSON.stringify(payload) })
  const data = await parseJson<{ ok: boolean; campaign: EmailCampaign }>(res)
  return data.campaign
}

export async function getCampaignApi(id: number): Promise<{ campaign: EmailCampaign; recipients: CampaignRecipient[] }> {
  const res = await api(`/campaigns/${id}`, { method: "GET" })
  const data = await parseJson<{ ok: boolean; campaign: EmailCampaign; recipients: CampaignRecipient[] }>(res)
  return { campaign: data.campaign, recipients: data.recipients }
}

export async function sendCampaignApi(id: number): Promise<void> {
  const res = await api(`/campaigns/${id}/send`, { method: "POST" })
  await parseJson<{ ok: boolean }>(res)
}

export async function cancelCampaignApi(id: number): Promise<EmailCampaign> {
  const res = await api(`/campaigns/${id}/cancel`, { method: "POST" })
  const data = await parseJson<{ ok: boolean; campaign: EmailCampaign }>(res)
  return data.campaign
}
