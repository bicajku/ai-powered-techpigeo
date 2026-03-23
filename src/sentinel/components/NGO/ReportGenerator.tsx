/**
 * Sentinel SAAS - Report Generator Component
 *
 * Generates and exports reports in PDF, DOCX, and XLSX formats.
 */

import React, { useState } from "react"
import { exportNGOContent, getEffectiveBranding } from "../../api/ngo-saas"
import { useSentinelAuth } from "../../hooks/useSentinelAuth"
import type { ExportFormat } from "../../types/index"
import type { NGOExportConfig } from "../../types/ngo-saas"

interface ReportGeneratorProps {
  organizationId: string
  /** Content to export (Markdown or plain text) */
  content: string
  /** Title used in the report header */
  reportTitle?: string
  onExported?: (format: ExportFormat) => void
}

type ExportStatus = "idle" | "exporting" | "success" | "error"

export function ReportGenerator({
  organizationId,
  content,
  reportTitle,
  onExported,
}: ReportGeneratorProps) {
  const { user } = useSentinelAuth()
  const [status, setStatus] = useState<ExportStatus>("idle")
  const [statusMessage, setStatusMessage] = useState<string>("")
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>("PDF")
  const [includeBranding, setIncludeBranding] = useState(true)
  const [includePageNumbers, setIncludePageNumbers] = useState(true)
  const [orientation, setOrientation] = useState<"PORTRAIT" | "LANDSCAPE">("PORTRAIT")
  const [pageSize, setPageSize] = useState<"A4" | "LETTER">("A4")

  const handleExport = async () => {
    if (!user || !content) return
    setStatus("exporting")
    setStatusMessage(`Generating ${selectedFormat}…`)

    try {
      const branding = await getEffectiveBranding(organizationId)

      const config: NGOExportConfig = {
        format: selectedFormat,
        includeBranding,
        branding,
        pageSize,
        orientation,
        includePageNumbers,
      }

      const exportContent = reportTitle
        ? `${reportTitle}\n${"=".repeat(reportTitle.length)}\n\n${content}`
        : content

      const result = await exportNGOContent(exportContent, config, organizationId, user.id)

      if (result.success && result.data) {
        // Trigger browser download
        const url = URL.createObjectURL(result.data)
        const a = document.createElement("a")
        a.href = url
        a.download = result.fileName ?? `report.${selectedFormat.toLowerCase()}`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)

        setStatus("success")
        setStatusMessage(`${selectedFormat} downloaded successfully!`)
        onExported?.(selectedFormat)

        setTimeout(() => setStatus("idle"), 3000)
      } else {
        setStatus("error")
        setStatusMessage(result.error ?? "Export failed")
      }
    } catch (err) {
      setStatus("error")
      setStatusMessage(err instanceof Error ? err.message : "Export failed")
    }
  }

  const formats: { id: ExportFormat; label: string; icon: string; description: string }[] = [
    { id: "PDF", label: "PDF", icon: "📄", description: "Best for sharing and printing" },
    { id: "DOCX", label: "Word", icon: "📝", description: "Editable Microsoft Word document" },
    { id: "XLSX", label: "Excel", icon: "📊", description: "Spreadsheet with data" },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold text-gray-900 mb-1">Export Report</h3>
        <p className="text-sm text-gray-500">
          Export your report with your organization&apos;s branding (or Sentinel default branding
          if not configured).
        </p>
      </div>

      {!content && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
          No content to export. Generate or enter report content first.
        </div>
      )}

      {/* Format Selection */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Export Format</label>
        <div className="grid grid-cols-3 gap-3">
          {formats.map((fmt) => (
            <button
              key={fmt.id}
              type="button"
              onClick={() => setSelectedFormat(fmt.id)}
              className={`p-3 rounded-xl border-2 text-left transition-all ${
                selectedFormat === fmt.id
                  ? "border-indigo-600 bg-indigo-50"
                  : "border-gray-200 hover:border-gray-300"
              }`}
            >
              <div className="text-2xl mb-1">{fmt.icon}</div>
              <div className="text-sm font-medium text-gray-900">{fmt.label}</div>
              <div className="text-xs text-gray-500 mt-0.5">{fmt.description}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Options */}
      <div className="space-y-3">
        <label className="block text-sm font-medium text-gray-700">Options</label>

        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={includeBranding}
            onChange={(e) => setIncludeBranding(e.target.checked)}
            className="w-4 h-4 rounded accent-indigo-600"
          />
          <span className="text-sm text-gray-700">Include organization branding</span>
        </label>

        {selectedFormat === "PDF" && (
          <>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={includePageNumbers}
                onChange={(e) => setIncludePageNumbers(e.target.checked)}
                className="w-4 h-4 rounded accent-indigo-600"
              />
              <span className="text-sm text-gray-700">Include page numbers</span>
            </label>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-600 mb-1">Page Size</label>
                <select
                  value={pageSize}
                  onChange={(e) => setPageSize(e.target.value as "A4" | "LETTER")}
                  className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm"
                >
                  <option value="A4">A4</option>
                  <option value="LETTER">Letter</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">Orientation</label>
                <select
                  value={orientation}
                  onChange={(e) => setOrientation(e.target.value as "PORTRAIT" | "LANDSCAPE")}
                  className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm"
                >
                  <option value="PORTRAIT">Portrait</option>
                  <option value="LANDSCAPE">Landscape</option>
                </select>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Status Feedback */}
      {status !== "idle" && (
        <div
          className={`rounded-lg px-4 py-3 text-sm ${
            status === "success"
              ? "bg-green-50 border border-green-200 text-green-700"
              : status === "error"
              ? "bg-red-50 border border-red-200 text-red-700"
              : "bg-blue-50 border border-blue-200 text-blue-700"
          }`}
        >
          {status === "exporting" && (
            <span className="inline-block animate-spin mr-2">⏳</span>
          )}
          {statusMessage}
        </div>
      )}

      {/* Export Button */}
      <button
        type="button"
        onClick={handleExport}
        disabled={status === "exporting" || !content}
        className="w-full py-2.5 bg-indigo-700 hover:bg-indigo-800 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {status === "exporting"
          ? `Generating ${selectedFormat}…`
          : `Export as ${selectedFormat}`}
      </button>
    </div>
  )
}
