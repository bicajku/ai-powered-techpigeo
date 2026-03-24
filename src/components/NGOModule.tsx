import { useState, useRef, useEffect } from "react"
import { v4 as uuidv4 } from "uuid"
import type { Icon } from "@phosphor-icons/react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Separator } from "@/components/ui/separator"
import {
  HandHeart,
  Target,
  Scroll,
  Translate,
  EnvelopeSimple,
  ChartBar,
  ArrowClockwise,
  Warning,
  CheckCircle,
  Sparkle,
  Users,
  FolderOpen,
  FilePlus,
  UploadSimple,
  FileText,
  FileCsv,
  Download,
  Buildings,
  Palette,
  Phone,
  At,
  MapPin,
  FloppyDisk,
  Trash,
  PencilSimple,
  Signature,
  UserPlus,
} from "@phosphor-icons/react"
import { motion, AnimatePresence } from "framer-motion"
import { toast } from "sonner"
import { sentinelQuery } from "@/lib/sentinel-query-pipeline"
import { consumeReviewCredit, getFeatureEntitlements } from "@/lib/subscription"
import { isNeonConfigured } from "@/lib/neon-client"
import { isGeminiConfigured } from "@/lib/gemini-client"
import { isCopilotConfigured } from "@/lib/copilot-client"
import { logQuery } from "@/lib/sentinel-brain"
import { REPORT_BRAND } from "@/lib/report-branding"
import { performExternalSourceCheck, getExternalSourceIntegrationSummary } from "@/lib/external-source-check"
import { getNGOAccessLevel, canWrite, canDelete, canManageTeam, getTeamMembers, addTeamMember, updateMemberAccess, removeMember } from "@/lib/ngo-team"
import { UserProfile, NGOAccessLevel, NGOTeamMember } from "@/types"
import mammoth from "mammoth"
import * as pdfjsLib from "pdfjs-dist"

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString()

// --- Types ---

interface NGOResult {
  header: string
  mainContent: string
  sdgTags: string[]
  ethicalWarnings: string[]
  suggestedKPIs: string[]
  emailVariants?: { type: string; subject: string; body: string }[]
}

interface NGOAction {
  id: string
  label: string
  icon: Icon
  description: string
  placeholder: string
  inputLabel: string
}

interface EnterpriseProject {
  id: string
  name: string
  description: string
  createdAt: number
}

interface ProjectFile {
  id: string
  projectId: string
  name: string
  type: "document" | "csv" | "other"
  size: number
  content: string
  uploadedAt: number
}

interface OrgSettings {
  orgName: string
  logoUrl: string
  primaryColor: string
  secondaryColor: string
  phone: string
  email: string
  address: string
}

// --- Style Helpers ---
const resolveHexToRgb = (hex: string) => {
  const clean = hex.replace(/^#/, "")
  if (clean.length === 6) {
    return `${parseInt(clean.slice(0, 2), 16)} ${parseInt(clean.slice(2, 4), 16)} ${parseInt(clean.slice(4, 6), 16)}`
  }
  if (clean.length === 3) {
    return `${parseInt(clean[0] + clean[0], 16)} ${parseInt(clean[1] + clean[1], 16)} ${parseInt(clean[2] + clean[2], 16)}`
  }
  return "16 185 129" // emerald-500 fallback
}

const getBrandedStyles = (org: OrgSettings | null, hasLoaded: boolean) => {
  if (!hasLoaded || !org || (!org.primaryColor && !org.secondaryColor)) {
    return {} // Default classes will just fall back nicely if no style overrides are present.
  }
  const p = org.primaryColor || "#10b981" // emerald-500 equivalent
  const s = org.secondaryColor || "#34d399" // emerald-400 equivalent
  
  return {
    "--ngo-primary": p,
    "--ngo-primary-rgb": resolveHexToRgb(p),
    "--ngo-secondary": s,
    "--ngo-secondary-rgb": resolveHexToRgb(s),
  } as React.CSSProperties
}

// --- Action Definitions ---

const NGO_ACTIONS: NGOAction[] = [
  {
    id: "grant",
    label: "Grant Alignment",
    icon: Scroll,
    description: "Map your project to UN SDGs and generate a structured 5-section donor proposal.",
    placeholder: "Enter your project title, rough description, and target donor.\n\nExample:\nProject: Girls Digital Literacy in AJK\nDescription: Teaching coding and digital skills to 500 girls in rural AJK communities, ages 12-18.\nDonor: USAID / UN Women",
    inputLabel: "Project Title + Description + Target Donor",
  },
  {
    id: "impact",
    label: "Impact Scan",
    icon: ChartBar,
    description: "Extract measurable Outputs vs Outcomes from past project reports and generate a LogFrame.",
    placeholder: "Paste your past project report or summary here.\n\nExample:\nOver 6 months we trained 200 women in tailoring. 150 completed the course. 80 are now self-employed. 30% reported income increase...",
    inputLabel: "Past Project Report / Summary",
  },
  {
    id: "narrative",
    label: "Ethical Narrative",
    icon: HandHeart,
    description: "Convert raw field notes into a donor-ready story with automatic PII anonymization.",
    placeholder: "Paste your raw field notes or beneficiary interviews here.\n\nExample:\nMet with Amina, 32, from village of Chakothi...",
    inputLabel: "Raw Field Notes / Interview Transcripts",
  },
  {
    id: "outreach",
    label: "Plain Language",
    icon: Translate,
    description: "Simplify complex policy or technical text to a 6th-grade reading level for communities.",
    placeholder: "Paste the technical policy, legal, or donor text you want simplified.",
    inputLabel: "Technical / Policy Text to Simplify",
  },
  {
    id: "email",
    label: "Donor Email",
    icon: EnvelopeSimple,
    description: "Generate 3 professionally crafted email variations: Cold Outreach, Follow-up, and Thank You.",
    placeholder: "Describe your organization, project, and donor context.",
    inputLabel: "Organization + Project + Donor Context",
  },
]

const REQUIRED_ACTION_SECTIONS: Record<string, string[]> = {
  grant: [
    "Executive Summary",
    "Problem Statement",
    "Proposed Solution",
    "Sustainability Plan",
    "Budget Narrative",
  ],
  impact: [
    "Outputs vs Outcomes",
    "LogFrame",
    "Means of Verification",
    "Assumptions",
  ],
  narrative: [
    "Context",
    "Beneficiary Journey",
    "Transformation",
  ],
  outreach: [
    "Plain Language Version",
    "What This Means For You",
  ],
  email: [
    "Cold Outreach",
    "Follow-up",
    "Thank You",
  ],
}

// --- Storage keys ---

const PROJECTS_KEY = "ngo-enterprise-projects"
const FILES_KEY = "ngo-project-files"
const ORG_SETTINGS_KEY = "ngo-org-settings"

// --- KV helpers (spark.kv with localStorage fallback) ---

async function kvGet<T>(key: string): Promise<T | undefined> {
  try {
    if (typeof spark !== "undefined" && spark.kv?.get) {
      return await spark.kv.get<T>(key)
    }
  } catch (e) { console.warn("[NGOModule] spark.kv.get failed:", e) }
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : undefined
  } catch (e) {
    console.warn("[NGOModule] localStorage.getItem failed:", e)
    return undefined
  }
}

async function kvSet<T>(key: string, value: T): Promise<void> {
  try {
    if (typeof spark !== "undefined" && spark.kv?.set) {
      await spark.kv.set(key, value)
    }
  } catch (e) { console.warn("[NGOModule] spark.kv.set failed:", e) }
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch (e) { console.warn("[NGOModule] localStorage.setItem failed:", e) }
}

// --- Prompt Builders ---

const PAKISTAN_AJK_CONTEXT = `
Regional Context (MANDATORY):
- Region: Pakistan & Azad Jammu and Kashmir (AJK)
- Standards: SECP NPO registration, FBR exemption, PCP code of ethics
- Context: Post-flood recovery, youth unemployment, girls education barriers
- Terminology: "beneficiaries" not "users", "field officers" not "staff"
- Currency: PKR alongside USD for international donors
- Key SDGs: 1, 2, 3, 4, 5, 6, 13
`

function buildGrantPrompt(input: string): string {
  return `${PAKISTAN_AJK_CONTEXT}

You are a senior grant writer. Generate a structured donor proposal.

INPUT:
${input}

Write a 5-section proposal (Executive Summary, Problem Statement, Proposed Solution, Sustainability Plan, Budget Narrative). Map to 2-4 UN SDGs. Suggest 3-5 KPIs. Flag ethical considerations.

Respond ONLY with valid JSON:
{
  "header": "Proposal title",
  "mainContent": "Full proposal in Markdown",
  "sdgTags": ["SDG X: Name"],
  "ethicalWarnings": [],
  "suggestedKPIs": ["KPI 1"]
}`
}

function buildImpactPrompt(input: string): string {
  return `${PAKISTAN_AJK_CONTEXT}

You are an M&E specialist. Analyze the project report and create a LogFrame Matrix.

INPUT:
${input}

Extract Outputs vs Outcomes. Create a LogFrame table: Level | Description | Indicator | Means of Verification | Assumptions.

Respond ONLY with valid JSON:
{
  "header": "Impact Scan Report",
  "mainContent": "LogFrame in Markdown",
  "sdgTags": [],
  "ethicalWarnings": [],
  "suggestedKPIs": []
}`
}

function buildNarrativePrompt(input: string): string {
  return `${PAKISTAN_AJK_CONTEXT}

You are a humanitarian storytelling specialist. Convert field notes to a donor story with PII anonymization.

INPUT:
${input}

Write a 3-paragraph story (400-500 words). Replace PII: names -> [BENEFICIARY_X], locations -> [COMMUNITY_LOCATION].

Respond ONLY with valid JSON:
{
  "header": "Beneficiary Story",
  "mainContent": "Anonymized story in Markdown",
  "sdgTags": [],
  "ethicalWarnings": ["PII replacements made"],
  "suggestedKPIs": []
}`
}

function buildOutreachPrompt(input: string): string {
  return `${PAKISTAN_AJK_CONTEXT}

You are a plain language specialist. Simplify this text to 6th-grade reading level.

INPUT:
${input}

Rewrite in simple Pakistani English. Max 15 words per sentence. Add "What This Means For You" section.

Respond ONLY with valid JSON:
{
  "header": "Plain Language Version",
  "mainContent": "Simplified content in Markdown",
  "sdgTags": ["SDG 4: Quality Education"],
  "ethicalWarnings": [],
  "suggestedKPIs": []
}`
}

function buildEmailPrompt(input: string): string {
  return `${PAKISTAN_AJK_CONTEXT}

You are a fundraising expert. Generate 3 donor email variations.

INPUT:
${input}

Create: 1) Cold Outreach, 2) Follow-up, 3) Thank You. Each 150-250 words with subject line and CTA.

Respond ONLY with valid JSON:
{
  "header": "Donor Email Suite",
  "mainContent": "Strategy summary in Markdown",
  "sdgTags": [],
  "ethicalWarnings": [],
  "suggestedKPIs": ["Open rate 25%+"],
  "emailVariants": [
    {"type": "Cold Outreach", "subject": "...", "body": "..."},
    {"type": "Follow-up", "subject": "...", "body": "..."},
    {"type": "Thank You", "subject": "...", "body": "..."}
  ]
}`
}

function getPromptForAction(actionId: string, input: string): string {
  switch (actionId) {
    case "grant": return buildGrantPrompt(input)
    case "impact": return buildImpactPrompt(input)
    case "narrative": return buildNarrativePrompt(input)
    case "outreach": return buildOutreachPrompt(input)
    case "email": return buildEmailPrompt(input)
    default: return buildGrantPrompt(input)
  }
}

// --- Response Parser ---

function parseNGOResult(raw: unknown): NGOResult {
  const coerce = (candidate: Partial<NGOResult>): NGOResult => ({
    header: typeof candidate.header === "string" && candidate.header.trim().length > 0
      ? candidate.header
      : "NGO Output",
    mainContent: typeof candidate.mainContent === "string" ? candidate.mainContent : "",
    sdgTags: Array.isArray(candidate.sdgTags) ? candidate.sdgTags.filter((x): x is string => typeof x === "string") : [],
    ethicalWarnings: Array.isArray(candidate.ethicalWarnings) ? candidate.ethicalWarnings.filter((x): x is string => typeof x === "string") : [],
    suggestedKPIs: Array.isArray(candidate.suggestedKPIs) ? candidate.suggestedKPIs.filter((x): x is string => typeof x === "string") : [],
    emailVariants: Array.isArray(candidate.emailVariants)
      ? candidate.emailVariants.filter((x): x is { type: string; subject: string; body: string } =>
          typeof x === "object" &&
          x !== null &&
          typeof (x as { type?: unknown }).type === "string" &&
          typeof (x as { subject?: unknown }).subject === "string" &&
          typeof (x as { body?: unknown }).body === "string"
        )
      : undefined,
  })

  if (typeof raw === "object" && raw !== null) return coerce(raw as NGOResult)
  if (typeof raw !== "string") throw new Error("Unexpected response format")

  const extractHeuristic = (input: string): NGOResult | null => {
    const headerMatch = input.match(/"header"\s*:\s*"([\s\S]*?)"\s*,/)
    const mainMatch = input.match(/"mainContent"\s*:\s*"([\s\S]*?)"\s*(,|})/)
    if (!headerMatch && !mainMatch) return null

    const decode = (value?: string) => {
      if (!value) return ""
      return value
        .replace(/\\n/g, "\n")
        .replace(/\\r/g, "\r")
        .replace(/\\t/g, "\t")
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, "\\")
    }

    return coerce({
      header: decode(headerMatch?.[1]) || "NGO Output",
      mainContent: decode(mainMatch?.[1]),
      ethicalWarnings: ["Recovered partially malformed AI response."],
    })
  }

  let cleaned = raw.trim()
  if (cleaned.startsWith("```json")) cleaned = cleaned.replace(/^```json\s*/, "").replace(/```\s*$/, "")
  else if (cleaned.startsWith("```")) cleaned = cleaned.replace(/^```\s*/, "").replace(/```\s*$/, "")

  const normalized = cleaned
    .trim()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u0000/g, "")

  try {
    return coerce(JSON.parse(normalized) as NGOResult)
  } catch {
    const start = normalized.indexOf("{")
    const end = normalized.lastIndexOf("}")
    if (start !== -1 && end !== -1 && end > start) {
      const sliced = normalized.substring(start, end + 1)
      try {
        return coerce(JSON.parse(sliced) as NGOResult)
      } catch {
        const repaired = sliced
          .replace(/,\s*}/g, "}")
          .replace(/,\s*]/g, "]")
        try {
          return coerce(JSON.parse(repaired) as NGOResult)
        } catch {
          const heuristic = extractHeuristic(repaired)
          if (heuristic) return heuristic
        }
      }
    }

    const heuristic = extractHeuristic(normalized)
    if (heuristic) {
      return heuristic
    }

    // Last resort: treat entire text as mainContent so the user sees something
    if (normalized.length > 100) {
      return coerce({
        header: "NGO Output",
        mainContent: normalized,
        ethicalWarnings: ["AI response was not valid JSON; raw text shown. Content may need manual review."],
      })
    }

    throw new Error("Failed to parse AI output as JSON")
  }
}

// --- Export helpers ---

function getBrandForExport(org: OrgSettings | null) {
  if (org?.orgName) {
    return {
      name: org.orgName,
      primary: org.primaryColor || REPORT_BRAND.colors.primary,
      secondary: org.secondaryColor || REPORT_BRAND.colors.secondary,
      logo: org.logoUrl || "",
      contact: [org.phone, org.email, org.address].filter(Boolean).join(" | "),
    }
  }
  return {
    name: REPORT_BRAND.companyName,
    primary: REPORT_BRAND.colors.primary,
    secondary: REPORT_BRAND.colors.secondary,
    logo: "",
    contact: REPORT_BRAND.contactLine,
  }
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

function formatInlineMarkdown(input: string): string {
  const escaped = escapeHtml(input)
  return escaped
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
}

function renderReportContentHtml(text: string): string {
  const lines = text
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .split("\n")

  const blocks: string[] = []
  let listBuffer: string[] = []

  const flushList = () => {
    if (listBuffer.length > 0) {
      blocks.push(`<ul>${listBuffer.join("")}</ul>`)
      listBuffer = []
    }
  }

  for (const rawLine of lines) {
    const line = rawLine.trim()

    if (!line) {
      flushList()
      continue
    }

    if (/^---+$/.test(line)) {
      flushList()
      blocks.push("<hr />")
      continue
    }

    if (/^###\s+/.test(line)) {
      flushList()
      blocks.push(`<h3>${formatInlineMarkdown(line.replace(/^###\s+/, ""))}</h3>`)
      continue
    }

    if (/^##\s+/.test(line)) {
      flushList()
      blocks.push(`<h2>${formatInlineMarkdown(line.replace(/^##\s+/, ""))}</h2>`)
      continue
    }

    if (/^#\s+/.test(line)) {
      flushList()
      blocks.push(`<h1>${formatInlineMarkdown(line.replace(/^#\s+/, ""))}</h1>`)
      continue
    }

    if (/^[-*]\s+/.test(line)) {
      listBuffer.push(`<li>${formatInlineMarkdown(line.replace(/^[-*]\s+/, ""))}</li>`)
      continue
    }

    flushList()
    blocks.push(`<p>${formatInlineMarkdown(line)}</p>`)
  }

  flushList()
  return blocks.join("")
}

function buildReportHtml(title: string, body: string, brand: ReturnType<typeof getBrandForExport>): string {
  const logoHtml = brand.logo
    ? `<img src="${brand.logo}" alt="${brand.name} logo" style="height:44px;object-fit:contain;" />`
    : `<span style="font-size:20px;font-weight:700;color:${brand.primary};">${brand.name}</span>`
  const renderedBody = renderReportContentHtml(body)
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>${title}</title>
<style>
  *{box-sizing:border-box;}
  body{font-family:Inter,Calibri,sans-serif;margin:0;color:#1C1414;background:#fff;}
  .page{padding:56px 56px 64px 56px;max-width:960px;margin:0 auto;}
  .header{border-bottom:3px solid ${brand.primary};padding-bottom:16px;margin-bottom:28px;display:flex;justify-content:space-between;align-items:center;gap:24px;}
  h1{color:${brand.primary};margin:0 0 14px 0;font-size:28px;line-height:1.25;}
  h2{color:${brand.secondary};border-left:4px solid ${brand.primary};padding-left:10px;margin:24px 0 10px 0;font-size:21px;line-height:1.3;}
  h3{color:${brand.primary};margin:18px 0 8px 0;font-size:17px;line-height:1.35;}
  p{margin:0 0 12px 0;line-height:1.7;text-align:left;white-space:normal;overflow-wrap:anywhere;word-break:break-word;}
  ul{margin:0 0 12px 20px;padding:0;}
  li{margin:0 0 8px 0;line-height:1.65;overflow-wrap:anywhere;word-break:break-word;}
  hr{border:none;border-top:1px solid #D9D9D9;margin:18px 0;}
  .content{font-size:14px;line-height:1.7;text-align:left;overflow-wrap:anywhere;word-break:break-word;}
  .footer{margin-top:56px;border-top:2px solid ${brand.primary};padding-top:16px;text-align:center;font-size:12px;color:#6A5B5B;}
</style>
</head><body>
  <div class="page">
    <div class="header"><div>${logoHtml}</div><div style="text-align:right;font-size:12px;color:#6A5B5B;">${brand.contact}</div></div>
    <h1>${escapeHtml(title)}</h1>
    <div class="content">${renderedBody}</div>
    <div class="footer">${brand.name} — Generated by Sentinel AI · ${new Date().toLocaleDateString()}</div>
  </div>
</body></html>`
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url; a.download = filename
  document.body.appendChild(a); a.click()
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url) }, 500)
}

async function exportAsPDF(title: string, body: string, org: OrgSettings | null) {
  const brand = getBrandForExport(org)
  const html = buildReportHtml(title, body, brand)
  const { default: jsPDF } = await import("jspdf")
  const doc = new jsPDF({ unit: "pt", format: "a4" })
  await doc.html(html, { x: 28, y: 28, width: 539, windowWidth: 1040, margin: [28, 28, 28, 28] })
  doc.save(`${title.replace(/\s+/g, "-")}.pdf`)
}

function exportAsWord(title: string, body: string, org: OrgSettings | null) {
  const brand = getBrandForExport(org)
  const html = buildReportHtml(title, body, brand)
  const blob = new Blob(["\ufeff", html], { type: "application/msword" })
  downloadBlob(blob, `${title.replace(/\s+/g, "-")}.doc`)
}

function exportAsExcel(title: string, rows: string[][], org: OrgSettings | null) {
  const brand = getBrandForExport(org)
  const colSpan = rows[0]?.length || 1
  const headerRow = `<tr><th colspan="${colSpan}" style="background:${brand.primary};color:#fff;padding:8px;">${title} — ${brand.name}</th></tr>`
  const dataRows = rows.map(row => `<tr>${row.map(cell => `<td style="border:1px solid #ddd;padding:8px;white-space:normal;word-break:break-word;overflow-wrap:anywhere;vertical-align:top;line-height:1.5;">${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")
  const html = `<html><head><meta charset="UTF-8"></head><body><table style="border-collapse:collapse;width:100%;">${headerRow}${dataRows}</table></body></html>`
  const blob = new Blob(["\ufeff", html], { type: "application/vnd.ms-excel" })
  downloadBlob(blob, `${title.replace(/\s+/g, "-")}.xls`)
}

// --- Main Component ---

interface NGOModuleProps {
  userId: string
  user?: UserProfile
}

export function NGOModule({ userId, user }: NGOModuleProps) {
  // AI Actions state
  const [activeAction, setActiveAction] = useState<string>("grant")
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [result, setResult] = useState<NGOResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copiedEmail, setCopiedEmail] = useState<number | null>(null)

  // Projects state
  const [projects, setProjects] = useState<EnterpriseProject[]>([])
  const [projectsLoaded, setProjectsLoaded] = useState(false)
  const [newProjectName, setNewProjectName] = useState("")
  const [newProjectDesc, setNewProjectDesc] = useState("")
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)

  // Files state
  const [projectFiles, setProjectFiles] = useState<ProjectFile[]>([])
  const [filesLoaded, setFilesLoaded] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Reports state
  const [reportTitle, setReportTitle] = useState("")
  const [reportBody, setReportBody] = useState("")
  const [reportGenerating, setReportGenerating] = useState(false)
  const [savedReports, setSavedReports] = useState<{ id: string; title: string; body: string; createdAt: number; status?: "draft" | "signed" | "approved"; generatedBy?: string }[]>([])
  const [reportsLoaded, setReportsLoaded] = useState(false)

  // Org settings state
  const [orgSettings, setOrgSettings] = useState<OrgSettings>({
    orgName: "", logoUrl: "", primaryColor: "#5CC3EB", secondaryColor: "#8CB499",
    phone: "", email: "", address: "",
  })
  const [orgLoaded, setOrgLoaded] = useState(false)
  const [orgSaving, setOrgSaving] = useState(false)

  // Knowledge Base files for AI context
  const [uploadedKBFiles, setUploadedKBFiles] = useState<ProjectFile[]>([])
  const [kbContentSummary, setKbContentSummary] = useState("")
  const [uploadingKBFile, setUploadingKBFile] = useState(false)
  const [useWebEvidence, setUseWebEvidence] = useState(false)
  const [webEvidenceSummary, setWebEvidenceSummary] = useState("")
  const kbFileInputRef = useRef<HTMLInputElement>(null)

  const entitlements = user ? getFeatureEntitlements(user) : null
  const canAccessNGOModule = user?.role === "admin" || !!entitlements?.canAccessNGOSaaS

  // --- Access level ---
  const accessLevel = getNGOAccessLevel(user)
  const hasWriteAccess = canWrite(accessLevel)
  const hasDeleteAccess = canDelete(accessLevel)
  const hasTeamAccess = canManageTeam(accessLevel)

  // --- Team state ---
  const [teamMembers, setTeamMembers] = useState<NGOTeamMember[]>([])
  const [teamLoaded, setTeamLoaded] = useState(false)
  const [newMemberEmail, setNewMemberEmail] = useState("")
  const [newMemberName, setNewMemberName] = useState("")
  const [newMemberPass, setNewMemberPass] = useState("")
  const [newMemberLevel, setNewMemberLevel] = useState<NGOAccessLevel>("user")
  const [addingMember, setAddingMember] = useState(false)

  const currentAction = NGO_ACTIONS.find((a) => a.id === activeAction) ?? NGO_ACTIONS[0]
  const neonReady = isNeonConfigured()
  const geminiReady = isGeminiConfigured()
  const copilotReady = isCopilotConfigured()
  const sparkReady = typeof spark !== "undefined" && typeof spark.llm === "function"
  const webEvidenceIntegration = getExternalSourceIntegrationSummary()

  // Load helpers

  const loadProjects = async () => {
    if (projectsLoaded) return
    const data = await kvGet<EnterpriseProject[]>(`${PROJECTS_KEY}-${userId}`)
    setProjects(data || [])
    setProjectsLoaded(true)
  }

  const loadFiles = async () => {
    if (filesLoaded) return
    const data = await kvGet<ProjectFile[]>(`${FILES_KEY}-${userId}`)
    setProjectFiles(data || [])
    setFilesLoaded(true)
  }

  const loadOrgSettings = async () => {
    if (orgLoaded) return
    const data = await kvGet<OrgSettings>(`${ORG_SETTINGS_KEY}-${userId}`)
    if (data) setOrgSettings(data)
    setOrgLoaded(true)
  }

  const loadReports = async () => {
    if (reportsLoaded) return
    const data = await kvGet<typeof savedReports>(`ngo-reports-${userId}`)
    setSavedReports(data || [])
    setReportsLoaded(true)
  }

  const loadTeamMembers = async () => {
    if (teamLoaded) return
    const members = await getTeamMembers(userId)
    setTeamMembers(members)
    setTeamLoaded(true)
  }

  const handleAddMember = async () => {
    if (!newMemberEmail || !newMemberName || !newMemberPass) {
      toast.error("All fields are required"); return
    }
    setAddingMember(true)
    const result = await addTeamMember(userId, newMemberEmail, newMemberPass, newMemberName, newMemberLevel)
    setAddingMember(false)
    if (result.success && result.member) {
      setTeamMembers(prev => [...prev, result.member!])
      setNewMemberEmail(""); setNewMemberName(""); setNewMemberPass(""); setNewMemberLevel("user")
      toast.success(`${result.member.fullName} added to team`)
    } else {
      toast.error(result.error || "Failed to add member")
    }
  }

  const handleUpdateMemberAccess = async (memberId: string, level: NGOAccessLevel) => {
    const result = await updateMemberAccess(userId, memberId, level)
    if (result.success) {
      setTeamMembers(prev => prev.map(m => m.id === memberId ? { ...m, accessLevel: level } : m))
      toast.success("Access level updated")
    } else {
      toast.error(result.error || "Failed to update")
    }
  }

  const handleRemoveMember = async (memberId: string) => {
    const result = await removeMember(userId, memberId)
    if (result.success) {
      setTeamMembers(prev => prev.filter(m => m.id !== memberId))
      toast.success("Member removed")
    } else {
      toast.error(result.error || "Failed to remove member")
    }
  }

  const handleSignReport = (reportId: string) => {
    if (!user) return
    const signatureBlock = `\n\n──────────────────────────\nApproved by: ${user.fullName}\nEmail: ${user.email}\nDate: ${new Date().toLocaleDateString()}\nRole: ${user.role === "admin" ? "Super Admin" : "Owner"}\n──────────────────────────`
    setSavedReports(prev => {
      const updated = prev.map(r =>
        r.id === reportId
          ? { ...r, body: r.body + signatureBlock, status: "approved" as const }
          : r
      )
      kvSet(`ngo-reports-${userId}`, updated)
      return updated
    })
    toast.success("Report approved. It is now available for export and visible to all users.")
  }

  const handleSaveGeneratedAsDraft = async () => {
    if (!result) {
      toast.error("No generated output to save")
      return
    }
    if (!user) {
      toast.error("Please sign in")
      return
    }

    const title = `${currentAction.label} - ${new Date().toLocaleDateString()}`
    const latestOrgSettings = await kvGet<OrgSettings>(`${ORG_SETTINGS_KEY}-${userId}`)
    const body = buildBrandedReportBody(title, result.mainContent, latestOrgSettings || orgSettings)
    const newReport = {
      id: uuidv4(),
      title,
      body,
      createdAt: Date.now(),
      status: "draft" as const,
      generatedBy: user?.fullName || "Unknown",
    }

    const updated = [newReport, ...savedReports]
    setSavedReports(updated)
    setReportTitle(title)
    setReportBody(body)
    await kvSet(`ngo-reports-${userId}`, updated)
    setReportsLoaded(true)
    toast.success("Saved to Reports as Draft")
  }

  const handleDeleteReport = (reportId: string) => {
    setSavedReports(prev => {
      const updated = prev.filter(r => r.id !== reportId)
      kvSet(`ngo-reports-${userId}`, updated)
      return updated
    })
    toast.success("Report deleted")
  }

  // Persist NGO Module State
  useEffect(() => {
    const loadNGOState = async () => {
      const saved = await kvGet<{ activeAction: string; input: string; uploadedKBFiles: ProjectFile[]; kbContentSummary?: string; useWebEvidence?: boolean }>(
        `ngo-module-state-${userId}`
      )
      if (saved) {
        setActiveAction(saved.activeAction)
        setInput(saved.input)
        setUploadedKBFiles(saved.uploadedKBFiles)
        setKbContentSummary(saved.kbContentSummary || "")
        setUseWebEvidence(Boolean(saved.useWebEvidence))
      }
    }
    loadNGOState()
  }, [userId])

  useEffect(() => {
    const saveNGOState = async () => {
      await kvSet(`ngo-module-state-${userId}`, {
        activeAction,
        input,
        uploadedKBFiles,
        kbContentSummary,
        useWebEvidence,
      })
    }
    saveNGOState()
  }, [activeAction, input, uploadedKBFiles, kbContentSummary, useWebEvidence, userId])

  const handleActionChange = (actionId: string) => {
    setActiveAction(actionId); setInput(""); setResult(null); setError(null); setWebEvidenceSummary("")
  }

  const extractTextFromFile = async (file: File): Promise<string> => {
    const ext = file.name.split(".").pop()?.toLowerCase() || ""

    if (ext === "docx") {
      try {
        const arrayBuffer = await file.arrayBuffer()
        const extracted = await mammoth.extractRawText({ arrayBuffer })
        if (extracted.value && extracted.value.trim().length > 0) return extracted.value
      } catch (e) {
        console.warn("[NGOModule] mammoth docx extraction failed:", e)
      }
    }

    if (ext === "pdf") {
      try {
        const arrayBuffer = await file.arrayBuffer()
        const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise
        const pages: string[] = []
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i)
          const textContent = await page.getTextContent()
          const pageText = textContent.items
            .map((item) => ("str" in item ? (item as { str: string }).str : ""))
            .join(" ")
          if (pageText.trim()) pages.push(pageText.trim())
        }
        const fullText = pages.join("\n\n")
        if (fullText.trim().length > 0) return fullText
      } catch (e) {
        console.warn("[NGOModule] PDF extraction failed:", e)
      }
    }

    if (["txt", "md", "csv", "json", "xml", "html", "htm"].includes(ext)) {
      try {
        const text = await file.text()
        if (text.trim().length > 0) return text
      } catch (e) {
        console.warn("[NGOModule] text extraction failed:", e)
      }
    }

    // Last resort: try reading as text, but validate it looks like readable content
    try {
      const text = await file.text()
      const printable = text.replace(/[\x20-\x7E\n\r\t]/g, "")
      const ratio = text.length > 0 ? (text.length - printable.length) / text.length : 0
      if (ratio > 0.85 && text.trim().length > 20) return text
    } catch { /* not text-readable */ }

    return ""
  }

  const extractProjectDetailsFromText = (text: string, fileName: string) => {
    const normalized = text
      .replace(/\u0000/g, "")
      .replace(/\r/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim()

    const lines = normalized.split("\n").map((line) => line.trim()).filter(Boolean)
    const firstMeaningfulLine = lines.find((line) => line.length >= 8 && line.length <= 140)
    const fallbackTitle = fileName.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ")

    const sentences = normalized
      .replace(/\s+/g, " ")
      .split(/(?<=[.!?])\s+/)
      .filter(Boolean)

    const overview = sentences.slice(0, 4).join(" ").slice(0, 800)
    const low = normalized.toLowerCase()

    const donorCandidates = ["USAID", "UN Women", "UNICEF", "UNDP", "World Bank", "ADB", "FCDO", "EU", "GIZ", "JICA"]
    const detectedDonor = donorCandidates.find((donor) => low.includes(donor.toLowerCase())) || "Not explicitly found"

    const geoCandidates = ["Pakistan", "AJK", "Azad Jammu and Kashmir", "Lahore", "Islamabad", "Karachi", "Peshawar", "Muzaffarabad"]
    const detectedGeography = geoCandidates.filter((place) => low.includes(place.toLowerCase()))

    const beneficiaryCandidates = ["girls", "women", "youth", "children", "students", "teachers", "communities", "families"]
    const detectedBeneficiaries = beneficiaryCandidates.filter((tag) => low.includes(tag))

    return {
      title: firstMeaningfulLine || fallbackTitle,
      overview: overview || normalized.slice(0, 500),
      donor: detectedDonor,
      geography: detectedGeography.length > 0 ? detectedGeography.join(", ") : "Pakistan / AJK",
      beneficiaries: detectedBeneficiaries.length > 0 ? detectedBeneficiaries.join(", ") : "General beneficiary groups",
      wordCount: normalized.split(/\s+/).filter(Boolean).length,
    }
  }

  const buildProjectInputTemplate = (details: ReturnType<typeof extractProjectDetailsFromText>) => {
    return `Project: ${details.title}\nDescription: ${details.overview}\nTarget Beneficiaries: ${details.beneficiaries}\nLocation: ${details.geography}\nDonor: ${details.donor}`
  }

  const buildBrandedReportBody = (title: string, content: string, branding: OrgSettings | null) => {
    const brand = getBrandForExport(branding)
    const normalizedContent = content
      .replace(/\r\n/g, "\n")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
    return `# ${title}

**Organization:** ${brand.name}
${brand.contact ? `**Contact:** ${brand.contact}` : ""}
**Prepared:** ${new Date().toLocaleDateString()}
**Generated via:** Sentinel Social NGO-SAAS

---

${normalizedContent}

---

_This draft is prepared for donor/funding review and should be approved by organization leadership before external submission._`
  }

  const hasRequiredSections = (actionId: string, mainContent: string) => {
    const required = REQUIRED_ACTION_SECTIONS[actionId] || []
    if (required.length === 0) return true
    const low = mainContent.toLowerCase()
    return required.every((section) => {
      const words = section.toLowerCase().split(/\s+/)
      // Require all words from the section name to appear near each other
      return words.every((w) => low.includes(w))
    })
  }

  const enhanceResultForDonorReadiness = async (candidate: NGOResult) => {
    const contentLength = candidate.mainContent.trim().length
    const appearsIncomplete =
      contentLength < 1500 ||
      !hasRequiredSections(activeAction, candidate.mainContent)

    if (!appearsIncomplete) {
      return candidate
    }

    const requiredSections = REQUIRED_ACTION_SECTIONS[activeAction] || []
    const improvePrompt = `${PAKISTAN_AJK_CONTEXT}

You are a senior NGO proposal editor. Improve the response into a complete, donor-ready output.

Action: ${currentAction.label}
User input:
${input}

Existing AI draft:
${JSON.stringify(candidate, null, 2)}

Requirements:
- Ensure a complete, executable response with all key sections filled.
- Required sections: ${requiredSections.join(", ") || "N/A"}
- Maintain factual caution and ethical safeguards.
- Keep PII anonymization where relevant.
- Produce actionable KPIs and practical recommendations.

Respond ONLY with valid JSON:
{
  "header": "...",
  "mainContent": "...",
  "sdgTags": ["..."],
  "ethicalWarnings": ["..."],
  "suggestedKPIs": ["..."],
  "emailVariants": [{"type":"...","subject":"...","body":"..."}]
}`

    try {
      const improved = await sentinelQuery(improvePrompt, {
        module: "ngo_module",
        userId: typeof user?.id === "number" ? user.id : undefined,
        skipCache: true,
        useConsensus: false,
        sparkFallback: async () => {
          if (typeof spark !== "undefined" && typeof spark.llm === "function") {
            return await spark.llm(improvePrompt, "gpt-4o", false) as string
          }
          throw new Error("Spark fallback unavailable")
        },
      })
      const improvedParsed = parseNGOResult(improved.response)
      // Only use improved result if it actually has more content than original
      if (improvedParsed.mainContent.trim().length > candidate.mainContent.trim().length) {
        return {
          ...improvedParsed,
          ethicalWarnings: [...(improvedParsed.ethicalWarnings || []), "Donor-readiness enhancement pass applied."],
        }
      }
      // Enhancement produced weaker content; keep original
      return {
        ...candidate,
        ethicalWarnings: [...(candidate.ethicalWarnings || []), "Enhancement pass did not improve content; original retained."],
      }
    } catch {
      return {
        ...candidate,
        ethicalWarnings: [...(candidate.ethicalWarnings || []), "Enhancement pass skipped due to AI parsing limits; review content before donor submission."],
      }
    }
  }

  const handleGenerate = async () => {
    if (!user) { toast.error("Please sign in to use the NGO module."); return }
    if (!canAccessNGOModule) { toast.error("NGO-SAAS is available for Enterprise plan and Super Admin only."); return }
    if (input.trim().length < 30) { toast.error("Please provide more detail (at least 30 characters)."); return }

    setIsLoading(true); setError(null); setResult(null)
    try {
      const creditResult = await consumeReviewCredit(user.id)
      if (!creditResult.success) {
        toast.error(creditResult.error ?? "You've used all your credits. Please upgrade your plan.")
        setIsLoading(false); return
      }
      let prompt = getPromptForAction(activeAction, input)
      prompt += getKBContext()
      prompt += await getWebEvidenceContext()

      let policy = ""
      if (activeAction === "grant") {
        policy = `\n\nMANDATORY GENERATION POLICY:\n- Map your project accurately to UN SDGs and generate a structured 5-section donor proposal.\n- Run internal integrity and relevance checks on uploaded context.\n- Use high-depth sector/domain reasoning for NGO/nonprofit work in Pakistan & AJK.\n- Keep final result donor-safe, policy-safe, and highly actionable.`
      } else if (activeAction === "impact") {
        policy = `\n\nMANDATORY GENERATION POLICY:\n- Ensure empirical rigor and realistic M&E principles logic (Outputs vs Outcomes).\n- Cross-check numeric claims defensively.\n- Do not invent metrics; synthesize strictly from provided reports.`
      } else if (activeAction === "narrative") {
        policy = `\n\nMANDATORY GENERATION POLICY:\n- Strictly enforce PII anonymization to protect beneficiary identities.\n- Maintain an ethical, dignity-focused narrative tone. No poverty porn or exploitation.`
      } else {
        policy = `\n\nMANDATORY GENERATION POLICY:\n- Keep output clear, actionable, and culturally tuned to the context of Pakistan & AJK.`
      }
      prompt += policy

      const res = await sentinelQuery(prompt, {
        module: "ngo_module",
        userId: typeof user.id === "number" ? user.id : undefined,
        skipCache: true,
        useConsensus: false,
        sparkFallback: async () => {
          if (typeof spark !== "undefined" && typeof spark.llm === "function") {
            return await spark.llm(prompt, "gpt-4o", false) as string
          }
          throw new Error("Spark fallback unavailable")
        },
      })
      let parsed: NGOResult
      try {
        parsed = parseNGOResult(res.response)
      } catch {
        const rawText = typeof res.response === "string"
          ? res.response
          : JSON.stringify(res.response, null, 2)
        parsed = {
          header: `${currentAction.label} Output`,
          mainContent: rawText,
          sdgTags: [],
          ethicalWarnings: ["Structured JSON response was malformed; raw output shown."],
          suggestedKPIs: [],
        }
      }
      // Safety net: if parsing ate the content, fall back to raw response
      if (!parsed.mainContent || parsed.mainContent.trim().length === 0) {
        const rawText = typeof res.response === "string"
          ? res.response
          : JSON.stringify(res.response, null, 2)
        if (rawText.trim().length > 0) {
          parsed.mainContent = rawText
          parsed.ethicalWarnings = [...(parsed.ethicalWarnings || []), "JSON parser returned empty content; raw AI response shown."]
        }
      }
      parsed = await enhanceResultForDonorReadiness(parsed)
      setResult(parsed)
      if (neonReady) {
        await logQuery({
          module: "ngo_module",
          user_id: typeof user.id === "number" ? user.id : undefined,
          query_text: `[${activeAction.toUpperCase()}] ${input.substring(0, 200)}`,
          response_json: parsed as unknown as Record<string, unknown>,
          providers_used: res.providers,
          brain_hits: res.brainHits,
        }).catch(() => { /* silent */ })
      }
      toast.success(`${currentAction.label} generated successfully!`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Generation failed. Please try again."
      setError(msg); toast.error(msg)
    } finally {
      setIsLoading(false)
    }
  }

  // Projects handlers

  const handleCreateProject = async () => {
    if (!newProjectName.trim()) { toast.error("Project name is required."); return }
    const project: EnterpriseProject = {
      id: uuidv4(), name: newProjectName.trim(),
      description: newProjectDesc.trim(), createdAt: Date.now(),
    }
    const updated = [...projects, project]
    setProjects(updated)
    await kvSet(`${PROJECTS_KEY}-${userId}`, updated)
    setNewProjectName(""); setNewProjectDesc("")
    toast.success(`Project "${project.name}" created.`)
  }

  const handleDeleteProject = async (id: string) => {
    const updated = projects.filter((p) => p.id !== id)
    setProjects(updated)
    await kvSet(`${PROJECTS_KEY}-${userId}`, updated)
    if (selectedProjectId === id) setSelectedProjectId(null)
    toast.success("Project deleted.")
  }

  // Files handlers

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    if (!selectedProjectId) { toast.error("Select a project first."); return }
    const newFiles: ProjectFile[] = []
    for (const file of Array.from(files)) {
      let content = await extractTextFromFile(file)
      if (!content || content.trim().length === 0) {
        content = `[File: ${file.name} — binary or unsupported format, ${(file.size / 1024).toFixed(1)} KB]`
      }
      const ext = file.name.split(".").pop()?.toLowerCase() || ""
      const type: ProjectFile["type"] =
        ["doc", "docx", "pdf", "txt", "md"].includes(ext) ? "document" :
        ["csv", "xls", "xlsx"].includes(ext) ? "csv" : "other"
      newFiles.push({ id: uuidv4(), projectId: selectedProjectId, name: file.name, type, size: file.size, content, uploadedAt: Date.now() })
    }
    const updated = [...projectFiles, ...newFiles]
    setProjectFiles(updated)
    await kvSet(`${FILES_KEY}-${userId}`, updated)
    toast.success(`${newFiles.length} file(s) uploaded.`)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  const handleDeleteFile = async (id: string) => {
    const updated = projectFiles.filter((f) => f.id !== id)
    setProjectFiles(updated)
    await kvSet(`${FILES_KEY}-${userId}`, updated)
    toast.success("File removed.")
  }

  // Reports handlers

  const handleGenerateReport = async () => {
    if (!reportTitle.trim()) { toast.error("Report title is required."); return }
    if (!user) { toast.error("Please sign in."); return }
    const files = selectedProjectId ? projectFiles.filter((f) => f.projectId === selectedProjectId) : []
    const context = files.length > 0
      ? `\n\nContext from uploaded files:\n${files.map((f) => `[${f.name}]:\n${f.content.substring(0, 800)}`).join("\n\n")}`
      : ""

    let prompt = ""
    if (activeAction === "grant") {
      prompt = `${PAKISTAN_AJK_CONTEXT}\nGenerate a structured Donor Alignment Report for the proposal titled "${reportTitle}".${context}\n\nStructure: Executive Summary, Target SDGs Matrix, Expected Impact, Risk Management, and Actionable Next Steps. Focus on donor readiness and 5-section logic.`
    } else if (activeAction === "impact") {
      prompt = `${PAKISTAN_AJK_CONTEXT}\nGenerate a rigorous Monitoring & LogFrame Audit Report titled "${reportTitle}".${context}\n\nStructure: Overview, LogFrame Analysis, Output Delivery Status, Outcome Insights, and M&E Recommendations.`
    } else if (activeAction === "narrative") {
      prompt = `${PAKISTAN_AJK_CONTEXT}\nGenerate an Ethical Narrative Highlights Report titled "${reportTitle}".${context}\n\nStructure: Key Stories Overview, Ethical Compliance & Dignity Check, PII Anonymization Audit, and Recommended Publication Channels.`
    } else if (activeAction === "outreach") {
      prompt = `${PAKISTAN_AJK_CONTEXT}\nGenerate a Community Outreach Snapshot Report titled "${reportTitle}".${context}\n\nStructure: Audience Profile, Language Complexity Reduction, Key Community Messages, and Distribution Channels.`
    } else if (activeAction === "email") {
      prompt = `${PAKISTAN_AJK_CONTEXT}\nGenerate a Donor Engagement & Follow-Up Strategy Report titled "${reportTitle}".${context}\n\nStructure: Campaign Goal, Donor Segmentation Tactics, Key Messaging Anchors, and Follow-up Timeline.`
    } else {
      prompt = `${PAKISTAN_AJK_CONTEXT}
Write a concise project summary report titled "${reportTitle}".${context}

Structure: Executive Summary, Key Achievements, Challenges & Lessons, Recommendations, Next Steps. 2-4 paragraphs each.`
    }

    setReportGenerating(true)
    try {
      const creditResult = await consumeReviewCredit(user.id)
      if (!creditResult.success) { toast.error(creditResult.error ?? "No credits remaining."); return }
      const res = await sentinelQuery(prompt, {
        module: "ngo_module",
        userId: typeof user.id === "number" ? user.id : undefined,
        skipCache: false,
        sparkFallback: async () => {
          if (typeof spark !== "undefined" && typeof spark.llm === "function") {
            return await spark.llm(prompt, "gpt-4o", false) as string
          }
          throw new Error("Spark fallback unavailable")
        },
      })
      const body = typeof res.response === "string" ? res.response : JSON.stringify(res.response, null, 2)
      const evidenceAppendix = await buildWebEvidenceAppendix(
        [reportTitle, input, context, body].filter(Boolean).join("\n\n"),
        `${activeAction}-report-evidence.txt`
      )
      const enrichedBody = `${body}${evidenceAppendix}`
      const latestOrgSettings = await kvGet<OrgSettings>(`${ORG_SETTINGS_KEY}-${userId}`)
      const brandedBody = buildBrandedReportBody(reportTitle, enrichedBody, latestOrgSettings || orgSettings)
      setReportBody(brandedBody)
      const newReport = { id: uuidv4(), title: reportTitle, body: enrichedBody, createdAt: Date.now(), status: "draft" as const, generatedBy: user?.fullName || "Unknown" }
      newReport.body = brandedBody
      const updated = [newReport, ...savedReports]
      setSavedReports(updated)
      await kvSet(`ngo-reports-${userId}`, updated)
      toast.success("Report generated and saved.")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Report generation failed.")
    } finally {
      setReportGenerating(false)
    }
  }

  // Org Settings handlers

  const handleSaveOrgSettings = async () => {
    setOrgSaving(true)
    try {
      await kvSet(`${ORG_SETTINGS_KEY}-${userId}`, orgSettings)
      toast.success("Organization settings saved.")
    } catch {
      toast.error("Failed to save settings.")
    } finally {
      setOrgSaving(false)
    }
  }

  const copyToClipboard = async (text: string, idx?: number) => {
    await navigator.clipboard.writeText(text)
    if (idx !== undefined) { setCopiedEmail(idx); setTimeout(() => setCopiedEmail(null), 2000) }
    else { toast.success("Copied to clipboard!") }
  }

  const clearAll = () => { setInput(""); setResult(null); setError(null); setWebEvidenceSummary("") }

  // Knowledge Base file handlers

  const handleKBFileSelect = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setUploadingKBFile(true)
    try {
      const file = files[0]
      const MAX_SIZE_MB = 10
      if (file.size > MAX_SIZE_MB * 1024 * 1024) {
        toast.error(`File size must be less than ${MAX_SIZE_MB}MB`)
        return
      }

      let content = await extractTextFromFile(file)

      if (!content || content.trim().length === 0) {
        try {
          const buffer = await file.arrayBuffer()
          content = new TextDecoder("utf-8", { fatal: false }).decode(new Uint8Array(buffer))
        } catch {
          content = ""
        }
      }

      const normalizedContent = content.replace(/\u0000/g, "").trim()
      const printable = normalizedContent.replace(/[\x20-\x7E\n\r\t]/g, "")
      const printableRatio = normalizedContent.length > 0
        ? (normalizedContent.length - printable.length) / normalizedContent.length
        : 0
      const looksBinary =
        normalizedContent.startsWith("PK") ||
        normalizedContent.includes("[Content_Types].xml") ||
        printableRatio < 0.65
      const hasReadableText = normalizedContent.length > 0
      const summarySource = hasReadableText && !looksBinary
        ? normalizedContent
        : `File uploaded: ${file.name}\nType: ${file.type || "unknown"}\nSize: ${(file.size / 1024).toFixed(1)} KB\nNo readable inline text extracted; metadata captured for context.`
      const parsedDetails = hasReadableText && !looksBinary
        ? extractProjectDetailsFromText(summarySource, file.name)
        : null
      const words = parsedDetails?.wordCount ?? 0
      const summarySnippet = summarySource.length > 900
        ? `${summarySource.substring(0, 900)}\n[...]`
        : summarySource

      const kbSummary = parsedDetails
        ? `File: ${file.name}\nType: ${file.type || "unknown"}\nSize: ${(file.size / 1024).toFixed(1)} KB\nEstimated words: ${words}\n\nParsed Project Details:\n- Project Title: ${parsedDetails.title}\n- Donor Hint: ${parsedDetails.donor}\n- Geography: ${parsedDetails.geography}\n- Beneficiaries: ${parsedDetails.beneficiaries}\n\nOverview:\n${parsedDetails.overview}\n\nSource Snippet:\n${summarySnippet}`
        : `File: ${file.name}\nType: ${file.type || "unknown"}\nSize: ${(file.size / 1024).toFixed(1)} KB\nEstimated words: ${words}\n\nSummary:\n${summarySnippet}`
      setKbContentSummary(kbSummary)

      if (parsedDetails) {
        const template = buildProjectInputTemplate(parsedDetails)
        setInput((current) => {
          if (!current.trim()) {
            return template
          }
          return current
        })
        toast.success("Project details extracted and loaded into project section")
      }

      const truncatedContent = content.length > 5000 ? content.substring(0, 5000) + "\n[... content truncated ...]" : content

      const newFile: ProjectFile = {
        id: uuidv4(),
        projectId: "kb",
        name: file.name,
        type: file.type.includes("csv") ? "csv" : "other",
        size: file.size,
        content: (looksBinary ? kbSummary : truncatedContent) || kbSummary,
        uploadedAt: Date.now(),
      }

      const updated = [...uploadedKBFiles, newFile]
      setUploadedKBFiles(updated)
      await kvSet(`ngo-kb-files-${userId}`, updated)
      toast.success(`"${file.name}" added to knowledge base`)
    } catch (err) {
      toast.error("Failed to upload file. Please try again.")
      console.error("KB file upload error:", err)
    } finally {
      setUploadingKBFile(false)
      if (kbFileInputRef.current) kbFileInputRef.current.value = ""
    }
  }

  const handleRemoveKBFile = async (fileId: string) => {
    const updated = uploadedKBFiles.filter(f => f.id !== fileId)
    setUploadedKBFiles(updated)
    if (updated.length === 0) {
      setKbContentSummary("")
    }
    await kvSet(`ngo-kb-files-${userId}`, updated)
    toast.success("File removed from knowledge base")
  }

  const getKBContext = (): string => {
    if (uploadedKBFiles.length === 0 && !kbContentSummary.trim()) return ""
    const fileContent = uploadedKBFiles.map(f => {
      const cleaned = f.content
        .replace(/\u0000/g, "")
        .trim()
      const truncated = cleaned.length > 6000
        ? cleaned.substring(0, 6000) + "\n[... content truncated ...]" : cleaned
      return `--- File: ${f.name} ---\n${truncated}`
    }).join("\n\n")
    const summary = kbContentSummary
      ? kbContentSummary.replace(/\u0000/g, "").trim()
      : ""
    return `\n\nREFERENCE MATERIALS FROM KNOWLEDGE BASE:\n${fileContent}${summary ? `\n\nPRIMARY FILE SUMMARY:\n${summary}` : ""}`
  }

  const getWebEvidenceContext = async (): Promise<string> => {
    if (!useWebEvidence) {
      setWebEvidenceSummary("")
      return ""
    }

    const queryCorpus = [
      input,
      kbContentSummary,
      uploadedKBFiles.map((file) => `${file.name}\n${file.content.slice(0, 1000)}`).join("\n\n"),
    ].filter(Boolean).join("\n\n")

    if (queryCorpus.trim().length < 80) {
      setWebEvidenceSummary("Web evidence skipped: not enough narrative text to build representative queries.")
      return ""
    }

    try {
      const check = await performExternalSourceCheck({
        text: queryCorpus,
        fileName: `${activeAction}-web-evidence.txt`,
      })

      const topMatches = [...(check.matches || [])]
        .sort((a, b) => (b.similarity || 0) - (a.similarity || 0))
        .slice(0, 5)

      if (topMatches.length === 0) {
        setWebEvidenceSummary(`${check.summary} No strong public-web sources found.`)
        return `\n\nWEB EVIDENCE CHECK:\n${check.summary}\nWarnings: ${(check.warnings || []).join(" | ") || "None"}`
      }

      const evidenceLines = topMatches.map((match, index) =>
        `[Source ${index + 1}] ${match.source} (similarity ${Math.round(match.similarity)}%, provider: ${match.provider || "unknown"}, repo: ${match.repository || "N/A"})`
      ).join("\n")

      setWebEvidenceSummary(`${check.summary}\n${evidenceLines}`)

      return `\n\nWEB EVIDENCE (PUBLIC SOURCES):\n${evidenceLines}\n\nINSTRUCTION: Use these sources only as supporting context. If cited, cite as [Source X] and avoid unverifiable claims.`
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Web evidence retrieval failed"
      setWebEvidenceSummary(`Web evidence check failed: ${msg}`)
      return `\n\nWEB EVIDENCE CHECK FAILED: ${msg}`
    }
  }

  const buildWebEvidenceAppendix = async (text: string, fileName: string): Promise<string> => {
    if (!useWebEvidence) {
      return ""
    }

    const queryText = text.trim()
    if (queryText.length < 80) {
      return ""
    }

    try {
      const check = await performExternalSourceCheck({ text: queryText, fileName })
      const topMatches = [...(check.matches || [])]
        .sort((a, b) => (b.similarity || 0) - (a.similarity || 0))
        .slice(0, 5)

      if (topMatches.length === 0) {
        return `\n\n## Source-backed References\nNo strong public-web source matches were found for this report context.\n` 
      }

      const references = topMatches
        .map((match, index) => `${index + 1}. ${match.source} (similarity ${Math.round(match.similarity)}%, provider: ${match.provider || "unknown"}, repository: ${match.repository || "N/A"})`)
        .join("\n")

      return `\n\n## Source-backed References\n${references}\n` 
    } catch {
      return "\n\n## Source-backed References\nWeb evidence lookup failed during report generation.\n"
    }
  }

  // Access guard

  if (!canAccessNGOModule) {
    return (
      <Card className="border-amber-400/30 bg-amber-500/5">
        <CardHeader>
          <CardTitle className="text-base font-semibold">NGO-SAAS Access Restricted</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            This module is reserved for social sector and NGO organizations and is available only on the{" "}
            <strong>Enterprise plan</strong> or with explicit module access granted by a Super Admin.
          </p>
        </CardContent>
      </Card>
    )
  }

  const selectedProject = projects.find((p) => p.id === selectedProjectId)
  const projectFilesForSelected = selectedProjectId
    ? projectFiles.filter((f) => f.projectId === selectedProjectId)
    : []
  const brandedOrgName = orgLoaded && orgSettings.orgName.trim()
    ? orgSettings.orgName.trim()
    : "NGO-SAAS Enterprise Module"
  const brandedTagline = orgLoaded && orgSettings.orgName.trim()
    ? "Sentinel Social — Branded workspace for NGOs & nonprofits in Pakistan & AJK"
    : "Sentinel Social — AI workspace for NGOs & nonprofits in Pakistan & AJK"

  return (
    <div className="ngo-branded flex flex-col gap-6" style={getBrandedStyles(orgSettings, orgLoaded)}>
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
          {orgLoaded && orgSettings.logoUrl.trim() ? (
            <img
              src={orgSettings.logoUrl}
              alt={`${brandedOrgName} logo`}
              className="h-6 w-6 rounded object-contain"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none" }}
            />
          ) : (
            <Users size={24} weight="bold" className="text-emerald-500" />
          )}
        </div>
        <div>
          <h2 className="text-xl font-bold text-emerald-700 dark:text-emerald-400">{brandedOrgName}</h2>
          <p className="text-sm text-muted-foreground">
            {brandedTagline}
          </p>
        </div>
        {(geminiReady || copilotReady || sparkReady || neonReady) && (
          <div className="ml-auto flex flex-wrap gap-2">
            {geminiReady && <Badge variant="outline" className="text-xs text-emerald-600 border-emerald-400/40 bg-emerald-500/5 animate-pulse">Sentinel AI Cloud • Bridge</Badge>}
            {copilotReady && <Badge variant="outline" className="text-xs text-blue-600 border-blue-400/40 bg-blue-500/5 animate-pulse">Sentinel AI MCP • Bridge</Badge>}
            {sparkReady && <Badge variant="outline" className="text-xs text-emerald-600 border-emerald-400/40 bg-emerald-500/5 animate-pulse">Sentinel Vertox Fallback • Bridge</Badge>}
            {neonReady && <Badge variant="outline" className="text-xs text-blue-600 border-blue-400/40 bg-blue-500/5 animate-pulse">Sentinel Vertox Logs • Bridge</Badge>}
          </div>
        )}
      </div>

      {/* Enterprise Tabs */}
      <Tabs defaultValue="ai-actions" className="w-full">
        <TabsList className="flex flex-wrap h-auto gap-1 bg-muted/50 p-1 rounded-xl">
          <TabsTrigger value="ai-actions" className="gap-1.5 text-xs"><Sparkle size={14} weight="fill" /> AI Actions</TabsTrigger>
          <TabsTrigger value="projects" className="gap-1.5 text-xs" onClick={loadProjects}><FolderOpen size={14} weight="bold" /> Projects</TabsTrigger>
          <TabsTrigger value="data-workspace" className="gap-1.5 text-xs" onClick={() => { loadProjects(); loadFiles() }}><UploadSimple size={14} weight="bold" /> Data Workspace</TabsTrigger>
          <TabsTrigger value="reports" className="gap-1.5 text-xs" onClick={() => { loadProjects(); loadFiles(); loadReports() }}><FileText size={14} weight="bold" /> Reports</TabsTrigger>
          <TabsTrigger value="export" className="gap-1.5 text-xs" onClick={() => { loadReports(); loadOrgSettings() }}><Download size={14} weight="bold" /> Export</TabsTrigger>
          {hasTeamAccess && (
            <TabsTrigger value="team" className="gap-1.5 text-xs" onClick={loadTeamMembers}><Users size={14} weight="bold" /> Team</TabsTrigger>
          )}
          <TabsTrigger value="org-settings" className="gap-1.5 text-xs" onClick={loadOrgSettings}><Buildings size={14} weight="bold" /> Org Settings</TabsTrigger>
        </TabsList>

        {/* Tab: AI Actions */}
        <TabsContent value="ai-actions" className="mt-4 overflow-hidden">
          <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6">
            <div className="flex flex-col gap-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1 mb-1">5 Core Actions</p>
              {NGO_ACTIONS.map((action) => {
                const Icon = action.icon
                const isActive = action.id === activeAction
                return (
                  <button key={action.id} onClick={() => handleActionChange(action.id)}
                    className={`w-full text-left rounded-xl border p-3.5 transition-all duration-200 group ${isActive ? "bg-emerald-500/10 border-emerald-500/30 shadow-sm" : "bg-card border-border hover:border-emerald-400/30 hover:bg-emerald-500/5"}`}>
                    <div className="flex items-center gap-3">
                      <div className={`p-1.5 rounded-lg transition-colors ${isActive ? "bg-emerald-500/20" : "bg-muted group-hover:bg-emerald-500/10"}`}>
                        <Icon size={18} weight="bold" className={isActive ? "text-emerald-500" : "text-muted-foreground group-hover:text-emerald-500"} />
                      </div>
                      <div className="min-w-0">
                        <p className={`text-sm font-semibold ${isActive ? "text-emerald-700 dark:text-emerald-400" : "text-foreground"}`}>{action.label}</p>
                        <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{action.description}</p>
                      </div>
                    </div>
                  </button>
                )
              })}
              <div className="mt-3 rounded-xl border border-amber-400/20 bg-amber-500/5 p-3">
                <p className="text-xs text-amber-700 dark:text-amber-400 font-medium flex items-center gap-1.5">
                  <Sparkle size={14} weight="fill" /> 1 credit per generation
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Outputs logged to Neon DB with status <code className="text-xs bg-muted px-1 rounded">ngo_module</code>.
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-4 min-w-0">
              <Card className="border-border/50 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    {(() => { const Icon = currentAction.icon; return <Icon size={18} weight="bold" className="text-emerald-500" /> })()}
                    {currentAction.label}
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">{currentAction.description}</p>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="border-b border-border/50 pb-4">
                    <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Knowledge Base Files (Optional)</label>
                    <div className="mb-3 rounded-lg border border-border/50 bg-muted/30 px-3 py-2">
                      <div className="flex items-center justify-between gap-3">
                        <label className="flex items-center gap-2 text-xs font-medium text-foreground cursor-pointer">
                          <Checkbox checked={useWebEvidence} onCheckedChange={(checked) => setUseWebEvidence(Boolean(checked))} />
                          Enable Web Evidence (public sources)
                        </label>
                        <span className={`text-[11px] ${webEvidenceIntegration.publicWebEnabled ? "text-emerald-600" : "text-amber-600"}`}>
                          {webEvidenceIntegration.publicWebEnabled
                            ? "Public web integration enabled"
                            : "Set VITE_ENABLE_PUBLIC_WEB_SIMILARITY=true to enable"}
                        </span>
                      </div>
                      {webEvidenceSummary && (
                        <p className="mt-2 text-[11px] text-muted-foreground whitespace-pre-wrap break-words">{webEvidenceSummary}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mb-3">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="gap-2 text-xs border-emerald-400/40 hover:bg-emerald-500/10"
                        onClick={() => kbFileInputRef.current?.click()}
                        disabled={uploadingKBFile}
                      >
                        <UploadSimple size={14} weight="bold" />
                        {uploadingKBFile ? "Uploading..." : "Add File"}
                      </Button>
                      <input
                        ref={kbFileInputRef}
                        type="file"
                        onChange={(e) => handleKBFileSelect(e.target.files)}
                        className="hidden"
                      />
                      <p className="text-xs text-muted-foreground">All file types supported · Max 10MB</p>
                    </div>
                    {kbContentSummary && (
                      <div className="rounded-lg border border-emerald-400/20 bg-emerald-500/5 p-3 mb-3">
                        <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider mb-2">Content Summary</p>
                        <Textarea
                          value={kbContentSummary}
                          readOnly
                          className="min-h-[120px] text-xs font-mono bg-background/70 break-words whitespace-pre-wrap"
                        />
                      </div>
                    )}
                    {uploadedKBFiles.length > 0 && (
                      <div className="space-y-2">
                        {uploadedKBFiles.map((file) => (
                          <div key={file.id} className="flex items-center justify-between rounded-lg border border-emerald-400/20 bg-emerald-500/5 px-3 py-2">
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium text-foreground truncate">{file.name}</p>
                              <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(1)} KB</p>
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0 text-red-500 hover:bg-red-500/10"
                              onClick={() => handleRemoveKBFile(file.id)}
                            >
                              <Trash size={14} weight="bold" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">{currentAction.inputLabel}</label>
                    <Textarea value={input} onChange={(e) => setInput(e.target.value)} placeholder={currentAction.placeholder} className="min-h-[180px] text-sm resize-y font-mono" disabled={isLoading} />
                    <p className="text-xs text-muted-foreground mt-1.5">{input.length} chars · Minimum 30 characters required</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Button onClick={handleGenerate} disabled={isLoading || input.trim().length < 30} className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2">
                      {isLoading ? <><ArrowClockwise size={16} weight="bold" className="animate-spin" />Generating…</> : <><Sparkle size={16} weight="fill" />Generate with Sentinel AI</>}
                    </Button>
                    {(result || error) && (
                      <Button variant="ghost" size="sm" onClick={clearAll} className="text-muted-foreground">
                        <ArrowClockwise size={14} weight="bold" className="mr-1.5" />Clear
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>

              <AnimatePresence>
                {isLoading && (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                    className="rounded-xl border border-emerald-400/20 bg-emerald-500/5 p-6 flex items-center gap-4">
                    <div className="w-8 h-8 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin" />
                    <div>
                      <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">Sentinel AI is generating your {currentAction.label}…</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Applying Pakistan & AJK regional context · SDG alignment · Ethical review</p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <AnimatePresence>
                {error && !isLoading && (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                    className="rounded-xl border border-red-400/30 bg-red-500/5 p-4 flex items-start gap-3">
                    <Warning size={20} weight="bold" className="text-red-500 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-semibold text-red-700 dark:text-red-400">Generation Failed</p>
                      <p className="text-xs text-muted-foreground mt-1">{error}</p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <AnimatePresence>
                {result && !isLoading && (
                  <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4 overflow-hidden w-full max-w-full min-w-0">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="flex min-w-0 items-start gap-2">
                        <CheckCircle size={18} weight="fill" className="text-emerald-500" />
                        <h3 className="font-semibold text-foreground break-words">{result.header}</h3>
                      </div>
                      <div className="flex w-full flex-wrap gap-2 justify-start">
                        <Button variant="default" size="sm" onClick={handleSaveGeneratedAsDraft} className="text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white">
                          <FloppyDisk size={14} />Save Draft
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => copyToClipboard(result.mainContent)} className="text-xs gap-1.5">
                          <CheckCircle size={14} />Copy
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => exportAsPDF(result.header, result.mainContent, orgSettings)} className="text-xs gap-1.5">
                          <Download size={14} />PDF
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => exportAsWord(result.header, result.mainContent, orgSettings)} className="text-xs gap-1.5">
                          <Download size={14} />Word
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => exportAsExcel(result.header, [[result.mainContent]], orgSettings)} className="text-xs gap-1.5">
                          <Download size={14} />Excel
                        </Button>
                      </div>
                    </div>
                    {result.sdgTags && result.sdgTags.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {result.sdgTags.map((tag, i) => (
                          <Badge key={i} variant="outline" className="text-xs text-emerald-700 dark:text-emerald-400 border-emerald-400/30 bg-emerald-500/5">{tag}</Badge>
                        ))}
                      </div>
                    )}
                    {result.ethicalWarnings && result.ethicalWarnings.length > 0 && (
                      <Card className="border-amber-400/30 bg-amber-500/5">
                        <CardContent className="p-4">
                          <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-1.5 mb-2"><Warning size={14} weight="fill" />Ethical Flags & PII Notes</p>
                          <ul className="space-y-1">
                            {result.ethicalWarnings.map((w, i) => (
                              <li key={i} className="text-xs text-amber-800 dark:text-amber-300 flex items-start gap-1.5 break-words"><span className="text-amber-500 mt-0.5">•</span>{w}</li>
                            ))}
                          </ul>
                        </CardContent>
                      </Card>
                    )}
                    <Card className="border-border/50 w-full max-w-full overflow-hidden">
                      <CardContent className="p-5 w-full max-w-full overflow-hidden">
                        <div className="prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed whitespace-pre-wrap break-words overflow-x-auto">
                          {result.mainContent}
                        </div>
                      </CardContent>
                    </Card>
                    {result.emailVariants && result.emailVariants.length > 0 && (
                      <div className="space-y-3">
                        <p className="text-sm font-semibold text-foreground flex items-center gap-2">
                          <EnvelopeSimple size={16} weight="bold" className="text-emerald-500" />3 Email Variations
                        </p>
                        {result.emailVariants.map((variant, i) => (
                          <Card key={i} className="border-border/50">
                            <CardContent className="p-4 space-y-3">
                              <div className="flex items-center justify-between">
                                <Badge variant="outline" className={`text-xs ${i === 0 ? "text-blue-600 border-blue-400/30 bg-blue-500/5" : i === 1 ? "text-purple-600 border-purple-400/30 bg-purple-500/5" : "text-emerald-600 border-emerald-400/30 bg-emerald-500/5"}`}>{variant.type}</Badge>
                                <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => copyToClipboard(`Subject: ${variant.subject}\n\n${variant.body}`, i)}>
                                  {copiedEmail === i ? <><CheckCircle size={12} weight="fill" className="mr-1 text-emerald-500" />Copied!</> : "Copy Email"}
                                </Button>
                              </div>
                              <div>
                                <p className="text-xs font-semibold text-muted-foreground mb-1">Subject Line</p>
                                <p className="text-sm font-medium text-foreground bg-muted/50 rounded-lg px-3 py-2">{variant.subject}</p>
                              </div>
                              <div>
                                <p className="text-xs font-semibold text-muted-foreground mb-1">Email Body</p>
                                <div className="text-sm text-foreground bg-muted/30 rounded-lg px-3 py-2 whitespace-pre-wrap leading-relaxed">{variant.body}</div>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    )}
                    {result.suggestedKPIs && result.suggestedKPIs.length > 0 && (
                      <Card className="border-border/50 bg-card/50">
                        <CardContent className="p-4">
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                            <Target size={14} weight="bold" />Suggested KPIs
                          </p>
                          <ul className="space-y-1.5">
                            {result.suggestedKPIs.map((kpi, i) => (
                              <li key={i} className="text-sm text-foreground flex items-start gap-2">
                                <CheckCircle size={14} weight="fill" className="text-emerald-500 shrink-0 mt-0.5" />{kpi}
                              </li>
                            ))}
                          </ul>
                        </CardContent>
                      </Card>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </TabsContent>

        {/* Tab: Projects */}
        <TabsContent value="projects" className="mt-4 space-y-6">
          {hasWriteAccess && (
            <Card className="border-border/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <FilePlus size={18} weight="bold" className="text-emerald-500" />Create New Project
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Input placeholder="Project name *" value={newProjectName} onChange={(e) => setNewProjectName(e.target.value)} />
                <Textarea placeholder="Short description (optional)" value={newProjectDesc} onChange={(e) => setNewProjectDesc(e.target.value)} className="min-h-[80px] text-sm" />
                <Button onClick={handleCreateProject} disabled={!newProjectName.trim()} className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2">
                  <FilePlus size={16} weight="bold" />Create Project
                </Button>
              </CardContent>
            </Card>
          )}
          <div className="space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Your Projects ({projects.length})</p>
            {projects.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No projects yet. Create your first project above.</div>
            ) : (
              projects.map((p) => (
                <Card key={p.id} className={`border-border/50 cursor-pointer transition-all ${selectedProjectId === p.id ? "border-emerald-500/40 bg-emerald-500/5" : "hover:border-emerald-400/20"}`}
                  onClick={() => setSelectedProjectId(p.id === selectedProjectId ? null : p.id)}>
                  <CardContent className="p-4 flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <FolderOpen size={16} weight="bold" className="text-emerald-500 shrink-0" />
                        <p className="text-sm font-semibold text-foreground truncate">{p.name}</p>
                      </div>
                      {p.description && <p className="text-xs text-muted-foreground line-clamp-2">{p.description}</p>}
                      <p className="text-xs text-muted-foreground mt-1.5">
                        ID: <code className="bg-muted px-1 rounded text-xs">{p.id}</code>{" · "}{new Date(p.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    {hasDeleteAccess && (
                      <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-600 hover:bg-red-50 shrink-0"
                        onClick={(e) => { e.stopPropagation(); handleDeleteProject(p.id) }}>
                        <Trash size={14} weight="bold" />
                      </Button>
                    )}
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </TabsContent>

        {/* Tab: Data Workspace */}
        <TabsContent value="data-workspace" className="mt-4 space-y-6">
          <Card className="border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <UploadSimple size={18} weight="bold" className="text-emerald-500" />Upload Files
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Select Project</label>
                <select className="w-full text-sm rounded-lg border border-border bg-background px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                  value={selectedProjectId || ""} onChange={(e) => setSelectedProjectId(e.target.value || null)}>
                  <option value="">— Select a project —</option>
                  {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div className="rounded-xl border-2 border-dashed border-border bg-muted/30 p-8 text-center">
                <UploadSimple size={32} weight="bold" className="text-muted-foreground mx-auto mb-3" />
                <p className="text-sm text-muted-foreground mb-3">Upload proposal templates, reports, or CSV/Excel data files</p>
                <input ref={fileInputRef} type="file" multiple accept=".doc,.docx,.pdf,.txt,.md,.csv,.xls,.xlsx" className="hidden" onChange={handleFileUpload} />
                <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={!selectedProjectId || !hasWriteAccess} className="gap-2">
                  <UploadSimple size={14} weight="bold" />Choose Files
                </Button>
                {!selectedProjectId && <p className="text-xs text-amber-600 mt-2">Select a project first</p>}
                {!hasWriteAccess && <p className="text-xs text-amber-600 mt-2">Write access required to upload files</p>}
              </div>
            </CardContent>
          </Card>
          {selectedProject && (
            <div className="space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Files in "{selectedProject.name}" ({projectFilesForSelected.length})</p>
              {projectFilesForSelected.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">No files uploaded for this project yet.</div>
              ) : (
                projectFilesForSelected.map((f) => (
                  <Card key={f.id} className="border-border/50">
                    <CardContent className="p-3 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        {f.type === "csv" ? <FileCsv size={20} weight="bold" className="text-green-500 shrink-0" /> : <FileText size={20} weight="bold" className="text-blue-500 shrink-0" />}
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{f.name}</p>
                          <p className="text-xs text-muted-foreground">{(f.size / 1024).toFixed(1)} KB · {new Date(f.uploadedAt).toLocaleDateString()}</p>
                        </div>
                      </div>
                      <Badge variant="outline" className="text-xs shrink-0">{f.type}</Badge>
                      {hasDeleteAccess && (
                        <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-600 hover:bg-red-50 shrink-0" onClick={() => handleDeleteFile(f.id)}>
                          <Trash size={13} weight="bold" />
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          )}
        </TabsContent>

        {/* Tab: Reports */}
        <TabsContent value="reports" className="mt-4 space-y-6">
          <Card className="border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <FileText size={18} weight="bold" className="text-emerald-500" />Generate Project Report
              </CardTitle>
              <p className="text-sm text-muted-foreground">Write an AI-powered summary report based on uploaded project data.</p>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Link to Project (optional)</label>
                <select className="w-full text-sm rounded-lg border border-border bg-background px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                  value={selectedProjectId || ""} onChange={(e) => setSelectedProjectId(e.target.value || null)}>
                  <option value="">— No project selected —</option>
                  {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Report Title *</label>
                <Input placeholder="e.g. Q3 2024 Field Operations Summary" value={reportTitle} onChange={(e) => setReportTitle(e.target.value)} />
              </div>
              <Button onClick={handleGenerateReport} disabled={reportGenerating || !reportTitle.trim() || !user} className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2">
                {reportGenerating ? <><ArrowClockwise size={16} weight="bold" className="animate-spin" />Generating Report…</> : <><Sparkle size={16} weight="fill" />Generate Report</>}
              </Button>
            </CardContent>
          </Card>
          {reportBody && (
            <Card className="border-emerald-400/20 bg-emerald-500/5">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <CheckCircle size={16} weight="fill" className="text-emerald-500" />Generated: {reportTitle}
                </CardTitle>
              </CardHeader>
              <CardContent className="overflow-hidden w-full max-w-full">
                <div className="prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed whitespace-pre-wrap break-words overflow-x-auto">{reportBody}</div>
              </CardContent>
            </Card>
          )}
          {savedReports.length > 0 && (
            <div className="space-y-2">
              <Separator />
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider pt-2">Saved Reports ({savedReports.length})</p>
              {savedReports.map((r) => (
                <Card key={r.id} className={`border-border/50 ${(r.status === "signed" || r.status === "approved") ? "border-emerald-400/30 bg-emerald-500/5" : ""}`}>
                  <CardContent className="p-3 flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-foreground truncate">{r.title}</p>
                        <Badge variant={(r.status === "signed" || r.status === "approved") ? "default" : "secondary"} className="text-xs shrink-0">
                          {(r.status === "signed" || r.status === "approved") ? "Approved" : "Draft"}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {new Date(r.createdAt).toLocaleDateString()}
                        {r.generatedBy && ` · by ${r.generatedBy}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Button variant="outline" size="sm" className="text-xs" onClick={() => { setReportTitle(r.title); setReportBody(r.body) }}>View</Button>
                      {hasDeleteAccess && r.status !== "signed" && r.status !== "approved" && (
                        <Button variant="outline" size="sm" className="text-xs gap-1 text-emerald-600 border-emerald-400/40" onClick={() => handleSignReport(r.id)}>
                          <Signature size={13} weight="bold" /> Approve
                        </Button>
                      )}
                      {hasDeleteAccess && (
                        <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-600 hover:bg-red-50 h-8 w-8 p-0" onClick={() => handleDeleteReport(r.id)}>
                          <Trash size={13} weight="bold" />
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Tab: Export */}
        <TabsContent value="export" className="mt-4 space-y-6">
          <Card className="border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Download size={18} weight="bold" className="text-emerald-500" />Export Reports
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Export to PDF, Word, or Excel. Custom branding from <strong>Org Settings</strong> will be applied if configured.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {(() => {
                const signedReports = savedReports.filter(r => r.status === "signed" || r.status === "approved")
                return signedReports.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                    Reports must be approved by an Owner/Admin before they can be exported.
                    {savedReports.length > 0 && <span className="block mt-1 text-xs">{savedReports.length} draft report(s) pending approval in the Reports tab.</span>}
                  </div>
                ) : (
                  signedReports.map((r) => (
                  <Card key={r.id} className="border-border/50">
                    <CardContent className="p-4">
                      <div className="mb-3">
                        <p className="text-sm font-semibold text-foreground">{r.title}</p>
                        <p className="text-xs text-muted-foreground">{new Date(r.createdAt).toLocaleDateString()}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button variant="outline" size="sm" className="gap-1.5 text-xs"
                          onClick={async () => { toast.info("Generating PDF…"); await exportAsPDF(r.title, r.body, orgLoaded ? orgSettings : null) }}>
                          <Download size={13} weight="bold" /> PDF
                        </Button>
                        <Button variant="outline" size="sm" className="gap-1.5 text-xs"
                          onClick={() => { exportAsWord(r.title, r.body, orgLoaded ? orgSettings : null); toast.success("Word document downloaded.") }}>
                          <Download size={13} weight="bold" /> Word
                        </Button>
                        <Button variant="outline" size="sm" className="gap-1.5 text-xs"
                          onClick={() => {
                            const rows = r.body.split("\n").filter(Boolean).map((line) => [line])
                            exportAsExcel(r.title, rows, orgLoaded ? orgSettings : null)
                            toast.success("Excel file downloaded.")
                          }}>
                          <Download size={13} weight="bold" /> Excel
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )})()}
              {orgLoaded && orgSettings.orgName && (
                <div className="rounded-xl border border-emerald-400/20 bg-emerald-500/5 p-3">
                  <p className="text-xs text-emerald-700 dark:text-emerald-400 font-medium flex items-center gap-1.5">
                    <Buildings size={14} weight="bold" />Custom branding active: <strong className="ml-1">{orgSettings.orgName}</strong>
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: Org Settings */}
        <TabsContent value="org-settings" className="mt-4 space-y-6">
          <Card className="border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Buildings size={18} weight="bold" className="text-emerald-500" />Organization Branding Settings
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Set your organization details for export branding. If not configured, default Sentinel branding is used.
              </p>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    <Buildings size={13} weight="bold" /> Organization Name
                  </label>
                  <Input placeholder="e.g. Glimpse Foundation" value={orgSettings.orgName} onChange={(e) => setOrgSettings({ ...orgSettings, orgName: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Logo URL</label>
                  <Input placeholder="https://example.com/logo.png" value={orgSettings.logoUrl} onChange={(e) => setOrgSettings({ ...orgSettings, logoUrl: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    <Palette size={13} weight="bold" /> Primary Color
                  </label>
                  <div className="flex gap-2">
                    <input type="color" value={orgSettings.primaryColor} onChange={(e) => setOrgSettings({ ...orgSettings, primaryColor: e.target.value })} className="w-10 h-9 rounded border border-border cursor-pointer p-0.5" />
                    <Input placeholder="#5CC3EB" value={orgSettings.primaryColor} onChange={(e) => setOrgSettings({ ...orgSettings, primaryColor: e.target.value })} className="flex-1 font-mono" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    <Palette size={13} weight="bold" /> Secondary Color
                  </label>
                  <div className="flex gap-2">
                    <input type="color" value={orgSettings.secondaryColor} onChange={(e) => setOrgSettings({ ...orgSettings, secondaryColor: e.target.value })} className="w-10 h-9 rounded border border-border cursor-pointer p-0.5" />
                    <Input placeholder="#8CB499" value={orgSettings.secondaryColor} onChange={(e) => setOrgSettings({ ...orgSettings, secondaryColor: e.target.value })} className="flex-1 font-mono" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    <Phone size={13} weight="bold" /> Phone Number
                  </label>
                  <Input placeholder="+92 300 1234567" value={orgSettings.phone} onChange={(e) => setOrgSettings({ ...orgSettings, phone: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    <At size={13} weight="bold" /> Email
                  </label>
                  <Input placeholder="contact@org.org" value={orgSettings.email} onChange={(e) => setOrgSettings({ ...orgSettings, email: e.target.value })} />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  <MapPin size={13} weight="bold" /> Office Address
                </label>
                <Input placeholder="123 Main Street, Islamabad, Pakistan" value={orgSettings.address} onChange={(e) => setOrgSettings({ ...orgSettings, address: e.target.value })} />
              </div>
              {orgSettings.orgName && (
                <div className="rounded-xl border border-border/50 p-4 bg-muted/30">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Brand Preview</p>
                  <div className="rounded-lg p-4 border" style={{ borderColor: orgSettings.primaryColor + "60", backgroundColor: orgSettings.primaryColor + "10" }}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-bold text-sm" style={{ color: orgSettings.primaryColor }}>{orgSettings.orgName}</p>
                        {orgSettings.email && <p className="text-xs mt-0.5" style={{ color: orgSettings.secondaryColor }}>{orgSettings.email}</p>}
                      </div>
                      {orgSettings.logoUrl && (
                        <img src={orgSettings.logoUrl} alt="logo" className="h-10 object-contain rounded"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = "none" }} />
                      )}
                    </div>
                    {orgSettings.address && <p className="text-xs text-muted-foreground mt-2">{orgSettings.address}</p>}
                  </div>
                </div>
              )}
              <Button onClick={handleSaveOrgSettings} disabled={orgSaving || !hasDeleteAccess} className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2">
                {orgSaving ? <><ArrowClockwise size={16} weight="bold" className="animate-spin" />Saving…</> : <><FloppyDisk size={16} weight="bold" />Save Organization Settings</>}
              </Button>
              {!hasDeleteAccess && <p className="text-xs text-amber-600 mt-2">Only Owner / Admin can modify organization settings</p>}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: Team */}
        {hasTeamAccess && (
          <TabsContent value="team" className="mt-4 space-y-6">
            <Card className="border-border/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <UserPlus size={18} weight="bold" className="text-emerald-500" />Add Team Member
                </CardTitle>
                <p className="text-sm text-muted-foreground">Add users to your NGO workspace. They will receive platform credentials and module access.</p>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Input placeholder="Full name *" value={newMemberName} onChange={(e) => setNewMemberName(e.target.value)} />
                  <Input placeholder="Email *" type="email" value={newMemberEmail} onChange={(e) => setNewMemberEmail(e.target.value)} />
                  <Input placeholder="Password (min 6 chars) *" type="password" value={newMemberPass} onChange={(e) => setNewMemberPass(e.target.value)} />
                  <select
                    className="w-full text-sm rounded-lg border border-border bg-background px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                    value={newMemberLevel}
                    onChange={(e) => setNewMemberLevel(e.target.value as NGOAccessLevel)}
                  >
                    <option value="user">Read-Only</option>
                    <option value="contributor">Contributor (can write)</option>
                    <option value="owner">Owner (full access)</option>
                  </select>
                </div>
                <Button onClick={handleAddMember} disabled={addingMember || !newMemberEmail || !newMemberName || !newMemberPass} className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2">
                  {addingMember ? <><ArrowClockwise size={16} weight="bold" className="animate-spin" />Adding…</> : <><UserPlus size={16} weight="bold" />Add Member</>}
                </Button>
              </CardContent>
            </Card>

            <div className="space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Team Members ({teamMembers.length})</p>
              {teamMembers.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                  No team members yet. Add your first member above.
                </div>
              ) : (
                teamMembers.map((member) => (
                  <Card key={member.id} className="border-border/50">
                    <CardContent className="p-4 flex items-center justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-foreground">{member.fullName}</p>
                        <p className="text-xs text-muted-foreground">{member.email}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">Added {new Date(member.addedAt).toLocaleDateString()}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <select
                          className="text-xs rounded-lg border border-border bg-background px-2 py-1.5 text-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                          value={member.accessLevel}
                          onChange={(e) => handleUpdateMemberAccess(member.id, e.target.value as NGOAccessLevel)}
                        >
                          <option value="user">Read-Only</option>
                          <option value="contributor">Contributor</option>
                          <option value="owner">Owner</option>
                        </select>
                        <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-600 hover:bg-red-50 h-8 w-8 p-0" onClick={() => handleRemoveMember(member.id)}>
                          <Trash size={14} weight="bold" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </TabsContent>
        )}
      </Tabs>
    </div>
  )
}
