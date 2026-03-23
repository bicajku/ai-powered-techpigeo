import { NGOAccessLevel, NGOTeamMember, UserProfile } from "@/types"
import { ensureUserSubscription, getDefaultSubscription } from "@/lib/subscription"

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
  try {
    const data = await spark.kv.get<NGOTeamMember[]>(`${TEAM_MEMBERS_KEY}-${adminId}`)
    return data || []
  } catch {
    try {
      const raw = localStorage.getItem(`${TEAM_MEMBERS_KEY}-${adminId}`)
      return raw ? JSON.parse(raw) : []
    } catch { return [] }
  }
}

async function saveTeamMembers(adminId: string, members: NGOTeamMember[]): Promise<void> {
  try {
    await spark.kv.set(`${TEAM_MEMBERS_KEY}-${adminId}`, members)
  } catch { /* ignore */ }
  try {
    localStorage.setItem(`${TEAM_MEMBERS_KEY}-${adminId}`, JSON.stringify(members))
  } catch { /* ignore */ }
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
    if (password.length < 6) {
      return { success: false, error: "Password must be at least 6 characters" }
    }

    const normalizedEmail = email.toLowerCase().trim()

    // Check main user policy: admin must be enterprise or admin role
    const users = (await spark.kv.get<Record<string, UserProfile>>(USERS_STORAGE_KEY)) || {}
    const admin = users[adminId]
    if (!admin) return { success: false, error: "Admin user not found" }

    const safeAdmin = ensureUserSubscription(admin)
    const adminSub = safeAdmin.subscription || getDefaultSubscription()
    const isEnterprise = adminSub.plan === "enterprise" || safeAdmin.role === "admin"
    if (!isEnterprise) {
      return { success: false, error: "Only Enterprise plan or Super Admin can manage team members" }
    }

    // Check if email already exists as a credential
    const credentials = (await spark.kv.get<Record<string, StoredCredential>>(USER_CREDENTIALS_KEY)) || {}
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
        await spark.kv.set(USERS_STORAGE_KEY, users)

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

    // Create new platform user
    const userId = `ngo_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
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

    await spark.kv.set(USER_CREDENTIALS_KEY, credentials)
    await spark.kv.set(USERS_STORAGE_KEY, users)

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
    const team = await getTeamMembers(adminId)
    const memberIndex = team.findIndex(m => m.id === memberId)
    if (memberIndex === -1) return { success: false, error: "Member not found" }

    team[memberIndex] = { ...team[memberIndex], accessLevel: newLevel }
    await saveTeamMembers(adminId, team)

    // Update the user's subscription as well
    const users = (await spark.kv.get<Record<string, UserProfile>>(USERS_STORAGE_KEY)) || {}
    const memberUser = users[memberId]
    if (memberUser) {
      const sub = memberUser.subscription || getDefaultSubscription()
      users[memberId] = {
        ...memberUser,
        subscription: { ...sub, ngoAccessLevel: newLevel, updatedAt: Date.now() },
      }
      await spark.kv.set(USERS_STORAGE_KEY, users)
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
    const team = await getTeamMembers(adminId)
    const updated = team.filter(m => m.id !== memberId)
    if (updated.length === team.length) return { success: false, error: "Member not found" }

    await saveTeamMembers(adminId, updated)

    // Revoke NGO access on the user's subscription
    const users = (await spark.kv.get<Record<string, UserProfile>>(USERS_STORAGE_KEY)) || {}
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
      await spark.kv.set(USERS_STORAGE_KEY, users)
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
