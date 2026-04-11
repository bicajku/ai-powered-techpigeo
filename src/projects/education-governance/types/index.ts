// Education Governance Platform Types

export type GovernanceRole = 
  | "secretariat_admin"
  | "deo_male"
  | "deo_female"
  | "principal"
  | "teacher_staff"
  | "parent_student"

export interface GovernanceUser {
  id: string
  email: string
  fullName: string
  role: GovernanceRole
  district?: string
  school?: string
  languagePreference: "urdu" | "english" | "bilingual"
  createdAt: Date
}

export interface School {
  id: string
  name: string
  nameUrdu: string
  type: "male" | "female" | "coeducational"
  districtCode: string
  principalId?: string
  staffCount: number
  studentCount: number
  createdAt: Date
}

export interface Staff {
  id: string
  name: string
  nameUrdu: string
  email?: string
  designation: string
  designationUrdu: string
  schoolId: string
  joinDate: Date
  status: "active" | "on_leave" | "transferred" | "retired"
}

export interface PolicyCircular {
  id: string
  title: string
  titleUrdu: string
  content: string
  contentUrdu: string
  issueDate: Date
  enforcementDate: Date
  createdBy: string
  status: "draft" | "published" | "archived"
  acknowledgementRequired: boolean
  acknowledgements?: PolicyAcknowledgement[]
}

export interface PolicyAcknowledgement {
  id: string
  policyId: string
  userId: string
  acknowledgedAt: Date
  role: GovernanceRole
}

export interface LeaveRequest {
  id: string
  staffId: string
  schoolId: string
  type: "casual" | "sick" | "earned" | "special"
  startDate: Date
  endDate: Date
  reason: string
  status: "pending" | "approved" | "rejected" | "cancelled"
  appliedAt: Date
  approvedAt?: Date
  approvedBy?: string
  substituteAssignedId?: string
}

export interface AttendanceRecord {
  id: string
  staffId: string
  schoolId: string
  date: Date
  status: "present" | "absent" | "leave"
  notes?: string
  recordedAt: Date
}

export interface Document {
  id: string
  title: string
  type: "policy" | "report" | "inspection" | "project" | "resource_request"
  schoolId?: string
  districtId?: string
  owner: string
  status: "draft" | "in_review" | "approved" | "archived"
  createdAt: Date
  updatedAt: Date
  history: DocumentStatusChange[]
}

export interface DocumentStatusChange {
  id: string
  documentId: string
  fromStatus: string
  toStatus: string
  changedBy: string
  changedAt: Date
  notes?: string
}

export interface ComplianceCheckpoint {
  id: string
  schoolId: string
  category: string
  item: string
  dueDateUrdu: string
  status: "compliant" | "at_risk" | "non_compliant"
  lastVerifiedAt?: Date
  verifiedBy?: string
}

export interface NotificationRecord {
  id: string
  recipientId: string
  role: GovernanceRole[]
  titleUrdu: string
  title: string
  contentUrdu: string
  content: string
  type: "policy" | "leave" | "attendance" | "compliance" | "general"
  sentAt: Date
  readAt?: Date
  actionUrl?: string
}

export interface FinanceRecord {
  id: string
  schoolId?: string
  districtId?: string
  type: "budget" | "expense" | "resource_request"
  amount: number
  currency: "PKR"
  description: string
  status: "pending" | "approved" | "rejected" | "disbursed"
  requestedAt: Date
  approvedAt?: Date
  approvedBy?: string
}
