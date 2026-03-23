/**
 * Sentinel SAAS - Authentication API
 *
 * Handles login, registration, password management, and session
 * management for the isolated Sentinel SAAS system.
 * Uses both Neon DB (primary) and Spark KV (fallback).
 */

import { v4 as uuidv4 } from "uuid"
import {
  dbGetUserByEmail,
  dbGetUserById,
  dbCreateUser,
  dbUpdateUserLastLogin,
  dbGetUserPasswordHash,
  dbWriteAuditLog,
  kvGet,
  kvSet,
  kvDelete,
} from "./db"
import {
  SENTINEL_KV_KEYS,
  SENTINEL_TOKEN,
  SENTINEL_CONFIG,
} from "../config"
import type {
  SentinelUser,
  SentinelSession,
  SentinelAuthToken,
  SentinelRole,
} from "../types/index"

// ─────────────────────────── Password Hashing ────────────────────

async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder()
  const salted = `sentinel:${password}:v2`
  const data = encoder.encode(salted)
  const hashBuffer = await crypto.subtle.digest("SHA-256", data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("")
}

// ─────────────────────────── Token Utilities ─────────────────────

function generateToken(user: SentinelUser): string {
  const payload: SentinelAuthToken = {
    userId: user.id,
    email: user.email,
    role: user.role,
    organizationId: user.organizationId,
    issuedAt: Date.now(),
    expiresAt: Date.now() + SENTINEL_TOKEN.expiryMs,
  }
  return btoa(JSON.stringify(payload))
}

function parseToken(token: string): SentinelAuthToken | null {
  try {
    const decoded = JSON.parse(atob(token)) as SentinelAuthToken
    if (decoded.expiresAt < Date.now()) return null
    return decoded
  } catch {
    return null
  }
}

// ─────────────────────────── KV Credential Helpers ───────────────

interface StoredCredential {
  email: string
  passwordHash: string
  userId: string
}

async function kvStoreCredential(email: string, passwordHash: string, userId: string): Promise<void> {
  const creds = await kvGet<Record<string, StoredCredential>>(SENTINEL_KV_KEYS.credentials) ?? {}
  creds[email.toLowerCase()] = { email: email.toLowerCase(), passwordHash, userId }
  await kvSet(SENTINEL_KV_KEYS.credentials, creds)
}

// ─────────────────────────── Auth Service ────────────────────────

export const sentinelAuth = {
  /**
   * Initialize the Sentinel Commander (Super Admin) account.
   * Safe to call on every startup — is idempotent.
   */
  async initializeCommander(): Promise<void> {
    const commanderEmail = SENTINEL_CONFIG.adminEmail
    try {
      const existing = await dbGetUserByEmail(commanderEmail)
      if (existing) return // Already initialized

      const passwordHash = await hashPassword(SENTINEL_CONFIG.commanderDefaultPass)
      const commanderId = "sentinel-commander"

      const commander: SentinelUser = {
        id: commanderId,
        email: commanderEmail,
        fullName: "Sentinel Commander",
        role: "SENTINEL_COMMANDER",
        isActive: true,
        createdAt: Date.now(),
        lastLoginAt: Date.now(),
      }

      await dbCreateUser({ ...commander, passwordHash })
      await kvStoreCredential(commanderEmail, passwordHash, commanderId)

      console.info("✅ Sentinel Commander initialized")
    } catch (err) {
      console.warn("Sentinel Commander init skipped:", err)
    }
  },

  /**
   * Register a new Sentinel user.
   */
  async register(
    email: string,
    password: string,
    fullName: string
  ): Promise<{ success: boolean; session?: SentinelSession; error?: string }> {
    try {
      if (!email || !password || !fullName) {
        return { success: false, error: "All fields are required" }
      }
      if (password.length < 8) {
        return { success: false, error: "Password must be at least 8 characters" }
      }

      const existing = await dbGetUserByEmail(email)
      if (existing) {
        return { success: false, error: "An account with this email already exists" }
      }

      const userId = uuidv4()
      const passwordHash = await hashPassword(password)

      const newUser: SentinelUser = {
        id: userId,
        email: email.toLowerCase(),
        fullName,
        role: "USER",
        isActive: true,
        createdAt: Date.now(),
        lastLoginAt: Date.now(),
      }

      await dbCreateUser({ ...newUser, passwordHash })
      await kvStoreCredential(email, passwordHash, userId)

      const token = generateToken(newUser)
      await kvSet(`${SENTINEL_KV_KEYS.currentUser}:${userId}`, token)

      await dbWriteAuditLog({
        userId,
        action: "CREATE",
        resource: "user",
        resourceId: userId,
        success: true,
      })

      return {
        success: true,
        session: { user: newUser, token },
      }
    } catch (err) {
      console.error("Sentinel register error:", err)
      return { success: false, error: "Registration failed. Please try again." }
    }
  },

  /**
   * Login with email and password.
   */
  async login(
    email: string,
    password: string
  ): Promise<{ success: boolean; session?: SentinelSession; error?: string }> {
    try {
      if (!email || !password) {
        return { success: false, error: "Email and password are required" }
      }

      const user = await dbGetUserByEmail(email)
      if (!user || !user.isActive) {
        return { success: false, error: "Invalid email or password" }
      }

      // Get stored hash — try DB first then KV
      let storedHash = await dbGetUserPasswordHash(email)
      if (!storedHash) {
        const creds = await kvGet<Record<string, StoredCredential>>(SENTINEL_KV_KEYS.credentials) ?? {}
        storedHash = creds[email.toLowerCase()]?.passwordHash ?? null
      }

      if (!storedHash) {
        return { success: false, error: "Invalid email or password" }
      }

      const inputHash = await hashPassword(password)
      if (inputHash !== storedHash) {
        await dbWriteAuditLog({
          userId: user.id,
          action: "LOGIN",
          resource: "auth",
          success: false,
          metadata: { reason: "wrong_password" },
        })
        return { success: false, error: "Invalid email or password" }
      }

      await dbUpdateUserLastLogin(user.id)

      const token = generateToken(user)
      await kvSet(SENTINEL_TOKEN.storageKey, token)

      await dbWriteAuditLog({
        userId: user.id,
        action: "LOGIN",
        resource: "auth",
        success: true,
      })

      return { success: true, session: { user, token } }
    } catch (err) {
      console.error("Sentinel login error:", err)
      return { success: false, error: "Login failed. Please try again." }
    }
  },

  /**
   * Logout the current session.
   */
  async logout(userId: string): Promise<void> {
    await kvDelete(SENTINEL_TOKEN.storageKey)
    await dbWriteAuditLog({
      userId,
      action: "LOGOUT",
      resource: "auth",
      success: true,
    })
  },

  /**
   * Restore session from stored token.
   */
  async getSession(): Promise<SentinelSession | null> {
    try {
      const token = await kvGet<string>(SENTINEL_TOKEN.storageKey)
      if (!token) return null

      const parsed = parseToken(token)
      if (!parsed) {
        await kvDelete(SENTINEL_TOKEN.storageKey)
        return null
      }

      const user = await dbGetUserById(parsed.userId)
      if (!user || !user.isActive) {
        await kvDelete(SENTINEL_TOKEN.storageKey)
        return null
      }

      return { user, token }
    } catch (err) {
      console.error("Sentinel getSession error:", err)
      return null
    }
  },

  /**
   * Update a user's role (Sentinel Commander only).
   */
  async updateUserRole(
    targetUserId: string,
    newRole: SentinelRole,
    performedBy: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const performer = await dbGetUserById(performedBy)
      if (!performer || performer.role !== "SENTINEL_COMMANDER") {
        return { success: false, error: "Only Sentinel Commander can update roles" }
      }

      const users = await kvGet<Record<string, SentinelUser>>(SENTINEL_KV_KEYS.users) ?? {}
      if (!users[targetUserId]) {
        return { success: false, error: "User not found" }
      }

      users[targetUserId].role = newRole
      await kvSet(SENTINEL_KV_KEYS.users, users)

      await dbWriteAuditLog({
        userId: performedBy,
        action: "ASSIGN_ROLE",
        resource: "user",
        resourceId: targetUserId,
        metadata: { newRole },
        success: true,
      })

      return { success: true }
    } catch (err) {
      console.error("updateUserRole error:", err)
      return { success: false, error: "Failed to update role" }
    }
  },

  /**
   * Verify a token string is valid.
   */
  verifyToken(token: string): SentinelAuthToken | null {
    return parseToken(token)
  },
}
