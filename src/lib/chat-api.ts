/**
 * chat-api.ts — Dedicated backend chat API client
 *
 * All chat operations go through named backend endpoints
 * ( /api/chat/... ) instead of the generic DB proxy.
 * The backend enforces JWT auth and user ownership on every call.
 *
 * Drop-in compatible with sentinel-brain.ts chat exports.
 */

import type { ChatThread, ChatMessage, RetrievalTrace } from "./sentinel-brain"

// Re-export the types so consumers can import from here too
export type { ChatThread, ChatMessage, RetrievalTrace }

// ── Helpers ───────────────────────────────────────────────────────

function getBackendBaseUrl(): string {
  if (typeof import.meta !== "undefined" && import.meta.env?.VITE_BACKEND_API_BASE_URL) {
    return import.meta.env.VITE_BACKEND_API_BASE_URL as string
  }
  return ""
}

function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" }
  const token =
    typeof localStorage !== "undefined"
      ? localStorage.getItem("sentinel-auth-token") || localStorage.getItem("sentinel_token")
      : null
  if (token) {
    headers["Authorization"] = `Bearer ${token}`
  }
  try {
    const csrfMatch = document.cookie
      .split(";")
      .map((c) => c.trim())
      .find((c) => c.startsWith("__csrf="))
    if (csrfMatch) {
      headers["X-CSRF-Token"] = csrfMatch.slice("__csrf=".length)
    }
  } catch {
    // SSR or cookie unavailable
  }
  return headers
}

async function chatFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const base = getBackendBaseUrl()
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: { ...getAuthHeaders(), ...(init?.headers ?? {}) },
    credentials: "include",
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string }
    const msg = body?.error || `Chat API error (${res.status})`
    throw new Error(msg)
  }
  return res.json() as Promise<T>
}

// ── Chat Threads ──────────────────────────────────────────────────

export async function createChatThread(entry?: {
  user_id?: string
  module?: string
  title?: string
  status?: ChatThread["status"]
}): Promise<ChatThread> {
  const data = await chatFetch<{ ok: boolean; thread: ChatThread }>("/api/chat/threads", {
    method: "POST",
    body: JSON.stringify({
      module: entry?.module ?? "general",
      title: entry?.title ?? "New Chat",
      status: entry?.status ?? "active",
    }),
  })
  return data.thread
}

export async function listChatThreads(options?: {
  user_id?: string
  module?: string
  status?: ChatThread["status"]
  limit?: number
}): Promise<ChatThread[]> {
  const params = new URLSearchParams()
  if (options?.module) params.set("module", options.module)
  if (options?.status) params.set("status", options.status)
  if (options?.limit) params.set("limit", String(options.limit))
  const qs = params.toString() ? `?${params.toString()}` : ""
  const data = await chatFetch<{ ok: boolean; threads: ChatThread[] }>(`/api/chat/threads${qs}`)
  return data.threads
}

export async function updateChatThread(
  id: number,
  updates: { title?: string; status?: ChatThread["status"]; module?: string }
): Promise<ChatThread | null> {
  try {
    const data = await chatFetch<{ ok: boolean; thread: ChatThread }>(`/api/chat/threads/${id}`, {
      method: "PATCH",
      body: JSON.stringify(updates),
    })
    return data.thread
  } catch {
    return null
  }
}

export async function deleteChatThread(id: number): Promise<boolean> {
  try {
    await chatFetch<{ ok: boolean }>(`/api/chat/threads/${id}`, { method: "DELETE" })
    return true
  } catch {
    return false
  }
}

export async function autoTitleThreadFromFirstMessage(
  threadId: number,
  firstMessage: string
): Promise<void> {
  if (!firstMessage?.trim()) return
  await chatFetch<{ ok: boolean }>(`/api/chat/threads/${threadId}/auto-title`, {
    method: "PATCH",
    body: JSON.stringify({ firstMessage }),
  }).catch(() => undefined)
}

// ── Chat Messages ─────────────────────────────────────────────────

export async function appendChatMessage(entry: {
  thread_id: number
  role: ChatMessage["role"]
  content: string
  provider?: string
  model_used?: string
  providers_used?: string[]
  brain_hits?: number
  metadata?: Record<string, unknown>
}): Promise<ChatMessage> {
  const { thread_id, ...rest } = entry
  const data = await chatFetch<{ ok: boolean; message: ChatMessage }>(
    `/api/chat/threads/${thread_id}/messages`,
    { method: "POST", body: JSON.stringify(rest) }
  )
  return data.message
}

export async function listChatMessages(threadId: number, limit = 200): Promise<ChatMessage[]> {
  const data = await chatFetch<{ ok: boolean; messages: ChatMessage[] }>(
    `/api/chat/threads/${threadId}/messages?limit=${limit}`
  )
  return data.messages
}

// ── Retrieval Traces ──────────────────────────────────────────────

export async function listRetrievalTracesByThread(
  threadId: number,
  limit = 100
): Promise<RetrievalTrace[]> {
  const data = await chatFetch<{ ok: boolean; traces: RetrievalTrace[] }>(
    `/api/chat/threads/${threadId}/traces?limit=${limit}`
  )
  return data.traces
}

export async function listRetrievalTraceByMessageId(
  messageId: number
): Promise<RetrievalTrace | null> {
  const data = await chatFetch<{ ok: boolean; trace: RetrievalTrace | null }>(
    `/api/chat/traces/by-message/${messageId}`
  )
  return data.trace
}
