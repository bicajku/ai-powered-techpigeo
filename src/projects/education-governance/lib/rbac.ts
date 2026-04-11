// RBAC and Permission utilities for Education Governance Platform

import { GovernanceRole } from "@/projects/education-governance/types"

export const RoleLabels: Record<GovernanceRole, { en: string; ur: string }> = {
  secretariat_admin: { en: "Secretariat Admin", ur: "سیکرٹریٹ ایڈمن" },
  deo_male: { en: "DEO (Male)", ur: "ڈی ای او (مردانہ)" },
  deo_female: { en: "DEO (Female)", ur: "ڈی ای او (خواتین)" },
  principal: { en: "Principal", ur: "پرنسپل" },
  teacher_staff: { en: "Teacher/Staff", ur: "اساتذہ/سٹاف" },
  parent_student: { en: "Parent/Student", ur: "والدین/طالب علم" },
}

export const ModuleAccess: Record<GovernanceRole, string[]> = {
  secretariat_admin: [
    "dashboard",
    "school_management",
    "staff_management",
    "policy_center",
    "leave_management",
    "attendance",
    "document_tracker",
    "notifications",
    "compliance",
    "finance",
    "analytics",
    "settings",
  ],
  deo_male: [
    "dashboard",
    "school_management",
    "staff_management",
    "policy_center",
    "leave_management",
    "attendance",
    "document_tracker",
    "notifications",
    "compliance",
    "analytics",
  ],
  deo_female: [
    "dashboard",
    "school_management",
    "staff_management",
    "policy_center",
    "leave_management",
    "attendance",
    "document_tracker",
    "notifications",
    "compliance",
    "analytics",
  ],
  principal: [
    "dashboard",
    "staff_management",
    "policy_center",
    "leave_management",
    "attendance",
    "document_tracker",
    "notifications",
    "compliance",
  ],
  teacher_staff: [
    "dashboard",
    "leave_management",
    "attendance",
    "notifications",
    "policy_center",
  ],
  parent_student: ["dashboard", "notifications"],
}

export function canAccessModule(role: GovernanceRole, module: string): boolean {
  return ModuleAccess[role]?.includes(module) || false
}

export function canApproveLeave(role: GovernanceRole): boolean {
  return ["secretariat_admin", "deo_male", "deo_female", "principal"].includes(role)
}

export function canViewAnalytics(role: GovernanceRole): boolean {
  return ["secretariat_admin", "deo_male", "deo_female", "principal"].includes(role)
}

export function canPublishPolicy(role: GovernanceRole): boolean {
  return ["secretariat_admin"].includes(role)
}

export function canViewFinance(role: GovernanceRole): boolean {
  return ["secretariat_admin", "deo_male", "deo_female", "principal"].includes(role)
}

// District visibility rules
export function getVisibleDistrictsForRole(
  role: GovernanceRole,
  userDistrict?: string
): string[] {
  if (role === "secretariat_admin") return [] // All districts
  return userDistrict ? [userDistrict] : []
}

// School visibility rules
export function getVisibleSchoolsForRole(
  role: GovernanceRole,
  userDistrict?: string,
  userSchool?: string
): string[] {
  if (["secretariat_admin", "deo_male", "deo_female"].includes(role)) {
    return [] // All schools in their district
  }
  if (role === "principal") return userSchool ? [userSchool] : []
  return []
}
