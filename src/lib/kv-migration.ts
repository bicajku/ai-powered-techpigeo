/**
 * Phase 3: Spark KV → Neon migration utility.
 *
 * Walks the granting admin's local Spark KV maps and replays each entry
 * through the new Phase 1 admin endpoints so cross-browser drift is healed
 * without losing data. This is NON-DESTRUCTIVE: KV is not cleared. The
 * caller can audit the per-record report and decide whether to clear.
 *
 * Usage from the browser console while logged in as the enterprise admin:
 *   const { migrateLocalKvToNeon } = await import("/src/lib/kv-migration.ts")
 *   await migrateLocalKvToNeon({ dryRun: true })   // see plan
 *   await migrateLocalKvToNeon()                   // execute
 *
 * Safety:
 * - Requires a logged-in TEAM_ADMIN+ session (token in localStorage).
 * - Does not write to KV. Reads only.
 * - All replays go through the existing admin routes which already enforce
 *   org-scope, role whitelist, and ngo_access_level CHECK constraints.
 */

import { getSafeKVClient } from "@/lib/spark-shim"
import { getPlatformKV } from "@/lib/platform-client"
import {
  backendUpsertEnterpriseMember,
  backendUpsertNgoTeamMember,
} from "@/lib/backend-cache"

interface MigrationResult {
  enterpriseMembers: { ok: number; failed: number; details: Array<{ orgId: string; userId: string; ok: boolean; error?: string }> }
  ngoTeamMembers: { ok: number; failed: number; details: Array<{ adminUserId: string; memberUserId: string; ok: boolean; error?: string }> }
  dryRun: boolean
}

interface KvEnterpriseSub {
  organizationId: string
  ownerId: string
  teamMembers?: Array<{
    id: string
    email: string
    role?: string
    moduleAccess?: string[]
    individualProLicense?: boolean
    ngoAccessLevel?: string | null
  }>
}

interface KvNgoMember {
  id: string
  email: string
  accessLevel: string
}

const ENTERPRISE_SUBSCRIPTIONS_KEY = "enterprise-subscriptions"
const NGO_TEAM_KEY_PREFIX = "ngo-team-members"

export async function migrateLocalKvToNeon({ dryRun = false }: { dryRun?: boolean } = {}): Promise<MigrationResult> {
  const result: MigrationResult = {
    enterpriseMembers: { ok: 0, failed: 0, details: [] },
    ngoTeamMembers: { ok: 0, failed: 0, details: [] },
    dryRun,
  }

  // ── Enterprise members ────────────────────────────────────────────────
  try {
    const kv = getSafeKVClient()
    const subs = (await kv.get<Record<string, KvEnterpriseSub>>(ENTERPRISE_SUBSCRIPTIONS_KEY)) || {}
    for (const [, sub] of Object.entries(subs)) {
      const orgId = sub?.organizationId
      if (!orgId || !Array.isArray(sub.teamMembers)) continue
      for (const m of sub.teamMembers) {
        if (!m?.email) continue
        if (dryRun) {
          result.enterpriseMembers.details.push({ orgId, userId: m.id || "(by-email)", ok: true })
          result.enterpriseMembers.ok++
          continue
        }
        const res = await backendUpsertEnterpriseMember({
          orgId,
          userId: m.id && !/^(ent|ngo)_\d+/.test(m.id) ? m.id : undefined,
          email: m.email,
          role: m.role || "viewer",
          moduleAccess: Array.isArray(m.moduleAccess) ? m.moduleAccess : ["strategy", "ideas"],
          individualProLicense: !!m.individualProLicense,
        })
        if (res.ok) {
          result.enterpriseMembers.ok++
          result.enterpriseMembers.details.push({ orgId, userId: m.id, ok: true })
        } else {
          result.enterpriseMembers.failed++
          result.enterpriseMembers.details.push({ orgId, userId: m.id, ok: false, error: res.error })
        }
      }
    }
  } catch (err) {
    console.warn("[kv-migration] enterprise read failed:", err)
  }

  // ── NGO team members ──────────────────────────────────────────────────
  // Walk every browser-localStorage key matching `${TEAM_MEMBERS_KEY}-<adminId>`.
  try {
    const kv = getPlatformKV()
    if (typeof localStorage !== "undefined") {
      const adminIds = new Set<string>()
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key && key.startsWith(`${NGO_TEAM_KEY_PREFIX}-`)) {
          adminIds.add(key.slice(`${NGO_TEAM_KEY_PREFIX}-`.length))
        }
      }
      for (const adminId of adminIds) {
        const members = (await kv.get<KvNgoMember[]>(`${NGO_TEAM_KEY_PREFIX}-${adminId}`)) || []
        for (const m of members) {
          if (!m?.email) continue
          const accessLevel = (m.accessLevel === "owner" || m.accessLevel === "contributor" || m.accessLevel === "user")
            ? m.accessLevel
            : "user"
          if (dryRun) {
            result.ngoTeamMembers.details.push({ adminUserId: adminId, memberUserId: m.id || "(by-email)", ok: true })
            result.ngoTeamMembers.ok++
            continue
          }
          const res = await backendUpsertNgoTeamMember({
            adminUserId: adminId,
            memberUserId: m.id && !/^(ent|ngo)_\d+/.test(m.id) ? m.id : undefined,
            email: m.email,
            accessLevel,
          })
          if (res.ok) {
            result.ngoTeamMembers.ok++
            result.ngoTeamMembers.details.push({ adminUserId: adminId, memberUserId: m.id, ok: true })
          } else {
            result.ngoTeamMembers.failed++
            result.ngoTeamMembers.details.push({ adminUserId: adminId, memberUserId: m.id, ok: false, error: res.error })
          }
        }
      }
    }
  } catch (err) {
    console.warn("[kv-migration] ngo-team read failed:", err)
  }

  return result
}

// Expose on window for one-shot console-driven runs by enterprise admins.
declare global {
  interface Window {
    __sentinelKvMigration?: typeof migrateLocalKvToNeon
  }
}
if (typeof window !== "undefined") {
  window.__sentinelKvMigration = migrateLocalKvToNeon
}
