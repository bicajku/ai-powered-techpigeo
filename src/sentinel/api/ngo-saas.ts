/**
 * Sentinel SAAS - NGO SAAS Operations API
 *
 * Handles document management, output generation, summaries,
 * reports, and exports for the NGO SAAS module.
 */

import { v4 as uuidv4 } from "uuid"
import { dbCreateNGODocument,
  dbGetNGODocuments,
  dbCreateNGOOutput,
  dbGetNGOOutputs,
  dbGetProjectSummaries,
  dbUpsertProjectSummary,
  dbGetNGOReports,
  dbCreateNGOReport,
  dbGetBranding,
  dbWriteAuditLog,
} from "./db"
import { checkNGOSAASAccess } from "./rbac"
import { DEFAULT_SENTINEL_BRANDING, MAX_INLINE_FILE_SIZE_BYTES } from "../config"
import type { OrganizationBranding } from "../types/index"
import type {
  NGODocument,
  NGOOutput,
  ProjectSummary,
  NGOReport,
  NGOUploadRequest,
  NGOUploadResult,
  NGOExportConfig,
  NGOOutputType,
} from "../types/ngo-saas"

// ─────────────────────────── Access Guard ────────────────────────

async function requireNGOAccess(userId: string): Promise<void> {
  const check = await checkNGOSAASAccess(userId)
  if (!check.allowed) {
    throw new Error(check.reason ?? "NGO SAAS access denied")
  }
}

// ─────────────────────────── Document Management ─────────────────

export async function uploadNGODocument(
  request: NGOUploadRequest,
  uploadedBy: string
): Promise<NGOUploadResult> {
  try {
    await requireNGOAccess(uploadedBy)

    const docId = uuidv4()
    const fileName = request.file.name
    const fileType = getFileExtension(fileName).toUpperCase()

    // Convert file to base64 data URL for storage (small files)
    // For production, replace this with object storage (S3/R2) upload
    let fileUrl = ""
    if (request.file.size < MAX_INLINE_FILE_SIZE_BYTES) {
      fileUrl = await fileToDataUrl(request.file)
    } else {
      // For large files, store placeholder and prompt production upload
      fileUrl = `sentinel://documents/${docId}/${fileName}`
    }

    const document: NGODocument = {
      id: docId,
      projectId: request.projectId,
      organizationId: "", // Will be resolved from project
      documentType: request.documentType,
      title: request.title || fileName,
      fileName,
      fileUrl,
      fileType: fileType as NGODocument["fileType"],
      fileSizeBytes: request.file.size,
      uploadedBy,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }

    await dbCreateNGODocument(document)

    await dbWriteAuditLog({
      userId: uploadedBy,
      action: "UPLOAD",
      resource: "ngo-document",
      resourceId: docId,
      metadata: { title: request.title, documentType: request.documentType },
      success: true,
    })

    return { success: true, document }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed"
    return { success: false, error: message }
  }
}

export async function getProjectDocuments(
  projectId: string,
  userId: string
): Promise<NGODocument[]> {
  await requireNGOAccess(userId)
  return dbGetNGODocuments(projectId)
}

// ─────────────────────────── Outputs ─────────────────────────────

export async function createNGOOutput(params: {
  projectId: string
  documentId?: string
  tabName: string
  outputType: NGOOutputType
  title: string
  generatedData: string
  createdBy: string
  brandingConfigId?: string
}): Promise<{ success: boolean; output?: NGOOutput; error?: string }> {
  try {
    await requireNGOAccess(params.createdBy)

    const output: NGOOutput = {
      id: uuidv4(),
      projectId: params.projectId,
      documentId: params.documentId,
      tabName: params.tabName,
      outputType: params.outputType,
      title: params.title,
      generatedData: params.generatedData,
      exportFormats: ["PDF", "DOCX", "XLSX"],
      brandingConfigId: params.brandingConfigId,
      createdBy: params.createdBy,
      createdAt: Date.now(),
      version: 1,
    }

    await dbCreateNGOOutput(output)

    return { success: true, output }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create output"
    return { success: false, error: message }
  }
}

export async function getProjectOutputs(
  projectId: string,
  userId: string
): Promise<NGOOutput[]> {
  await requireNGOAccess(userId)
  return dbGetNGOOutputs(projectId)
}

// ─────────────────────────── Project Summaries ───────────────────

export async function getProjectSummaries(
  projectId: string,
  userId: string
): Promise<ProjectSummary[]> {
  await requireNGOAccess(userId)
  return dbGetProjectSummaries(projectId)
}

export async function saveProjectSummary(
  summary: Omit<ProjectSummary, "id" | "createdAt" | "updatedAt" | "version"> & { id?: string },
  userId: string
): Promise<{ success: boolean; summary?: ProjectSummary; error?: string }> {
  try {
    await requireNGOAccess(userId)

    const now = Date.now()
    const full: ProjectSummary = {
      id: summary.id ?? uuidv4(),
      ...summary,
      createdAt: now,
      updatedAt: now,
      version: 1,
    }

    await dbUpsertProjectSummary(full)

    await dbWriteAuditLog({
      userId,
      action: "UPDATE",
      resource: "project-summary",
      resourceId: full.id,
      success: true,
    })

    return { success: true, summary: full }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to save summary"
    return { success: false, error: message }
  }
}

// ─────────────────────────── Reports ─────────────────────────────

export async function getProjectReports(
  projectId: string,
  userId: string
): Promise<NGOReport[]> {
  await requireNGOAccess(userId)
  return dbGetNGOReports(projectId)
}

export async function createNGOReport(
  params: Omit<NGOReport, "id" | "generatedAt" | "exportedFormats">,
  userId: string
): Promise<{ success: boolean; report?: NGOReport; error?: string }> {
  try {
    await requireNGOAccess(userId)

    const report: NGOReport = {
      id: uuidv4(),
      ...params,
      generatedAt: Date.now(),
      exportedFormats: [],
    }

    await dbCreateNGOReport(report)

    await dbWriteAuditLog({
      userId,
      action: "CREATE",
      resource: "ngo-report",
      resourceId: report.id,
      success: true,
    })

    return { success: true, report }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create report"
    return { success: false, error: message }
  }
}

// ─────────────────────────── Organization Branding ───────────────

export async function getEffectiveBranding(
  organizationId: string
): Promise<OrganizationBranding> {
  const stored = await dbGetBranding(organizationId)

  if (stored?.useCustomBranding) return stored

  // Fall back to Sentinel default branding
  return {
    id: "default",
    organizationId,
    ...DEFAULT_SENTINEL_BRANDING,
    useCustomBranding: false,
    createdAt: 0,
    updatedAt: 0,
  }
}

// ─────────────────────────── Export ──────────────────────────────

export async function exportNGOContent(
  content: string,
  config: NGOExportConfig,
  organizationId: string,
  userId: string
): Promise<{ success: boolean; data?: Blob; mimeType?: string; fileName?: string; error?: string }> {
  try {
    await requireNGOAccess(userId)

    const branding = config.branding ?? (await getEffectiveBranding(organizationId))

    await dbWriteAuditLog({
      userId,
      action: "EXPORT",
      resource: "ngo-content",
      metadata: { format: config.format, organizationId },
      success: true,
    })

    switch (config.format) {
      case "PDF":
        return exportAsPDF(content, branding, config)
      case "DOCX":
        return exportAsDOCX(content, branding)
      case "XLSX":
        return exportAsXLSX(content, branding)
      default:
        return { success: false, error: `Unsupported format: ${config.format}` }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Export failed"
    return { success: false, error: message }
  }
}

// ─────────────────────────── Export Implementations ──────────────

async function exportAsPDF(
  content: string,
  branding: OrganizationBranding,
  config: NGOExportConfig
): Promise<{ success: boolean; data?: Blob; mimeType?: string; fileName?: string; error?: string }> {
  try {
    const { jsPDF } = await import("jspdf")
    const orientationVal = (config.orientation === "LANDSCAPE" ? "landscape" : "portrait") as "portrait" | "landscape"
    const doc = new jsPDF({
      orientation: orientationVal,
      format: (config.pageSize ?? "a4").toLowerCase(),
    })

    const pageWidth = doc.internal.pageSize.getWidth()
    const margin = 15
    let y = margin

    // Header with branding
    if (config.includeBranding) {
      const primaryHex = branding.primaryColor ?? "#1e1b4b"
      const r = parseInt(primaryHex.slice(1, 3), 16)
      const g = parseInt(primaryHex.slice(3, 5), 16)
      const b = parseInt(primaryHex.slice(5, 7), 16)

      doc.setFillColor(r, g, b)
      doc.rect(0, 0, pageWidth, 20, "F")

      doc.setTextColor(255, 255, 255)
      doc.setFontSize(14)
      doc.text(branding.name, margin, 13)

      doc.setTextColor(0, 0, 0)
      y = 30
    }

    // Content
    doc.setFontSize(11)
    doc.setTextColor(0, 0, 0)
    const lines = doc.splitTextToSize(content, pageWidth - margin * 2)
    doc.text(lines, margin, y)

    // Footer
    if (config.includeBranding) {
      const pageCount = doc.getNumberOfPages()
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i)
        doc.setFontSize(9)
        doc.setTextColor(150, 150, 150)
        doc.text(
          `${branding.name} | ${branding.email}`,
          margin,
          doc.internal.pageSize.getHeight() - 8
        )
        if (config.includePageNumbers) {
          doc.text(
            `Page ${i} of ${pageCount}`,
            pageWidth - margin - 20,
            doc.internal.pageSize.getHeight() - 8
          )
        }
      }
    }

    const blob = doc.output("blob")
    return {
      success: true,
      data: blob,
      mimeType: "application/pdf",
      fileName: `${sanitizeFileName(branding.name)}-report.pdf`,
    }
  } catch (err) {
    console.error("PDF export error:", err)
    return { success: false, error: "PDF export failed. Please try again." }
  }
}

async function exportAsDOCX(
  content: string,
  branding: OrganizationBranding
): Promise<{ success: boolean; data?: Blob; mimeType?: string; fileName?: string; error?: string }> {
  try {
    // Use the existing document-export.ts pattern if available
    const header = `${branding.name}\n${branding.email}\n${"─".repeat(40)}\n\n`
    const fullContent = header + content

    const blob = new Blob([fullContent], {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    })
    return {
      success: true,
      data: blob,
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      fileName: `${sanitizeFileName(branding.name)}-report.docx`,
    }
  } catch (err) {
    console.error("DOCX export error:", err)
    return { success: false, error: "DOCX export failed. Please try again." }
  }
}

async function exportAsXLSX(
  content: string,
  branding: OrganizationBranding
): Promise<{ success: boolean; data?: Blob; mimeType?: string; fileName?: string; error?: string }> {
  try {
    // Simple CSV-compatible format that Excel can open
    const rows = content.split("\n").map((line) => line.split(",").join("\t"))
    const header = `${branding.name}\t\t\n${branding.email}\t\t\n\n`
    const tsvContent = header + rows.join("\n")

    const blob = new Blob([tsvContent], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    })
    return {
      success: true,
      data: blob,
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      fileName: `${sanitizeFileName(branding.name)}-data.xlsx`,
    }
  } catch (err) {
    console.error("XLSX export error:", err)
    return { success: false, error: "XLSX export failed. Please try again." }
  }
}

// ─────────────────────────── Utilities ───────────────────────────

function getFileExtension(fileName: string): string {
  const parts = fileName.split(".")
  return parts.length > 1 ? parts[parts.length - 1] : "bin"
}

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9-_]/g, "-").toLowerCase()
}
