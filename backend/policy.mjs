/**
 * Centralized Permission Policy Map
 *
 * Single source of truth for all authorization decisions.
 * Pure functions — no DB calls, no side effects.
 * Used by backend middleware to enforce access rules.
 *
 * Role hierarchy (highest → lowest):
 *   SENTINEL_COMMANDER > ORG_ADMIN > TEAM_ADMIN > TEAM_MEMBER > USER
 *
 * Module access levels:
 *   FULL > READ_WRITE > READ
 */

// ─────────────────────────── Role Hierarchy ──────────────────────

const ROLE_RANK = {
  SENTINEL_COMMANDER: 100,
  ORG_ADMIN: 80,
  TEAM_ADMIN: 60,
  TEAM_MEMBER: 40,
  TESTER: 30,
  USER: 20,
}

const ACCESS_RANK = {
  FULL: 30,
  READ_WRITE: 20,
  READ: 10,
}

// ─────────────────────────── Module Definitions ──────────────────

export const MODULES = {
  STRATEGY_GENERATION: "strategy-generation",
  PLAGIARISM_CHECKER: "plagiarism-checker",
  ANALYTICS: "analytics",
  NGO_SAAS: "ngo-saas",
  ADMIN_PORTAL: "admin-portal",
  TEAM_MANAGEMENT: "team-management",
  RAG_CHAT: "rag-chat",
  HUMANIZER: "humanizer",
}

// ─────────────────────────── Tier → Module Access ────────────────

export const TIER_MODULES = {
  BASIC: [MODULES.STRATEGY_GENERATION, MODULES.ANALYTICS, MODULES.HUMANIZER],
  PRO: [
    MODULES.STRATEGY_GENERATION,
    MODULES.PLAGIARISM_CHECKER,
    MODULES.ANALYTICS,
    MODULES.HUMANIZER,
    MODULES.RAG_CHAT,
  ],
  TEAMS: [
    MODULES.STRATEGY_GENERATION,
    MODULES.PLAGIARISM_CHECKER,
    MODULES.ANALYTICS,
    MODULES.TEAM_MANAGEMENT,
    MODULES.HUMANIZER,
    MODULES.RAG_CHAT,
  ],
  ENTERPRISE: [
    MODULES.STRATEGY_GENERATION,
    MODULES.PLAGIARISM_CHECKER,
    MODULES.ANALYTICS,
    MODULES.TEAM_MANAGEMENT,
    MODULES.NGO_SAAS,
    MODULES.HUMANIZER,
    MODULES.RAG_CHAT,
  ],
}

// Modules that require explicit permission grant beyond tier access
const EXPLICIT_GRANT_MODULES = new Set([MODULES.NGO_SAAS])

// ─────────────────────────── Action Definitions ──────────────────

/**
 * Actions organized by resource domain.
 * Format: "resource:action"
 */
export const ACTIONS = {
  // Reports
  REPORT_CREATE: "report:create",
  REPORT_READ: "report:read",
  REPORT_UPDATE: "report:update",
  REPORT_DELETE: "report:delete",
  REPORT_SUBMIT: "report:submit",
  REPORT_APPROVE: "report:approve",
  REPORT_SIGN: "report:sign",
  REPORT_PUBLISH: "report:publish",
  REPORT_REVERT: "report:revert",

  // AI Generation
  AI_GENERATE: "ai:generate",
  AI_HUMANIZE: "ai:humanize",
  AI_RAG_QUERY: "ai:rag-query",

  // Team Management
  TEAM_ADD_MEMBER: "team:add-member",
  TEAM_REMOVE_MEMBER: "team:remove-member",
  TEAM_UPDATE_ROLE: "team:update-role",
  TEAM_VIEW_MEMBERS: "team:view-members",

  // Module Permissions
  MODULE_GRANT_ACCESS: "module:grant-access",
  MODULE_REVOKE_ACCESS: "module:revoke-access",

  // Organization
  ORG_UPDATE: "org:update",
  ORG_VIEW: "org:view",
  ORG_UPDATE_BRANDING: "org:update-branding",

  // Subscription
  SUB_VIEW: "subscription:view",
  SUB_MANAGE: "subscription:manage",
  SUB_ASSIGN: "subscription:assign",

  // Audit
  AUDIT_VIEW: "audit:view",
  AUDIT_EXPORT: "audit:export",

  // Admin
  ADMIN_USERS: "admin:users",
  ADMIN_SYSTEM: "admin:system",
}

// ─────────────────────────── Role → Action Matrix ────────────────

/**
 * Maps each role to the set of actions it is allowed to perform.
 * Higher roles inherit all permissions of lower roles.
 */
const ROLE_ACTIONS = {
  TESTER: new Set([
    ACTIONS.REPORT_READ,
    ACTIONS.AI_GENERATE,
    ACTIONS.AI_HUMANIZE,
    ACTIONS.AI_RAG_QUERY,
    ACTIONS.ORG_VIEW,
    ACTIONS.SUB_VIEW,
  ]),

  USER: new Set([
    ACTIONS.REPORT_READ,
    ACTIONS.AI_GENERATE,
    ACTIONS.AI_HUMANIZE,
    ACTIONS.AI_RAG_QUERY,
    ACTIONS.ORG_VIEW,
    ACTIONS.SUB_VIEW,
  ]),

  TEAM_MEMBER: new Set([
    ACTIONS.REPORT_CREATE,
    ACTIONS.REPORT_READ,
    ACTIONS.REPORT_UPDATE,
    ACTIONS.REPORT_SUBMIT,
    ACTIONS.AI_GENERATE,
    ACTIONS.AI_HUMANIZE,
    ACTIONS.AI_RAG_QUERY,
    ACTIONS.TEAM_VIEW_MEMBERS,
    ACTIONS.ORG_VIEW,
    ACTIONS.SUB_VIEW,
  ]),

  TEAM_ADMIN: new Set([
    ACTIONS.REPORT_CREATE,
    ACTIONS.REPORT_READ,
    ACTIONS.REPORT_UPDATE,
    ACTIONS.REPORT_DELETE,
    ACTIONS.REPORT_SUBMIT,
    ACTIONS.REPORT_APPROVE,
    ACTIONS.REPORT_SIGN,
    ACTIONS.REPORT_PUBLISH,
    ACTIONS.REPORT_REVERT,
    ACTIONS.AI_GENERATE,
    ACTIONS.AI_HUMANIZE,
    ACTIONS.AI_RAG_QUERY,
    ACTIONS.TEAM_ADD_MEMBER,
    ACTIONS.TEAM_REMOVE_MEMBER,
    ACTIONS.TEAM_UPDATE_ROLE,
    ACTIONS.TEAM_VIEW_MEMBERS,
    ACTIONS.ORG_VIEW,
    ACTIONS.SUB_VIEW,
    ACTIONS.AUDIT_VIEW,
  ]),

  ORG_ADMIN: new Set([
    ACTIONS.REPORT_CREATE,
    ACTIONS.REPORT_READ,
    ACTIONS.REPORT_UPDATE,
    ACTIONS.REPORT_DELETE,
    ACTIONS.REPORT_SUBMIT,
    ACTIONS.REPORT_APPROVE,
    ACTIONS.REPORT_SIGN,
    ACTIONS.REPORT_PUBLISH,
    ACTIONS.REPORT_REVERT,
    ACTIONS.AI_GENERATE,
    ACTIONS.AI_HUMANIZE,
    ACTIONS.AI_RAG_QUERY,
    ACTIONS.TEAM_ADD_MEMBER,
    ACTIONS.TEAM_REMOVE_MEMBER,
    ACTIONS.TEAM_UPDATE_ROLE,
    ACTIONS.TEAM_VIEW_MEMBERS,
    ACTIONS.MODULE_GRANT_ACCESS,
    ACTIONS.MODULE_REVOKE_ACCESS,
    ACTIONS.ORG_UPDATE,
    ACTIONS.ORG_VIEW,
    ACTIONS.ORG_UPDATE_BRANDING,
    ACTIONS.SUB_VIEW,
    ACTIONS.SUB_MANAGE,
    ACTIONS.AUDIT_VIEW,
    ACTIONS.AUDIT_EXPORT,
  ]),

  SENTINEL_COMMANDER: new Set([
    // All actions
    ...Object.values(ACTIONS),
  ]),
}

// ─────────────────────────── Policy Check Functions ──────────────

/**
 * Check if a role has permission to perform an action.
 * @param {string} role - User's sentinel role
 * @param {string} action - Action from ACTIONS constant
 * @returns {boolean}
 */
export function canPerformAction(role, action) {
  if (!role || !action) return false

  // SENTINEL_COMMANDER can do everything
  if (role === "SENTINEL_COMMANDER") return true

  const allowed = ROLE_ACTIONS[role]
  return allowed ? allowed.has(action) : false
}

/**
 * Check if a role meets or exceeds the minimum required role.
 * @param {string} userRole - User's current role
 * @param {string} requiredRole - Minimum required role
 * @returns {boolean}
 */
export function hasMinimumRole(userRole, requiredRole) {
  const userRank = ROLE_RANK[userRole] || 0
  const requiredRank = ROLE_RANK[requiredRole] || 0
  return userRank >= requiredRank
}

/**
 * Check if a subscription tier includes access to a module.
 * @param {string} tier - Subscription tier (BASIC, PRO, TEAMS, ENTERPRISE)
 * @param {string} moduleName - Module name from MODULES constant
 * @returns {boolean}
 */
export function tierIncludesModule(tier, moduleName) {
  const modules = TIER_MODULES[tier]
  return modules ? modules.includes(moduleName) : false
}

/**
 * Check if a module requires an explicit permission grant beyond tier access.
 * @param {string} moduleName - Module name
 * @returns {boolean}
 */
export function requiresExplicitGrant(moduleName) {
  return EXPLICIT_GRANT_MODULES.has(moduleName)
}

/**
 * Get the minimum subscription tier required for a module.
 * @param {string} moduleName - Module name
 * @returns {string|null} Tier name or null if not found
 */
export function getMinimumTierForModule(moduleName) {
  const tiers = ["BASIC", "PRO", "TEAMS", "ENTERPRISE"]
  for (const tier of tiers) {
    if (TIER_MODULES[tier].includes(moduleName)) return tier
  }
  return null
}

/**
 * Check if an access level meets or exceeds the required level.
 * @param {string} userLevel - User's access level (READ, READ_WRITE, FULL)
 * @param {string} requiredLevel - Required access level
 * @returns {boolean}
 */
export function hasMinimumAccess(userLevel, requiredLevel) {
  const userRank = ACCESS_RANK[userLevel] || 0
  const requiredRank = ACCESS_RANK[requiredLevel] || 0
  return userRank >= requiredRank
}

// ─────────────────────────── Org Module Subscription Statuses ────

/** Statuses considered "usable" for module access */
const ACTIVE_SUB_STATUSES = new Set(["ACTIVE", "TRIAL", "GRACE_PERIOD"])

// ─────────────────────────── Composite Checks ────────────────────

/**
 * Full module access check: tier + explicit grant + org subscription + role.
 *
 * The `orgModuleSubscription` parameter is OPTIONAL for backward compatibility.
 * When provided, it is the authoritative gate: if the org's subscription for
 * this module is expired/cancelled/suspended, access is denied regardless of
 * tier or explicit grants.
 *
 * @param {object} params
 * @param {string} params.role - User's sentinel role
 * @param {string} params.tier - User's subscription tier
 * @param {string} params.moduleName - Target module
 * @param {Array<{moduleName: string, expiresAt?: number}>} [params.modulePermissions] - Explicit grants
 * @param {object} [params.orgModuleSubscription] - Org-level module subscription (from DB)
 * @param {string} [params.orgModuleSubscription.status] - ACTIVE | TRIAL | GRACE_PERIOD | EXPIRED | CANCELLED | SUSPENDED
 * @param {number} [params.orgModuleSubscription.expiresAt] - Epoch ms, null = no expiry
 * @param {number} [params.orgModuleSubscription.maxSeats]
 * @param {number} [params.usedSeats] - Current seat count for the org+module
 * @returns {{ allowed: boolean, reason?: string, requiredTier?: string }}
 */
export function checkModuleAccess({ role, tier, moduleName, modulePermissions, orgModuleSubscription }) {
  // SENTINEL_COMMANDER always has access
  if (role === "SENTINEL_COMMANDER") {
    return { allowed: true }
  }

  // ── Org-level subscription gate (Phase 3) ──
  // If provided, the org must have an active subscription for this module
  if (orgModuleSubscription) {
    if (!ACTIVE_SUB_STATUSES.has(orgModuleSubscription.status)) {
      return {
        allowed: false,
        reason: `Organization's "${moduleName}" subscription is ${orgModuleSubscription.status.toLowerCase()}. Contact your administrator.`,
      }
    }
    // Check expiry (belt-and-suspenders: status should already reflect this,
    // but guard against stale status between cron runs)
    if (orgModuleSubscription.expiresAt && orgModuleSubscription.status !== "GRACE_PERIOD") {
      if (Date.now() > orgModuleSubscription.expiresAt) {
        return {
          allowed: false,
          reason: `Organization's "${moduleName}" subscription has expired. Contact your administrator.`,
        }
      }
    }
  }

  // Check tier includes this module
  if (!tierIncludesModule(tier, moduleName)) {
    const requiredTier = getMinimumTierForModule(moduleName)
    return {
      allowed: false,
      reason: `Module "${moduleName}" requires ${requiredTier || "Enterprise"} tier or higher.`,
      requiredTier: requiredTier || "ENTERPRISE",
    }
  }

  // Check explicit grant if needed
  if (requiresExplicitGrant(moduleName)) {
    const grant = (modulePermissions || []).find(
      (p) =>
        p.moduleName === moduleName &&
        (!p.expiresAt || p.expiresAt > Date.now())
    )
    if (!grant) {
      return {
        allowed: false,
        reason: `Access to "${moduleName}" must be explicitly granted by your administrator.`,
        requiredTier: "ENTERPRISE",
      }
    }
  }

  return { allowed: true }
}

/**
 * Check if granting module access to a new user is allowed,
 * considering seat limits on the org module subscription.
 *
 * @param {object} params
 * @param {string} params.actorRole - Actor's role
 * @param {string} params.moduleName - Module to grant
 * @param {object} [params.orgModuleSubscription] - Org subscription record
 * @param {number} [params.usedSeats] - Current seat count
 * @returns {{ allowed: boolean, reason?: string }}
 */
export function checkModuleGrantWithSeats({ actorRole, moduleName, orgModuleSubscription, usedSeats }) {
  // First: role-based grant permission
  const roleCheck = checkModuleGrantPermission(actorRole, moduleName)
  if (!roleCheck.allowed) return roleCheck

  // If no org subscription data provided, fall back to old behavior (allow)
  if (!orgModuleSubscription) return { allowed: true }

  // Org subscription must be active
  if (!ACTIVE_SUB_STATUSES.has(orgModuleSubscription.status)) {
    return {
      allowed: false,
      reason: `Cannot grant access — "${moduleName}" subscription is ${orgModuleSubscription.status.toLowerCase()}.`,
    }
  }

  // Seat limit check
  if (usedSeats !== undefined && orgModuleSubscription.maxSeats !== undefined) {
    if (usedSeats >= orgModuleSubscription.maxSeats) {
      return {
        allowed: false,
        reason: `Seat limit reached for "${moduleName}" (${usedSeats}/${orgModuleSubscription.maxSeats}). Upgrade your plan or remove inactive members.`,
      }
    }
  }

  return { allowed: true }
}

/**
 * Check if a user can perform an action on a specific report based on report state.
 *
 * Report state machine: draft -> submitted -> approved_signed -> published
 *
 * @param {object} params
 * @param {string} params.role - User's role
 * @param {string} params.action - Action from ACTIONS
 * @param {string} params.reportState - Current report state
 * @param {string} params.userId - Acting user's ID
 * @param {string} params.reportOwnerId - Report owner's ID
 * @returns {{ allowed: boolean, reason?: string }}
 */
export function checkReportAction({ role, action, reportState, userId, reportOwnerId }) {
  // First check basic role permission
  if (!canPerformAction(role, action)) {
    return { allowed: false, reason: `Role "${role}" cannot perform "${action}"` }
  }

  // State-specific rules
  switch (action) {
    case ACTIONS.REPORT_UPDATE:
      // Can only edit drafts; owner or admin+
      if (reportState !== "draft") {
        return { allowed: false, reason: "Reports can only be edited in draft state" }
      }
      if (userId !== reportOwnerId && !hasMinimumRole(role, "TEAM_ADMIN")) {
        return { allowed: false, reason: "Only the report owner or admin can edit drafts" }
      }
      return { allowed: true }

    case ACTIONS.REPORT_SUBMIT:
      if (reportState !== "draft") {
        return { allowed: false, reason: "Only draft reports can be submitted" }
      }
      return { allowed: true }

    case ACTIONS.REPORT_APPROVE:
    case ACTIONS.REPORT_SIGN:
      if (reportState !== "submitted") {
        return { allowed: false, reason: "Only submitted reports can be approved/signed" }
      }
      if (!hasMinimumRole(role, "TEAM_ADMIN")) {
        return { allowed: false, reason: "Only admin or owner can approve/sign reports" }
      }
      return { allowed: true }

    case ACTIONS.REPORT_PUBLISH:
      if (reportState !== "approved_signed") {
        return { allowed: false, reason: "Only approved and signed reports can be published" }
      }
      if (!hasMinimumRole(role, "TEAM_ADMIN")) {
        return { allowed: false, reason: "Only admin or owner can publish reports" }
      }
      return { allowed: true }

    case ACTIONS.REPORT_REVERT:
      if (reportState === "draft" || reportState === "published") {
        return { allowed: false, reason: "Cannot revert draft or published reports" }
      }
      if (!hasMinimumRole(role, "TEAM_ADMIN")) {
        return { allowed: false, reason: "Only admin or owner can revert reports" }
      }
      return { allowed: true }

    case ACTIONS.REPORT_DELETE:
      if (reportState === "published") {
        return { allowed: false, reason: "Published reports cannot be deleted" }
      }
      if (!hasMinimumRole(role, "TEAM_ADMIN")) {
        return { allowed: false, reason: "Only admin or owner can delete reports" }
      }
      return { allowed: true }

    default:
      return { allowed: true }
  }
}

/**
 * Check if a user can manage another user's role.
 * Rules:
 *  - Cannot change own role
 *  - Cannot set role >= own role (except SENTINEL_COMMANDER)
 *  - Must have TEAM_ADMIN+ to manage roles
 *
 * @param {object} params
 * @param {string} params.actorRole - Acting user's role
 * @param {string} params.actorId - Acting user's ID
 * @param {string} params.targetId - Target user's ID
 * @param {string} params.newRole - Role to assign
 * @returns {{ allowed: boolean, reason?: string }}
 */
export function checkRoleAssignment({ actorRole, actorId, targetId, newRole }) {
  if (actorId === targetId) {
    return { allowed: false, reason: "Cannot change your own role" }
  }

  if (!hasMinimumRole(actorRole, "TEAM_ADMIN")) {
    return { allowed: false, reason: "Insufficient role to manage team members" }
  }

  // Non-commanders cannot assign roles at or above their own level
  if (actorRole !== "SENTINEL_COMMANDER") {
    const actorRank = ROLE_RANK[actorRole] || 0
    const newRank = ROLE_RANK[newRole] || 0
    if (newRank >= actorRank) {
      return { allowed: false, reason: `Cannot assign role "${newRole}" — at or above your own level` }
    }
  }

  return { allowed: true }
}

/**
 * Check if a user can grant module access.
 * - SENTINEL_COMMANDER can grant anything
 * - ORG_ADMIN can grant non-exclusive modules
 * - TEAM_ADMIN can grant non-exclusive modules
 * - Only SENTINEL_COMMANDER can grant NGO_SAAS
 *
 * @param {string} actorRole
 * @param {string} moduleName
 * @returns {{ allowed: boolean, reason?: string }}
 */
export function checkModuleGrantPermission(actorRole, moduleName) {
  if (actorRole === "SENTINEL_COMMANDER") return { allowed: true }

  if (!hasMinimumRole(actorRole, "TEAM_ADMIN")) {
    return { allowed: false, reason: "Insufficient role to grant module access" }
  }

  if (moduleName === MODULES.NGO_SAAS) {
    return { allowed: false, reason: "Only Sentinel Commander can grant NGO SAAS access" }
  }

  return { allowed: true }
}
