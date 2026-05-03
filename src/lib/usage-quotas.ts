/**
 * Usage Quota Engine — single source of truth for free/basic plan limits.
 *
 * Policy summary (per user request):
 *  - RAG Chat:        ≤1000 words per rolling 2-hour window  (free + basic)
 *  - RAG/Chat upload: ≤1 file per calendar day               (free + basic)
 *  - Review:          ≤3 file reviews per day                (basic with credits)
 *  - Humanizer:       ≤300 words per submission, ≤7 per day  (basic with credits)
 *
 * Pro / Team / Enterprise / Admin: no client-side quota enforcement.
 *
 * Storage: counters live in KV via `getSafeKVClient()`. Day reset uses the
 * user's local timezone (calendar day boundary).
 */

import { getSafeKVClient } from "@/lib/spark-shim"
import type { SubscriptionPlan, UserProfile } from "@/types"

export type QuotaAction =
  | "rag_chat_words"
  | "rag_chat_file"
  | "review_file"
  | "humanizer_words"
  | "humanizer_submission"

export type QuotaReason =
  | "rag_words_exceeded"
  | "rag_file_daily_cap"
  | "review_daily_cap"
  | "humanizer_word_cap"
  | "humanizer_daily_cap"

export interface QuotaPolicy {
  ragChatWordsPerWindow: number
  ragChatWindowMs: number
  ragChatFilesPerDay: number
  reviewFilesPerDay: number
  humanizerWordsPerSubmission: number
  humanizerSubmissionsPerDay: number
}

export const QUOTA_POLICY: QuotaPolicy = {
  ragChatWordsPerWindow: 1000,
  ragChatWindowMs: 2 * 60 * 60 * 1000, // 2h rolling window
  ragChatFilesPerDay: 1,
  reviewFilesPerDay: 3,
  humanizerWordsPerSubmission: 300,
  humanizerSubmissionsPerDay: 7,
}

/** Plans that bypass all client-side quota enforcement. */
const UNLIMITED_PLANS: ReadonlySet<SubscriptionPlan> = new Set<SubscriptionPlan>([
  "pro",
  "team",
  "enterprise",
])

/** Returns true if quotas should NOT be enforced for this user. */
export function isQuotaExempt(user: UserProfile | null | undefined): boolean {
  if (!user) return false
  if (user.role === "admin") return true
  const plan = (user.subscription?.plan || "basic") as SubscriptionPlan
  return UNLIMITED_PLANS.has(plan)
}

// ─────────────────────────────── Time helpers ───────────────────────────────

/** Calendar-day key in user-local timezone, e.g. "2026-05-03". */
export function getLocalDayKey(now: number = Date.now()): string {
  const d = new Date(now)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

/** Timestamp at the user's next local midnight. */
export function getNextLocalMidnight(now: number = Date.now()): number {
  const d = new Date(now)
  d.setHours(24, 0, 0, 0)
  return d.getTime()
}

export function formatRemainingMs(ms: number): string {
  if (ms <= 0) return "now"
  const totalMin = Math.ceil(ms / 60000)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  if (h <= 0) return `${m}m`
  return `${h}h ${m}m`
}

export function countWords(text: string): number {
  const trimmed = (text || "").trim()
  if (!trimmed) return 0
  return trimmed.split(/\s+/).length
}

// ─────────────────────────────── Counter shapes ─────────────────────────────

interface RagWindowCounter {
  windowStartMs: number
  wordsUsed: number
}

interface DailyCounter {
  dayKey: string
  count: number
}

// ─────────────────────────────── KV keys ────────────────────────────────────

function kvKey(userId: string, suffix: string): string {
  return `usage-${suffix}-${userId}`
}

async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const kv = getSafeKVClient()
    const v = await kv.get<T>(key)
    return v ?? fallback
  } catch {
    return fallback
  }
}

async function writeJson<T>(key: string, value: T): Promise<void> {
  try {
    const kv = getSafeKVClient()
    await kv.set(key, value)
  } catch {
    // best-effort
  }
}

// ─────────────────────────────── Check API ──────────────────────────────────

export interface QuotaCheckResult {
  allowed: boolean
  reason?: QuotaReason
  message?: string
  /** Tokens (words / files / submissions) remaining in the current window/day. */
  remaining?: number
  /** Limit cap for context. */
  limit?: number
  /** Wall-clock timestamp when this quota next resets. */
  resetAt?: number
  /** Human-friendly "Resets in 1h 23m" / "Resets at midnight". */
  resetLabel?: string
}

const ALLOWED: QuotaCheckResult = { allowed: true }

/**
 * Check whether the given action would be allowed RIGHT NOW for this user.
 * Does NOT mutate counters — call `recordUsage` after the action succeeds.
 */
export async function checkQuota(
  user: UserProfile | null | undefined,
  action: QuotaAction,
  payload: { words?: number } = {},
): Promise<QuotaCheckResult> {
  if (!user || isQuotaExempt(user)) return ALLOWED
  const userId = user.id
  const now = Date.now()

  switch (action) {
    case "rag_chat_words": {
      const requested = Math.max(0, payload.words || 0)
      const counter = await readJson<RagWindowCounter | null>(kvKey(userId, "rag-window"), null)
      const windowOpen = counter && now - counter.windowStartMs < QUOTA_POLICY.ragChatWindowMs
      const used = windowOpen ? counter!.wordsUsed : 0
      const remaining = Math.max(0, QUOTA_POLICY.ragChatWordsPerWindow - used)
      const resetAt = windowOpen
        ? counter!.windowStartMs + QUOTA_POLICY.ragChatWindowMs
        : now + QUOTA_POLICY.ragChatWindowMs
      if (used + requested > QUOTA_POLICY.ragChatWordsPerWindow) {
        return {
          allowed: false,
          reason: "rag_words_exceeded",
          message: `Basic plan allows ${QUOTA_POLICY.ragChatWordsPerWindow} words per 2 hours. You have ${remaining} word(s) remaining in this window.`,
          remaining,
          limit: QUOTA_POLICY.ragChatWordsPerWindow,
          resetAt,
          resetLabel: `Resets in ${formatRemainingMs(resetAt - now)}`,
        }
      }
      return { allowed: true, remaining: remaining - requested, limit: QUOTA_POLICY.ragChatWordsPerWindow, resetAt }
    }

    case "rag_chat_file": {
      const dayKey = getLocalDayKey(now)
      const counter = await readJson<DailyCounter | null>(kvKey(userId, "rag-files"), null)
      const used = counter && counter.dayKey === dayKey ? counter.count : 0
      const remaining = Math.max(0, QUOTA_POLICY.ragChatFilesPerDay - used)
      const resetAt = getNextLocalMidnight(now)
      if (used + 1 > QUOTA_POLICY.ragChatFilesPerDay) {
        return {
          allowed: false,
          reason: "rag_file_daily_cap",
          message: `Basic plan allows ${QUOTA_POLICY.ragChatFilesPerDay} chat file upload per day. Try again tomorrow or upgrade for unlimited uploads.`,
          remaining,
          limit: QUOTA_POLICY.ragChatFilesPerDay,
          resetAt,
          resetLabel: `Resets in ${formatRemainingMs(resetAt - now)}`,
        }
      }
      return { allowed: true, remaining: remaining - 1, limit: QUOTA_POLICY.ragChatFilesPerDay, resetAt }
    }

    case "review_file": {
      const dayKey = getLocalDayKey(now)
      const counter = await readJson<DailyCounter | null>(kvKey(userId, "review-day"), null)
      const used = counter && counter.dayKey === dayKey ? counter.count : 0
      const remaining = Math.max(0, QUOTA_POLICY.reviewFilesPerDay - used)
      const resetAt = getNextLocalMidnight(now)
      if (used + 1 > QUOTA_POLICY.reviewFilesPerDay) {
        return {
          allowed: false,
          reason: "review_daily_cap",
          message: `Basic plan allows ${QUOTA_POLICY.reviewFilesPerDay} document reviews per day. Resets at midnight.`,
          remaining,
          limit: QUOTA_POLICY.reviewFilesPerDay,
          resetAt,
          resetLabel: `Resets in ${formatRemainingMs(resetAt - now)}`,
        }
      }
      return { allowed: true, remaining: remaining - 1, limit: QUOTA_POLICY.reviewFilesPerDay, resetAt }
    }

    case "humanizer_words": {
      const requested = Math.max(0, payload.words || 0)
      if (requested > QUOTA_POLICY.humanizerWordsPerSubmission) {
        return {
          allowed: false,
          reason: "humanizer_word_cap",
          message: `Basic plan limits Humanizer to ${QUOTA_POLICY.humanizerWordsPerSubmission} words per submission. Trim your text or upgrade.`,
          limit: QUOTA_POLICY.humanizerWordsPerSubmission,
        }
      }
      return { allowed: true, limit: QUOTA_POLICY.humanizerWordsPerSubmission }
    }

    case "humanizer_submission": {
      const dayKey = getLocalDayKey(now)
      const counter = await readJson<DailyCounter | null>(kvKey(userId, "humanizer-day"), null)
      const used = counter && counter.dayKey === dayKey ? counter.count : 0
      const remaining = Math.max(0, QUOTA_POLICY.humanizerSubmissionsPerDay - used)
      const resetAt = getNextLocalMidnight(now)
      if (used + 1 > QUOTA_POLICY.humanizerSubmissionsPerDay) {
        return {
          allowed: false,
          reason: "humanizer_daily_cap",
          message: `Basic plan allows ${QUOTA_POLICY.humanizerSubmissionsPerDay} humanizations per day. Try again tomorrow or upgrade for unlimited usage.`,
          remaining,
          limit: QUOTA_POLICY.humanizerSubmissionsPerDay,
          resetAt,
          resetLabel: `Resets in ${formatRemainingMs(resetAt - now)}`,
        }
      }
      return { allowed: true, remaining: remaining - 1, limit: QUOTA_POLICY.humanizerSubmissionsPerDay, resetAt }
    }

    default:
      return ALLOWED
  }
}

/**
 * Atomically (best-effort) increment the counter for an action AFTER it
 * succeeded. Safe to call for exempt users (no-op).
 */
export async function recordUsage(
  user: UserProfile | null | undefined,
  action: QuotaAction,
  payload: { words?: number } = {},
): Promise<void> {
  if (!user) return
  const exempt = isQuotaExempt(user)
  const userId = user.id
  const now = Date.now()

  switch (action) {
    case "rag_chat_words": {
      const words = Math.max(0, payload.words || 0)
      if (!words) return
      if (!exempt) {
        const key = kvKey(userId, "rag-window")
        const current = await readJson<RagWindowCounter | null>(key, null)
        const windowOpen = current && now - current.windowStartMs < QUOTA_POLICY.ragChatWindowMs
        const next: RagWindowCounter = windowOpen
          ? { windowStartMs: current!.windowStartMs, wordsUsed: current!.wordsUsed + words }
          : { windowStartMs: now, wordsUsed: words }
        await writeJson(key, next)
      }
      void mirrorToBackend(user, action, { words }).catch(() => {})
      return
    }
    case "rag_chat_file":
      if (!exempt) await bumpDaily(userId, "rag-files")
      void mirrorToBackend(user, action, { files: 1 }).catch(() => {})
      return
    case "review_file":
      if (!exempt) await bumpDaily(userId, "review-day")
      void mirrorToBackend(user, action, { files: 1 }).catch(() => {})
      return
    case "humanizer_submission":
      if (!exempt) await bumpDaily(userId, "humanizer-day")
      void mirrorToBackend(user, action, { words: payload.words || 0, submissions: 1 }).catch(() => {})
      return
    case "humanizer_words":
      // Word-cap is per-submission and not a stored counter; logged with submission.
      return
  }
}

async function bumpDaily(userId: string, suffix: string): Promise<void> {
  const key = kvKey(userId, suffix)
  const dayKey = getLocalDayKey()
  const current = await readJson<DailyCounter | null>(key, null)
  const next: DailyCounter =
    current && current.dayKey === dayKey
      ? { dayKey, count: current.count + 1 }
      : { dayKey, count: 1 }
  await writeJson(key, next)
}

// ─────────────────────────────── Backend mirror ─────────────────────────────

interface MirrorPayload {
  words?: number
  files?: number
  submissions?: number
  outcome?: "allowed" | "blocked"
  reason?: QuotaReason
  metadata?: Record<string, unknown>
}

function getBackendBaseUrl(): string {
  if (typeof import.meta !== "undefined" && import.meta.env?.VITE_BACKEND_API_BASE_URL) {
    return String(import.meta.env.VITE_BACKEND_API_BASE_URL)
  }
  return ""
}

/**
 * Fire-and-forget POST so backend audit log captures usage events for the
 * Global Dashboard observability panels. Failures are silently swallowed.
 */
export async function mirrorToBackend(
  user: UserProfile,
  action: QuotaAction,
  payload: MirrorPayload,
): Promise<void> {
  try {
    const token =
      typeof localStorage !== "undefined"
        ? localStorage.getItem("sentinel-auth-token") || localStorage.getItem("sentinel_token")
        : null
    if (!token) return
    const headers: Record<string, string> = { "Content-Type": "application/json" }
    headers.Authorization = `Bearer ${token}`
    await fetch(`${getBackendBaseUrl()}/api/usage/record`, {
      method: "POST",
      headers,
      credentials: "include",
      body: JSON.stringify({
        action,
        words: payload.words || 0,
        files: payload.files || 0,
        submissions: payload.submissions || 0,
        outcome: payload.outcome || "allowed",
        reason: payload.reason || null,
        metadata: payload.metadata || null,
        plan: user.subscription?.plan || "basic",
      }),
    })
  } catch {
    // Backend unreachable — local KV counters still enforce limits.
  }
}

/** Convenience: log a blocked attempt for admin observability. */
export async function logBlockedAttempt(
  user: UserProfile,
  action: QuotaAction,
  reason: QuotaReason,
  payload: { words?: number; files?: number } = {},
): Promise<void> {
  void mirrorToBackend(user, action, {
    ...payload,
    outcome: "blocked",
    reason,
  }).catch(() => {})
}
