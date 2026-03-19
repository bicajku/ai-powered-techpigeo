import { UserProfile, SavedStrategy, UserRole } from "@/types"

const USERS_STORAGE_KEY = "platform-users"

export const adminService = {
  async getAllUsers(): Promise<UserProfile[]> {
    try {
      const users = await spark.kv.get<Record<string, UserProfile>>(USERS_STORAGE_KEY) || {}
      return Object.values(users)
    } catch (error) {
      console.error("Failed to get all users:", error)
      return []
    }
  },

  async getUserStrategies(userId: string): Promise<SavedStrategy[]> {
    try {
      const strategies = await spark.kv.get<SavedStrategy[]>(`saved-strategies-${userId}`) || []
      return strategies
    } catch (error) {
      console.error(`Failed to get strategies for user ${userId}:`, error)
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

  async updateUserRole(email: string, newRole: UserRole): Promise<{ success: boolean; error?: string }> {
    try {
      const users = await spark.kv.get<Record<string, UserProfile>>(USERS_STORAGE_KEY) || {}
      const user = users[email]

      if (!user) {
        return { success: false, error: "User not found" }
      }

      user.role = newRole
      users[email] = user
      await spark.kv.set(USERS_STORAGE_KEY, users)

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

      const users = await spark.kv.get<Record<string, UserProfile>>(USERS_STORAGE_KEY) || {}
      const user = users[email]

      if (!user) {
        return { success: false, error: "User not found" }
      }

      delete users[email]
      await spark.kv.set(USERS_STORAGE_KEY, users)
      await spark.kv.delete(`password_${email}`)
      await spark.kv.delete(`saved-strategies-${user.id}`)
      await spark.kv.delete(`user-prompt-memory-${user.id}`)

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
    recentUsers: number
  }> {
    try {
      const users = await this.getAllUsers()
      const allStrategies = await this.getAllStrategies()
      
      const totalStrategies = allStrategies.reduce(
        (sum, item) => sum + item.strategies.length,
        0
      )

      const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
      const recentUsers = users.filter(u => u.createdAt >= sevenDaysAgo).length

      return {
        totalUsers: users.length,
        totalAdmins: users.filter(u => u.role === "admin").length,
        totalClients: users.filter(u => u.role === "client").length,
        totalStrategies,
        recentUsers,
      }
    } catch (error) {
      console.error("Failed to get system stats:", error)
      return {
        totalUsers: 0,
        totalAdmins: 0,
        totalClients: 0,
        totalStrategies: 0,
        recentUsers: 0,
      }
    }
  },
}
