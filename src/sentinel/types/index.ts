// Sentinel SAAS Platform - Core Types

export type SentinelRole =
  | "SENTINEL_COMMANDER"
  | "ORG_ADMIN"
  | "TEAM_ADMIN"
  | "TEAM_MEMBER"
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
  subscription?: UserSubscription
  organization?: Organization
}

// ───────────────────────────── Access Check ──────────────────────

export interface AccessCheckResult {
  allowed: boolean
  reason?: string
  requiredTier?: SubscriptionTier
}
