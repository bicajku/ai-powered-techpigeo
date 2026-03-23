/**
 * Sentinel SAAS - Database Utilities
 *
 * Thin wrapper around the Neon client for Sentinel-specific
 * database operations. All KV fallbacks are also handled here.
 */

import { getNeonClient, isNeonConfigured } from "@/lib/neon-client"
import { SENTINEL_KV_KEYS, AUDIT_LOG_KV_LIMIT } from "../config"
import type {
  SentinelUser,
  UserSubscription,
  Organization,
  OrganizationBranding,
  SentinelProject,
  UserModulePermission,
  AuditLogEntry,
  AuditAction,
} from "../types/index"
import type { NGODocument, NGOOutput, ProjectSummary, NGOReport } from "../types/ngo-saas"

// ─────────────────────────── Helpers ─────────────────────────────

type KVStore = typeof spark.kv

function getKV(): KVStore {
  if (typeof spark !== "undefined" && spark.kv) return spark.kv
  // localStorage shim for non-Spark environments
  return {
    get: async <T>(key: string) => {
      const v = localStorage.getItem(key)
      return v ? (JSON.parse(v) as T) : null
    },
    set: async <T>(key: string, value: T) => {
      localStorage.setItem(key, JSON.stringify(value))
    },
    delete: async (key: string) => {
      localStorage.removeItem(key)
    },
    list: async () => [],
  } as unknown as KVStore
}

// ─────────────────────────── KV Operations ───────────────────────

export async function kvGet<T>(key: string): Promise<T | null> {
  try {
    const kv = getKV()
    const result = await kv.get<T>(key)
    return result ?? null
  } catch {
    return null
  }
}

export async function kvSet<T>(key: string, value: T): Promise<void> {
  try {
    const kv = getKV()
    await kv.set(key, value)
  } catch (err) {
    console.warn("KV set failed:", err)
  }
}

export async function kvDelete(key: string): Promise<void> {
  try {
    const kv = getKV()
    await kv.delete(key)
  } catch (err) {
    console.warn("KV delete failed:", err)
  }
}

// ─────────────────────────── User DB Ops ─────────────────────────

export async function dbGetUserByEmail(email: string): Promise<SentinelUser | null> {
  if (isNeonConfigured()) {
    try {
      const sql = await getNeonClient()
      const rows = await sql`
        SELECT id, email, full_name, role, organization_id, avatar_url, is_active,
               EXTRACT(EPOCH FROM created_at)::BIGINT * 1000 AS created_at,
               EXTRACT(EPOCH FROM last_login_at)::BIGINT * 1000 AS last_login_at
        FROM sentinel_users
        WHERE email = ${email.toLowerCase()} AND is_active = TRUE
        LIMIT 1
      ` as Array<Record<string, unknown>>
      if (!rows[0]) return null
      return rowToUser(rows[0])
    } catch (err) {
      console.warn("DB getUserByEmail failed, trying KV:", err)
    }
  }

  const users = await kvGet<Record<string, SentinelUser>>(SENTINEL_KV_KEYS.users) ?? {}
  return Object.values(users).find((u) => u.email === email.toLowerCase()) ?? null
}

export async function dbGetUserById(id: string): Promise<SentinelUser | null> {
  if (isNeonConfigured()) {
    try {
      const sql = await getNeonClient()
      const rows = await sql`
        SELECT id, email, full_name, role, organization_id, avatar_url, is_active,
               EXTRACT(EPOCH FROM created_at)::BIGINT * 1000 AS created_at,
               EXTRACT(EPOCH FROM last_login_at)::BIGINT * 1000 AS last_login_at
        FROM sentinel_users
        WHERE id = ${id} AND is_active = TRUE
        LIMIT 1
      ` as Array<Record<string, unknown>>
      if (!rows[0]) return null
      return rowToUser(rows[0])
    } catch (err) {
      console.warn("DB getUserById failed, trying KV:", err)
    }
  }

  const users = await kvGet<Record<string, SentinelUser>>(SENTINEL_KV_KEYS.users) ?? {}
  return users[id] ?? null
}

export async function dbCreateUser(
  user: Omit<SentinelUser, "createdAt" | "lastLoginAt"> & { passwordHash: string }
): Promise<SentinelUser | null> {
  if (isNeonConfigured()) {
    try {
      const sql = await getNeonClient()
      const rows = await sql`
        INSERT INTO sentinel_users (id, email, full_name, password_hash, role, organization_id, avatar_url, is_active)
        VALUES (${user.id}, ${user.email.toLowerCase()}, ${user.fullName}, ${user.passwordHash},
                ${user.role}, ${user.organizationId ?? null}, ${user.avatarUrl ?? null}, ${user.isActive})
        RETURNING id, email, full_name, role, organization_id, avatar_url, is_active,
                  EXTRACT(EPOCH FROM created_at)::BIGINT * 1000 AS created_at,
                  EXTRACT(EPOCH FROM last_login_at)::BIGINT * 1000 AS last_login_at
      ` as Array<Record<string, unknown>>
      if (!rows[0]) return null
      return rowToUser(rows[0])
    } catch (err) {
      console.warn("DB createUser failed, falling to KV:", err)
    }
  }

  const newUser: SentinelUser = {
    id: user.id,
    email: user.email.toLowerCase(),
    fullName: user.fullName,
    role: user.role,
    organizationId: user.organizationId,
    avatarUrl: user.avatarUrl,
    isActive: user.isActive,
    createdAt: Date.now(),
    lastLoginAt: Date.now(),
  }
  const users = await kvGet<Record<string, SentinelUser>>(SENTINEL_KV_KEYS.users) ?? {}
  users[newUser.id] = newUser
  await kvSet(SENTINEL_KV_KEYS.users, users)
  return newUser
}

export async function dbUpdateUserLastLogin(id: string): Promise<void> {
  if (isNeonConfigured()) {
    try {
      const sql = await getNeonClient()
      await sql`UPDATE sentinel_users SET last_login_at = NOW() WHERE id = ${id}`
      return
    } catch {
      // fallback to KV
    }
  }
  const users = await kvGet<Record<string, SentinelUser>>(SENTINEL_KV_KEYS.users) ?? {}
  if (users[id]) {
    users[id].lastLoginAt = Date.now()
    await kvSet(SENTINEL_KV_KEYS.users, users)
  }
}

export async function dbGetUserPasswordHash(email: string): Promise<string | null> {
  if (isNeonConfigured()) {
    try {
      const sql = await getNeonClient()
      const rows = await sql`
        SELECT password_hash FROM sentinel_users
        WHERE email = ${email.toLowerCase()} AND is_active = TRUE
        LIMIT 1
      ` as Array<{ password_hash: string }>
      return rows[0]?.password_hash ?? null
    } catch {
      // fallback
    }
  }
  const creds = await kvGet<Record<string, { email: string; passwordHash: string; userId: string }>>(
    SENTINEL_KV_KEYS.credentials
  ) ?? {}
  return creds[email.toLowerCase()]?.passwordHash ?? null
}

export async function dbListUsers(organizationId?: string): Promise<SentinelUser[]> {
  if (isNeonConfigured()) {
    try {
      const sql = await getNeonClient()
      const rows = organizationId
        ? await sql`
            SELECT id, email, full_name, role, organization_id, avatar_url, is_active,
                   EXTRACT(EPOCH FROM created_at)::BIGINT * 1000 AS created_at,
                   EXTRACT(EPOCH FROM last_login_at)::BIGINT * 1000 AS last_login_at
            FROM sentinel_users WHERE organization_id = ${organizationId} AND is_active = TRUE
          ` as Array<Record<string, unknown>>
        : await sql`
            SELECT id, email, full_name, role, organization_id, avatar_url, is_active,
                   EXTRACT(EPOCH FROM created_at)::BIGINT * 1000 AS created_at,
                   EXTRACT(EPOCH FROM last_login_at)::BIGINT * 1000 AS last_login_at
            FROM sentinel_users WHERE is_active = TRUE ORDER BY created_at DESC
          ` as Array<Record<string, unknown>>
      return rows.map(rowToUser)
    } catch (err) {
      console.warn("DB listUsers failed:", err)
    }
  }
  const users = await kvGet<Record<string, SentinelUser>>(SENTINEL_KV_KEYS.users) ?? {}
  const all = Object.values(users).filter((u) => u.isActive)
  return organizationId ? all.filter((u) => u.organizationId === organizationId) : all
}

// ─────────────────────────── Subscription DB Ops ─────────────────

export async function dbGetUserSubscription(userId: string): Promise<UserSubscription | null> {
  if (isNeonConfigured()) {
    try {
      const sql = await getNeonClient()
      const rows = await sql`
        SELECT id, user_id, subscription_id, tier, status, assigned_by, organization_id, auto_renew,
               EXTRACT(EPOCH FROM assigned_at)::BIGINT * 1000 AS assigned_at,
               EXTRACT(EPOCH FROM expires_at)::BIGINT * 1000 AS expires_at
        FROM sentinel_user_subscriptions
        WHERE user_id = ${userId} AND status = 'ACTIVE'
        ORDER BY assigned_at DESC LIMIT 1
      ` as Array<Record<string, unknown>>
      if (!rows[0]) return null
      return rowToUserSubscription(rows[0])
    } catch (err) {
      console.warn("DB getUserSubscription failed:", err)
    }
  }

  const subs = await kvGet<Record<string, UserSubscription>>(SENTINEL_KV_KEYS.userSubscriptions) ?? {}
  return Object.values(subs).find((s) => s.userId === userId && s.status === "ACTIVE") ?? null
}

export async function dbAssignSubscription(sub: UserSubscription): Promise<void> {
  if (isNeonConfigured()) {
    try {
      const sql = await getNeonClient()
      await sql`
        INSERT INTO sentinel_user_subscriptions
          (id, user_id, subscription_id, tier, status, assigned_by, organization_id, auto_renew, expires_at)
        VALUES (${sub.id}, ${sub.userId}, ${sub.subscriptionId}, ${sub.tier}, ${sub.status},
                ${sub.assignedBy}, ${sub.organizationId}, ${sub.autoRenew},
                ${sub.expiresAt ? new Date(sub.expiresAt).toISOString() : null})
        ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, updated_at = NOW()
      `
      return
    } catch (err) {
      console.warn("DB assignSubscription failed:", err)
    }
  }

  const subs = await kvGet<Record<string, UserSubscription>>(SENTINEL_KV_KEYS.userSubscriptions) ?? {}
  subs[sub.id] = sub
  await kvSet(SENTINEL_KV_KEYS.userSubscriptions, subs)
}

// ─────────────────────────── Organization DB Ops ─────────────────

export async function dbGetOrganization(id: string): Promise<Organization | null> {
  if (isNeonConfigured()) {
    try {
      const sql = await getNeonClient()
      const rows = await sql`
        SELECT o.id, o.name, o.subscription_id, o.tier, o.admin_user_id,
               EXTRACT(EPOCH FROM o.created_at)::BIGINT * 1000 AS created_at,
               EXTRACT(EPOCH FROM o.updated_at)::BIGINT * 1000 AS updated_at,
               COALESCE(array_agg(u.id) FILTER (WHERE u.id IS NOT NULL), '{}') AS member_ids
        FROM sentinel_organizations o
        LEFT JOIN sentinel_users u ON u.organization_id = o.id AND u.is_active = TRUE
        WHERE o.id = ${id}
        GROUP BY o.id
      ` as Array<Record<string, unknown>>
      if (!rows[0]) return null
      return rowToOrganization(rows[0])
    } catch (err) {
      console.warn("DB getOrganization failed:", err)
    }
  }

  const orgs = await kvGet<Record<string, Organization>>(SENTINEL_KV_KEYS.organizations) ?? {}
  return orgs[id] ?? null
}

// ─────────────────────────── Branding DB Ops ─────────────────────

export async function dbGetBranding(organizationId: string): Promise<OrganizationBranding | null> {
  if (isNeonConfigured()) {
    try {
      const sql = await getNeonClient()
      const rows = await sql`
        SELECT id, organization_id, name, logo_url, primary_color, secondary_color, accent_color,
               phone, email, office_address, website, use_custom_branding,
               EXTRACT(EPOCH FROM created_at)::BIGINT * 1000 AS created_at,
               EXTRACT(EPOCH FROM updated_at)::BIGINT * 1000 AS updated_at
        FROM sentinel_org_branding
        WHERE organization_id = ${organizationId}
        LIMIT 1
      ` as Array<Record<string, unknown>>
      if (!rows[0]) return null
      return rowToBranding(rows[0])
    } catch (err) {
      console.warn("DB getBranding failed:", err)
    }
  }

  const brandings = await kvGet<Record<string, OrganizationBranding>>(SENTINEL_KV_KEYS.branding) ?? {}
  return Object.values(brandings).find((b) => b.organizationId === organizationId) ?? null
}

export async function dbUpsertBranding(branding: OrganizationBranding): Promise<void> {
  if (isNeonConfigured()) {
    try {
      const sql = await getNeonClient()
      await sql`
        INSERT INTO sentinel_org_branding
          (id, organization_id, name, logo_url, primary_color, secondary_color, accent_color,
           phone, email, office_address, website, use_custom_branding)
        VALUES (${branding.id}, ${branding.organizationId}, ${branding.name}, ${branding.logoUrl},
                ${branding.primaryColor}, ${branding.secondaryColor}, ${branding.accentColor ?? null},
                ${branding.phone}, ${branding.email}, ${branding.officeAddress}, ${branding.website ?? null},
                ${branding.useCustomBranding})
        ON CONFLICT (organization_id) DO UPDATE
          SET name = EXCLUDED.name, logo_url = EXCLUDED.logo_url, primary_color = EXCLUDED.primary_color,
              secondary_color = EXCLUDED.secondary_color, accent_color = EXCLUDED.accent_color,
              phone = EXCLUDED.phone, email = EXCLUDED.email, office_address = EXCLUDED.office_address,
              website = EXCLUDED.website, use_custom_branding = EXCLUDED.use_custom_branding,
              updated_at = NOW()
      `
      return
    } catch (err) {
      console.warn("DB upsertBranding failed:", err)
    }
  }

  const brandings = await kvGet<Record<string, OrganizationBranding>>(SENTINEL_KV_KEYS.branding) ?? {}
  brandings[branding.id] = branding
  await kvSet(SENTINEL_KV_KEYS.branding, brandings)
}

// ─────────────────────────── Project DB Ops ──────────────────────

export async function dbGetProjectsByOrg(organizationId: string): Promise<SentinelProject[]> {
  if (isNeonConfigured()) {
    try {
      const sql = await getNeonClient()
      const rows = await sql`
        SELECT p.id, p.organization_id, p.name, p.description, p.modules_enabled, p.created_by,
               p.status, p.branding_id,
               EXTRACT(EPOCH FROM p.created_at)::BIGINT * 1000 AS created_at,
               EXTRACT(EPOCH FROM p.updated_at)::BIGINT * 1000 AS updated_at,
               COALESCE(array_agg(pm.user_id) FILTER (WHERE pm.user_id IS NOT NULL), '{}') AS team_member_ids
        FROM sentinel_projects p
        LEFT JOIN sentinel_project_members pm ON pm.project_id = p.id
        WHERE p.organization_id = ${organizationId}
        GROUP BY p.id ORDER BY p.created_at DESC
      ` as Array<Record<string, unknown>>
      return rows.map(rowToProject)
    } catch (err) {
      console.warn("DB getProjectsByOrg failed:", err)
    }
  }

  const projects = await kvGet<Record<string, SentinelProject>>(SENTINEL_KV_KEYS.projects) ?? {}
  return Object.values(projects).filter((p) => p.organizationId === organizationId)
}

export async function dbCreateProject(project: SentinelProject): Promise<void> {
  if (isNeonConfigured()) {
    try {
      const sql = await getNeonClient()
      await sql`
        INSERT INTO sentinel_projects (id, organization_id, name, description, modules_enabled, created_by, status, branding_id)
        VALUES (${project.id}, ${project.organizationId}, ${project.name}, ${project.description ?? null},
                ${JSON.stringify(project.modulesEnabled)}, ${project.createdBy}, ${project.status},
                ${project.brandingId ?? null})
      `
      for (const memberId of project.teamMemberIds) {
        await sql`
          INSERT INTO sentinel_project_members (project_id, user_id) VALUES (${project.id}, ${memberId})
          ON CONFLICT DO NOTHING
        `
      }
      return
    } catch (err) {
      console.warn("DB createProject failed:", err)
    }
  }

  const projects = await kvGet<Record<string, SentinelProject>>(SENTINEL_KV_KEYS.projects) ?? {}
  projects[project.id] = project
  await kvSet(SENTINEL_KV_KEYS.projects, projects)
}

// ─────────────────────────── Module Permission DB Ops ────────────

export async function dbGetUserModulePermissions(userId: string): Promise<UserModulePermission[]> {
  if (isNeonConfigured()) {
    try {
      const sql = await getNeonClient()
      const rows = await sql`
        SELECT id, user_id, organization_id, module_name, access_level, granted_by,
               EXTRACT(EPOCH FROM granted_at)::BIGINT * 1000 AS granted_at,
               EXTRACT(EPOCH FROM expires_at)::BIGINT * 1000 AS expires_at
        FROM sentinel_module_permissions
        WHERE user_id = ${userId}
          AND (expires_at IS NULL OR expires_at > NOW())
      ` as Array<Record<string, unknown>>
      return rows.map(rowToModulePermission)
    } catch (err) {
      console.warn("DB getUserModulePermissions failed:", err)
    }
  }

  const perms = await kvGet<Record<string, UserModulePermission>>(SENTINEL_KV_KEYS.modulePermissions) ?? {}
  return Object.values(perms).filter((p) => p.userId === userId)
}

export async function dbGrantModulePermission(perm: UserModulePermission): Promise<void> {
  if (isNeonConfigured()) {
    try {
      const sql = await getNeonClient()
      await sql`
        INSERT INTO sentinel_module_permissions
          (id, user_id, organization_id, module_name, access_level, granted_by, expires_at)
        VALUES (${perm.id}, ${perm.userId}, ${perm.organizationId}, ${perm.moduleName},
                ${perm.accessLevel}, ${perm.grantedBy}, ${perm.expiresAt ? new Date(perm.expiresAt).toISOString() : null})
        ON CONFLICT (user_id, organization_id, module_name)
        DO UPDATE SET access_level = EXCLUDED.access_level, expires_at = EXCLUDED.expires_at
      `
      return
    } catch (err) {
      console.warn("DB grantModulePermission failed:", err)
    }
  }

  const key = `${perm.userId}:${perm.organizationId}:${perm.moduleName}`
  const perms = await kvGet<Record<string, UserModulePermission>>(SENTINEL_KV_KEYS.modulePermissions) ?? {}
  perms[key] = perm
  await kvSet(SENTINEL_KV_KEYS.modulePermissions, perms)
}

export async function dbRevokeModulePermission(
  userId: string,
  organizationId: string,
  moduleName: string
): Promise<void> {
  if (isNeonConfigured()) {
    try {
      const sql = await getNeonClient()
      await sql`
        DELETE FROM sentinel_module_permissions
        WHERE user_id = ${userId} AND organization_id = ${organizationId} AND module_name = ${moduleName}
      `
      return
    } catch (err) {
      console.warn("DB revokeModulePermission failed:", err)
    }
  }

  const key = `${userId}:${organizationId}:${moduleName}`
  const perms = await kvGet<Record<string, UserModulePermission>>(SENTINEL_KV_KEYS.modulePermissions) ?? {}
  delete perms[key]
  await kvSet(SENTINEL_KV_KEYS.modulePermissions, perms)
}

// ─────────────────────────── NGO Document DB Ops ─────────────────

export async function dbCreateNGODocument(doc: NGODocument): Promise<void> {
  if (isNeonConfigured()) {
    try {
      const sql = await getNeonClient()
      await sql`
        INSERT INTO sentinel_ngo_documents
          (id, project_id, organization_id, document_type, title, file_name, file_url, file_type,
           file_size_bytes, content, ai_processed_data, uploaded_by)
        VALUES (${doc.id}, ${doc.projectId}, ${doc.organizationId}, ${doc.documentType},
                ${doc.title}, ${doc.fileName}, ${doc.fileUrl}, ${doc.fileType},
                ${doc.fileSizeBytes ?? null}, ${doc.content ?? null},
                ${doc.aiProcessedData ? JSON.stringify(doc.aiProcessedData) : null}, ${doc.uploadedBy})
      `
      return
    } catch (err) {
      console.warn("DB createNGODocument failed:", err)
    }
  }

  const docs = await kvGet<Record<string, NGODocument>>(SENTINEL_KV_KEYS.ngoDocuments) ?? {}
  docs[doc.id] = doc
  await kvSet(SENTINEL_KV_KEYS.ngoDocuments, docs)
}

export async function dbGetNGODocuments(projectId: string): Promise<NGODocument[]> {
  if (isNeonConfigured()) {
    try {
      const sql = await getNeonClient()
      const rows = await sql`
        SELECT id, project_id, organization_id, document_type, title, file_name, file_url,
               file_type, file_size_bytes, content, ai_processed_data, uploaded_by,
               EXTRACT(EPOCH FROM created_at)::BIGINT * 1000 AS created_at,
               EXTRACT(EPOCH FROM updated_at)::BIGINT * 1000 AS updated_at
        FROM sentinel_ngo_documents WHERE project_id = ${projectId}
        ORDER BY created_at DESC
      ` as Array<Record<string, unknown>>
      return rows.map(rowToNGODocument)
    } catch (err) {
      console.warn("DB getNGODocuments failed:", err)
    }
  }

  const docs = await kvGet<Record<string, NGODocument>>(SENTINEL_KV_KEYS.ngoDocuments) ?? {}
  return Object.values(docs).filter((d) => d.projectId === projectId)
}

// ─────────────────────────── NGO Output DB Ops ───────────────────

export async function dbCreateNGOOutput(output: NGOOutput): Promise<void> {
  if (isNeonConfigured()) {
    try {
      const sql = await getNeonClient()
      await sql`
        INSERT INTO sentinel_ngo_outputs
          (id, project_id, document_id, tab_name, output_type, title, generated_data, export_formats, branding_config_id, created_by, version)
        VALUES (${output.id}, ${output.projectId}, ${output.documentId ?? null}, ${output.tabName},
                ${output.outputType}, ${output.title}, ${output.generatedData},
                ${JSON.stringify(output.exportFormats)}, ${output.brandingConfigId ?? null}, ${output.createdBy}, ${output.version})
      `
      return
    } catch (err) {
      console.warn("DB createNGOOutput failed:", err)
    }
  }

  const outputs = await kvGet<Record<string, NGOOutput>>(SENTINEL_KV_KEYS.ngoOutputs) ?? {}
  outputs[output.id] = output
  await kvSet(SENTINEL_KV_KEYS.ngoOutputs, outputs)
}

export async function dbGetNGOOutputs(projectId: string): Promise<NGOOutput[]> {
  if (isNeonConfigured()) {
    try {
      const sql = await getNeonClient()
      const rows = await sql`
        SELECT id, project_id, document_id, tab_name, output_type, title, generated_data,
               export_formats, branding_config_id, created_by, version,
               EXTRACT(EPOCH FROM created_at)::BIGINT * 1000 AS created_at
        FROM sentinel_ngo_outputs WHERE project_id = ${projectId}
        ORDER BY created_at DESC
      ` as Array<Record<string, unknown>>
      return rows.map(rowToNGOOutput)
    } catch (err) {
      console.warn("DB getNGOOutputs failed:", err)
    }
  }

  const outputs = await kvGet<Record<string, NGOOutput>>(SENTINEL_KV_KEYS.ngoOutputs) ?? {}
  return Object.values(outputs).filter((o) => o.projectId === projectId)
}

// ─────────────────────────── Project Summary DB Ops ──────────────

export async function dbGetProjectSummaries(projectId: string): Promise<ProjectSummary[]> {
  if (isNeonConfigured()) {
    try {
      const sql = await getNeonClient()
      const rows = await sql`
        SELECT id, project_id, organization_id, title, content, objectives, target_beneficiaries,
               budget_overview, timeline, impact_metrics, created_by, version,
               EXTRACT(EPOCH FROM created_at)::BIGINT * 1000 AS created_at,
               EXTRACT(EPOCH FROM updated_at)::BIGINT * 1000 AS updated_at
        FROM sentinel_project_summaries WHERE project_id = ${projectId}
        ORDER BY created_at DESC
      ` as Array<Record<string, unknown>>
      return rows.map(rowToProjectSummary)
    } catch (err) {
      console.warn("DB getProjectSummaries failed:", err)
    }
  }

  const summaries = await kvGet<Record<string, ProjectSummary>>(SENTINEL_KV_KEYS.projectSummaries) ?? {}
  return Object.values(summaries).filter((s) => s.projectId === projectId)
}

export async function dbUpsertProjectSummary(summary: ProjectSummary): Promise<void> {
  if (isNeonConfigured()) {
    try {
      const sql = await getNeonClient()
      await sql`
        INSERT INTO sentinel_project_summaries
          (id, project_id, organization_id, title, content, objectives, target_beneficiaries,
           budget_overview, timeline, impact_metrics, created_by, version)
        VALUES (${summary.id}, ${summary.projectId}, ${summary.organizationId}, ${summary.title},
                ${summary.content}, ${JSON.stringify(summary.objectives ?? [])},
                ${summary.targetBeneficiaries ?? null}, ${summary.budgetOverview ?? null},
                ${summary.timeline ?? null}, ${JSON.stringify(summary.impactMetrics ?? [])},
                ${summary.createdBy}, ${summary.version})
        ON CONFLICT (id) DO UPDATE
          SET title = EXCLUDED.title, content = EXCLUDED.content, updated_at = NOW(),
              version = EXCLUDED.version + 1
      `
      return
    } catch (err) {
      console.warn("DB upsertProjectSummary failed:", err)
    }
  }

  const summaries = await kvGet<Record<string, ProjectSummary>>(SENTINEL_KV_KEYS.projectSummaries) ?? {}
  summaries[summary.id] = summary
  await kvSet(SENTINEL_KV_KEYS.projectSummaries, summaries)
}

// ─────────────────────────── NGO Report DB Ops ───────────────────

export async function dbGetNGOReports(projectId: string): Promise<NGOReport[]> {
  if (isNeonConfigured()) {
    try {
      const sql = await getNeonClient()
      const rows = await sql`
        SELECT id, project_id, organization_id, title, report_type, sections, branding_id, generated_by, exported_formats,
               EXTRACT(EPOCH FROM generated_at)::BIGINT * 1000 AS generated_at
        FROM sentinel_ngo_reports WHERE project_id = ${projectId}
        ORDER BY generated_at DESC
      ` as Array<Record<string, unknown>>
      return rows.map(rowToNGOReport)
    } catch (err) {
      console.warn("DB getNGOReports failed:", err)
    }
  }

  const reports = await kvGet<Record<string, NGOReport>>(SENTINEL_KV_KEYS.ngoReports) ?? {}
  return Object.values(reports).filter((r) => r.projectId === projectId)
}

export async function dbCreateNGOReport(report: NGOReport): Promise<void> {
  if (isNeonConfigured()) {
    try {
      const sql = await getNeonClient()
      await sql`
        INSERT INTO sentinel_ngo_reports
          (id, project_id, organization_id, title, report_type, sections, branding_id, generated_by, exported_formats)
        VALUES (${report.id}, ${report.projectId}, ${report.organizationId}, ${report.title},
                ${report.reportType}, ${JSON.stringify(report.sections)}, ${report.brandingId ?? null},
                ${report.generatedBy}, ${JSON.stringify(report.exportedFormats)})
      `
      return
    } catch (err) {
      console.warn("DB createNGOReport failed:", err)
    }
  }

  const reports = await kvGet<Record<string, NGOReport>>(SENTINEL_KV_KEYS.ngoReports) ?? {}
  reports[report.id] = report
  await kvSet(SENTINEL_KV_KEYS.ngoReports, reports)
}

// ─────────────────────────── Audit Log DB Ops ────────────────────

export async function dbWriteAuditLog(
  entry: Omit<AuditLogEntry, "id" | "timestamp">
): Promise<void> {
  const id = `audit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const timestamp = Date.now()

  if (isNeonConfigured()) {
    try {
      const sql = await getNeonClient()
      await sql`
        INSERT INTO sentinel_audit_logs (id, user_id, action, resource, resource_id, metadata, ip_address, success)
        VALUES (${id}, ${entry.userId}, ${entry.action as string}, ${entry.resource},
                ${entry.resourceId ?? null}, ${entry.metadata ? JSON.stringify(entry.metadata) : null},
                ${entry.ipAddress ?? null}, ${entry.success})
      `
      return
    } catch (err) {
      console.warn("DB writeAuditLog failed:", err)
    }
  }

  const logs = await kvGet<AuditLogEntry[]>(SENTINEL_KV_KEYS.auditLog) ?? []
  logs.unshift({ ...entry, id, timestamp })
  // Keep last AUDIT_LOG_KV_LIMIT entries in KV
  await kvSet(SENTINEL_KV_KEYS.auditLog, logs.slice(0, AUDIT_LOG_KV_LIMIT))
}

export async function dbGetAuditLogs(limit = 100): Promise<AuditLogEntry[]> {
  if (isNeonConfigured()) {
    try {
      const sql = await getNeonClient()
      const rows = await sql`
        SELECT id, user_id, action, resource, resource_id, metadata, ip_address, success,
               EXTRACT(EPOCH FROM timestamp)::BIGINT * 1000 AS timestamp
        FROM sentinel_audit_logs
        ORDER BY timestamp DESC LIMIT ${limit}
      ` as Array<Record<string, unknown>>
      return rows.map(rowToAuditLog)
    } catch (err) {
      console.warn("DB getAuditLogs failed:", err)
    }
  }

  const logs = await kvGet<AuditLogEntry[]>(SENTINEL_KV_KEYS.auditLog) ?? []
  return logs.slice(0, limit)
}

// ─────────────────────────── Row Mappers ─────────────────────────

function rowToUser(row: Record<string, unknown>): SentinelUser {
  return {
    id: row.id as string,
    email: row.email as string,
    fullName: row.full_name as string,
    role: row.role as SentinelUser["role"],
    organizationId: (row.organization_id as string | null) ?? undefined,
    avatarUrl: (row.avatar_url as string | null) ?? undefined,
    isActive: row.is_active as boolean,
    createdAt: Number(row.created_at) || Date.now(),
    lastLoginAt: Number(row.last_login_at) || Date.now(),
  }
}

function rowToUserSubscription(row: Record<string, unknown>): UserSubscription {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    subscriptionId: row.subscription_id as string,
    tier: row.tier as UserSubscription["tier"],
    status: row.status as UserSubscription["status"],
    assignedBy: row.assigned_by as string,
    assignedAt: Number(row.assigned_at) || Date.now(),
    expiresAt: row.expires_at ? Number(row.expires_at) : null,
    organizationId: row.organization_id as string,
    autoRenew: row.auto_renew as boolean,
  }
}

function rowToOrganization(row: Record<string, unknown>): Organization {
  return {
    id: row.id as string,
    name: row.name as string,
    subscriptionId: (row.subscription_id as string | null) ?? "",
    tier: row.tier as Organization["tier"],
    adminUserId: row.admin_user_id as string,
    memberIds: Array.isArray(row.member_ids) ? (row.member_ids as string[]) : [],
    createdAt: Number(row.created_at) || Date.now(),
    updatedAt: Number(row.updated_at) || Date.now(),
  }
}

function rowToBranding(row: Record<string, unknown>): OrganizationBranding {
  return {
    id: row.id as string,
    organizationId: row.organization_id as string,
    name: row.name as string,
    logoUrl: (row.logo_url as string | null) ?? "",
    primaryColor: (row.primary_color as string | null) ?? "#1e1b4b",
    secondaryColor: (row.secondary_color as string | null) ?? "#4f46e5",
    accentColor: (row.accent_color as string | null) ?? undefined,
    phone: (row.phone as string | null) ?? "",
    email: (row.email as string | null) ?? "",
    officeAddress: (row.office_address as string | null) ?? "",
    website: (row.website as string | null) ?? undefined,
    useCustomBranding: row.use_custom_branding as boolean,
    createdAt: Number(row.created_at) || Date.now(),
    updatedAt: Number(row.updated_at) || Date.now(),
  }
}

function rowToProject(row: Record<string, unknown>): SentinelProject {
  return {
    id: row.id as string,
    organizationId: row.organization_id as string,
    name: row.name as string,
    description: (row.description as string | null) ?? "",
    modulesEnabled: Array.isArray(row.modules_enabled)
      ? (row.modules_enabled as string[])
      : JSON.parse((row.modules_enabled as string) || "[]"),
    teamMemberIds: Array.isArray(row.team_member_ids) ? (row.team_member_ids as string[]) : [],
    createdBy: row.created_by as string,
    createdAt: Number(row.created_at) || Date.now(),
    updatedAt: Number(row.updated_at) || Date.now(),
    brandingId: (row.branding_id as string | null) ?? undefined,
    status: (row.status as SentinelProject["status"]) ?? "ACTIVE",
  }
}

function rowToModulePermission(row: Record<string, unknown>): UserModulePermission {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    organizationId: row.organization_id as string,
    moduleName: row.module_name as string,
    accessLevel: row.access_level as UserModulePermission["accessLevel"],
    grantedBy: row.granted_by as string,
    grantedAt: Number(row.granted_at) || Date.now(),
    expiresAt: row.expires_at ? Number(row.expires_at) : undefined,
  }
}

function rowToNGODocument(row: Record<string, unknown>): NGODocument {
  return {
    id: row.id as string,
    projectId: row.project_id as string,
    organizationId: row.organization_id as string,
    documentType: row.document_type as NGODocument["documentType"],
    title: row.title as string,
    fileName: row.file_name as string,
    fileUrl: row.file_url as string,
    fileType: row.file_type as NGODocument["fileType"],
    fileSizeBytes: (row.file_size_bytes as number | null) ?? undefined,
    content: (row.content as string | null) ?? undefined,
    aiProcessedData: row.ai_processed_data
      ? (typeof row.ai_processed_data === "string"
          ? JSON.parse(row.ai_processed_data)
          : row.ai_processed_data)
      : undefined,
    uploadedBy: row.uploaded_by as string,
    createdAt: Number(row.created_at) || Date.now(),
    updatedAt: Number(row.updated_at) || Date.now(),
  }
}

function rowToNGOOutput(row: Record<string, unknown>): NGOOutput {
  return {
    id: row.id as string,
    projectId: row.project_id as string,
    documentId: (row.document_id as string | null) ?? undefined,
    tabName: row.tab_name as string,
    outputType: row.output_type as NGOOutput["outputType"],
    title: row.title as string,
    generatedData: row.generated_data as string,
    exportFormats: Array.isArray(row.export_formats)
      ? (row.export_formats as NGOOutput["exportFormats"])
      : JSON.parse((row.export_formats as string) || "[]"),
    brandingConfigId: (row.branding_config_id as string | null) ?? undefined,
    createdBy: row.created_by as string,
    createdAt: Number(row.created_at) || Date.now(),
    version: (row.version as number) ?? 1,
  }
}

function rowToProjectSummary(row: Record<string, unknown>): ProjectSummary {
  return {
    id: row.id as string,
    projectId: row.project_id as string,
    organizationId: row.organization_id as string,
    title: row.title as string,
    content: row.content as string,
    objectives: row.objectives
      ? (Array.isArray(row.objectives) ? row.objectives : JSON.parse(row.objectives as string)) as string[]
      : undefined,
    targetBeneficiaries: (row.target_beneficiaries as string | null) ?? undefined,
    budgetOverview: (row.budget_overview as string | null) ?? undefined,
    timeline: (row.timeline as string | null) ?? undefined,
    impactMetrics: row.impact_metrics
      ? (Array.isArray(row.impact_metrics)
          ? row.impact_metrics
          : JSON.parse(row.impact_metrics as string)) as string[]
      : undefined,
    createdBy: row.created_by as string,
    createdAt: Number(row.created_at) || Date.now(),
    updatedAt: Number(row.updated_at) || Date.now(),
    version: (row.version as number) ?? 1,
  }
}

function rowToNGOReport(row: Record<string, unknown>): NGOReport {
  return {
    id: row.id as string,
    projectId: row.project_id as string,
    organizationId: row.organization_id as string,
    title: row.title as string,
    reportType: row.report_type as NGOReport["reportType"],
    sections: Array.isArray(row.sections)
      ? row.sections
      : JSON.parse((row.sections as string) || "[]"),
    brandingId: (row.branding_id as string | null) ?? undefined,
    generatedBy: row.generated_by as string,
    generatedAt: Number(row.generated_at) || Date.now(),
    exportedFormats: Array.isArray(row.exported_formats)
      ? row.exported_formats
      : JSON.parse((row.exported_formats as string) || "[]"),
  }
}

function rowToAuditLog(row: Record<string, unknown>): AuditLogEntry {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    action: row.action as AuditAction,
    resource: row.resource as string,
    resourceId: (row.resource_id as string | null) ?? undefined,
    metadata: row.metadata as Record<string, unknown> | undefined,
    ipAddress: (row.ip_address as string | null) ?? undefined,
    timestamp: Number(row.timestamp) || Date.now(),
    success: row.success as boolean,
  }
}
