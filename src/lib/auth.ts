import { UserProfile, NGOAccessLevel, SubscriptionInfo } from "@/types"
import { ensureUserSubscription, getDefaultSubscription, TRIAL_CREDITS, TRIAL_MAX_SUBMISSIONS } from "@/lib/subscription"
import { getSafeKVClient } from "@/lib/spark-shim"
import { sentinelAuth } from "@/sentinel/api/auth"
import type { SentinelUser } from "@/sentinel/types"

/**
 * Safe accessor for spark.user() — guards against ReferenceError when Spark
 * SDK is not present. Falls back to undefined so callers can handle gracefully.
 */
const safeSparkUser = async (): Promise<{ id: string; login: string; email?: string; avatarUrl?: string; isOwner?: boolean } | null> => {
  try {
    // typeof check prevents ReferenceError if spark global is not defined
    if (typeof spark === "undefined" || typeof spark.user !== "function") return null
    const result = await spark.user()
    return result as unknown as { id: string; login: string; email?: string; avatarUrl?: string; isOwner?: boolean }
  } catch {
    return null
  }
}

const USERS_STORAGE_KEY = "platform-users"
const CURRENT_USER_KEY = "current-user-id"
const CURRENT_USER_LOCAL_KEY = "current-user-id-local"
const USER_CREDENTIALS_KEY = "user-credentials"
const RESET_CODES_KEY = "password-reset-codes"

const saveCurrentUserIdLocal = (userId: string) => {
  if (typeof window === "undefined") return
  window.localStorage.setItem(CURRENT_USER_LOCAL_KEY, userId)
}

const clearCurrentUserIdLocal = () => {
  if (typeof window === "undefined") return
  window.localStorage.removeItem(CURRENT_USER_LOCAL_KEY)
}

const getCurrentUserIdLocal = () => {
  if (typeof window === "undefined") return null
  return window.localStorage.getItem(CURRENT_USER_LOCAL_KEY)
}

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

function mapSentinelUserToUserProfile(user: SentinelUser): UserProfile {
  // INVARIANT[platform-admin-rbac]: Platform-wide "admin" (super-admin) is reserved
  // for SENTINEL_COMMANDER ONLY. ORG_ADMIN / TEAM_ADMIN are organization-scoped
  // roles — their elevated capabilities are scoped via subscription flags
  // (e.g. enterpriseOrganizationId, ngoAccessLevel) and module-level helpers,
  // NOT via the platform admin role. See /memories/repo/policies.md.
  const isPlatformAdmin = user.role === "SENTINEL_COMMANDER"

  const defaultSub = getDefaultSubscription()
  const isTesterRole = user.role === "TESTER"
  const testerSubscription = isTesterRole
    ? {
        ...defaultSub,
        plan: "pro" as const,
        status: "active" as const,
        proCredits: Math.max(50, defaultSub.proCredits || 0),
        testerSeedCredits: 50,
        testerAutoBypassUpgrade: true,
        updatedAt: Date.now(),
      }
    : null

  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: isPlatformAdmin ? "admin" : isTesterRole ? "tester" : "client",
    avatarUrl: user.avatarUrl,
    subscription: (() => {
      const baseSub = user.organizationId
        ? { ...(testerSubscription || defaultSub), enterpriseOrganizationId: user.organizationId }
        : (testerSubscription || defaultSub)
      // INVARIANT[enterprise-grant-persistence]: project DB-persisted enterprise
      // grant fields into the client subscription so getFeatureEntitlements()
      // can unlock NGO-SAAS / Enterprise modules from any browser. Only users
      // granted via the Enterprise Admin or NGO-SAAS Team page (grantedVia is
      // 'enterprise' or 'ngo-team') will have ngoAccessLevel populated; new
      // signups never receive these columns and stay on BASIC defaults.
      const hasEnterpriseGrant =
        !!user.enterpriseRole ||
        !!user.ngoAccessLevel ||
        (Array.isArray(user.enterpriseModuleAccess) && user.enterpriseModuleAccess.length > 0) ||
        user.individualProLicense === true
      if (!hasEnterpriseGrant) return baseSub
      const enterpriseRoleValue = (
        ["owner", "admin", "contributor", "viewer"].includes(String(user.enterpriseRole))
          ? (user.enterpriseRole as SubscriptionInfo["enterpriseRole"])
          : undefined
      )
      const moduleAccessValue = (
        Array.isArray(user.enterpriseModuleAccess)
          ? user.enterpriseModuleAccess.filter((m): m is "strategy" | "ideas" | "review" | "humanizer" =>
              m === "strategy" || m === "ideas" || m === "review" || m === "humanizer")
          : baseSub.enterpriseModuleAccess
      )
      return {
        ...baseSub,
        // Promote to enterprise plan so isEnterprise gating in getFeatureEntitlements unlocks.
        plan: "enterprise" as const,
        status: "active" as const,
        enterpriseOrganizationId: user.organizationId || baseSub.enterpriseOrganizationId,
        enterpriseRole: enterpriseRoleValue,
        enterpriseModuleAccess: moduleAccessValue,
        individualProLicense: user.individualProLicense === true,
        ngoAccessLevel: (user.ngoAccessLevel || undefined) as NGOAccessLevel | undefined,
        ngoTeamAdminId: user.ngoTeamAdminId || undefined,
        hasNgoModuleAccess: !!user.ngoAccessLevel,
        updatedAt: Date.now(),
      }
    })(),
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt,
  }
}

function mergeUserProfileWithStoredState(user: SentinelUser, storedUser?: UserProfile | null): UserProfile {
  const mappedUser = mapSentinelUserToUserProfile(user)
  const previous = storedUser ?? null

  // INVARIANT[server-auth-wins]: identity-bearing fields (role, subscription
  // grant fields) must be sourced from the freshly verified server profile.
  // Local KV state may augment UI-only properties but must NOT override
  // server-authoritative values. The grant-aware merge below enforces this
  // for the enterprise/NGO subscription fields.
  // INVARIANT[enterprise-grant-persistence]: when the freshly verified
  // SentinelUser carries an enterprise/NGO grant from the DB, the mapped
  // subscription (plan: 'enterprise', status: 'active', ngoAccessLevel,
  // ngoTeamAdminId, enterpriseRole, enterpriseModuleAccess,
  // hasNgoModuleAccess, individualProLicense) MUST overwrite any stale
  // locally-cached subscription. Otherwise users granted NGO-SAAS access
  // from another browser would never see the tab unlock on reload, because
  // the previous local subscription would mask the new grant fields.
  const hasEnterpriseGrant =
    !!user.enterpriseRole ||
    !!user.ngoAccessLevel ||
    (Array.isArray(user.enterpriseModuleAccess) && user.enterpriseModuleAccess.length > 0) ||
    user.individualProLicense === true

  const mappedSub = mappedUser.subscription || getDefaultSubscription()
  const mergedSubscription = previous?.subscription
    ? hasEnterpriseGrant
      ? {
          ...previous.subscription,
          ...mappedSub,
          enterpriseOrganizationId:
            user.organizationId
            || mappedSub.enterpriseOrganizationId
            || previous.subscription.enterpriseOrganizationId,
        }
      : {
          ...previous.subscription,
          enterpriseOrganizationId: user.organizationId || previous.subscription.enterpriseOrganizationId,
        }
    : mappedSub

  return ensureUserSubscription({
    ...previous,
    ...mappedUser,
    subscription: mergedSubscription,
  })
}

function findStoredUserBySentinelUser(
  users: Record<string, UserProfile>,
  user: SentinelUser
): UserProfile | null {
  return users[user.id] || Object.values(users).find(
    (candidate) => candidate.email.toLowerCase() === user.email.toLowerCase()
  ) || null
}

export async function resolveSentinelSessionUserIfTokenPresent(
  readToken: () => string | null,
  readSession: () => Promise<{ user?: SentinelUser } | null>
): Promise<SentinelUser | null> {
  const token = readToken()
  if (!token) return null

  const session = await readSession()
  return session?.user ?? null
}

async function simpleHash(text: string): Promise<string> {
  const encoder = new TextEncoder()
  // Salt the password to prevent rainbow table attacks
  const salted = `sentinel:${text}:v2`
  const data = encoder.encode(salted)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

function getBackendBaseUrl(): string {
  if (typeof import.meta !== "undefined" && import.meta.env?.VITE_BACKEND_API_BASE_URL) {
    return import.meta.env.VITE_BACKEND_API_BASE_URL as string
  }
  return ""
}

async function postBackend(path: string, payload: unknown): Promise<{ ok: boolean; status: number; data?: Record<string, unknown> | null }> {
  try {
    const res = await fetch(`${getBackendBaseUrl()}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload),
    })
    const data = await res.json().catch(() => null)
    return { ok: res.ok, status: res.status, data }
  } catch {
    return { ok: false, status: 0 }
  }
}

export const authService = {
  /**
   * Initialize master admin account.
   *
   * C2/C3 + H11 security fix: Admin provisioning is now backend-only.
   * The hardcoded "admin123" password and admin email allowlist have been
   * removed. Admin accounts are seeded via the backend's database migration
   * or seed scripts, NOT from client-side code.
   *
   * This method is kept as a no-op for backward compatibility with callers
   * that invoke it on startup.
   */
  async initializeMasterAdmin(): Promise<void> {
    // No-op: Admin provisioning is backend-only.
    // Previously this seeded a hardcoded admin123 password and promoted
    // emails from a hardcoded allowlist — both are security vulnerabilities.
  },

  async signUp(email: string, password: string, fullName: string): Promise<{ success: boolean; user?: UserProfile; error?: string }> {
    try {
      if (!email || !password || !fullName) {
        return { success: false, error: "All fields are required" }
      }

      if (password.length < 8) {
        return { success: false, error: "Password must be at least 8 characters" }
      }

      // ── Try Sentinel backend registration first (mirrors login() pattern) ──
      // This ensures a JWT is stored so all subsequent API calls are authenticated.
      const sentinelResult = await sentinelAuth.register(email, password, fullName)
      if (sentinelResult.success && sentinelResult.session?.user) {
        const kv = getSafeKVClient()
        const users = await kv.get<Record<string, UserProfile>>(USERS_STORAGE_KEY) || {}
        const existingUser = findStoredUserBySentinelUser(users, sentinelResult.session.user)
        const normalizedUser = mergeUserProfileWithStoredState(sentinelResult.session.user, existingUser)

        // Sync credits from the backend subscription (source of truth) if available.
        // Fall back to TRIAL_CREDITS so the trial sub-object is also set correctly.
        const backendSub = sentinelResult.session.subscription
        const backendProCredits = (typeof backendSub?.proCredits === "number") ? backendSub.proCredits : TRIAL_CREDITS
        if (!normalizedUser.subscription?.trial?.requested) {
          normalizedUser.subscription = {
            ...(normalizedUser.subscription || getDefaultSubscription()),
            proCredits: backendProCredits,
            trial: {
              requested: true,
              requestedAt: Date.now(),
              exhausted: false,
              creditsGranted: backendProCredits,
              submissionsUsed: 0,
              maxSubmissions: TRIAL_MAX_SUBMISSIONS,
            },
          }
        } else if (typeof backendSub?.proCredits === "number") {
          // Trial already set — still keep proCredits in sync with backend
          normalizedUser.subscription = {
            ...(normalizedUser.subscription || getDefaultSubscription()),
            proCredits: backendSub.proCredits,
          }
        }
        users[normalizedUser.id] = normalizedUser
        await kv.set(USERS_STORAGE_KEY, users)
        await kv.set(CURRENT_USER_KEY, normalizedUser.id)
        saveCurrentUserIdLocal(normalizedUser.id)
        return { success: true, user: normalizedUser }
      }

      // If backend responded with an error (not just unreachable), surface it
      if (sentinelResult.error && sentinelResult.error !== "Registration failed. Please try again.") {
        return { success: false, error: sentinelResult.error }
      }

      // ── Fallback: KV-based registration (backend unreachable) ──
      const kv = getSafeKVClient()
      const credentials = await kv.get<Record<string, StoredCredential>>(USER_CREDENTIALS_KEY) || {}
      
      if (credentials[email.toLowerCase()]) {
        return { success: false, error: "Email already exists" }
      }

      const users = await kv.get<Record<string, UserProfile>>(USERS_STORAGE_KEY) || {}
      
      const userId = crypto.randomUUID()
      const passwordHash = await simpleHash(password)

      const newUser: UserProfile = {
        id: userId,
        email: email.toLowerCase(),
        fullName: fullName,
        role: "client",
        subscription: {
          ...getDefaultSubscription(),
          proCredits: TRIAL_CREDITS,
          trial: {
            requested: true,
            requestedAt: Date.now(),
            exhausted: false,
            creditsGranted: TRIAL_CREDITS,
            submissionsUsed: 0,
            maxSubmissions: TRIAL_MAX_SUBMISSIONS,
          },
        },
        createdAt: Date.now(),
        lastLoginAt: Date.now(),
      }

      credentials[email.toLowerCase()] = {
        email: email.toLowerCase(),
        passwordHash,
        userId,
      }

      users[userId] = newUser

      await kv.set(USER_CREDENTIALS_KEY, credentials)
      await kv.set(USERS_STORAGE_KEY, users)
      await kv.set(CURRENT_USER_KEY, userId)
      saveCurrentUserIdLocal(userId)

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

      // Prefer Sentinel backend auth first so seeded backend users can sign in.
      const sentinelResult = await sentinelAuth.login(email, password)
      if (sentinelResult.success && sentinelResult.session?.user) {
        const kv = getSafeKVClient()
        const users = await kv.get<Record<string, UserProfile>>(USERS_STORAGE_KEY) || {}
        const existingUser = findStoredUserBySentinelUser(users, sentinelResult.session.user)
        const normalizedUser = mergeUserProfileWithStoredState(sentinelResult.session.user, existingUser)
        // Sync backend subscription proCredits so KV always reflects the real balance.
        const backendSub = sentinelResult.session.subscription
        if (typeof backendSub?.proCredits === "number" && normalizedUser.role !== "admin") {
          normalizedUser.subscription = {
            ...(normalizedUser.subscription || getDefaultSubscription()),
            proCredits: backendSub.proCredits,
          }
        }
        users[normalizedUser.id] = normalizedUser
        await kv.set(USERS_STORAGE_KEY, users)
        await kv.set(CURRENT_USER_KEY, normalizedUser.id)
        saveCurrentUserIdLocal(normalizedUser.id)
        return { success: true, user: normalizedUser }
      }

      // When the backend is reachable but auth fails, do not fall back to the
      // legacy client-side login flow because that produces a UI session with
      // no valid JWT for backend-protected proxy routes.
      if (sentinelResult.error) {
        return { success: false, error: sentinelResult.error }
      }

      const kv = getSafeKVClient()
      const credentials = await kv.get<Record<string, StoredCredential>>(USER_CREDENTIALS_KEY) || {}
      const credential = credentials[email.toLowerCase()]

      if (!credential) {
        return { success: false, error: "Invalid email or password" }
      }

      const passwordHash = await simpleHash(password)

      if (passwordHash !== credential.passwordHash) {
        return { success: false, error: "Invalid email or password" }
      }

      const users = await kv.get<Record<string, UserProfile>>(USERS_STORAGE_KEY) || {}
      const user = users[credential.userId]

      if (!user) {
        return { success: false, error: "User not found" }
      }

      const normalizedUser = ensureUserSubscription(user)
      normalizedUser.lastLoginAt = Date.now()
      users[credential.userId] = normalizedUser
      await kv.set(USERS_STORAGE_KEY, users)
      await kv.set(CURRENT_USER_KEY, normalizedUser.id)
      saveCurrentUserIdLocal(normalizedUser.id)

      return { success: true, user: normalizedUser }
    } catch (error) {
      console.error("Login error:", error)
      return { success: false, error: "Login failed. Please try again." }
    }
  },

  async loginWithGitHub(): Promise<{ success: boolean; user?: UserProfile; error?: string }> {
    try {
      let githubUser: { id: string; login: string; email?: string; avatarUrl?: string; isOwner?: boolean } | null = null

      // Attempt 1: Spark runtime's native GitHub integration
      githubUser = await safeSparkUser()

      // Filter out the shim's placeholder "Local User" login
      if (githubUser && (!githubUser.login || githubUser.login === "Local User")) {
        githubUser = null
      }

      // Attempt 2: Codespace dev server endpoint (proxies GITHUB_TOKEN → GitHub API)
      if (!githubUser && import.meta.env.DEV) {
        try {
          const res = await fetch('/__github-user')
          if (res.ok) {
            const data = await res.json() as { id: string; login: string; email?: string; avatar_url?: string }
            if (data.login) {
              githubUser = {
                id: data.id,
                login: data.login,
                email: data.email || undefined,
                avatarUrl: data.avatar_url || undefined,
              }
            }
          }
        } catch {
          // Dev endpoint not available (production build or network error)
        }
      }

      if (!githubUser || !githubUser.login) {
        return { 
          success: false, 
          error: "GitHub authentication failed. Please try again."
        }
      }

      const kv = getSafeKVClient()
      const users = await kv.get<Record<string, UserProfile>>(USERS_STORAGE_KEY) || {}
      
      // C3/H11 fix: Removed hardcoded ADMIN_EMAILS allowlist.
      // Admin role assignment is now managed server-side only.
      const userEmail = (githubUser.email || `${githubUser.login}@github.user`).toLowerCase()
      const isAdmin = Boolean(githubUser.isOwner) // Only Spark runtime owner gets admin, no email allowlist
      const githubUserId = githubUser.id
      
      const existingUser = Object.values(users).find(u => u.id === githubUserId)
      
      let user: UserProfile
      
      if (!existingUser) {
        user = {
          id: githubUserId,
          email: userEmail,
          fullName: githubUser.login,
          role: isAdmin ? "admin" : "client",
          avatarUrl: githubUser.avatarUrl,
          subscription: getDefaultSubscription(),
          createdAt: Date.now(),
          lastLoginAt: Date.now(),
        }
        
        users[githubUserId] = user
        await kv.set(USERS_STORAGE_KEY, users)
      } else {
        user = ensureUserSubscription(existingUser)
        user.lastLoginAt = Date.now()
        user.avatarUrl = githubUser.avatarUrl
        
        // Only promote to admin, never demote (preserve existing admin roles)
        if (isAdmin) {
          user.role = "admin"
        }
        
        if (githubUser.email) {
          user.email = githubUser.email
        }
        
        users[githubUserId] = user
        await kv.set(USERS_STORAGE_KEY, users)
      }

      await kv.set(CURRENT_USER_KEY, user.id)
      saveCurrentUserIdLocal(user.id)

      return { success: true, user }
    } catch (error) {
      console.error("GitHub login error:", error)
      return { success: false, error: "GitHub authentication failed. Please try again." }
    }
  },

  async logout(): Promise<void> {
    // Non-blocking — failures here should never prevent the user from "logging out" in the UI
    try {
      const sentinelSession = await sentinelAuth.getSession().catch(() => null)
      if (sentinelSession?.user?.id) {
        await sentinelAuth.logout(sentinelSession.user.id).catch(() => null)
      }
      await getSafeKVClient().delete(CURRENT_USER_KEY)
      clearCurrentUserIdLocal()
    } catch {
      // Intentional: ignore KV delete failures on logout
      clearCurrentUserIdLocal()
    }
  },

  async getCurrentUser(): Promise<UserProfile | null> {
    try {
      const hadSentinelToken = typeof localStorage !== "undefined"
        ? Boolean(localStorage.getItem("sentinel-auth-token") || localStorage.getItem("sentinel_token"))
        : false

      // If a sentinel OAuth token is present in localStorage, it means the user just logged
      // in via Google/GitHub OAuth (or has an active sentinel session). Always verify and
      // return that user FIRST — before consulting the Spark KV store — so that the OAuth
      // user is never shadowed by a stale KV-stored admin/previous session.
      const kv = getSafeKVClient()
      try {
        // Check token inline so we can capture the full session (incl. subscription).
        const sentinelToken = localStorage.getItem("sentinel-auth-token")
        if (sentinelToken) {
          const session = await sentinelAuth.getSession()
          const sentinelUser = session?.user ?? null
          if (sentinelUser) {
            const users = await kv.get<Record<string, UserProfile>>(USERS_STORAGE_KEY) || {}
            const existingUser = findStoredUserBySentinelUser(users, sentinelUser)
            const normalized = mergeUserProfileWithStoredState(sentinelUser, existingUser)
            // Sync backend proCredits (source of truth) so the frontend always
            // reflects the real credit balance, including welcome bonus credits
            // that were seeded on the backend after OAuth or email signup.
            const backendSub = session?.subscription
            if (typeof backendSub?.proCredits === "number" && normalized.role !== "admin") {
              normalized.subscription = {
                ...(normalized.subscription || getDefaultSubscription()),
                proCredits: backendSub.proCredits,
              }
            }
            users[normalized.id] = normalized
            await kv.set(USERS_STORAGE_KEY, users)
            await kv.set(CURRENT_USER_KEY, normalized.id)
            saveCurrentUserIdLocal(normalized.id)
            return normalized
          }
          // Token present but backend verification failed — force re-login.
          if (hadSentinelToken) {
            await kv.delete(CURRENT_USER_KEY).catch(() => null)
            clearCurrentUserIdLocal()
            return null
          }
        }
      } catch {
        // Sentinel token check failed — fall through to KV lookup
      }


      const kvCurrentUserId = await kv.get<string>(CURRENT_USER_KEY)
      const currentUserId = kvCurrentUserId || getCurrentUserIdLocal()
      
      if (currentUserId) {
        const users = await kv.get<Record<string, UserProfile>>(USERS_STORAGE_KEY) || {}
        const storedUser = users[currentUserId]
        if (!storedUser) return null

        const normalized = ensureUserSubscription(storedUser)
        if (!storedUser.subscription) {
          users[currentUserId] = normalized
          await kv.set(USERS_STORAGE_KEY, users)
        }

        if (!kvCurrentUserId) {
          await kv.set(CURRENT_USER_KEY, currentUserId)
        }
        saveCurrentUserIdLocal(currentUserId)

        return normalized
      }

      // Attempt GitHub SSO lookup (Spark runtime only — safeSparkUser guards typeof spark)
      try {
        const githubUser = await safeSparkUser()
        
        if (githubUser && githubUser.login) {
          const users = await kv.get<Record<string, UserProfile>>(USERS_STORAGE_KEY) || {}
          const existingUser = Object.values(users).find(u => u.id === githubUser.id)
          
          if (existingUser) {
            const normalized = ensureUserSubscription(existingUser)
            if (!existingUser.subscription) {
              users[existingUser.id] = normalized
              await kv.set(USERS_STORAGE_KEY, users)
            }
            await kv.set(CURRENT_USER_KEY, normalized.id)
            saveCurrentUserIdLocal(normalized.id)
            return normalized
          }
        }
      } catch {
        console.log("GitHub auth not available, using email/password auth")
      }

      // Restore session from Sentinel backend token when present.
      try {
        const sentinelSession = await sentinelAuth.getSession()
        if (sentinelSession?.user) {
          const users = await kv.get<Record<string, UserProfile>>(USERS_STORAGE_KEY) || {}
          const existingUser = findStoredUserBySentinelUser(users, sentinelSession.user)
          const normalized = mergeUserProfileWithStoredState(sentinelSession.user, existingUser)
          // Sync backend proCredits so the frontend reflects the real balance.
          const backendSub = sentinelSession.subscription
          if (typeof backendSub?.proCredits === "number" && normalized.role !== "admin") {
            normalized.subscription = {
              ...(normalized.subscription || getDefaultSubscription()),
              proCredits: backendSub.proCredits,
            }
          }
          users[normalized.id] = normalized
          await kv.set(USERS_STORAGE_KEY, users)
          await kv.set(CURRENT_USER_KEY, normalized.id)
          saveCurrentUserIdLocal(normalized.id)
          return normalized
        }
      } catch {
        // Keep legacy auth flow resilient when Sentinel backend is unavailable
      }

      return null
    } catch (error) {
      console.error("Get current user error:", error)
      return null
    }
  },

  async updateProfile(userId: string, updates: Partial<UserProfile>): Promise<{ success: boolean; user?: UserProfile; error?: string }> {
    try {
      const kv = getSafeKVClient()
      const users = await kv.get<Record<string, UserProfile>>(USERS_STORAGE_KEY) || {}
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

      // Attach GitHub avatar if available in Spark runtime
      try {
        const githubUser = await safeSparkUser()
        if (githubUser?.avatarUrl && user.id === githubUser.id) {
          updatedUser.avatarUrl = githubUser.avatarUrl
        }
      } catch {
        // Non-blocking — avatar update failure should not block profile save
      }
      
      users[userId] = updatedUser
      await kv.set(USERS_STORAGE_KEY, users)

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

      const backendRes = await postBackend("/api/auth/password-reset/request", { email })
      if (backendRes.status !== 0) {
        if (backendRes.ok && backendRes.data?.ok) {
          return { success: true }
        }
        return { success: false, error: (backendRes.data?.error as string) || "Failed to process reset request. Please try again." }
      }

      const kv = getSafeKVClient()
      const credentials = await kv.get<Record<string, StoredCredential>>(USER_CREDENTIALS_KEY) || {}
      const credential = credentials[email.toLowerCase()]

      if (!credential) {
        return { success: true }
      }

      const resetCode = Math.floor(100000 + Math.random() * 900000).toString()
      const expiresAt = Date.now() + 15 * 60 * 1000

      const resetCodes = await kv.get<Record<string, PasswordResetCode>>(RESET_CODES_KEY) || {}
      
      resetCodes[email.toLowerCase()] = {
        email: email.toLowerCase(),
        code: resetCode,
        expiresAt,
        userId: credential.userId,
      }

      await kv.set(RESET_CODES_KEY, resetCodes)

      // Reset code stored securely — do not log to console

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

      const backendRes = await postBackend("/api/auth/password-reset/verify", { email, code })
      if (backendRes.status !== 0) {
        if (backendRes.ok && backendRes.data?.ok) {
          return { success: true }
        }
        return { success: false, error: (backendRes.data?.error as string) || "Invalid or expired reset code" }
      }

      const kv = getSafeKVClient()
      const resetCodes = await kv.get<Record<string, PasswordResetCode>>(RESET_CODES_KEY) || {}
      const resetData = resetCodes[email.toLowerCase()]

      if (!resetData) {
        return { success: false, error: "Invalid or expired reset code" }
      }

      if (resetData.code !== code) {
        return { success: false, error: "Invalid reset code" }
      }

      if (Date.now() > resetData.expiresAt) {
        delete resetCodes[email.toLowerCase()]
        await kv.set(RESET_CODES_KEY, resetCodes)
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

      if (newPassword.length < 8) {
        return { success: false, error: "Password must be at least 8 characters" }
      }

      const backendRes = await postBackend("/api/auth/password-reset/confirm", {
        email,
        code,
        newPassword,
      })
      if (backendRes.status !== 0) {
        if (backendRes.ok && backendRes.data?.ok) {
          return { success: true }
        }
        return { success: false, error: (backendRes.data?.error as string) || "Failed to reset password. Please try again." }
      }

      const verifyResult = await this.verifyResetCode(email, code)
      if (!verifyResult.success) {
        return verifyResult
      }

      const kv = getSafeKVClient()
      const resetCodes = await kv.get<Record<string, PasswordResetCode>>(RESET_CODES_KEY) || {}
      const resetData = resetCodes[email.toLowerCase()]

      if (!resetData) {
        return { success: false, error: "Invalid reset session" }
      }

      const credentials = await kv.get<Record<string, StoredCredential>>(USER_CREDENTIALS_KEY) || {}
      const credential = credentials[email.toLowerCase()]

      if (!credential) {
        return { success: false, error: "User not found" }
      }

      const newPasswordHash = await simpleHash(newPassword)
      credential.passwordHash = newPasswordHash
      credentials[email.toLowerCase()] = credential

      await kv.set(USER_CREDENTIALS_KEY, credentials)

      delete resetCodes[email.toLowerCase()]
      await kv.set(RESET_CODES_KEY, resetCodes)

      return { success: true }
    } catch (error) {
      console.error("Reset password error:", error)
      return { success: false, error: "Failed to reset password. Please try again." }
    }
  },
}
