// Sentinel SAAS - NGO Module Types

import type { ExportFormat, DocumentType, FileType, OrganizationBranding } from "./index"

// ───────────────────────────── Document ──────────────────────────

export interface NGODocument {
  id: string
  projectId: string
  organizationId: string
  documentType: DocumentType
  title: string
  fileName: string
  fileUrl: string
  fileType: FileType
  fileSizeBytes?: number
  content?: string                  // Extracted text content
  aiProcessedData?: NGOAIExtract    // AI-extracted insights
  uploadedBy: string
  createdAt: number
  updatedAt: number
}

// ───────────────────────────── AI Extraction ─────────────────────

export interface NGOAIExtract {
  summary?: string
  keyMetrics?: Record<string, string | number>
  extractedEntities?: {
    names?: string[]
    dates?: string[]
    amounts?: string[]
    organizations?: string[]
  }
  topics?: string[]
  sentiment?: "POSITIVE" | "NEUTRAL" | "NEGATIVE"
  completenessScore?: number        // 0-100
  riskFlags?: string[]
  recommendations?: string[]
}

// ───────────────────────────── Output ────────────────────────────

export type NGOOutputType = "SUMMARY" | "ANALYSIS" | "REPORT" | "EXTRACTED_DATA" | "CUSTOM"

export interface NGOOutput {
  id: string
  projectId: string
  documentId?: string
  tabName: string
  outputType: NGOOutputType
  title: string
  generatedData: string             // Markdown / HTML content
  exportFormats: ExportFormat[]
  brandingConfigId?: string
  createdBy: string
  createdAt: number
  version: number
}

// ───────────────────────────── Project Summary ───────────────────

export interface ProjectSummary {
  id: string
  projectId: string
  organizationId: string
  title: string
  content: string                   // Rich text / Markdown
  objectives?: string[]
  targetBeneficiaries?: string
  budgetOverview?: string
  timeline?: string
  impactMetrics?: string[]
  createdBy: string
  createdAt: number
  updatedAt: number
  version: number
}

// ───────────────────────────── Report ────────────────────────────

export interface NGOReport {
  id: string
  projectId: string
  organizationId: string
  title: string
  reportType: "PROGRESS" | "IMPACT" | "FINANCIAL" | "DONOR" | "COMPLIANCE" | "CUSTOM"
  sections: NGOReportSection[]
  brandingId?: string
  generatedAt: number
  generatedBy: string
  exportedFormats: ExportFormat[]
}

export interface NGOReportSection {
  id: string
  title: string
  content: string
  order: number
  includeInExport: boolean
}

// ───────────────────────────── Export Config ─────────────────────

export interface NGOExportConfig {
  format: ExportFormat
  includeBranding: boolean
  branding?: OrganizationBranding
  pageSize?: "A4" | "LETTER"
  orientation?: "PORTRAIT" | "LANDSCAPE"
  quality?: "STANDARD" | "HIGH" | "PRINT"
  includeTableOfContents?: boolean
  includePageNumbers?: boolean
  watermark?: string
}

// ───────────────────────────── Upload ────────────────────────────

export interface NGOUploadRequest {
  projectId: string
  documentType: DocumentType
  title: string
  file: File
  extractContent?: boolean
  runAIAnalysis?: boolean
}

export interface NGOUploadResult {
  success: boolean
  document?: NGODocument
  error?: string
}

// ───────────────────────────── Tab Definitions ───────────────────

export type NGOTab =
  | "documents"
  | "summaries"
  | "reports"
  | "settings"
  | "data-upload"

export interface NGOTabConfig {
  id: NGOTab
  label: string
  description: string
  icon: string
}

export const NGO_TABS: NGOTabConfig[] = [
  {
    id: "documents",
    label: "Documents",
    description: "Upload and manage project documents",
    icon: "📄",
  },
  {
    id: "data-upload",
    label: "Data Upload",
    description: "Upload CSV/Excel data files for analysis",
    icon: "📊",
  },
  {
    id: "summaries",
    label: "Project Summaries",
    description: "Create and manage project summaries",
    icon: "📝",
  },
  {
    id: "reports",
    label: "Reports",
    description: "Generate and export reports",
    icon: "📋",
  },
  {
    id: "settings",
    label: "Organization Settings",
    description: "Configure branding and organization details",
    icon: "⚙️",
  },
]
