import { UserProfile, SavedStrategy, UserRole, SavedReviewDocument } from "@/types"
import { getSafeKVClient } from "@/lib/spark-shim"
import { errorLogger } from "@/lib/error-logger"

const USERS_STORAGE_KEY = "platform-users"
const USER_CREDENTIALS_KEY = "user-credentials"

interface StoredCredential {
  email: string
  passwordHash: string
  userId: string
}

interface BackendSystemStatsResponse {
  users?: { total?: number; active?: number }
  organizations?: { total?: number }
  subscriptions?: { total?: number; active?: number; expired?: number }
  reports?: { total?: number; drafts?: number; submitted?: number; approvedSigned?: number; published?: number }
  moduleSubscriptions?: { total?: number; active?: number; trial?: number; expired?: number; cancelled?: number }
  recentLogins7d?: number
}

interface ProviderUsageSummary {
  windowDays: number
  totals: {
    events: number
    requests: number
    tokens: number
    cost: number
    errors: number
  }
  byProvider: Array<{
    provider: string
    kind: string
    events: number
    requests: number
    tokens: number
    cost: number
  }>
  byModule: Array<{
    moduleName: string
    events: number
    requests: number
    tokens: number
    cost: number
  }>
  dailyCosts: Array<{
    day: string
    cost: number
    requests: number
  }>
}

export interface GlobalAnalyticsPayload {
  users: UserProfile[]
  platformStats: BackendSystemStatsResponse | null
  providerSummary: ProviderUsageSummary | null
}

function getBackendBaseUrl(): string {
  if (typeof import.meta !== "undefined" && import.meta.env?.VITE_BACKEND_API_BASE_URL) {
    return import.meta.env.VITE_BACKEND_API_BASE_URL as string
  }
  return ""
}

function isLocalDevHost(): boolean {
  if (typeof window === "undefined") return false
  const host = window.location.hostname.toLowerCase()
  return host === "localhost" || host === "127.0.0.1" || host === "::1"
}

async function postBackend(path: string, payload: unknown): Promise<{ ok: boolean; status: number; data?: Record<string, unknown> | null }> {
  return requestBackend("POST", path, payload)
}

async function requestBackend(method: "GET" | "POST", path: string, payload?: unknown): Promise<{ ok: boolean; status: number; data?: Record<string, unknown> | null }> {
  try {
    const token = typeof localStorage !== "undefined"
      ? localStorage.getItem("sentinel-auth-token") || localStorage.getItem("sentinel_token")
      : null

    const headers: Record<string, string> = { "Content-Type": "application/json" }
    if (token) {
      headers.Authorization = `Bearer ${token}`
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
      // Cookie access unavailable
    }

    const res = await fetch(`${getBackendBaseUrl()}${path}`, {
      method,
      headers,
      credentials: "include",
      body: method === "POST" ? JSON.stringify(payload) : undefined,
    })
    const data = await res.json().catch(() => null)
    return { ok: res.ok, status: res.status, data }
  } catch {
    return { ok: false, status: 0 }
  }
}

function getCurrentMonthKey(prefix: string): string {
  const now = new Date()
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
  return `${prefix}-${month}`
}

async function simpleHash(text: string): Promise<string> {
  const encoder = new TextEncoder()
  const salted = `sentinel:${text}:v2`
  const data = encoder.encode(salted)
  const hashBuffer = await crypto.subtle.digest("SHA-256", data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("")
}

export const adminService = {
  async getAllUsers(): Promise<UserProfile[]> {
    // Try backend Neon-backed users list first (contains all OAuth + email signups)
    const res = await requestBackend("GET", "/api/sentinel/admin/users")
    if (res.ok && res.data?.ok && Array.isArray(res.data.users)) {
      return (res.data.users as unknown[]).map((u) => {
        const raw = u as {
          id: string; email: string; fullName: string; role: string;
          effectivePlan: string; planStatus: string; credits: number;
          trialDaysRemaining: number; createdAt: number; lastLoginAt: number;
          organizationId?: string; avatarUrl?: string;
          subscription?: { tier: string; status: string; proCredits: number; expiresAt?: number }
        }
        const plan = (raw.effectivePlan || "basic") as import("@/types").SubscriptionPlan
        return {
          id: raw.id,
          email: raw.email,
          fullName: raw.fullName,
          role: (["admin", "client", "tester"].includes(raw.role?.toLowerCase())
            ? raw.role.toLowerCase()
            // Only SENTINEL_COMMANDER is treated as platform admin; ORG_ADMIN /
            // TEAM_ADMIN are organization-scoped and remain regular clients.
            : raw.role === "SENTINEL_COMMANDER"
              ? "admin"
              : raw.role === "TESTER" ? "tester" : "client") as import("@/types").UserRole,
          avatarUrl: raw.avatarUrl,
          createdAt: raw.createdAt,
          lastLoginAt: raw.lastLoginAt,
          subscription: {
            plan,
            status: (raw.planStatus === "active" || raw.planStatus === "trial" ? "active" : "inactive") as import("@/types").SubscriptionStatus,
            proCredits: raw.credits || 0,
            updatedAt: raw.subscription?.expiresAt || raw.createdAt,
            ...(raw.trialDaysRemaining > 0 ? {
              trial: {
                requested: true,
                creditsGranted: raw.credits,
                submissionsUsed: 0,
                maxSubmissions: raw.credits,
                exhausted: false,
              }
            } : {}),
          },
        } as UserProfile
      })
    }

    // Fallback: local KV (used on localhost dev when backend is unreachable)
    try {
      const users = await getSafeKVClient().get<Record<string, UserProfile>>(USERS_STORAGE_KEY) || {}
      const dedupedByEmail = new Map<string, UserProfile>()
      for (const user of Object.values(users)) {
        const normalizedEmail = user.email.toLowerCase()
        const existing = dedupedByEmail.get(normalizedEmail)
        if (!existing || user.lastLoginAt > existing.lastLoginAt || user.createdAt > existing.createdAt) {
          dedupedByEmail.set(normalizedEmail, user)
        }
      }
      return Array.from(dedupedByEmail.values())
    } catch (error) {
      console.error("Failed to get all users:", error)
      return []
    }
  },

  async listTesterUsers(): Promise<{ maxTesters: number; total: number; testers: Array<Pick<UserProfile, "id" | "email" | "fullName" | "role" | "lastLoginAt" | "createdAt">> }> {
    const res = await requestBackend("GET", "/api/sentinel/admin/testers")
    if (!res.ok || !res.data?.ok) {
      throw new Error((res.data?.error as string) || "Failed to load tester accounts")
    }
    return {
      maxTesters: Number(res.data.maxTesters || 0),
      total: Number(res.data.total || 0),
      testers: Array.isArray(res.data.testers) ? res.data.testers as Array<Pick<UserProfile, "id" | "email" | "fullName" | "role" | "lastLoginAt" | "createdAt">> : [],
    }
  },

  async createTesterUser(payload: { email: string; fullName: string; password: string }): Promise<{ success: boolean; error?: string }> {
    const res = await postBackend("/api/sentinel/admin/testers", payload)
    if (!res.ok || !res.data?.ok) {
      return { success: false, error: (res.data?.error as string) || "Failed to create tester" }
    }
    return { success: true }
  },

  async manageTesterUser(userId: string, action: "promote" | "revoke"): Promise<{ success: boolean; error?: string }> {
    const res = await postBackend("/api/sentinel/admin/testers/action", { userId, action })
    if (!res.ok || !res.data?.ok) {
      return { success: false, error: (res.data?.error as string) || "Failed to update tester account" }
    }
    return { success: true }
  },

  async getUsageSummary(rangeHours: number = 24): Promise<{
    rangeHours: number
    sinceMs: number
    perUser: Array<{
      userId: string
      email?: string | null
      fullName?: string | null
      plan?: string | null
      ragMessages: number
      ragWords: number
      ragFiles: number
      reviews: number
      humanizations: number
      humanizerWords: number
      blockedAttempts: number
      lastActivity: string | null
    }>
    totals: {
      totalEvents?: number
      activeUsers?: number
      totalBlocked?: number
      totalRagWords?: number
      totalHumanizerWords?: number
      totalReviews?: number
      totalChatFiles?: number
    }
  }> {
    const range = rangeHours <= 24 ? "24h" : rangeHours <= 24 * 7 ? "7d" : "30d"
    const res = await requestBackend("GET", `/api/sentinel/admin/usage-summary?range=${range}`)
    if (!res.ok || !res.data?.ok) {
      throw new Error((res.data?.error as string) || "Failed to load usage summary")
    }
    return {
      rangeHours: Number(res.data.rangeHours || rangeHours),
      sinceMs: Number(res.data.sinceMs || 0),
      perUser: Array.isArray(res.data.perUser) ? (res.data.perUser as Array<{
        userId: string
        email?: string | null
        fullName?: string | null
        plan?: string | null
        ragMessages: number
        ragWords: number
        ragFiles: number
        reviews: number
        humanizations: number
        humanizerWords: number
        blockedAttempts: number
        lastActivity: string | null
      }>).map((row) => ({
        ...row,
        ragMessages: Number(row.ragMessages || 0),
        ragWords: Number(row.ragWords || 0),
        ragFiles: Number(row.ragFiles || 0),
        reviews: Number(row.reviews || 0),
        humanizations: Number(row.humanizations || 0),
        humanizerWords: Number(row.humanizerWords || 0),
        blockedAttempts: Number(row.blockedAttempts || 0),
      })) : [],
      totals: (res.data.totals as Record<string, number>) || {},
    }
  },

  async getPolicyViolations(rangeHours: number = 24): Promise<Array<{
    id: number
    userId: string
    email?: string | null
    fullName?: string | null
    action: string
    reason: string | null
    plan: string | null
    words: number
    files: number
    metadata: Record<string, unknown> | null
    createdAt: number
  }>> {
    const range = rangeHours <= 24 ? "24h" : rangeHours <= 24 * 7 ? "7d" : "30d"
    const res = await requestBackend("GET", `/api/sentinel/admin/policy-violations?range=${range}`)
    if (!res.ok || !res.data?.ok) {
      throw new Error((res.data?.error as string) || "Failed to load policy violations")
    }
    return Array.isArray(res.data.violations) ? res.data.violations as Array<{
      id: number
      userId: string
      email?: string | null
      fullName?: string | null
      action: string
      reason: string | null
      plan: string | null
      words: number
      files: number
      metadata: Record<string, unknown> | null
      createdAt: number
    }> : []
  },

  async getUserStrategies(userId: string): Promise<SavedStrategy[]> {
    try {
      const strategies = await getSafeKVClient().get<SavedStrategy[]>(`saved-strategies-${userId}`)
      return Array.isArray(strategies) ? strategies : []
    } catch (error) {
      console.error(`Failed to get strategies for user ${userId}:`, error)
      return []
    }
  },

  async getUserReviews(userId: string): Promise<SavedReviewDocument[]> {
    try {
      const reviews = await getSafeKVClient().get<SavedReviewDocument[]>(`saved-reviews-${userId}`)
      return Array.isArray(reviews) ? reviews : []
    } catch (error) {
      console.error(`Failed to get reviews for user ${userId}:`, error)
      return []
    }
  },

  async getAllStrategies(users?: UserProfile[]): Promise<{ user: UserProfile; strategies: SavedStrategy[] }[]> {
    try {
      const targetUsers = users ?? await this.getAllUsers()
      const results = await Promise.all(
        targetUsers.map(async (user) => ({
          user,
          strategies: await this.getUserStrategies(user.id)
        }))
      )
      return results
    } catch (error) {
      console.error("Failed to get all strategies:", error)
      return []
    }
  },

  async getAllReviews(users?: UserProfile[]): Promise<{ user: UserProfile; reviews: SavedReviewDocument[] }[]> {
    try {
      const targetUsers = users ?? await this.getAllUsers()
      const results = await Promise.all(
        targetUsers.map(async (user) => ({
          user,
          reviews: await this.getUserReviews(user.id)
        }))
      )
      return results
    } catch (error) {
      console.error("Failed to get all reviews:", error)
      return []
    }
  },

  async updateUserRole(email: string, newRole: UserRole): Promise<{ success: boolean; error?: string }> {
    try {
      const users = await getSafeKVClient().get<Record<string, UserProfile>>(USERS_STORAGE_KEY) || {}
      const userEntry = Object.entries(users).find(([, candidate]) => candidate.email === email)
      const user = userEntry?.[1]
      const userId = userEntry?.[0]

      if (!user || !userId) {
        return { success: false, error: "User not found" }
      }

      user.role = newRole
      users[userId] = user
      await getSafeKVClient().set(USERS_STORAGE_KEY, users)

      return { success: true }
    } catch (error) {
      console.error("Failed to update user role:", error)
      return { success: false, error: "Failed to update role" }
    }
  },

  async deleteUser(email: string): Promise<{ success: boolean; error?: string }> {
    try {
      if (email === "admin") {
        return { success: false, error: "Cannot delete master admin" }
      }

      // Try backend first
      const backendRes = await postBackend("/api/sentinel/admin/users/delete", { email })

      if (backendRes.status !== 0) {
        // Backend uses { ok: true } convention; tolerate { success: true } too.
        const payload = backendRes.data as { ok?: boolean; success?: boolean; error?: string } | undefined
        if (backendRes.ok && (payload?.ok || payload?.success)) {
          return { success: true }
        }
        return {
          success: false,
          error: payload?.error || "Failed to delete user",
        }
      }

      // Backend unavailable - fall back to KV (localhost only)
      if (!isLocalDevHost()) {
        return { success: false, error: "Backend unavailable" }
      }

      const users = (await getSafeKVClient().get<Record<string, UserProfile>>(USERS_STORAGE_KEY)) || {}
      const userEntry = Object.entries(users).find(([, candidate]) => candidate.email === email)
      const user = userEntry?.[1]
      const userId = userEntry?.[0]

      if (!user || !userId) {
        return { success: false, error: "User not found" }
      }

      delete users[userId]
      await getSafeKVClient().set(USERS_STORAGE_KEY, users)

      const credentials = (await getSafeKVClient().get<Record<string, StoredCredential>>(USER_CREDENTIALS_KEY)) || {}
      delete credentials[email.toLowerCase()]
      await getSafeKVClient().set(USER_CREDENTIALS_KEY, credentials)

      await getSafeKVClient().delete(`saved-strategies-${user.id}`)
      await getSafeKVClient().delete(`saved-reviews-${user.id}`)
      await getSafeKVClient().delete(`saved-ideas-${user.id}`)
      await getSafeKVClient().delete(`idea-memory-${user.id}`)
      await getSafeKVClient().delete(`document-reviews-${user.id}`)
      await getSafeKVClient().delete(`user-prompt-memory-${user.id}`)
      await getSafeKVClient().delete(`strategy-workflow-runs-${user.id}`)
      await getSafeKVClient().delete(`${getCurrentMonthKey("strategy-spend")}-${user.id}`)
      await getSafeKVClient().delete(`${getCurrentMonthKey("strategy-exports")}-${user.id}`)
      await getSafeKVClient().delete(`${getCurrentMonthKey("review-exports")}-${user.id}`)

      return { success: true }
    } catch (error) {
      console.error("Failed to delete user:", error)
      return { success: false, error: "Failed to delete user" }
    }
  },

  async getSystemStats(): Promise<{
    totalUsers: number
    totalAdmins: number
    totalClients: number
    totalStrategies: number
    totalReviews: number
    recentUsers: number
  }> {
    try {
      const users = await this.getAllUsers()
      const allStrategies = await this.getAllStrategies(users)
      const allReviews = await this.getAllReviews(users)
      
      const totalStrategies = allStrategies.reduce(
        (sum, item) => sum + item.strategies.length,
        0
      )

      const totalReviews = allReviews.reduce(
        (sum, item) => sum + item.reviews.length,
        0
      )

      const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
      const recentUsers = users.filter(u => u.createdAt >= sevenDaysAgo).length

      return {
        totalUsers: users.length,
        totalAdmins: users.filter(u => u.role === "admin").length,
        totalClients: users.filter(u => u.role === "client").length,
        totalStrategies,
        totalReviews,
        recentUsers,
      }
    } catch (error) {
      console.error("Failed to get system stats:", error)
      return {
        totalUsers: 0,
        totalAdmins: 0,
        totalClients: 0,
        totalStrategies: 0,
        totalReviews: 0,
        recentUsers: 0,
      }
    }
  },

  async getGlobalAnalytics(days = 30): Promise<GlobalAnalyticsPayload> {
    const safeDays = Math.max(1, Math.min(Number(days) || 30, 365))

    const [users, statsRes, providerRes] = await Promise.all([
      this.getAllUsers(),
      requestBackend("GET", "/api/sentinel/admin/stats"),
      requestBackend("GET", `/api/sentinel/admin/provider-usage?days=${safeDays}&module=global`),
    ])

    const platformStats = statsRes.ok && statsRes.data?.ok
      ? (statsRes.data as unknown as BackendSystemStatsResponse)
      : null

    const providerSummary = providerRes.ok && providerRes.data?.ok
      ? ((providerRes.data.summary as unknown as ProviderUsageSummary) || null)
      : null

    return {
      users,
      platformStats,
      providerSummary,
    }
  },

  async updateUserPassword(email: string, newPassword: string): Promise<{ success: boolean; error?: string }> {
    try {
      if (!newPassword || newPassword.length < 8) {
        return { success: false, error: "Password must be at least 8 characters" }
      }

      const backendRes = await postBackend("/api/auth/admin/set-password", { email, newPassword })
      if (backendRes.status !== 0) {
        if (backendRes.ok && backendRes.data?.ok) {
          return { success: true }
        }

        const backendError = (backendRes.data?.error as string) || "Failed to update password"
        await errorLogger.logError(
          "Admin set-password API failed",
          new Error(backendError),
          "authentication",
          backendRes.status === 403 ? "high" : "medium",
          undefined,
          { endpoint: "/api/auth/admin/set-password", status: backendRes.status, targetEmail: email }
        )

        return { success: false, error: backendError }
      }

      const users = await getSafeKVClient().get<Record<string, UserProfile>>(USERS_STORAGE_KEY) || {}
      const userEntry = Object.entries(users).find(([, candidate]) => candidate.email.toLowerCase() === email.toLowerCase())
      const user = userEntry?.[1]
      const userId = user?.id || userEntry?.[0]

      if (!user || !userId) {
        return { success: false, error: "User not found" }
      }

      const credentials = await getSafeKVClient().get<Record<string, StoredCredential>>(USER_CREDENTIALS_KEY) || {}
      const normalizedEmail = email.toLowerCase()
      const nextPasswordHash = await simpleHash(newPassword)
      credentials[normalizedEmail] = {
        email: normalizedEmail,
        userId,
        passwordHash: nextPasswordHash,
      }
      await getSafeKVClient().set(USER_CREDENTIALS_KEY, credentials)

      return { success: true }
    } catch (error) {
      console.error("Failed to update user password:", error)
      await errorLogger.logError(
        "Admin set-password request crashed",
        error,
        "authentication",
        "high",
        undefined,
        { endpoint: "/api/auth/admin/set-password", targetEmail: email }
      )
      return { success: false, error: "Failed to update password" }
    }
  },
}
