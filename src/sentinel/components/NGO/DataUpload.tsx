/**
 * Sentinel SAAS - Data Upload Component
 *
 * Handles document and CSV/Excel uploads for NGO SAAS module.
 */

import React, { useState, useRef } from "react"
import { uploadNGODocument } from "../../api/ngo-saas"
import { useSentinelAuth } from "../../hooks/useSentinelAuth"
import { MAX_UPLOAD_SIZE_MB } from "../../config"
import type { DocumentType } from "../../types/index"
import type { NGODocument } from "../../types/ngo-saas"

interface DataUploadProps {
  projectId: string
  onUploaded?: (doc: NGODocument) => void
}

const ACCEPTED_TYPES: Record<string, string> = {
  "application/pdf": ".pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
  "text/csv": ".csv",
  "text/plain": ".txt",
}

const MAX_SIZE_MB = MAX_UPLOAD_SIZE_MB

export function DataUpload({ projectId, onUploaded }: DataUploadProps) {
  const { user } = useSentinelAuth()
  const [dragActive, setDragActive] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [documentType, setDocumentType] = useState<DocumentType>("PROPOSAL")
  const [title, setTitle] = useState("")
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true)
    } else if (e.type === "dragleave") {
      setDragActive(false)
    }
  }

  const validateFile = (file: File): string | null => {
    if (!Object.keys(ACCEPTED_TYPES).includes(file.type)) {
      return "Unsupported file type. Accepted: PDF, DOCX, XLSX, CSV, TXT"
    }
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      return `File size must be under ${MAX_SIZE_MB}MB`
    }
    return null
  }

  const selectFile = (file: File) => {
    const validationError = validateFile(file)
    if (validationError) {
      setError(validationError)
      return
    }
    setError(null)
    setSelectedFile(file)
    if (!title) {
      setTitle(file.name.replace(/\.[^/.]+$/, ""))
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragActive(false)
    if (e.dataTransfer.files[0]) {
      selectFile(e.dataTransfer.files[0])
    }
  }

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      selectFile(e.target.files[0])
    }
  }

  const handleUpload = async () => {
    if (!selectedFile || !user) return
    setIsUploading(true)
    setError(null)
    setSuccess(null)

    const result = await uploadNGODocument(
      {
        projectId,
        documentType,
        title: title || selectedFile.name,
        file: selectedFile,
        extractContent: true,
        runAIAnalysis: false,
      },
      user.id
    )

    if (result.success && result.document) {
      setSuccess(`"${result.document.title}" uploaded successfully!`)
      setSelectedFile(null)
      setTitle("")
      if (fileRef.current) fileRef.current.value = ""
      onUploaded?.(result.document)
    } else {
      setError(result.error ?? "Upload failed")
    }

    setIsUploading(false)
  }

  const docTypeLabels: Record<DocumentType, string> = {
    PROPOSAL: "📄 Proposal",
    TEMPLATE: "📋 Template",
    REPORT: "📊 Report",
    DATA_FILE: "📈 Data File (CSV/Excel)",
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold text-gray-900 mb-1">Upload Document</h3>
        <p className="text-sm text-gray-500">
          Upload proposals, templates, reports, or CSV/Excel data files.
          Max {MAX_SIZE_MB}MB per file.
        </p>
      </div>

      {/* Drop Zone */}
      <div
        className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer ${
          dragActive
            ? "border-indigo-500 bg-indigo-50"
            : selectedFile
            ? "border-green-400 bg-green-50"
            : "border-gray-300 hover:border-indigo-400 hover:bg-gray-50"
        }`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={() => fileRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && fileRef.current?.click()}
        aria-label="Upload file"
      >
        <input
          ref={fileRef}
          type="file"
          className="hidden"
          accept={Object.values(ACCEPTED_TYPES).join(",")}
          onChange={handleFileInput}
        />

        {selectedFile ? (
          <div>
            <div className="text-3xl mb-2">
              {selectedFile.name.endsWith(".pdf")
                ? "📄"
                : selectedFile.name.endsWith(".csv")
                ? "📊"
                : selectedFile.name.endsWith(".xlsx")
                ? "📈"
                : "📋"}
            </div>
            <p className="font-medium text-gray-900">{selectedFile.name}</p>
            <p className="text-sm text-gray-500">
              {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
            </p>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                setSelectedFile(null)
                setTitle("")
                if (fileRef.current) fileRef.current.value = ""
              }}
              className="mt-2 text-xs text-red-600 hover:underline"
            >
              Remove
            </button>
          </div>
        ) : (
          <div>
            <div className="text-4xl mb-2">☁️</div>
            <p className="text-gray-600 font-medium">
              {dragActive ? "Drop file here" : "Drag & drop or click to browse"}
            </p>
            <p className="text-xs text-gray-400 mt-1">PDF, DOCX, XLSX, CSV, TXT up to {MAX_SIZE_MB}MB</p>
          </div>
        )}
      </div>

      {/* Form Fields */}
      {selectedFile && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Document Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter a descriptive title"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Document Type</label>
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(docTypeLabels) as DocumentType[]).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setDocumentType(type)}
                  className={`px-3 py-2 rounded-lg text-sm text-left transition-colors ${
                    documentType === type
                      ? "bg-indigo-700 text-white"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  {docTypeLabels[type]}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {success && (
            <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-sm text-green-700">
              ✓ {success}
            </div>
          )}

          <button
            type="button"
            onClick={handleUpload}
            disabled={isUploading || !selectedFile}
            className="w-full py-2.5 bg-indigo-700 hover:bg-indigo-800 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            {isUploading ? "Uploading…" : "Upload Document"}
          </button>
        </div>
      )}

      {error && !selectedFile && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {success && !selectedFile && (
        <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-sm text-green-700">
          ✓ {success}
        </div>
      )}
    </div>
  )
}
