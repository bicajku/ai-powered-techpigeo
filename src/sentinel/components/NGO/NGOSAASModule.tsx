/**
 * Sentinel SAAS - NGO SAAS Main Module Component
 *
 * Enterprise-only module. Access blocked for all non-Enterprise users.
 */

import React, { useEffect, useState } from "react"
import { useRBAC } from "../../hooks/useRBAC"
import { useSentinelAuth } from "../../hooks/useSentinelAuth"
import { useSubscription } from "../../hooks/useSubscription"
import { DataUpload } from "./DataUpload"
import { OrganizationSettings } from "./OrganizationSettings"
import { ReportGenerator } from "./ReportGenerator"
import {
  getProjectDocuments,
  getProjectSummaries,
  saveProjectSummary,
  getProjectReports,
  createNGOReport,
} from "../../api/ngo-saas"
import type { NGOTab, NGOTabConfig } from "../../types/ngo-saas"
import { NGO_TABS } from "../../types/ngo-saas"
import type { NGODocument, ProjectSummary, NGOReport } from "../../types/ngo-saas"

interface NGOSAASModuleProps {
  projectId: string
  organizationId: string
}

export function NGOSAASModule({ projectId, organizationId }: NGOSAASModuleProps) {
  const { user } = useSentinelAuth()
  const { hasNGOAccess } = useRBAC()
  const { label } = useSubscription()

  const [activeTab, setActiveTab] = useState<NGOTab>("documents")
  const [documents, setDocuments] = useState<NGODocument[]>([])
  const [summaries, setSummaries] = useState<ProjectSummary[]>([])
  const [reports, setReports] = useState<NGOReport[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // Summary editor state
  const [summaryTitle, setSummaryTitle] = useState("")
  const [summaryContent, setSummaryContent] = useState("")
  const [isSavingSummary, setIsSavingSummary] = useState(false)
  const [summaryMessage, setSummaryMessage] = useState<string | null>(null)

  // Report state
  const [reportTitle, setReportTitle] = useState("")
  const [reportContent, setReportContent] = useState("")
  const [isCreatingReport, setIsCreatingReport] = useState(false)
  const [reportMessage, setReportMessage] = useState<string | null>(null)

  const isBlocked = !hasNGOAccess

  useEffect(() => {
    if (isBlocked || !user) return

    const loadData = async () => {
      setIsLoading(true)
      try {
        const [docs, sums, reps] = await Promise.all([
          getProjectDocuments(projectId, user.id),
          getProjectSummaries(projectId, user.id),
          getProjectReports(projectId, user.id),
        ])
        setDocuments(docs)
        setSummaries(sums)
        setReports(reps)
      } catch (err) {
        console.error("NGO module load error:", err)
      } finally {
        setIsLoading(false)
      }
    }

    void loadData()
  }, [projectId, user, isBlocked])

  const handleSaveSummary = async () => {
    if (!user || !summaryTitle || !summaryContent) return
    setIsSavingSummary(true)
    setSummaryMessage(null)

    const result = await saveProjectSummary(
      {
        projectId,
        organizationId,
        title: summaryTitle,
        content: summaryContent,
        createdBy: user.id,
      },
      user.id
    )

    if (result.success && result.summary) {
      setSummaries((prev) => [result.summary!, ...prev.filter((s) => s.id !== result.summary!.id)])
      setSummaryMessage("Summary saved!")
      setSummaryTitle("")
      setSummaryContent("")
    } else {
      setSummaryMessage(result.error ?? "Failed to save summary")
    }

    setIsSavingSummary(false)
  }

  const handleCreateReport = async () => {
    if (!user || !reportTitle || !reportContent) return
    setIsCreatingReport(true)
    setReportMessage(null)

    const result = await createNGOReport(
      {
        projectId,
        organizationId,
        title: reportTitle,
        reportType: "CUSTOM",
        sections: [
          {
            id: "main",
            title: "Report Content",
            content: reportContent,
            order: 1,
            includeInExport: true,
          },
        ],
        generatedBy: user.id,
      },
      user.id
    )

    if (result.success && result.report) {
      setReports((prev) => [result.report!, ...prev])
      setReportMessage("Report created!")
    } else {
      setReportMessage(result.error ?? "Failed to create report")
    }

    setIsCreatingReport(false)
  }

  // ── Access Denied ──────────────────────────────────────────────
  if (isBlocked) {
    return (
      <div className="flex flex-col items-center justify-center min-h-64 py-16 px-6 text-center">
        <div className="text-5xl mb-4">🔒</div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">Access Restricted</h2>
        <p className="text-gray-600 max-w-sm mb-4">
          The NGO SAAS module is exclusively available to{" "}
          <strong>Enterprise subscription</strong> holders with explicit access granted by your
          administrator.
        </p>
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800 max-w-sm">
          <strong>Current plan:</strong> {label}
          <br />
          Contact{" "}
          <a href="mailto:sales@techpigeon.com.pk" className="underline">
            sales@techpigeon.com.pk
          </a>{" "}
          to upgrade to Enterprise.
        </div>
      </div>
    )
  }

  const tabClass = (tab: NGOTab) =>
    `flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg transition-colors ${
      activeTab === tab
        ? "bg-indigo-700 text-white"
        : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
    }`

  return (
    <div className="min-h-[600px]">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          🌐 NGO SAAS Module
          <span className="text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-medium">
            Enterprise
          </span>
        </h2>
        <p className="text-sm text-gray-500 mt-1">
          Project: <code className="text-xs bg-gray-100 px-1 rounded">{projectId}</code>
        </p>
      </div>

      <div className="flex gap-6">
        {/* Sidebar Tabs */}
        <nav className="flex flex-col gap-1 w-48 flex-shrink-0">
          {NGO_TABS.map((tab: NGOTabConfig) => (
            <button
              key={tab.id}
              className={tabClass(tab.id)}
              onClick={() => setActiveTab(tab.id)}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </nav>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {isLoading ? (
            <div className="text-center py-12 text-gray-500">Loading…</div>
          ) : (
            <>
              {/* Documents Tab */}
              {activeTab === "documents" && (
                <div className="space-y-6">
                  <DataUpload
                    projectId={projectId}
                    onUploaded={(doc) => setDocuments((prev) => [doc, ...prev])}
                  />

                  {documents.length > 0 && (
                    <div>
                      <h4 className="text-sm font-semibold text-gray-700 mb-3">
                        Uploaded Documents ({documents.length})
                      </h4>
                      <div className="space-y-2">
                        {documents.map((doc) => (
                          <div
                            key={doc.id}
                            className="flex items-center gap-3 bg-white rounded-xl border p-3"
                          >
                            <span className="text-xl">
                              {doc.fileType === "PDF"
                                ? "📄"
                                : doc.fileType === "CSV" || doc.fileType === "XLSX"
                                ? "📊"
                                : "📋"}
                            </span>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900 truncate">{doc.title}</p>
                              <p className="text-xs text-gray-500">
                                {doc.documentType} &bull;{" "}
                                {new Date(doc.createdAt).toLocaleDateString()}
                              </p>
                            </div>
                            <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                              {doc.fileType}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Data Upload Tab */}
              {activeTab === "data-upload" && (
                <div>
                  <p className="text-sm text-gray-600 mb-4">
                    Upload CSV or Excel files to extract and analyze data. The system will parse
                    column headers and rows for use in reports.
                  </p>
                  <DataUpload
                    projectId={projectId}
                    onUploaded={(doc) => setDocuments((prev) => [doc, ...prev])}
                  />
                </div>
              )}

              {/* Summaries Tab */}
              {activeTab === "summaries" && (
                <div className="space-y-6">
                  <div className="bg-white rounded-xl border p-4 space-y-4">
                    <h4 className="text-sm font-semibold text-gray-900">New Project Summary</h4>
                    <input
                      type="text"
                      value={summaryTitle}
                      onChange={(e) => setSummaryTitle(e.target.value)}
                      placeholder="Summary title"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <textarea
                      value={summaryContent}
                      onChange={(e) => setSummaryContent(e.target.value)}
                      placeholder="Write your project summary here…"
                      rows={8}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm resize-y focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    {summaryMessage && (
                      <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                        {summaryMessage}
                      </div>
                    )}
                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={handleSaveSummary}
                        disabled={isSavingSummary || !summaryTitle || !summaryContent}
                        className="px-4 py-2 bg-indigo-700 hover:bg-indigo-800 text-white text-sm rounded-lg disabled:opacity-50"
                      >
                        {isSavingSummary ? "Saving…" : "Save Summary"}
                      </button>
                    </div>
                  </div>

                  {summaries.length > 0 && (
                    <div>
                      <h4 className="text-sm font-semibold text-gray-700 mb-3">
                        Saved Summaries ({summaries.length})
                      </h4>
                      {summaries.map((summary) => (
                        <div
                          key={summary.id}
                          className="bg-white rounded-xl border p-4 mb-3"
                          onClick={() => {
                            setSummaryTitle(summary.title)
                            setSummaryContent(summary.content)
                          }}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              setSummaryTitle(summary.title)
                              setSummaryContent(summary.content)
                            }
                          }}
                        >
                          <h5 className="font-medium text-gray-900 text-sm">{summary.title}</h5>
                          <p className="text-xs text-gray-500 mt-1">
                            {new Date(summary.createdAt).toLocaleDateString()} &bull; v{summary.version}
                          </p>
                          <p className="text-sm text-gray-600 mt-2 line-clamp-3">
                            {summary.content}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Reports Tab */}
              {activeTab === "reports" && (
                <div className="space-y-6">
                  <div className="bg-white rounded-xl border p-4 space-y-4">
                    <h4 className="text-sm font-semibold text-gray-900">Create Report</h4>
                    <input
                      type="text"
                      value={reportTitle}
                      onChange={(e) => setReportTitle(e.target.value)}
                      placeholder="Report title"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <textarea
                      value={reportContent}
                      onChange={(e) => setReportContent(e.target.value)}
                      placeholder="Write your report content here…"
                      rows={10}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm resize-y focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    {reportMessage && (
                      <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                        {reportMessage}
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={handleCreateReport}
                      disabled={isCreatingReport || !reportTitle || !reportContent}
                      className="px-4 py-2 bg-indigo-700 hover:bg-indigo-800 text-white text-sm rounded-lg disabled:opacity-50"
                    >
                      {isCreatingReport ? "Creating…" : "Create Report"}
                    </button>
                  </div>

                  {/* Export Section */}
                  {reportContent && (
                    <ReportGenerator
                      organizationId={organizationId}
                      content={reportContent}
                      reportTitle={reportTitle}
                    />
                  )}

                  {/* Report History */}
                  {reports.length > 0 && (
                    <div>
                      <h4 className="text-sm font-semibold text-gray-700 mb-3">
                        Report History ({reports.length})
                      </h4>
                      {reports.map((report) => (
                        <div
                          key={report.id}
                          className="bg-white rounded-xl border p-4 mb-3 cursor-pointer hover:shadow-sm"
                          onClick={() => {
                            setReportTitle(report.title)
                            setReportContent(
                              report.sections.map((s) => s.content).join("\n\n")
                            )
                          }}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              setReportTitle(report.title)
                              setReportContent(
                                report.sections.map((s) => s.content).join("\n\n")
                              )
                            }
                          }}
                        >
                          <h5 className="font-medium text-gray-900 text-sm">{report.title}</h5>
                          <p className="text-xs text-gray-500 mt-0.5">
                            {report.reportType} &bull;{" "}
                            {new Date(report.generatedAt).toLocaleDateString()}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Settings Tab */}
              {activeTab === "settings" && (
                <OrganizationSettings organizationId={organizationId} />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
