/**
 * Backend Neon Database Client
 *
 * Server-side Neon client for the Sentinel SAAS schema.
 * Uses NEON_DATABASE_URL env var directly (no client-side secret store).
 * Provides query helpers for auth, users, subscriptions, permissions, and audit logs.
 */

import { neon } from "@neondatabase/serverless"
import crypto from "node:crypto"

// ─────────────────────────── Client Setup ────────────────────────

let _sql = null

function getSql() {
  if (_sql) return _sql
  const url = process.env.NEON_DATABASE_URL
  if (!url) {
    throw new Error(
      "NEON_DATABASE_URL not configured. Set it in environment to enable Sentinel auth."
    )
  }
  _sql = neon(url)
  return _sql
}

export function isDbConfigured() {
  return Boolean(process.env.NEON_DATABASE_URL)
}

// ─────────────────────────── Schema Bootstrap ────────────────────

/**
 * Ensure the sentinel_users table has the password_hash column.
 * This is a lightweight idempotent check — the full schema should
 * be bootstrapped via sql/neon-schema.sql or sentinel-brain.ts.
 */
export async function ensureSentinelTables() {
  if (!isDbConfigured()) return

  try {
    const sql = getSql()
    // Just verify sentinel_users table exists by selecting 1 row
    await sql`SELECT 1 FROM sentinel_users LIMIT 1`
    console.log("[db] Sentinel tables verified")
  } catch (err) {
    console.warn("[db] Sentinel tables not found — run migrations first:", err.message)
  }
}

// ─────────────────────────── User Queries ────────────────────────

/**
 * Create a new user in the sentinel_users table.
 * Used by the /api/auth/register endpoint.
 *
 * @param {object} user
 * @param {string} user.id - User UUID
 * @param {string} user.email - Email (lowercased)
 * @param {string} user.fullName - Display name
 * @param {string} user.passwordHash - Pre-hashed password
 * @param {string} [user.role] - Sentinel role (default: 'USER')
 * @param {string|null} [user.organizationId] - Org ID (null for standalone users)
 * @returns {Promise<object|null>} Created user (without passwordHash) or null on conflict
 */
export async function createUser({ id, email, fullName, passwordHash, role = "USER", organizationId = null }) {
  const sql = getSql()
  const rows = await sql`
    INSERT INTO sentinel_users (id, email, full_name, password_hash, role, organization_id, is_active)
    VALUES (${id}, ${email.toLowerCase()}, ${fullName}, ${passwordHash}, ${role}, ${organizationId}, TRUE)
    ON CONFLICT (email) DO NOTHING
    RETURNING id, email, full_name AS "fullName", role, organization_id AS "organizationId",
              is_active AS "isActive",
              EXTRACT(EPOCH FROM created_at)::BIGINT * 1000 AS "createdAt",
              EXTRACT(EPOCH FROM last_login_at)::BIGINT * 1000 AS "lastLoginAt"
  `
  return rows[0] || null
}

/**
 * Get user by email for login.
 * Returns user + password_hash for verification.
 */
export async function getUserByEmailForLogin(email) {
  const sql = getSql()
  const rows = await sql`
    SELECT id, email, full_name AS "fullName", password_hash AS "passwordHash",
           role, organization_id AS "organizationId", avatar_url AS "avatarUrl",
           is_active AS "isActive",
           EXTRACT(EPOCH FROM created_at)::BIGINT * 1000 AS "createdAt",
           EXTRACT(EPOCH FROM last_login_at)::BIGINT * 1000 AS "lastLoginAt"
    FROM sentinel_users
    WHERE email = ${email.toLowerCase()}
    LIMIT 1
  `
  return rows[0] || null
}

/**
 * Get user by ID (no password_hash).
 */
export async function getUserById(userId) {
  const sql = getSql()
  const rows = await sql`
    SELECT id, email, full_name AS "fullName",
           role, organization_id AS "organizationId", avatar_url AS "avatarUrl",
           is_active AS "isActive",
           EXTRACT(EPOCH FROM created_at)::BIGINT * 1000 AS "createdAt",
           EXTRACT(EPOCH FROM last_login_at)::BIGINT * 1000 AS "lastLoginAt"
    FROM sentinel_users
    WHERE id = ${userId} AND is_active = TRUE
    LIMIT 1
  `
  return rows[0] || null
}

/**
 * Update last_login_at for a user.
 */
export async function updateLastLogin(userId) {
  const sql = getSql()
  await sql`UPDATE sentinel_users SET last_login_at = NOW() WHERE id = ${userId}`
}

/**
 * H2 fix: Update a user's password hash.
 * Used for re-hashing legacy SHA-256 passwords to bcrypt on login.
 *
 * @param {string} userId - User ID
 * @param {string} newHash - New bcrypt password hash
 */
export async function updatePasswordHash(userId, newHash) {
  const sql = getSql()
  await sql`UPDATE sentinel_users SET password_hash = ${newHash} WHERE id = ${userId}`
}

// ─────────────────────────── Subscription Queries ────────────────

/**
 * Get the active subscription for a user.
 */
export async function getUserSubscription(userId) {
  const sql = getSql()
  const rows = await sql`
    SELECT id, user_id AS "userId", subscription_id AS "subscriptionId",
           tier, status, assigned_by AS "assignedBy",
           organization_id AS "organizationId", auto_renew AS "autoRenew",
           EXTRACT(EPOCH FROM assigned_at)::BIGINT * 1000 AS "assignedAt",
           EXTRACT(EPOCH FROM expires_at)::BIGINT * 1000 AS "expiresAt"
    FROM sentinel_user_subscriptions
    WHERE user_id = ${userId} AND status = 'ACTIVE'
    ORDER BY assigned_at DESC
    LIMIT 1
  `
  return rows[0] || null
}

// ─────────────────────────── Module Permission Queries ───────────

/**
 * Get all active module permissions for a user.
 */
export async function getUserModulePermissions(userId) {
  const sql = getSql()
  const rows = await sql`
    SELECT id, user_id AS "userId", organization_id AS "organizationId",
           module_name AS "moduleName", access_level AS "accessLevel",
           granted_by AS "grantedBy",
           EXTRACT(EPOCH FROM granted_at)::BIGINT * 1000 AS "grantedAt",
           EXTRACT(EPOCH FROM expires_at)::BIGINT * 1000 AS "expiresAt"
    FROM sentinel_module_permissions
    WHERE user_id = ${userId}
      AND (expires_at IS NULL OR expires_at > NOW())
  `
  return rows
}

/**
 * Grant or update a module permission.
 */
export async function grantModulePermission(perm) {
  const sql = getSql()
  await sql`
    INSERT INTO sentinel_module_permissions
      (id, user_id, organization_id, module_name, access_level, granted_by, expires_at)
    VALUES (${perm.id}, ${perm.userId}, ${perm.organizationId}, ${perm.moduleName},
            ${perm.accessLevel}, ${perm.grantedBy},
            ${perm.expiresAt ? new Date(perm.expiresAt).toISOString() : null})
    ON CONFLICT (user_id, organization_id, module_name)
    DO UPDATE SET access_level = EXCLUDED.access_level, expires_at = EXCLUDED.expires_at
  `
}

/**
 * Revoke a module permission.
 */
export async function revokeModulePermission(userId, organizationId, moduleName) {
  const sql = getSql()
  await sql`
    DELETE FROM sentinel_module_permissions
    WHERE user_id = ${userId}
      AND organization_id = ${organizationId}
      AND module_name = ${moduleName}
  `
}

// ─────────────────────────── Organization Queries ────────────────

/**
 * Get organization by ID.
 */
export async function getOrganization(orgId) {
  const sql = getSql()
  const rows = await sql`
    SELECT o.id, o.name, o.subscription_id AS "subscriptionId",
           o.tier, o.admin_user_id AS "adminUserId",
           EXTRACT(EPOCH FROM o.created_at)::BIGINT * 1000 AS "createdAt",
           EXTRACT(EPOCH FROM o.updated_at)::BIGINT * 1000 AS "updatedAt",
           COALESCE(
             array_agg(u.id) FILTER (WHERE u.id IS NOT NULL), '{}'
           ) AS "memberIds"
    FROM sentinel_organizations o
    LEFT JOIN sentinel_users u ON u.organization_id = o.id AND u.is_active = TRUE
    WHERE o.id = ${orgId}
    GROUP BY o.id
  `
  return rows[0] || null
}

/**
 * List users in an organization.
 */
export async function listOrgUsers(organizationId) {
  const sql = getSql()
  return sql`
    SELECT id, email, full_name AS "fullName",
           role, organization_id AS "organizationId",
           avatar_url AS "avatarUrl", is_active AS "isActive",
           EXTRACT(EPOCH FROM created_at)::BIGINT * 1000 AS "createdAt",
           EXTRACT(EPOCH FROM last_login_at)::BIGINT * 1000 AS "lastLoginAt"
    FROM sentinel_users
    WHERE organization_id = ${organizationId} AND is_active = TRUE
    ORDER BY created_at DESC
  `
}

// ─────────────────────────── Report Queries ──────────────────────

/**
 * Report SELECT column list (reused across queries).
 * Matches the new state-machine columns added in Phase 5.2 migration.
 */
const REPORT_COLUMNS = `
  id, project_id AS "projectId", organization_id AS "organizationId",
  title, report_type AS "reportType", sections, branding_id AS "brandingId",
  generated_by AS "generatedBy", status,
  submitted_by AS "submittedBy", approved_by AS "approvedBy",
  signature_hash AS "signatureHash", signed_by AS "signedBy",
  published_by AS "publishedBy", updated_by AS "updatedBy",
  exported_formats AS "exportedFormats",
  EXTRACT(EPOCH FROM generated_at)::BIGINT * 1000 AS "generatedAt",
  EXTRACT(EPOCH FROM submitted_at)::BIGINT * 1000 AS "submittedAt",
  EXTRACT(EPOCH FROM approved_at)::BIGINT * 1000 AS "approvedAt",
  EXTRACT(EPOCH FROM signed_at)::BIGINT * 1000 AS "signedAt",
  EXTRACT(EPOCH FROM published_at)::BIGINT * 1000 AS "publishedAt",
  EXTRACT(EPOCH FROM updated_at)::BIGINT * 1000 AS "updatedAt"
`

/**
 * Get a single report by ID.
 */
export async function getReportById(reportId) {
  const sql = getSql()
  const rows = await sql`
    SELECT ${sql.unsafe(REPORT_COLUMNS)}
    FROM sentinel_ngo_reports
    WHERE id = ${reportId}
    LIMIT 1
  `
  return rows[0] ? normalizeReport(rows[0]) : null
}

/**
 * List reports for a project, optionally filtered by status.
 */
export async function listReportsByProject(projectId, { status, limit = 50 } = {}) {
  const sql = getSql()
  if (status) {
    const rows = await sql`
      SELECT ${sql.unsafe(REPORT_COLUMNS)}
      FROM sentinel_ngo_reports
      WHERE project_id = ${projectId} AND status = ${status}
      ORDER BY generated_at DESC LIMIT ${limit}
    `
    return rows.map(normalizeReport)
  }
  const rows = await sql`
    SELECT ${sql.unsafe(REPORT_COLUMNS)}
    FROM sentinel_ngo_reports
    WHERE project_id = ${projectId}
    ORDER BY generated_at DESC LIMIT ${limit}
  `
  return rows.map(normalizeReport)
}

/**
 * List reports for an organization, optionally filtered by status.
 */
export async function listReportsByOrg(organizationId, { status, limit = 100 } = {}) {
  const sql = getSql()
  if (status) {
    const rows = await sql`
      SELECT ${sql.unsafe(REPORT_COLUMNS)}
      FROM sentinel_ngo_reports
      WHERE organization_id = ${organizationId} AND status = ${status}
      ORDER BY generated_at DESC LIMIT ${limit}
    `
    return rows.map(normalizeReport)
  }
  const rows = await sql`
    SELECT ${sql.unsafe(REPORT_COLUMNS)}
    FROM sentinel_ngo_reports
    WHERE organization_id = ${organizationId}
    ORDER BY generated_at DESC LIMIT ${limit}
  `
  return rows.map(normalizeReport)
}

/**
 * Create a new report in DRAFT status.
 */
export async function createReport(report) {
  const sql = getSql()
  await sql`
    INSERT INTO sentinel_ngo_reports
      (id, project_id, organization_id, title, report_type, sections,
       branding_id, generated_by, status, updated_by, exported_formats)
    VALUES (${report.id}, ${report.projectId}, ${report.organizationId},
            ${report.title}, ${report.reportType || 'CUSTOM'},
            ${JSON.stringify(report.sections || [])},
            ${report.brandingId || null}, ${report.generatedBy},
            'DRAFT', ${report.generatedBy},
            ${JSON.stringify(report.exportedFormats || [])})
  `
}

/**
 * Update report content (title, sections). Only allowed in DRAFT status.
 */
export async function updateReportContent(reportId, { title, sections, updatedBy }) {
  const sql = getSql()
  const rows = await sql`
    UPDATE sentinel_ngo_reports
    SET title = COALESCE(${title}, title),
        sections = COALESCE(${sections ? JSON.stringify(sections) : null}, sections),
        updated_by = ${updatedBy},
        updated_at = NOW()
    WHERE id = ${reportId} AND status = 'DRAFT'
    RETURNING id
  `
  return rows.length > 0
}

/**
 * Transition report from DRAFT -> SUBMITTED.
 */
export async function submitReport(reportId, submittedBy) {
  const sql = getSql()
  const rows = await sql`
    UPDATE sentinel_ngo_reports
    SET status = 'SUBMITTED',
        submitted_by = ${submittedBy},
        submitted_at = NOW(),
        updated_by = ${submittedBy},
        updated_at = NOW()
    WHERE id = ${reportId} AND status = 'DRAFT'
    RETURNING id
  `
  if (rows.length > 0) {
    await recordTransition(sql, reportId, 'DRAFT', 'SUBMITTED', submittedBy)
  }
  return rows.length > 0
}

/**
 * Transition report from SUBMITTED -> APPROVED_SIGNED.
 * Requires signature hash from the digital signature system.
 */
export async function approveAndSignReport(reportId, { approvedBy, signatureHash }) {
  const sql = getSql()
  const rows = await sql`
    UPDATE sentinel_ngo_reports
    SET status = 'APPROVED_SIGNED',
        approved_by = ${approvedBy},
        approved_at = NOW(),
        signed_by = ${approvedBy},
        signed_at = NOW(),
        signature_hash = ${signatureHash},
        updated_by = ${approvedBy},
        updated_at = NOW()
    WHERE id = ${reportId} AND status = 'SUBMITTED'
    RETURNING id
  `
  if (rows.length > 0) {
    await recordTransition(sql, reportId, 'SUBMITTED', 'APPROVED_SIGNED', approvedBy, null, signatureHash)
  }
  return rows.length > 0
}

/**
 * Transition report from APPROVED_SIGNED -> PUBLISHED.
 */
export async function publishReport(reportId, publishedBy) {
  const sql = getSql()
  const rows = await sql`
    UPDATE sentinel_ngo_reports
    SET status = 'PUBLISHED',
        published_by = ${publishedBy},
        published_at = NOW(),
        updated_by = ${publishedBy},
        updated_at = NOW()
    WHERE id = ${reportId} AND status = 'APPROVED_SIGNED'
    RETURNING id
  `
  if (rows.length > 0) {
    await recordTransition(sql, reportId, 'APPROVED_SIGNED', 'PUBLISHED', publishedBy)
  }
  return rows.length > 0
}

/**
 * Revert a SUBMITTED or APPROVED_SIGNED report back to DRAFT.
 * Clears all approval/signature data.
 */
export async function revertReport(reportId, revertedBy, comment) {
  const sql = getSql()
  // Get current status for transition log
  const current = await sql`SELECT status FROM sentinel_ngo_reports WHERE id = ${reportId}`
  const fromStatus = current[0]?.status
  if (!fromStatus || fromStatus === 'DRAFT' || fromStatus === 'PUBLISHED') {
    return false
  }

  const rows = await sql`
    UPDATE sentinel_ngo_reports
    SET status = 'DRAFT',
        submitted_by = NULL,
        submitted_at = NULL,
        approved_by = NULL,
        approved_at = NULL,
        signed_by = NULL,
        signed_at = NULL,
        signature_hash = NULL,
        published_by = NULL,
        published_at = NULL,
        updated_by = ${revertedBy},
        updated_at = NOW()
    WHERE id = ${reportId} AND status IN ('SUBMITTED', 'APPROVED_SIGNED')
    RETURNING id
  `
  if (rows.length > 0) {
    await recordTransition(sql, reportId, fromStatus, 'DRAFT', revertedBy, comment)
  }
  return rows.length > 0
}

/**
 * Delete a report. Only allowed if not PUBLISHED.
 */
export async function deleteReport(reportId) {
  const sql = getSql()
  const rows = await sql`
    DELETE FROM sentinel_ngo_reports
    WHERE id = ${reportId} AND status != 'PUBLISHED'
    RETURNING id
  `
  return rows.length > 0
}

/**
 * Get the state transition history for a report.
 */
export async function getReportTransitions(reportId) {
  const sql = getSql()
  return sql`
    SELECT id, report_id AS "reportId", from_status AS "fromStatus",
           to_status AS "toStatus", transitioned_by AS "transitionedBy",
           comment, signature_hash AS "signatureHash",
           EXTRACT(EPOCH FROM timestamp)::BIGINT * 1000 AS "timestamp"
    FROM report_state_transitions
    WHERE report_id = ${reportId}
    ORDER BY timestamp ASC
  `
}

/** Internal: record a state transition */
async function recordTransition(sql, reportId, fromStatus, toStatus, userId, comment, signatureHash) {
  const id = `rst_${crypto.randomUUID()}`
  await sql`
    INSERT INTO report_state_transitions
      (id, report_id, from_status, to_status, transitioned_by, comment, signature_hash)
    VALUES (${id}, ${reportId}, ${fromStatus}, ${toStatus}, ${userId},
            ${comment || null}, ${signatureHash || null})
  `
}

/** Normalize a report row (parse JSON columns) */
function normalizeReport(row) {
  return {
    ...row,
    sections: typeof row.sections === "string" ? JSON.parse(row.sections) : (row.sections || []),
    exportedFormats: typeof row.exportedFormats === "string"
      ? JSON.parse(row.exportedFormats)
      : (row.exportedFormats || []),
    generatedAt: Number(row.generatedAt) || null,
    submittedAt: row.submittedAt ? Number(row.submittedAt) : null,
    approvedAt: row.approvedAt ? Number(row.approvedAt) : null,
    signedAt: row.signedAt ? Number(row.signedAt) : null,
    publishedAt: row.publishedAt ? Number(row.publishedAt) : null,
    updatedAt: row.updatedAt ? Number(row.updatedAt) : null,
  }
}

// ─────────────────────────── Audit Log ───────────────────────────

/**
 * Write an audit log entry.
 */
export async function writeAuditLog(entry) {
  const sql = getSql()
  const id = `audit_${crypto.randomUUID()}`
  await sql`
    INSERT INTO sentinel_audit_logs
      (id, user_id, action, resource, resource_id, metadata, ip_address, success)
    VALUES (${id}, ${entry.userId}, ${entry.action}, ${entry.resource},
            ${entry.resourceId || null},
            ${entry.metadata ? JSON.stringify(entry.metadata) : null},
            ${entry.ipAddress || null}, ${entry.success ?? true})
  `
  return id
}

/**
 * Get recent audit logs (optionally filtered by user or action).
 * Kept for backward compatibility — delegates to getAuditLogsAdvanced.
 */
export async function getAuditLogs({ userId, action, limit = 100 } = {}) {
  return getAuditLogsAdvanced({ userId, action, limit })
}

const AUDIT_COLUMNS = `
  id, user_id AS "userId", action, resource,
  resource_id AS "resourceId", metadata, ip_address AS "ipAddress",
  success, EXTRACT(EPOCH FROM timestamp)::BIGINT * 1000 AS "timestamp"
`

/**
 * Advanced audit log query with full filtering, pagination, and date range.
 *
 * @param {object} opts
 * @param {string}  [opts.userId]     - Filter by acting user
 * @param {string}  [opts.action]     - Filter by action type (e.g. "LOGIN", "CREATE")
 * @param {string}  [opts.resource]   - Filter by resource type (e.g. "ngo-report", "module-permission")
 * @param {string}  [opts.resourceId] - Filter by specific resource ID
 * @param {boolean} [opts.success]    - Filter by success/failure
 * @param {number}  [opts.fromTs]     - Start of date range (epoch ms)
 * @param {number}  [opts.toTs]       - End of date range (epoch ms)
 * @param {number}  [opts.limit]      - Max rows (default 100, max 500)
 * @param {number}  [opts.offset]     - Offset for pagination (default 0)
 * @returns {Promise<{ logs: Array, total: number }>}
 */
export async function getAuditLogsAdvanced({
  userId, action, resource, resourceId, success,
  fromTs, toTs, limit = 100, offset = 0,
} = {}) {
  const sql = getSql()
  const conditions = []
  const params = []
  let paramIdx = 1

  if (userId) {
    conditions.push(`user_id = $${paramIdx++}`)
    params.push(userId)
  }
  if (action) {
    conditions.push(`action = $${paramIdx++}`)
    params.push(action)
  }
  if (resource) {
    conditions.push(`resource = $${paramIdx++}`)
    params.push(resource)
  }
  if (resourceId) {
    conditions.push(`resource_id = $${paramIdx++}`)
    params.push(resourceId)
  }
  if (success !== undefined) {
    conditions.push(`success = $${paramIdx++}`)
    params.push(success)
  }
  if (fromTs) {
    conditions.push(`timestamp >= to_timestamp($${paramIdx++}::DOUBLE PRECISION / 1000)`)
    params.push(fromTs)
  }
  if (toTs) {
    conditions.push(`timestamp <= to_timestamp($${paramIdx++}::DOUBLE PRECISION / 1000)`)
    params.push(toTs)
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : ""
  const safeLimit = Math.min(Math.max(limit, 1), 500)
  const safeOffset = Math.max(offset, 0)

  // Count total matching rows (for pagination)
  const countQuery = `SELECT COUNT(*)::INTEGER AS total FROM sentinel_audit_logs ${whereClause}`
  const countResult = await sql.unsafe(countQuery, params)
  const total = countResult[0]?.total || 0

  // Fetch page
  const dataQuery = `
    SELECT ${AUDIT_COLUMNS}
    FROM sentinel_audit_logs
    ${whereClause}
    ORDER BY timestamp DESC
    LIMIT $${paramIdx++} OFFSET $${paramIdx++}
  `
  const logs = await sql.unsafe(dataQuery, [...params, safeLimit, safeOffset])

  return { logs: logs.map(normalizeAuditLog), total }
}

/**
 * Get audit log aggregation stats.
 * Returns counts by action, resource, and time buckets.
 *
 * @param {object} opts
 * @param {number} [opts.fromTs] - Start epoch ms (default: 30 days ago)
 * @param {number} [opts.toTs]   - End epoch ms (default: now)
 * @param {string} [opts.userId] - Optionally scope to a single user
 * @returns {Promise<object>} { byAction, byResource, byDay, totalEvents, failedEvents }
 */
export async function getAuditStats({ fromTs, toTs, userId } = {}) {
  const sql = getSql()
  const defaultFrom = Date.now() - 30 * 24 * 60 * 60 * 1000
  const from = fromTs || defaultFrom
  const to = toTs || Date.now()

  // Build parameterized user filter (NEVER interpolate userId into SQL strings)
  const userFilterClause = userId ? "AND user_id = $3" : ""
  const baseParams = userId ? [from, to, userId] : [from, to]

  // Counts by action
  const byAction = await sql.unsafe(`
    SELECT action, COUNT(*)::INTEGER AS count
    FROM sentinel_audit_logs
    WHERE timestamp >= to_timestamp($1::DOUBLE PRECISION / 1000)
      AND timestamp <= to_timestamp($2::DOUBLE PRECISION / 1000)
      ${userFilterClause}
    GROUP BY action
    ORDER BY count DESC
  `, baseParams)

  // Counts by resource
  const byResource = await sql.unsafe(`
    SELECT resource, COUNT(*)::INTEGER AS count
    FROM sentinel_audit_logs
    WHERE timestamp >= to_timestamp($1::DOUBLE PRECISION / 1000)
      AND timestamp <= to_timestamp($2::DOUBLE PRECISION / 1000)
      ${userFilterClause}
    GROUP BY resource
    ORDER BY count DESC
  `, baseParams)

  // Counts by day (for timeline chart)
  const byDay = await sql.unsafe(`
    SELECT DATE(timestamp) AS day, COUNT(*)::INTEGER AS count
    FROM sentinel_audit_logs
    WHERE timestamp >= to_timestamp($1::DOUBLE PRECISION / 1000)
      AND timestamp <= to_timestamp($2::DOUBLE PRECISION / 1000)
      ${userFilterClause}
    GROUP BY DATE(timestamp)
    ORDER BY day ASC
  `, baseParams)

  // Total + failed counts
  const totals = await sql.unsafe(`
    SELECT
      COUNT(*)::INTEGER AS "totalEvents",
      COUNT(*) FILTER (WHERE success = false)::INTEGER AS "failedEvents"
    FROM sentinel_audit_logs
    WHERE timestamp >= to_timestamp($1::DOUBLE PRECISION / 1000)
      AND timestamp <= to_timestamp($2::DOUBLE PRECISION / 1000)
      ${userFilterClause}
  `, baseParams)

  return {
    byAction,
    byResource,
    byDay: byDay.map(r => ({ day: r.day, count: r.count })),
    totalEvents: totals[0]?.totalEvents || 0,
    failedEvents: totals[0]?.failedEvents || 0,
  }
}

/**
 * Get admin system overview stats.
 * Returns counts of users, orgs, subscriptions, reports, and module subscriptions.
 */
export async function getSystemStats() {
  const sql = getSql()

  const [users, orgs, subs, reports, modSubs, recentLogins] = await Promise.all([
    sql`SELECT COUNT(*)::INTEGER AS total,
               COUNT(*) FILTER (WHERE is_active = true)::INTEGER AS active
        FROM sentinel_users`,
    sql`SELECT COUNT(*)::INTEGER AS total FROM sentinel_organizations`,
    sql`SELECT
          COUNT(*)::INTEGER AS total,
          COUNT(*) FILTER (WHERE status = 'ACTIVE')::INTEGER AS active,
          COUNT(*) FILTER (WHERE status = 'EXPIRED')::INTEGER AS expired
        FROM sentinel_user_subscriptions`,
    sql`SELECT
          COUNT(*)::INTEGER AS total,
          COUNT(*) FILTER (WHERE status = 'DRAFT')::INTEGER AS drafts,
          COUNT(*) FILTER (WHERE status = 'SUBMITTED')::INTEGER AS submitted,
          COUNT(*) FILTER (WHERE status = 'APPROVED_SIGNED')::INTEGER AS "approvedSigned",
          COUNT(*) FILTER (WHERE status = 'PUBLISHED')::INTEGER AS published
        FROM sentinel_ngo_reports`,
    sql`SELECT
          COUNT(*)::INTEGER AS total,
          COUNT(*) FILTER (WHERE status = 'ACTIVE')::INTEGER AS active,
          COUNT(*) FILTER (WHERE status = 'TRIAL')::INTEGER AS trial,
          COUNT(*) FILTER (WHERE status = 'EXPIRED')::INTEGER AS expired,
          COUNT(*) FILTER (WHERE status = 'CANCELLED')::INTEGER AS cancelled
        FROM sentinel_org_module_subscriptions`,
    sql`SELECT COUNT(*)::INTEGER AS count
        FROM sentinel_audit_logs
        WHERE action = 'LOGIN'
          AND timestamp > NOW() - INTERVAL '7 days'`,
  ])

  return {
    users: { total: users[0]?.total || 0, active: users[0]?.active || 0 },
    organizations: { total: orgs[0]?.total || 0 },
    subscriptions: {
      total: subs[0]?.total || 0,
      active: subs[0]?.active || 0,
      expired: subs[0]?.expired || 0,
    },
    reports: {
      total: reports[0]?.total || 0,
      drafts: reports[0]?.drafts || 0,
      submitted: reports[0]?.submitted || 0,
      approvedSigned: reports[0]?.approvedSigned || 0,
      published: reports[0]?.published || 0,
    },
    moduleSubscriptions: {
      total: modSubs[0]?.total || 0,
      active: modSubs[0]?.active || 0,
      trial: modSubs[0]?.trial || 0,
      expired: modSubs[0]?.expired || 0,
      cancelled: modSubs[0]?.cancelled || 0,
    },
    recentLogins7d: recentLogins[0]?.count || 0,
  }
}

/** Normalize an audit log row */
function normalizeAuditLog(row) {
  return {
    ...row,
    metadata: typeof row.metadata === "string" ? JSON.parse(row.metadata) : (row.metadata || null),
    timestamp: Number(row.timestamp) || 0,
  }
}

// ────────────────────── Org Module Subscriptions (Phase 3) ───────

const ORG_MOD_SUB_COLUMNS = `
  id, organization_id AS "organizationId", module_name AS "moduleName",
  tier, status, max_seats AS "maxSeats",
  EXTRACT(EPOCH FROM starts_at)::BIGINT * 1000 AS "startsAt",
  CASE WHEN expires_at IS NOT NULL
       THEN EXTRACT(EPOCH FROM expires_at)::BIGINT * 1000
       ELSE NULL END AS "expiresAt",
  auto_renew AS "autoRenew",
  grace_period_days AS "gracePeriodDays",
  provisioned_by AS "provisionedBy",
  EXTRACT(EPOCH FROM provisioned_at)::BIGINT * 1000 AS "provisionedAt",
  CASE WHEN cancelled_at IS NOT NULL
       THEN EXTRACT(EPOCH FROM cancelled_at)::BIGINT * 1000
       ELSE NULL END AS "cancelledAt",
  cancelled_by AS "cancelledBy",
  metadata,
  EXTRACT(EPOCH FROM created_at)::BIGINT * 1000 AS "createdAt",
  EXTRACT(EPOCH FROM updated_at)::BIGINT * 1000 AS "updatedAt"
`

/**
 * Get a single org module subscription by org + module.
 * Returns null if not found.
 */
export async function getOrgModuleSubscription(orgId, moduleName) {
  const sql = getSql()
  const rows = await sql.unsafe(
    `SELECT ${ORG_MOD_SUB_COLUMNS}
     FROM sentinel_org_module_subscriptions
     WHERE organization_id = $1 AND module_name = $2
     LIMIT 1`,
    [orgId, moduleName]
  )
  return rows.length > 0 ? normalizeOrgModSub(rows[0]) : null
}

/**
 * List all module subscriptions for an org.
 * Optionally filter by status.
 */
export async function listOrgModuleSubscriptions(orgId, { status } = {}) {
  const sql = getSql()
  let rows
  if (status) {
    rows = await sql.unsafe(
      `SELECT ${ORG_MOD_SUB_COLUMNS}
       FROM sentinel_org_module_subscriptions
       WHERE organization_id = $1 AND status = $2
       ORDER BY module_name`,
      [orgId, status]
    )
  } else {
    rows = await sql.unsafe(
      `SELECT ${ORG_MOD_SUB_COLUMNS}
       FROM sentinel_org_module_subscriptions
       WHERE organization_id = $1
       ORDER BY module_name`,
      [orgId]
    )
  }
  return rows.map(normalizeOrgModSub)
}

/**
 * Create (provision) a new org module subscription.
 * Upserts: if the org already has a row for this module, it is updated.
 */
export async function createOrgModuleSubscription({
  organizationId, moduleName, tier = "BASIC", maxSeats = 1,
  expiresAt = null, autoRenew = false, gracePeriodDays = 7,
  provisionedBy, status = "ACTIVE", metadata = {}
}) {
  const sql = getSql()
  const id = `omsub_${crypto.randomUUID()}`
  const expiresTimestamp = expiresAt ? new Date(expiresAt).toISOString() : null
  const rows = await sql`
    INSERT INTO sentinel_org_module_subscriptions
      (id, organization_id, module_name, tier, status, max_seats,
       expires_at, auto_renew, grace_period_days, provisioned_by, metadata)
    VALUES (${id}, ${organizationId}, ${moduleName}, ${tier}, ${status},
            ${maxSeats}, ${expiresTimestamp}::TIMESTAMPTZ, ${autoRenew},
            ${gracePeriodDays}, ${provisionedBy}, ${JSON.stringify(metadata)})
    ON CONFLICT (organization_id, module_name) DO UPDATE SET
      tier = EXCLUDED.tier,
      status = EXCLUDED.status,
      max_seats = EXCLUDED.max_seats,
      expires_at = EXCLUDED.expires_at,
      auto_renew = EXCLUDED.auto_renew,
      grace_period_days = EXCLUDED.grace_period_days,
      provisioned_by = EXCLUDED.provisioned_by,
      metadata = EXCLUDED.metadata,
      updated_at = NOW()
    RETURNING id
  `
  return rows[0]?.id || id
}

/**
 * Update an existing org module subscription.
 * Accepts partial updates: tier, maxSeats, status, expiresAt, autoRenew, gracePeriodDays, metadata.
 */
export async function updateOrgModuleSubscription(orgId, moduleName, updates) {
  const sql = getSql()
  // Build SET clauses dynamically
  const setClauses = []
  const params = []
  let paramIdx = 1

  if (updates.tier !== undefined) {
    setClauses.push(`tier = $${paramIdx++}`)
    params.push(updates.tier)
  }
  if (updates.maxSeats !== undefined) {
    setClauses.push(`max_seats = $${paramIdx++}`)
    params.push(updates.maxSeats)
  }
  if (updates.status !== undefined) {
    setClauses.push(`status = $${paramIdx++}`)
    params.push(updates.status)
  }
  if (updates.expiresAt !== undefined) {
    setClauses.push(`expires_at = $${paramIdx++}::TIMESTAMPTZ`)
    params.push(updates.expiresAt ? new Date(updates.expiresAt).toISOString() : null)
  }
  if (updates.autoRenew !== undefined) {
    setClauses.push(`auto_renew = $${paramIdx++}`)
    params.push(updates.autoRenew)
  }
  if (updates.gracePeriodDays !== undefined) {
    setClauses.push(`grace_period_days = $${paramIdx++}`)
    params.push(updates.gracePeriodDays)
  }
  if (updates.metadata !== undefined) {
    setClauses.push(`metadata = $${paramIdx++}`)
    params.push(JSON.stringify(updates.metadata))
  }

  if (setClauses.length === 0) return false

  setClauses.push("updated_at = NOW()")
  params.push(orgId, moduleName)

  const query = `
    UPDATE sentinel_org_module_subscriptions
    SET ${setClauses.join(", ")}
    WHERE organization_id = $${paramIdx++} AND module_name = $${paramIdx++}
    RETURNING id
  `
  const rows = await sql.unsafe(query, params)
  return rows.length > 0
}

/**
 * Cancel an org module subscription.
 * Sets status to CANCELLED and records who/when.
 */
export async function cancelOrgModuleSubscription(orgId, moduleName, cancelledBy) {
  const sql = getSql()
  const rows = await sql`
    UPDATE sentinel_org_module_subscriptions
    SET status = 'CANCELLED',
        cancelled_at = NOW(),
        cancelled_by = ${cancelledBy},
        updated_at = NOW()
    WHERE organization_id = ${orgId}
      AND module_name = ${moduleName}
      AND status NOT IN ('CANCELLED')
    RETURNING id
  `
  return rows.length > 0
}

/**
 * Count active seats for an org+module.
 * "Seats used" = number of active (non-expired) module_permissions rows for this org+module.
 */
export async function countModuleSeats(orgId, moduleName) {
  const sql = getSql()
  const rows = await sql`
    SELECT COUNT(*)::INTEGER AS "usedSeats"
    FROM sentinel_module_permissions
    WHERE organization_id = ${orgId}
      AND module_name = ${moduleName}
      AND (expires_at IS NULL OR expires_at > NOW())
  `
  return rows[0]?.usedSeats || 0
}

/**
 * Check if seats are available for granting a new module permission.
 * Returns { available: boolean, usedSeats, maxSeats, subscription? }.
 */
export async function checkModuleSeatsAvailable(orgId, moduleName) {
  const sub = await getOrgModuleSubscription(orgId, moduleName)
  if (!sub) {
    return { available: false, usedSeats: 0, maxSeats: 0, reason: "No module subscription found" }
  }
  const activeStatuses = ["ACTIVE", "TRIAL", "GRACE_PERIOD"]
  if (!activeStatuses.includes(sub.status)) {
    return { available: false, usedSeats: 0, maxSeats: sub.maxSeats, reason: `Subscription status is ${sub.status}` }
  }
  // Check expiry (if not in grace period handling — the status already covers this)
  if (sub.expiresAt && sub.status !== "GRACE_PERIOD") {
    const now = Date.now()
    if (now > sub.expiresAt) {
      return { available: false, usedSeats: 0, maxSeats: sub.maxSeats, reason: "Subscription has expired" }
  }
}
  const usedSeats = await countModuleSeats(orgId, moduleName)
  return {
    available: usedSeats < sub.maxSeats,
    usedSeats,
    maxSeats: sub.maxSeats,
    subscription: sub,
  }
}

/**
 * Get subscriptions expiring within N days. Used for renewal notifications.
 */
export async function getExpiringSubscriptions(withinDays = 30) {
  const sql = getSql()
  const rows = await sql.unsafe(
    `SELECT ${ORG_MOD_SUB_COLUMNS}
     FROM sentinel_org_module_subscriptions
     WHERE status IN ('ACTIVE', 'TRIAL')
       AND expires_at IS NOT NULL
       AND expires_at <= NOW() + INTERVAL '1 day' * $1
       AND expires_at > NOW()
     ORDER BY expires_at ASC`,
    [withinDays]
  )
  return rows.map(normalizeOrgModSub)
}

/**
 * Transition expired subscriptions to GRACE_PERIOD or EXPIRED.
 * Call this periodically (cron / startup).
 * Returns count of rows transitioned.
 */
export async function processExpiredSubscriptions() {
  const sql = getSql()

  // Active/Trial -> GRACE_PERIOD (past expires_at but within grace)
  const toGrace = await sql`
    UPDATE sentinel_org_module_subscriptions
    SET status = 'GRACE_PERIOD', updated_at = NOW()
    WHERE status IN ('ACTIVE', 'TRIAL')
      AND expires_at IS NOT NULL
      AND expires_at < NOW()
      AND expires_at + (grace_period_days || ' days')::INTERVAL > NOW()
    RETURNING id
  `

  // GRACE_PERIOD -> EXPIRED (past grace period)
  const toExpired = await sql`
    UPDATE sentinel_org_module_subscriptions
    SET status = 'EXPIRED', updated_at = NOW()
    WHERE status = 'GRACE_PERIOD'
      AND expires_at IS NOT NULL
      AND expires_at + (grace_period_days || ' days')::INTERVAL <= NOW()
    RETURNING id
  `

  return { graced: toGrace.length, expired: toExpired.length }
}

/** Normalize an org module subscription row */
function normalizeOrgModSub(row) {
  return {
    ...row,
    metadata: typeof row.metadata === "string" ? JSON.parse(row.metadata) : (row.metadata || {}),
    startsAt: Number(row.startsAt) || null,
    expiresAt: row.expiresAt ? Number(row.expiresAt) : null,
    provisionedAt: Number(row.provisionedAt) || null,
    cancelledAt: row.cancelledAt ? Number(row.cancelledAt) : null,
    createdAt: Number(row.createdAt) || null,
    updatedAt: Number(row.updatedAt) || null,
    maxSeats: Number(row.maxSeats) || 1,
    gracePeriodDays: Number(row.gracePeriodDays) || 7,
  }
}

// ─────────────────────────── Proxy Query Execution ────────────────

/**
 * C4/C5 fix: Execute a parameterized SQL query through the backend.
 * Used by the frontend proxy endpoint to route DB queries through
 * the backend instead of direct browser-to-database connections.
 *
 * @param {string} query - The SQL query with $1, $2, etc. placeholders
 * @param {Array} params - Array of parameter values
 * @returns {Promise<Array>} Query result rows
 */
export async function executeProxyQuery(query, params = []) {
  const sql = getSql()
  // The frontend passes a Postgres parameterized string: "SELECT * FROM t WHERE id = $1"
  // Neon's tagged template literal function no longer accepts (string, array) directly.
  // We can use the exposed `.query` method (or cast it).
  // Error message said: "For a conventional function call with value placeholders ($1, $2, etc.), use sql.query(...)"
  
  if (typeof sql.query === 'function') {
    return await sql.query(query, params)
  } else {
    // If not available, we have to fake the template strings array
    // Since it's parameterized with $1, $2, this is hacky. But `sql.query` should exist.
    // As a fallback, we just call it as tagged template with single string.
    return await sql([query], ...params)
  }
}
