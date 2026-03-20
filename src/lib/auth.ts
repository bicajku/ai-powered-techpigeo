import { UserProfile } from "@/types"
import { ensureUserSubscription, getDefaultSubscription } from "@/lib/subscription"

const USERS_STORAGE_KEY = "platform-users"
const CURRENT_USER_KEY = "current-user-id"
const USER_CREDENTIALS_KEY = "user-credentials"
const RESET_CODES_KEY = "password-reset-codes"

interface StoredCredential {
  email: string
  passwordHash: string
  userId: string
}

interface PasswordResetCode {
  email: string
  code: string
  expiresAt: number
  userId: string
}

async function simpleHash(text: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(text)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

export const authService = {
  async initializeMasterAdmin(): Promise<void> {
    return Promise.resolve()
  },

  async signUp(email: string, password: string, fullName: string): Promise<{ success: boolean; user?: UserProfile; error?: string }> {
    try {
      if (!email || !password || !fullName) {
        return { success: false, error: "All fields are required" }
      }

      if (password.length < 6) {
        return { success: false, error: "Password must be at least 6 characters" }
      }

      const credentials = await spark.kv.get<Record<string, StoredCredential>>(USER_CREDENTIALS_KEY) || {}
      
      if (credentials[email.toLowerCase()]) {
        return { success: false, error: "Email already exists" }
      }

      const users = await spark.kv.get<Record<string, UserProfile>>(USERS_STORAGE_KEY) || {}
      
      const userId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      const passwordHash = await simpleHash(password)

      const newUser: UserProfile = {
        id: userId,
        email: email.toLowerCase(),
        fullName: fullName,
        role: "client",
        subscription: getDefaultSubscription(),
        createdAt: Date.now(),
        lastLoginAt: Date.now(),
      }

      credentials[email.toLowerCase()] = {
        email: email.toLowerCase(),
        passwordHash,
        userId,
      }

      users[userId] = newUser

      await spark.kv.set(USER_CREDENTIALS_KEY, credentials)
      await spark.kv.set(USERS_STORAGE_KEY, users)
      await spark.kv.set(CURRENT_USER_KEY, userId)

      return { success: true, user: newUser }
    } catch (error) {
      console.error("Signup error:", error)
      return { success: false, error: "Failed to create account. Please try again." }
    }
  },

  async login(email: string, password: string): Promise<{ success: boolean; user?: UserProfile; error?: string }> {
    try {
      if (!email || !password) {
        return { success: false, error: "Email and password are required" }
      }

      const credentials = await spark.kv.get<Record<string, StoredCredential>>(USER_CREDENTIALS_KEY) || {}
      const credential = credentials[email.toLowerCase()]

      if (!credential) {
        return { success: false, error: "Invalid email or password" }
      }

      const passwordHash = await simpleHash(password)

      if (passwordHash !== credential.passwordHash) {
        return { success: false, error: "Invalid email or password" }
      }

      const users = await spark.kv.get<Record<string, UserProfile>>(USERS_STORAGE_KEY) || {}
      const user = users[credential.userId]

      if (!user) {
        return { success: false, error: "User not found" }
      }

      const normalizedUser = ensureUserSubscription(user)
      normalizedUser.lastLoginAt = Date.now()
      users[credential.userId] = normalizedUser
      await spark.kv.set(USERS_STORAGE_KEY, users)
      await spark.kv.set(CURRENT_USER_KEY, normalizedUser.id)

      return { success: true, user: normalizedUser }
    } catch (error) {
      console.error("Login error:", error)
      return { success: false, error: "Login failed. Please try again." }
    }
  },

  async loginWithGitHub(): Promise<{ success: boolean; user?: UserProfile; error?: string }> {
    try {
      const githubUser = await spark.user()
      
      if (!githubUser || !githubUser.login) {
        return { success: false, error: "GitHub authentication failed" }
      }

      const users = await spark.kv.get<Record<string, UserProfile>>(USERS_STORAGE_KEY) || {}
      
      const role = githubUser.isOwner ? "admin" : "client"
      
      const existingUser = Object.values(users).find(u => u.id === githubUser.id)
      
      let user: UserProfile
      
      if (!existingUser) {
        user = {
          id: githubUser.id,
          email: githubUser.email || `${githubUser.login}@github.user`,
          fullName: githubUser.login,
          role: role,
          avatarUrl: githubUser.avatarUrl,
          subscription: getDefaultSubscription(),
          createdAt: Date.now(),
          lastLoginAt: Date.now(),
        }
        
        users[githubUser.id] = user
        await spark.kv.set(USERS_STORAGE_KEY, users)
      } else {
        user = ensureUserSubscription(existingUser)
        user.lastLoginAt = Date.now()
        user.role = role
        user.avatarUrl = githubUser.avatarUrl
        
        if (githubUser.email) {
          user.email = githubUser.email
        }
        
        users[githubUser.id] = user
        await spark.kv.set(USERS_STORAGE_KEY, users)
      }

      await spark.kv.set(CURRENT_USER_KEY, user.id)

      return { success: true, user }
    } catch (error) {
      console.error("GitHub login error:", error)
      return { success: false, error: "GitHub authentication failed. Please try again." }
    }
  },

  async logout(): Promise<void> {
    await spark.kv.delete(CURRENT_USER_KEY)
  },

  async getCurrentUser(): Promise<UserProfile | null> {
    try {
      const currentUserId = await spark.kv.get<string>(CURRENT_USER_KEY)
      
      if (currentUserId) {
        const users = await spark.kv.get<Record<string, UserProfile>>(USERS_STORAGE_KEY) || {}
        const storedUser = users[currentUserId]
        if (!storedUser) return null

        const normalized = ensureUserSubscription(storedUser)
        if (!storedUser.subscription) {
          users[currentUserId] = normalized
          await spark.kv.set(USERS_STORAGE_KEY, users)
        }

        return normalized
      }

      try {
        const githubUser = await spark.user()
        
        if (githubUser && githubUser.login) {
          const users = await spark.kv.get<Record<string, UserProfile>>(USERS_STORAGE_KEY) || {}
          const existingUser = Object.values(users).find(u => u.id === githubUser.id)
          
          if (existingUser) {
            const normalized = ensureUserSubscription(existingUser)
            if (!existingUser.subscription) {
              users[existingUser.id] = normalized
              await spark.kv.set(USERS_STORAGE_KEY, users)
            }
            await spark.kv.set(CURRENT_USER_KEY, normalized.id)
            return normalized
          }
        }
      } catch (githubError) {
        console.log("GitHub auth not available, using email/password auth")
      }

      return null
    } catch (error) {
      console.error("Get current user error:", error)
      return null
    }
  },

  async updateProfile(userId: string, updates: Partial<UserProfile>): Promise<{ success: boolean; user?: UserProfile; error?: string }> {
    try {
      const users = await spark.kv.get<Record<string, UserProfile>>(USERS_STORAGE_KEY) || {}
      const user = users[userId]

      if (!user) {
        return { success: false, error: "User not found" }
      }

      const updatedUser = { 
        ...user, 
        ...updates, 
        id: user.id, 
        email: user.email, 
        createdAt: user.createdAt,
        role: user.role,
        subscription: user.subscription || getDefaultSubscription(),
      }

      try {
        const githubUser = await spark.user()
        if (githubUser?.avatarUrl && user.id === githubUser.id) {
          updatedUser.avatarUrl = githubUser.avatarUrl
        }
      } catch (e) {
        console.log("GitHub not available for avatar update")
      }
      
      users[userId] = updatedUser
      await spark.kv.set(USERS_STORAGE_KEY, users)

      return { success: true, user: updatedUser }
    } catch (error) {
      console.error("Update profile error:", error)
      return { success: false, error: "Failed to update profile. Please try again." }
    }
  },

  async requestPasswordReset(email: string): Promise<{ success: boolean; error?: string }> {
    try {
      if (!email) {
        return { success: false, error: "Email is required" }
      }

      const credentials = await spark.kv.get<Record<string, StoredCredential>>(USER_CREDENTIALS_KEY) || {}
      const credential = credentials[email.toLowerCase()]

      if (!credential) {
        return { success: true }
      }

      const resetCode = Math.floor(100000 + Math.random() * 900000).toString()
      const expiresAt = Date.now() + 15 * 60 * 1000

      const resetCodes = await spark.kv.get<Record<string, PasswordResetCode>>(RESET_CODES_KEY) || {}
      
      resetCodes[email.toLowerCase()] = {
        email: email.toLowerCase(),
        code: resetCode,
        expiresAt,
        userId: credential.userId,
      }

      await spark.kv.set(RESET_CODES_KEY, resetCodes)

      console.log(`Password reset code for ${email}: ${resetCode} (expires in 15 minutes)`)

      return { success: true }
    } catch (error) {
      console.error("Request password reset error:", error)
      return { success: false, error: "Failed to process reset request. Please try again." }
    }
  },

  async verifyResetCode(email: string, code: string): Promise<{ success: boolean; error?: string }> {
    try {
      if (!email || !code) {
        return { success: false, error: "Email and code are required" }
      }

      const resetCodes = await spark.kv.get<Record<string, PasswordResetCode>>(RESET_CODES_KEY) || {}
      const resetData = resetCodes[email.toLowerCase()]

      if (!resetData) {
        return { success: false, error: "Invalid or expired reset code" }
      }

      if (resetData.code !== code) {
        return { success: false, error: "Invalid reset code" }
      }

      if (Date.now() > resetData.expiresAt) {
        delete resetCodes[email.toLowerCase()]
        await spark.kv.set(RESET_CODES_KEY, resetCodes)
        return { success: false, error: "Reset code has expired. Please request a new one." }
      }

      return { success: true }
    } catch (error) {
      console.error("Verify reset code error:", error)
      return { success: false, error: "Failed to verify code. Please try again." }
    }
  },

  async resetPassword(email: string, code: string, newPassword: string): Promise<{ success: boolean; error?: string }> {
    try {
      if (!email || !code || !newPassword) {
        return { success: false, error: "All fields are required" }
      }

      if (newPassword.length < 6) {
        return { success: false, error: "Password must be at least 6 characters" }
      }

      const verifyResult = await this.verifyResetCode(email, code)
      if (!verifyResult.success) {
        return verifyResult
      }

      const resetCodes = await spark.kv.get<Record<string, PasswordResetCode>>(RESET_CODES_KEY) || {}
      const resetData = resetCodes[email.toLowerCase()]

      if (!resetData) {
        return { success: false, error: "Invalid reset session" }
      }

      const credentials = await spark.kv.get<Record<string, StoredCredential>>(USER_CREDENTIALS_KEY) || {}
      const credential = credentials[email.toLowerCase()]

      if (!credential) {
        return { success: false, error: "User not found" }
      }

      const newPasswordHash = await simpleHash(newPassword)
      credential.passwordHash = newPasswordHash
      credentials[email.toLowerCase()] = credential

      await spark.kv.set(USER_CREDENTIALS_KEY, credentials)

      delete resetCodes[email.toLowerCase()]
      await spark.kv.set(RESET_CODES_KEY, resetCodes)

      return { success: true }
    } catch (error) {
      console.error("Reset password error:", error)
      return { success: false, error: "Failed to reset password. Please try again." }
    }
  },
}
