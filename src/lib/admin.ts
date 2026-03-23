import { UserProfile, SavedStrategy, UserRole, SavedReviewDocument } from "@/types"
import { getSafeKVClient } from "@/lib/spark-shim"

const USERS_STORAGE_KEY = "platform-users"
const USER_CREDENTIALS_KEY = "user-credentials"

interface StoredCredential {
  email: string
  passwordHash: string
  userId: string
}

function getCurrentMonthKey(prefix: string): string {
  const now = new Date()
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
  return `${prefix}-${month}`
}

async function simpleHash(text: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(text)
  const hashBuffer = await crypto.subtle.digest("SHA-256", data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("")
}

export const adminService = {
  async getAllUsers(): Promise<UserProfile[]> {
    try {
      const users = await getSafeKVClient().get<Record<string, UserProfile>>(USERS_STORAGE_KEY) || {}
      return Object.values(users)
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
      if (!newPassword || newPassword.length < 6) {
        return { success: false, error: "Password must be at least 6 characters" }
      }

      const credentials = await getSafeKVClient().get<Record<string, StoredCredential>>(USER_CREDENTIALS_KEY) || {}
      const credential = credentials[email.toLowerCase()]

      if (!credential) {
        return { success: false, error: "Credentials not found for this user" }
      }

      credential.passwordHash = await simpleHash(newPassword)
      credentials[email.toLowerCase()] = credential
      await getSafeKVClient().set(USER_CREDENTIALS_KEY, credentials)

      return { success: true }
    } catch (error) {
      console.error("Failed to update user password:", error)
      return { success: false, error: "Failed to update password" }
    }
  },
}
