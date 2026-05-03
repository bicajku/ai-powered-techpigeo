/**
 * Sentinel SAAS - Authentication API
 *
 * C2/C3 security fix: All authentication now routes through the backend
 * JWT endpoints instead of generating unsigned base64 tokens client-side.
 *
 * Backend endpoints used:
 *   POST /api/auth/login      → { ok, token, user }
 *   POST /api/auth/register   → { ok, token, user }
 *   GET  /api/auth/verify     → { ok, user, subscription }
 *   POST /api/auth/refresh    → { ok, token }
 *   POST /api/auth/logout     → { ok }
 *
 * The JWT is stored in localStorage under SENTINEL_TOKEN.storageKey
 * ("sentinel-auth-token") and sent as `Authorization: Bearer <token>`
 * on all authenticated requests.
 *
 * Falls back to the legacy client-side flow (KV + unsigned tokens)
 * ONLY when the backend is unreachable, preserving backward compatibility
 * during migration. The fallback is logged with a warning.
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
} from "../config"
import type {
  SentinelUser,
  SentinelSession,
  SentinelAuthToken,
  SentinelRole,
  UserSubscription,
} from "../types/index"

// ─────────────────────────── Backend API Base ────────────────────

function getBackendBase(): string {
  if (typeof import.meta !== "undefined" && import.meta.env?.VITE_BACKEND_API_BASE_URL) {
    return import.meta.env.VITE_BACKEND_API_BASE_URL;
  }
  // When running locally in dev via Vite proxy, or same origin in production, base is empty string
  return "";
}

function getStoredToken(): string | null {
  try {
    return localStorage.getItem(SENTINEL_TOKEN.storageKey)
  } catch {
    return null
  }
}

function storeToken(token: string): void {
  try {
    localStorage.setItem(SENTINEL_TOKEN.storageKey, token)
  } catch {
    // localStorage unavailable (SSR, private browsing, etc.)
  }
}

function clearToken(): void {
  try {
    localStorage.removeItem(SENTINEL_TOKEN.storageKey)
  } catch {
    // Ignore
  }
}

// ─────────────────────────── Backend Request Helper ──────────────

/**
 * Read the __csrf cookie value set by the backend.
 */
function getCsrfToken(): string | null {
  try {
    const match = document.cookie
      .split(";")
      .map((c) => c.trim())
      .find((c) => c.startsWith("__csrf="))
    return match ? match.slice("__csrf=".length) : null
  } catch {
    return null
  }
}

async function backendFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<{ ok: boolean; data?: T; status: number }> {
  try {
    const base = getBackendBase()
    const token = getStoredToken()
    const csrfToken = getCsrfToken()
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      // M1 fix: Include CSRF token on state-changing requests
      ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}),
      ...(options.headers as Record<string, string> || {}),
    }

    const res = await fetch(`${base}${path}`, {
      ...options,
      headers,
      credentials: "include", // M1: Send cookies cross-origin for CSRF
      signal: AbortSignal.timeout(3000),
    })

    const data = await res.json() as T
    return { ok: res.ok, data, status: res.status }
  } catch (err) {
    console.error("[backendFetch] Network or CORS error:", err)
    // Backend unreachable
    return { ok: false, status: 0 }
  }
}

// ─────────────────────────── Legacy Fallback (Password Hashing) ──

async function hashPasswordLegacy(password: string): Promise<string> {
  const encoder = new TextEncoder()
  const salted = `sentinel:${password}:v2`
  const data = encoder.encode(salted)
  const hashBuffer = await crypto.subtle.digest("SHA-256", data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("")
}

// Legacy unsigned token generation — used ONLY as fallback when backend is down
function generateTokenLegacy(user: SentinelUser): string {
  console.warn("[sentinel/auth] Using LEGACY unsigned token — backend unavailable")
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

function parseTokenLegacy(token: string): SentinelAuthToken | null {
  try {
    // JWT tokens have 3 dot-separated parts; legacy tokens are plain base64
    if (token.split(".").length === 3) {
      // This is a JWT — cannot verify client-side, must call backend
      return null
    }
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

interface BackendAuthResponse {
  ok: boolean
  token?: string
  user?: SentinelUser
  subscription?: UserSubscription | null
  error?: string
}

export const sentinelAuth = {
  /**
   * Initialize the Sentinel Commander (Super Admin) account.
   *
   * C2/C3 fix: Commander provisioning is now backend-only.
   * The frontend no longer creates the commander account or stores
   * hardcoded passwords. This method is kept as a no-op for
   * backward compatibility with SentinelContext.tsx.
   */
  async initializeCommander(): Promise<void> {
    // No-op: Commander account is provisioned server-side only.
    // The backend seeds the commander during startup via its own
    // database migration / seed script, NOT via frontend code.
  },

  /**
   * Register a new Sentinel user via the backend.
   * Falls back to legacy KV-based registration if backend is unreachable.
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

      // ── Try backend first ──
      const res = await backendFetch<BackendAuthResponse>("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({ email, password, fullName }),
      })

      if (res.status !== 0) {
        // Backend responded (even if error)
        if (res.ok && res.data?.ok && res.data.token && res.data.user) {
          const user = res.data.user
          const token = res.data.token
          const subscription = res.data.subscription ?? null
          storeToken(token)

          return {
            success: true,
            session: { user, token, subscription },
          }
        }
        return { success: false, error: res.data?.error || "Registration failed" }
      }

      // ── Fallback: Legacy KV-based registration ──
      console.warn("[sentinel/auth] Backend unreachable, using legacy registration")
      const existing = await dbGetUserByEmail(email)
      if (existing) {
        return { success: false, error: "An account with this email already exists" }
      }

      const userId = uuidv4()
      const passwordHash = await hashPasswordLegacy(password)

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

      const token = generateTokenLegacy(newUser)
      storeToken(token)
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
   * Login with email and password via the backend JWT endpoint.
   * Falls back to legacy KV-based login if backend is unreachable.
   */
  async login(
    email: string,
    password: string
  ): Promise<{ success: boolean; session?: SentinelSession; error?: string }> {
    try {
      if (!email || !password) {
        return { success: false, error: "Email and password are required" }
      }

      // ── Try backend first ──
      const res = await backendFetch<BackendAuthResponse>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      })

      if (res.status !== 0) {
        // Backend responded
        if (res.ok && res.data?.ok && res.data.token && res.data.user) {
          const user = res.data.user
          const token = res.data.token
          const subscription = res.data.subscription ?? null
          storeToken(token)

          return { success: true, session: { user, token, subscription } }
        }
        return { success: false, error: res.data?.error || "Invalid email or password" }
      }

      // ── Fallback: Legacy KV-based login ──
      console.warn("[sentinel/auth] Backend unreachable, using legacy login")
      const user = await dbGetUserByEmail(email)
      if (!user || !user.isActive) {
        return { success: false, error: "Invalid email or password" }
      }

      let storedHash = await dbGetUserPasswordHash(email)
      if (!storedHash) {
        const creds = await kvGet<Record<string, StoredCredential>>(SENTINEL_KV_KEYS.credentials) ?? {}
        storedHash = creds[email.toLowerCase()]?.passwordHash ?? null
      }

      if (!storedHash) {
        return { success: false, error: "Invalid email or password" }
      }

      const inputHash = await hashPasswordLegacy(password)
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

      const token = generateTokenLegacy(user)
      storeToken(token)

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
   * Calls backend to revoke the JWT, then clears local storage.
   */
  async logout(userId: string): Promise<void> {
    // Call backend logout to revoke the JWT
    try {
      await backendFetch("/api/auth/logout", { method: "POST" })
    } catch {
      // Non-blocking — continue clearing local state
    }

    clearToken()
    await kvDelete(SENTINEL_TOKEN.storageKey).catch(() => null)

    await dbWriteAuditLog({
      userId,
      action: "LOGOUT",
      resource: "auth",
      success: true,
    }).catch(() => null)
  },

  /**
   * Restore session from stored token.
   * Verifies the JWT via the backend /api/auth/verify endpoint.
   * Falls back to legacy token parsing if backend is unreachable.
   */
  async getSession(): Promise<SentinelSession | null> {
    try {
      const token = getStoredToken()
      if (!token) return null

      // ── Try backend verification first ──
      const res = await backendFetch<BackendAuthResponse>("/api/auth/verify", {
        method: "GET",
      })

      if (res.status !== 0) {
        if (res.ok && res.data?.ok && res.data.user) {
          const user = res.data.user
          const subscription = res.data.subscription ?? null
          return { user, token, subscription }
        }
        // Backend said token is invalid — clear it
        clearToken()
        return null
      }

      // ── Fallback: Legacy token parsing ──
      console.warn("[sentinel/auth] Backend unreachable, using legacy token parsing")
      const parsed = parseTokenLegacy(token)
      if (!parsed) {
        clearToken()
        return null
      }

      const user = await dbGetUserById(parsed.userId)
      if (!user || !user.isActive) {
        clearToken()
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
   * For JWTs, this delegates to the backend. For legacy tokens, parses locally.
   */
  verifyToken(token: string): SentinelAuthToken | null {
    // Legacy tokens are plain base64 JSON — can parse locally
    // JWTs (3 dot-separated parts) need backend verification
    if (token.split(".").length === 3) {
      // Cannot verify JWT client-side — callers should use getSession() instead
      // Return a minimal parsed payload from the JWT body (unverified, for UI hints only)
      try {
        const bodyB64 = token.split(".")[1]
        const body = JSON.parse(atob(bodyB64.replace(/-/g, "+").replace(/_/g, "/")))
        if (body.exp && body.exp < Math.floor(Date.now() / 1000)) return null
        return {
          userId: body.userId,
          email: body.email,
          role: body.role,
          organizationId: body.organizationId || undefined,
          issuedAt: (body.iat || 0) * 1000,
          expiresAt: (body.exp || 0) * 1000,
        }
      } catch {
        return null
      }
    }
    return parseTokenLegacy(token)
  },
}
