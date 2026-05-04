// Sentinel SAAS Platform - Core Types

export type SentinelRole =
  | "SENTINEL_COMMANDER"
  | "ORG_ADMIN"
  | "TEAM_ADMIN"
  | "TEAM_MEMBER"
  | "TESTER"
  | "USER"

export type SubscriptionTier = "BASIC" | "PRO" | "TEAMS" | "ENTERPRISE"

export type SubscriptionStatus = "ACTIVE" | "PENDING" | "EXPIRED" | "CANCELLED"

export type ModuleAccessLevel = "READ" | "READ_WRITE" | "FULL"

export type ExportFormat = "PDF" | "DOCX" | "XLSX"

export type DocumentType = "PROPOSAL" | "TEMPLATE" | "REPORT" | "DATA_FILE"

export type FileType = "PDF" | "DOCX" | "XLSX" | "CSV" | "TXT" | "PNG" | "JPG"

export type AuditAction =
  | "LOGIN"
  | "LOGOUT"
  | "CREATE"
  | "READ"
  | "UPDATE"
  | "DELETE"
  | "EXPORT"
  | "UPLOAD"
  | "ASSIGN_ROLE"
  | "ASSIGN_SUBSCRIPTION"
  // Report workflow actions (Phase 2)
  | "SUBMIT"
  | "APPROVE"
  | "SIGN"
  | "PUBLISH"
  | "REVERT"

// ───────────────────────────── User ──────────────────────────────

export interface SentinelUser {
  id: string
  email: string
  fullName: string
  role: SentinelRole
  organizationId?: string
  avatarUrl?: string
  createdAt: number
  lastLoginAt: number
  isActive: boolean
  // ── Enterprise grant fields (INVARIANT[enterprise-grant-persistence]) ──
  // Populated by /api/auth/verify when the user has been granted access via
  // the Enterprise Admin or NGO-SAAS Team page. Absent for ordinary signups.
  enterpriseRole?: string | null
  enterpriseModuleAccess?: string[] | null
  individualProLicense?: boolean | null
  ngoAccessLevel?: "owner" | "contributor" | "user" | null
  ngoTeamAdminId?: string | null
  grantedVia?: "enterprise" | "ngo-team" | null
}

// ───────────────────────────── Subscription ──────────────────────

export interface SentinelSubscription {
  id: string
  tier: SubscriptionTier
  description: string
  pricingMonthly: number
  pricingYearly: number
  features: string[]
  maxMembers: number | null // null = unlimited
  includesNGOSAAS: boolean
  requiresApproval: boolean
  status: "ACTIVE" | "INACTIVE" | "ARCHIVED"
  createdAt: number
  updatedAt: number
}

export interface UserSubscription {
  id: string
  userId: string
  subscriptionId: string
  tier: SubscriptionTier
  status: SubscriptionStatus
  assignedBy: string // Sentinel Commander ID
  assignedAt: number
  expiresAt: number | null
  organizationId: string
  autoRenew: boolean
  proCredits?: number   // credit balance from sentinel_user_subscriptions
}

// ───────────────────────────── Organization ──────────────────────

export interface Organization {
  id: string
  name: string
  subscriptionId: string
  tier: SubscriptionTier
  adminUserId: string
  memberIds: string[]
  createdAt: number
  updatedAt: number
}

// ───────────────────────────── Branding ──────────────────────────

export interface OrganizationBranding {
  id: string
  organizationId: string
  name: string
  logoUrl: string
  primaryColor: string    // hex e.g. #1a2b3c
  secondaryColor: string  // hex e.g. #4d5e6f
  accentColor?: string
  phone: string
  email: string
  officeAddress: string
  website?: string
  useCustomBranding: boolean
  createdAt: number
  updatedAt: number
}

// ───────────────────────────── Project ───────────────────────────

export interface SentinelProject {
  id: string            // UUID auto-generated
  organizationId: string
  name: string
  description: string
  modulesEnabled: string[]
  teamMemberIds: string[]
  createdBy: string
  createdAt: number
  updatedAt: number
  brandingId?: string
  status: "ACTIVE" | "ARCHIVED" | "COMPLETED"
}

// ───────────────────────────── RBAC ──────────────────────────────

export interface ModuleAccess {
  id: string
  moduleName: string
  subscriptionTier: SubscriptionTier
  accessLevel: ModuleAccessLevel
  isExclusive: boolean   // NGO SAAS = true (enterprise only)
}

export interface UserModulePermission {
  id: string
  userId: string
  organizationId: string
  moduleName: string
  accessLevel: ModuleAccessLevel
  grantedBy: string
  grantedAt: number
  expiresAt?: number
}

export interface RolePermission {
  id: string
  role: SentinelRole
  resource: string
  action: AuditAction
  subscriptionTier?: SubscriptionTier
}

// ───────────────────────────── Team Admin ────────────────────────

export interface TeamAdmin {
  id: string
  userId: string
  organizationId: string
  subscriptionId: string
  role: "TEAM_ADMIN"
  canAddMembers: boolean
  canAssignModules: boolean
  createdAt: number
}

// ───────────────────────────── Audit ─────────────────────────────

/** Individual audit log entry */
export interface AuditLogEntry {
  id: string
  userId: string
  action: AuditAction
  resource: string
  resourceId?: string
  metadata?: Record<string, unknown>
  ipAddress?: string
  timestamp: number
  success: boolean
}

// ───────────────────────────── Report State Transition ───────────

/** Tracks each state transition in the report workflow */
export interface ReportStateTransition {
  id: string
  reportId: string
  fromStatus: string | null        // null for initial creation
  toStatus: string
  performedBy: string
  performedAt: number
  reason?: string
  signatureHash?: string           // Present on APPROVED_SIGNED transitions
}

// ───────────────────────────── Auth ──────────────────────────────

export interface SentinelAuthToken {
  userId: string
  email: string
  role: SentinelRole
  organizationId?: string
  subscriptionTier?: SubscriptionTier
  issuedAt: number
  expiresAt: number
}

export interface SentinelSession {
  user: SentinelUser
  token: string
  subscription?: UserSubscription | null
  organization?: Organization
}

// ───────────────────────────── Access Check ──────────────────────

export interface AccessCheckResult {
  allowed: boolean
  reason?: string
  requiredTier?: SubscriptionTier
}

// ──────────────── Org Module Subscription (Phase 3) ──────────────

export type ModuleSubscriptionStatus =
  | "ACTIVE"
  | "TRIAL"
  | "GRACE_PERIOD"
  | "EXPIRED"
  | "CANCELLED"
  | "SUSPENDED"

/**
 * Per-tenant per-module subscription record.
 * Authoritative source for whether an organization can access a module,
 * how many seats they have, and when the subscription expires.
 */
export interface OrgModuleSubscription {
  id: string
  organizationId: string
  moduleName: string
  tier: SubscriptionTier
  status: ModuleSubscriptionStatus
  maxSeats: number
  startsAt: number                    // Epoch ms
  expiresAt: number | null            // null = no expiry
  autoRenew: boolean
  gracePeriodDays: number
  provisionedBy: string
  provisionedAt: number
  cancelledAt: number | null
  cancelledBy: string | null
  metadata: Record<string, unknown>
  createdAt: number
  updatedAt: number
}

/** Seat usage info for a module */
export interface ModuleSeatInfo {
  available: boolean
  usedSeats: number
  maxSeats: number
  subscription?: OrgModuleSubscription
  reason?: string
}

// ──────────────── Audit Log Query/Response (Phase 4) ─────────────

/** Parameters for the advanced audit log query endpoint */
export interface AuditLogQuery {
  userId?: string
  action?: AuditAction
  resource?: string
  resourceId?: string
  success?: boolean
  from?: number                       // Epoch ms
  to?: number                         // Epoch ms
  limit?: number                      // Max 500
  offset?: number                     // Pagination offset
}

/** Response from the paginated audit log endpoint */
export interface AuditLogPage {
  logs: AuditLogEntry[]
  total: number
  limit: number
  offset: number
}

/** Aggregation bucket (action or resource) */
export interface AuditCountBucket {
  action?: string
  resource?: string
  count: number
}

/** Daily count for timeline chart */
export interface AuditDayCount {
  day: string                         // ISO date "YYYY-MM-DD"
  count: number
}

/** Audit log aggregation stats */
export interface AuditStats {
  byAction: AuditCountBucket[]
  byResource: AuditCountBucket[]
  byDay: AuditDayCount[]
  totalEvents: number
  failedEvents: number
}

// ──────────────── Admin System Stats (Phase 4) ───────────────────

/** System-wide statistics for the admin console */
export interface SystemStats {
  users: {
    total: number
    active: number
  }
  organizations: {
    total: number
  }
  subscriptions: {
    total: number
    active: number
    expired: number
  }
  reports: {
    total: number
    drafts: number
    submitted: number
    approvedSigned: number
    published: number
  }
  moduleSubscriptions: {
    total: number
    active: number
    trial: number
    expired: number
    cancelled: number
  }
  recentLogins7d: number
}
