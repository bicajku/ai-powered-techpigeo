import { NGOAccessLevel, NGOTeamMember, UserProfile } from "@/types"
import { ensureUserSubscription, getDefaultSubscription } from "@/lib/subscription"
import { getPlatformKV } from "@/lib/platform-client"
import { createOrganizationMember } from "@/lib/org-members"

const USERS_STORAGE_KEY = "platform-users"
const USER_CREDENTIALS_KEY = "user-credentials"
const TEAM_MEMBERS_KEY = "ngo-team-members"

interface StoredCredential {
  email: string
  passwordHash: string
  userId: string
}

async function simpleHash(text: string): Promise<string> {
  const encoder = new TextEncoder()
  const salted = `sentinel:${text}:v2`
  const data = encoder.encode(salted)
  const hashBuffer = await crypto.subtle.digest("SHA-256", data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("")
}

export async function getTeamMembers(adminId: string): Promise<NGOTeamMember[]> {
  const kv = getPlatformKV()
  try {
    const data = await kv.get<NGOTeamMember[]>(`${TEAM_MEMBERS_KEY}-${adminId}`)
    return data || []
  } catch {
    try {
      const raw = localStorage.getItem(`${TEAM_MEMBERS_KEY}-${adminId}`)
      return raw ? JSON.parse(raw) : []
    } catch { return [] }
  }
}

async function saveTeamMembers(adminId: string, members: NGOTeamMember[]): Promise<void> {
  const kv = getPlatformKV()
  try {
    await kv.set(`${TEAM_MEMBERS_KEY}-${adminId}`, members)
  } catch { /* ignore */ }
  try {
    localStorage.setItem(`${TEAM_MEMBERS_KEY}-${adminId}`, JSON.stringify(members))
  } catch { /* ignore */ }
}

/**
 * Sync a member into the NGO team list when module access is granted
 * from outside (e.g. Enterprise admin panel). Idempotent — will not
 * duplicate an existing member.
 */
export async function syncMemberToNGOTeam(
  adminId: string,
  member: { id: string; email: string; fullName: string; accessLevel: NGOAccessLevel }
): Promise<void> {
  const team = await getTeamMembers(adminId)
  const existing = team.find(m => m.id === member.id || m.email.toLowerCase() === member.email.toLowerCase())
  if (existing) {
    // Update access level if it changed
    existing.accessLevel = member.accessLevel
    await saveTeamMembers(adminId, team)
    return
  }
  const entry: NGOTeamMember = {
    id: member.id,
    email: member.email.toLowerCase().trim(),
    fullName: member.fullName,
    accessLevel: member.accessLevel,
    addedBy: adminId,
    addedAt: Date.now(),
  }
  await saveTeamMembers(adminId, [...team, entry])
}

/**
 * Remove a member from the NGO team list when module access is revoked
 * from outside (e.g. Enterprise admin panel). No-op if the member is
 * not in the list.
 */
export async function removeMemberFromNGOTeam(
  adminId: string,
  memberId: string
): Promise<void> {
  const team = await getTeamMembers(adminId)
  const filtered = team.filter(m => m.id !== memberId)
  if (filtered.length !== team.length) {
    await saveTeamMembers(adminId, filtered)
  }
}

export async function addTeamMember(
  adminId: string,
  email: string,
  password: string,
  fullName: string,
  accessLevel: NGOAccessLevel
): Promise<{ success: boolean; member?: NGOTeamMember; error?: string }> {
  try {
    if (!email || !password || !fullName) {
      return { success: false, error: "All fields are required" }
    }
    if (password.length < 8) {
      return { success: false, error: "Password must be at least 8 characters" }
    }

    const normalizedEmail = email.toLowerCase().trim()

    // Check main user policy: admin must be enterprise or admin role
    const kv = getPlatformKV()
    const users = (await kv.get<Record<string, UserProfile>>(USERS_STORAGE_KEY)) || {}
    const admin = users[adminId]
    if (!admin) return { success: false, error: "Admin user not found" }

    const safeAdmin = ensureUserSubscription(admin)
    const adminSub = safeAdmin.subscription || getDefaultSubscription()
    const isEnterprise = adminSub.plan === "enterprise" || safeAdmin.role === "admin"
    if (!isEnterprise) {
      return { success: false, error: "Only Enterprise plan or Super Admin can manage team members" }
    }

    // Check if email already exists as a credential
    const credentials = (await kv.get<Record<string, StoredCredential>>(USER_CREDENTIALS_KEY)) || {}
    if (credentials[normalizedEmail]) {
      // User already exists — just grant NGO access instead of creating new account
      const existingCred = credentials[normalizedEmail]
      const existingUser = users[existingCred.userId]
      if (existingUser) {
        const existingSub = existingUser.subscription || getDefaultSubscription()
        users[existingCred.userId] = {
          ...existingUser,
          subscription: {
            ...existingSub,
            hasNgoModuleAccess: true,
            ngoAccessLevel: accessLevel,
            ngoTeamAdminId: adminId,
            updatedAt: Date.now(),
          },
        }
        await kv.set(USERS_STORAGE_KEY, users)

        const member: NGOTeamMember = {
          id: existingCred.userId,
          email: normalizedEmail,
          fullName: existingUser.fullName,
          accessLevel,
          addedBy: adminId,
          addedAt: Date.now(),
        }
        const team = await getTeamMembers(adminId)
        const existing = team.find(m => m.id === existingCred.userId)
        if (existing) {
          return { success: false, error: "This user is already a team member" }
        }
        await saveTeamMembers(adminId, [...team, member])
        return { success: true, member }
      }
    }

    const orgId = safeAdmin.subscription?.enterpriseOrganizationId || safeAdmin.id
    const backendCreate = await createOrganizationMember({
      email: normalizedEmail,
      fullName,
      password,
      role: accessLevel === "owner" ? "admin" : accessLevel === "contributor" ? "contributor" : "viewer",
    })

    if (!backendCreate.success) {
      return { success: false, error: backendCreate.error || "Failed to create backend team member" }
    }

    const userId = typeof backendCreate.member?.id === "string"
      ? backendCreate.member.id
      : `ngo_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    const passwordHash = await simpleHash(password)

    const newUser: UserProfile = {
      id: userId,
      email: normalizedEmail,
      fullName,
      role: "client",
      subscription: {
        ...getDefaultSubscription(),
        hasNgoModuleAccess: true,
        ngoAccessLevel: accessLevel,
        ngoTeamAdminId: adminId,
        enterpriseOrganizationId: orgId,
      },
      createdAt: Date.now(),
      lastLoginAt: Date.now(),
    }

    credentials[normalizedEmail] = {
      email: normalizedEmail,
      passwordHash,
      userId,
    }

    users[userId] = newUser

    await kv.set(USER_CREDENTIALS_KEY, credentials)
    await kv.set(USERS_STORAGE_KEY, users)

    const member: NGOTeamMember = {
      id: userId,
      email: normalizedEmail,
      fullName,
      accessLevel,
      addedBy: adminId,
      addedAt: Date.now(),
    }

    const team = await getTeamMembers(adminId)
    await saveTeamMembers(adminId, [...team, member])

    return { success: true, member }
  } catch (error) {
    console.error("Failed to add team member:", error)
    return { success: false, error: "Failed to add team member" }
  }
}

export async function updateMemberAccess(
  adminId: string,
  memberId: string,
  newLevel: NGOAccessLevel
): Promise<{ success: boolean; error?: string }> {
  try {
    const kv = getPlatformKV()
    const team = await getTeamMembers(adminId)
    const memberIndex = team.findIndex(m => m.id === memberId)
    if (memberIndex === -1) return { success: false, error: "Member not found" }

    team[memberIndex] = { ...team[memberIndex], accessLevel: newLevel }
    await saveTeamMembers(adminId, team)

    // Update the user's subscription as well
    const users = (await kv.get<Record<string, UserProfile>>(USERS_STORAGE_KEY)) || {}
    const memberUser = users[memberId]
    if (memberUser) {
      const sub = memberUser.subscription || getDefaultSubscription()
      users[memberId] = {
        ...memberUser,
        subscription: { ...sub, ngoAccessLevel: newLevel, updatedAt: Date.now() },
      }
      await kv.set(USERS_STORAGE_KEY, users)
    }

    return { success: true }
  } catch (error) {
    console.error("Failed to update member access:", error)
    return { success: false, error: "Failed to update access level" }
  }
}

export async function removeMember(
  adminId: string,
  memberId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const kv = getPlatformKV()
    const team = await getTeamMembers(adminId)
    const updated = team.filter(m => m.id !== memberId)
    if (updated.length === team.length) return { success: false, error: "Member not found" }

    await saveTeamMembers(adminId, updated)

    // Revoke NGO access on the user's subscription
    const users = (await kv.get<Record<string, UserProfile>>(USERS_STORAGE_KEY)) || {}
    const memberUser = users[memberId]
    if (memberUser) {
      const sub = memberUser.subscription || getDefaultSubscription()
      users[memberId] = {
        ...memberUser,
        subscription: {
          ...sub,
          hasNgoModuleAccess: false,
          ngoAccessLevel: undefined,
          ngoTeamAdminId: undefined,
          updatedAt: Date.now(),
        },
      }
      await kv.set(USERS_STORAGE_KEY, users)
    }

    return { success: true }
  } catch (error) {
    console.error("Failed to remove member:", error)
    return { success: false, error: "Failed to remove team member" }
  }
}

export function getNGOAccessLevel(user?: UserProfile): NGOAccessLevel | "admin" | null {
  if (!user) return null
  if (user.role === "admin") return "admin"
  const sub = user.subscription
  if (!sub?.hasNgoModuleAccess) return null
  return sub.ngoAccessLevel || "user"
}

export function canWrite(level: NGOAccessLevel | "admin" | null): boolean {
  return level === "admin" || level === "owner" || level === "contributor"
}

export function canDelete(level: NGOAccessLevel | "admin" | null): boolean {
  return level === "admin" || level === "owner"
}

export function canManageTeam(level: NGOAccessLevel | "admin" | null): boolean {
  return level === "admin" || level === "owner"
}
