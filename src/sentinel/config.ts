// Sentinel SAAS Platform - Feature Flags & Configuration
// All Sentinel features are disabled by default.
// Enable via environment variables or runtime configuration.

import type { SubscriptionTier, OrganizationBranding } from "./types/index"

// ───────────────────────────── Feature Flags ─────────────────────

export const SENTINEL_CONFIG = {
  /** Master on/off switch for the entire Sentinel SAAS module */
  enabled: import.meta.env.VITE_SENTINEL_ENABLED === "true",

  /** Base URL for Sentinel API calls */
  apiBaseUrl: (import.meta.env.VITE_SENTINEL_API_BASE_URL as string | undefined) ?? "",

  /** Super admin email (read-only reference — seed separately) */
  adminEmail: (import.meta.env.VITE_SENTINEL_ADMIN_EMAIL as string | undefined) ?? "sentinel.sa@techpigeon.com.pk",

  /** Whether the NGO SAAS module is enabled */
  ngoSaasEnabled: import.meta.env.VITE_SENTINEL_NGO_ENABLED !== "false",

  /** KV storage key namespace */
  kvNamespace: "sentinel",

  /** Default commander password used for initial seed (override with VITE_SENTINEL_COMMANDER_PASS) */
  commanderDefaultPass: (import.meta.env.VITE_SENTINEL_COMMANDER_PASS as string | undefined) ?? "Root@sentinel2026",
} as const

// ───────────────────────────── Upload Limits ─────────────────────

/** Maximum file size (in bytes) that will be stored as a base64 data URL in KV.
 *  Files larger than this require an object-storage backend. */
export const MAX_INLINE_FILE_SIZE_BYTES = 5 * 1024 * 1024 // 5 MB

/** Maximum upload size exposed to the UI (in MB) */
export const MAX_UPLOAD_SIZE_MB = 10

/** Maximum number of audit log entries stored in KV (DB has no such limit) */
export const AUDIT_LOG_KV_LIMIT = 500

// ───────────────────────────── KV Keys ───────────────────────────

export const SENTINEL_KV_KEYS = {
  users: "sentinel-users",
  credentials: "sentinel-credentials",
  subscriptions: "sentinel-subscriptions",
  userSubscriptions: "sentinel-user-subscriptions",
  organizations: "sentinel-organizations",
  branding: "sentinel-branding",
  projects: "sentinel-projects",
  modulePermissions: "sentinel-module-permissions",
  teamAdmins: "sentinel-team-admins",
  auditLog: "sentinel-audit-log",
  currentUser: "sentinel-current-user",
  ngoDocuments: "sentinel-ngo-documents",
  ngoOutputs: "sentinel-ngo-outputs",
  projectSummaries: "sentinel-project-summaries",
  ngoReports: "sentinel-ngo-reports",
  initialized: "sentinel-initialized",
} as const

// ───────────────────────────── Subscription Tiers ────────────────

export const SUBSCRIPTION_DEFINITIONS: Record<
  SubscriptionTier,
  {
    label: string
    description: string
    pricingMonthly: number
    pricingYearly: number
    features: string[]
    maxMembers: number | null
    includesNGOSAAS: boolean
    requiresApproval: boolean
    color: string
  }
> = {
  BASIC: {
    label: "Sentinel Basic",
    description: "Essential tools for individuals getting started",
    pricingMonthly: 9,
    pricingYearly: 90,
    features: [
      "Core strategy generation",
      "Basic analytics",
      "PDF exports",
      "5 projects",
    ],
    maxMembers: 1,
    includesNGOSAAS: false,
    requiresApproval: false,
    color: "#6366f1",
  },
  PRO: {
    label: "Sentinel Pro",
    description: "Advanced features for power users",
    pricingMonthly: 29,
    pricingYearly: 290,
    features: [
      "Everything in Basic",
      "Advanced AI models",
      "Plagiarism detection",
      "Word/Excel exports",
      "25 projects",
      "Priority support",
    ],
    maxMembers: 1,
    includesNGOSAAS: false,
    requiresApproval: false,
    color: "#8b5cf6",
  },
  TEAMS: {
    label: "Sentinel Teams",
    description: "Collaboration tools for teams",
    pricingMonthly: 79,
    pricingYearly: 790,
    features: [
      "Everything in Pro",
      "Up to 10 team members",
      "Team admin controls",
      "Collaborative projects",
      "Shared workspace",
      "Team analytics",
    ],
    maxMembers: 10,
    includesNGOSAAS: false,
    requiresApproval: false,
    color: "#0ea5e9",
  },
  ENTERPRISE: {
    label: "Sentinel Enterprise",
    description: "Enterprise-grade solution with NGO SAAS module",
    pricingMonthly: 0, // Contact sales
    pricingYearly: 0,
    features: [
      "Everything in Teams",
      "Unlimited team members",
      "NGO SAAS module (exclusive)",
      "Custom branding & exports",
      "Dedicated project UUIDs",
      "Advanced RBAC",
      "Audit logs",
      "Dedicated support",
      "Custom integrations",
    ],
    maxMembers: null,
    includesNGOSAAS: true,
    requiresApproval: true,
    color: "#f59e0b",
  },
}

// ───────────────────────────── Modules ───────────────────────────

export const SENTINEL_MODULES = {
  STRATEGY_GENERATION: "strategy-generation",
  PLAGIARISM_CHECKER: "plagiarism-checker",
  ANALYTICS: "analytics",
  NGO_SAAS: "ngo-saas",
  ADMIN_PORTAL: "admin-portal",
  TEAM_MANAGEMENT: "team-management",
} as const

export type SentinelModuleName =
  (typeof SENTINEL_MODULES)[keyof typeof SENTINEL_MODULES]

/** Modules accessible by each subscription tier */
export const TIER_MODULE_ACCESS: Record<SubscriptionTier, SentinelModuleName[]> = {
  BASIC: [
    SENTINEL_MODULES.STRATEGY_GENERATION,
    SENTINEL_MODULES.ANALYTICS,
  ],
  PRO: [
    SENTINEL_MODULES.STRATEGY_GENERATION,
    SENTINEL_MODULES.PLAGIARISM_CHECKER,
    SENTINEL_MODULES.ANALYTICS,
  ],
  TEAMS: [
    SENTINEL_MODULES.STRATEGY_GENERATION,
    SENTINEL_MODULES.PLAGIARISM_CHECKER,
    SENTINEL_MODULES.ANALYTICS,
    SENTINEL_MODULES.TEAM_MANAGEMENT,
  ],
  ENTERPRISE: [
    SENTINEL_MODULES.STRATEGY_GENERATION,
    SENTINEL_MODULES.PLAGIARISM_CHECKER,
    SENTINEL_MODULES.ANALYTICS,
    SENTINEL_MODULES.TEAM_MANAGEMENT,
    SENTINEL_MODULES.NGO_SAAS,
  ],
}

// ───────────────────────────── Default Branding ──────────────────

export const DEFAULT_SENTINEL_BRANDING: Omit<
  OrganizationBranding,
  "id" | "organizationId" | "createdAt" | "updatedAt"
> = {
  name: "Sentinel SAAS",
  logoUrl: "/sentinel-logo.svg",
  primaryColor: "#1e1b4b",
  secondaryColor: "#4f46e5",
  accentColor: "#fbbf24",
  phone: "",
  email: "support@techpigeon.com.pk",
  officeAddress: "TechPigeon, Pakistan",
  website: "https://techpigeon.com.pk",
  useCustomBranding: false,
}

// ───────────────────────────── Token Settings ────────────────────

export const SENTINEL_TOKEN = {
  expiryMs: 24 * 60 * 60 * 1000, // 24 hours
  storageKey: "sentinel-auth-token",
} as const
