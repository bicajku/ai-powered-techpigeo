export interface InviteLink {
  code: string
  createdAt: number
  expiresAt: number
  usedAt?: number
  usedBy?: string
  isActive: boolean
  createdBy: string
}

const INVITES_STORAGE_KEY = "invite-links"

export const inviteService = {
  async generateInviteLink(createdByUserId: string, expirationDays: number = 30): Promise<{ success: boolean; code?: string; link?: string; error?: string }> {
    try {
      const code = `invite_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      const now = Date.now()
      const expiresAt = now + expirationDays * 24 * 60 * 60 * 1000

      const invites = (await spark.kv.get<Record<string, InviteLink>>(INVITES_STORAGE_KEY)) || {}

      invites[code] = {
        code,
        createdAt: now,
        expiresAt,
        isActive: true,
        createdBy: createdByUserId,
      }

      await spark.kv.set(INVITES_STORAGE_KEY, invites)

      const baseUrl = typeof window !== "undefined" ? window.location.origin : "https://example.com"
      const link = `${baseUrl}?invite=${code}`

      return { success: true, code, link }
    } catch (error) {
      console.error("Failed to generate invite link:", error)
      return { success: false, error: "Failed to generate invite link" }
    }
  },

  async validateInviteLink(code: string): Promise<{ valid: boolean; invite?: InviteLink; error?: string }> {
    try {
      const invites = (await spark.kv.get<Record<string, InviteLink>>(INVITES_STORAGE_KEY)) || {}
      const invite = invites[code]

      if (!invite) {
        return { valid: false, error: "Invite link not found" }
      }

      if (!invite.isActive) {
        return { valid: false, error: "Invite link has been used" }
      }

      if (invite.expiresAt < Date.now()) {
        return { valid: false, error: "Invite link has expired" }
      }

      return { valid: true, invite }
    } catch (error) {
      console.error("Failed to validate invite link:", error)
      return { valid: false, error: "Failed to validate invite link" }
    }
  },

  async useInviteLink(code: string, userId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const invites = (await spark.kv.get<Record<string, InviteLink>>(INVITES_STORAGE_KEY)) || {}
      const invite = invites[code]

      if (!invite) {
        return { success: false, error: "Invite link not found" }
      }

      if (!invite.isActive) {
        return { success: false, error: "Invite link has already been used" }
      }

      if (invite.expiresAt < Date.now()) {
        return { success: false, error: "Invite link has expired" }
      }

      invite.isActive = false
      invite.usedAt = Date.now()
      invite.usedBy = userId

      await spark.kv.set(INVITES_STORAGE_KEY, invites)

      return { success: true }
    } catch (error) {
      console.error("Failed to use invite link:", error)
      return { success: false, error: "Failed to use invite link" }
    }
  },

  async getInviteLinks(createdByUserId: string): Promise<InviteLink[]> {
    try {
      const invites = (await spark.kv.get<Record<string, InviteLink>>(INVITES_STORAGE_KEY)) || {}
      return Object.values(invites)
        .filter(invite => invite.createdBy === createdByUserId)
        .sort((a, b) => b.createdAt - a.createdAt)
    } catch (error) {
      console.error("Failed to get invite links:", error)
      return []
    }
  },

  async revokeInviteLink(code: string): Promise<{ success: boolean; error?: string }> {
    try {
      const invites = (await spark.kv.get<Record<string, InviteLink>>(INVITES_STORAGE_KEY)) || {}
      const invite = invites[code]

      if (!invite) {
        return { success: false, error: "Invite link not found" }
      }

      invite.isActive = false
      await spark.kv.set(INVITES_STORAGE_KEY, invites)

      return { success: true }
    } catch (error) {
      console.error("Failed to revoke invite link:", error)
      return { success: false, error: "Failed to revoke invite link" }
    }
  },
}
