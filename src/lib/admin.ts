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

function getBackendBaseUrl(): string {
  if (typeof import.meta !== "undefined" && import.meta.env?.VITE_BACKEND_API_BASE_URL) {
    return import.meta.env.VITE_BACKEND_API_BASE_URL as string
  }
  return ""
}

async function postBackend(path: string, payload: unknown): Promise<{ ok: boolean; status: number; data?: Record<string, unknown> | null }> {
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
      method: "POST",
      headers,
      credentials: "include",
      body: JSON.stringify(payload),
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

  async getAllStrategies(): Promise<{ user: UserProfile; strategies: SavedStrategy[] }[]> {
    try {
      const users = await this.getAllUsers()
      const results = await Promise.all(
        users.map(async (user) => ({
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

  async getAllReviews(): Promise<{ user: UserProfile; reviews: SavedReviewDocument[] }[]> {
    try {
      const users = await this.getAllUsers()
      const results = await Promise.all(
        users.map(async (user) => ({
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

      const users = await getSafeKVClient().get<Record<string, UserProfile>>(USERS_STORAGE_KEY) || {}
      const userEntry = Object.entries(users).find(([, candidate]) => candidate.email === email)
      const user = userEntry?.[1]
      const userId = userEntry?.[0]

      if (!user || !userId) {
        return { success: false, error: "User not found" }
      }

      delete users[userId]
      await getSafeKVClient().set(USERS_STORAGE_KEY, users)

      const credentials = await getSafeKVClient().get<Record<string, StoredCredential>>(USER_CREDENTIALS_KEY) || {}
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
      const allStrategies = await this.getAllStrategies()
      const allReviews = await this.getAllReviews()
      
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
