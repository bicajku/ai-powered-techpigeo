import { UserProfile, UserCredentials, UserRole } from "@/types"

const USERS_STORAGE_KEY = "platform-users"
const CURRENT_USER_KEY = "current-user-id"
const MASTER_ADMIN_USERNAME = "admin"
const MASTER_ADMIN_PASSWORD = "admin123"

export const authService = {
  async initializeMasterAdmin(): Promise<void> {
    try {
      const users = await spark.kv.get<Record<string, UserProfile>>(USERS_STORAGE_KEY) || {}
      
      if (!users[MASTER_ADMIN_USERNAME]) {
        const hashedPassword = await hashPassword(MASTER_ADMIN_PASSWORD)
        const adminUser: UserProfile = {
          id: "admin_master",
          email: MASTER_ADMIN_USERNAME,
          fullName: "Master Admin",
          role: "admin",
          createdAt: Date.now(),
          lastLoginAt: Date.now(),
        }
        
        users[MASTER_ADMIN_USERNAME] = adminUser
        await spark.kv.set(USERS_STORAGE_KEY, users)
        await spark.kv.set(`password_${MASTER_ADMIN_USERNAME}`, hashedPassword)
      }
    } catch (error) {
      console.error("Failed to initialize master admin:", error)
    }
  },

  async register(credentials: UserCredentials & { fullName: string }): Promise<{ success: boolean; user?: UserProfile; error?: string }> {
    try {
      const users = await spark.kv.get<Record<string, UserProfile>>(USERS_STORAGE_KEY) || {}
      
      if (users[credentials.email]) {
        return { success: false, error: "Email already registered" }
      }

      const hashedPassword = await hashPassword(credentials.password)
      const userId = `user_${Date.now()}_${Math.random().toString(36).substring(7)}`
      
      const newUser: UserProfile = {
        id: userId,
        email: credentials.email,
        fullName: credentials.fullName,
        role: "client",
        createdAt: Date.now(),
        lastLoginAt: Date.now(),
      }

      users[credentials.email] = newUser
      await spark.kv.set(USERS_STORAGE_KEY, users)
      await spark.kv.set(`password_${credentials.email}`, hashedPassword)
      await spark.kv.set(CURRENT_USER_KEY, userId)

      return { success: true, user: newUser }
    } catch (error) {
      console.error("Registration error:", error)
      return { success: false, error: "Registration failed. Please try again." }
    }
  },

  async login(credentials: UserCredentials): Promise<{ success: boolean; user?: UserProfile; error?: string }> {
    try {
      const users = await spark.kv.get<Record<string, UserProfile>>(USERS_STORAGE_KEY) || {}
      const user = users[credentials.email]

      if (!user) {
        return { success: false, error: "Invalid email or password" }
      }

      const storedHash = await spark.kv.get<string>(`password_${credentials.email}`)
      const isPasswordValid = await verifyPassword(credentials.password, storedHash || "")

      if (!isPasswordValid) {
        return { success: false, error: "Invalid email or password" }
      }

      user.lastLoginAt = Date.now()
      users[credentials.email] = user
      await spark.kv.set(USERS_STORAGE_KEY, users)
      await spark.kv.set(CURRENT_USER_KEY, user.id)

      return { success: true, user }
    } catch (error) {
      console.error("Login error:", error)
      return { success: false, error: "Login failed. Please try again." }
    }
  },

  async logout(): Promise<void> {
    await spark.kv.delete(CURRENT_USER_KEY)
  },

  async getCurrentUser(): Promise<UserProfile | null> {
    try {
      const userId = await spark.kv.get<string>(CURRENT_USER_KEY)
      if (!userId) return null

      const users = await spark.kv.get<Record<string, UserProfile>>(USERS_STORAGE_KEY) || {}
      const user = Object.values(users).find(u => u.id === userId)
      
      return user || null
    } catch (error) {
      console.error("Get current user error:", error)
      return null
    }
  },

  async updateProfile(userId: string, updates: Partial<UserProfile>): Promise<{ success: boolean; user?: UserProfile; error?: string }> {
    try {
      const users = await spark.kv.get<Record<string, UserProfile>>(USERS_STORAGE_KEY) || {}
      const user = Object.values(users).find(u => u.id === userId)

      if (!user) {
        return { success: false, error: "User not found" }
      }

      const updatedUser = { ...user, ...updates, id: user.id, email: user.email, createdAt: user.createdAt }
      users[user.email] = updatedUser
      await spark.kv.set(USERS_STORAGE_KEY, users)

      return { success: true, user: updatedUser }
    } catch (error) {
      console.error("Update profile error:", error)
      return { success: false, error: "Failed to update profile. Please try again." }
    }
  },
}

async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(password)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const passwordHash = await hashPassword(password)
  return passwordHash === hash
}
