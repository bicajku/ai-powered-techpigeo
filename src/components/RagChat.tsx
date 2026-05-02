import { useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { ScrollArea } from "@/components/ui/scroll-area"
import { PostProcessControls, type PostProcessSettings } from "@/components/PostProcessControls"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Progress } from "@/components/ui/progress"
import { Plus, ChatsCircle, User, Robot, ClockCounterClockwise, X, Lightning, Bell, Question, UserCircle, Gift, Trash, PencilSimple, ArrowUp, ArrowDown } from "@phosphor-icons/react"
import mammoth from "mammoth"
import * as pdfjsLib from "pdfjs-dist"
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url"
import PptxGenJS from "pptxgenjs"
import {
  createChatThread,
  deleteChatThread,
  updateChatThread,
  listChatThreads,
  listChatMessages,
  listRetrievalTraceByMessageId,
  type ChatThread,
  type ChatMessage,
  type RetrievalTrace,
} from "@/lib/chat-api"
import {
  addBrainDocument,
  updateDocumentStatus,
} from "@/lib/sentinel-brain"
import { sentinelQuery, ingestTextTooBrain } from "@/lib/sentinel-query-pipeline"
import { isNeonConfigured } from "@/lib/neon-client"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

type AvailableModel = { id: string; name: string; provider: string; tier: string }
type UploadedContextFile = {
  id: string
  name: string
  content: string
  status: "ready" | "ingested" | "failed"
  chunksIndexed?: number
}
type DynamicSuggestion = { title: string; desc: string }

const DEFAULT_MODELS: AvailableModel[] = [
  { id: "gpt-4.1",                 name: "GPT-4.1",           provider: "copilot", tier: "high" },
  { id: "gpt-4.1-mini",            name: "GPT-4.1 Mini",      provider: "copilot", tier: "low"  },
  { id: "gpt-4o",                  name: "GPT-4o",            provider: "copilot", tier: "high" },
  { id: "gpt-5",                   name: "GPT-5",             provider: "copilot", tier: "high" },
  { id: "gpt-5-mini",              name: "GPT-5 Mini",        provider: "copilot", tier: "low"  },
  { id: "o4-mini",                 name: "o4-mini",           provider: "copilot", tier: "high" },
  { id: "claude-3-5-sonnet",       name: "Claude 3.5 Sonnet", provider: "copilot", tier: "high" },
  { id: "claude-3-5-haiku",        name: "Claude 3.5 Haiku",  provider: "copilot", tier: "low"  },
  { id: "DeepSeek-R1",             name: "DeepSeek R1",       provider: "copilot", tier: "high" },
  { id: "grok-3",                  name: "Grok-3",            provider: "copilot", tier: "high" },
  { id: "gemini-2.5-flash",        name: "Gemini 2.5 Flash",  provider: "gemini",  tier: "low"  },
  { id: "llama-3.3-70b-versatile", name: "Llama 3.3 70B",     provider: "groq",    tier: "high" },
  { id: "deepseek-chat",           name: "DeepSeek V3",       provider: "deepseek", tier: "high" },
  { id: "deepseek-reasoner",       name: "DeepSeek R1",       provider: "deepseek", tier: "high" },
]

const DEFAULT_SUGGESTIONS: DynamicSuggestion[] = [
  { title: "How do I collect Google Maps business data?", desc: "Get structured names, addresses, and phone numbers from listings." },
  { title: "How do I use proxies with Puppeteer or Selenium?", desc: "Step-by-step setup for browser automation scripts." },
  { title: "How to connect my AI agent with MCP", desc: "Integrate your agent with MCP tools and data workflows." },
  { title: "How do I get a proxy from a specific country or city?", desc: "Route traffic by geo-location with the right proxy class." },
]

const makeId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`

function triggerDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = fileName
  document.body.appendChild(anchor)
  anchor.click()
  setTimeout(() => {
    document.body.removeChild(anchor)
    URL.revokeObjectURL(url)
  }, 300)
}

function buildDynamicSuggestions(messages: ChatMessage[], uploaded: UploadedContextFile[]): DynamicSuggestion[] {
  if (messages.length === 0) return DEFAULT_SUGGESTIONS
  const lastUser = [...messages].reverse().find((m) => m.role === "user")?.content.toLowerCase() || ""
  const hasTableIntent = /table|excel|sheet|csv|sum|formula|pivot/.test(lastUser)
  const hasReportIntent = /report|proposal|summary|brief|document/.test(lastUser)
  const hasDeckIntent = /pitch|deck|slides|presentation|ppt/.test(lastUser)
  const hasFiles = uploaded.length > 0

  const suggestions: DynamicSuggestion[] = []
  if (hasFiles) {
    suggestions.push({ title: "Use uploaded files to answer with citations", desc: "Ground the next answer in uploaded document context." })
  }
  if (hasTableIntent) {
    suggestions.push({ title: "Create an Excel-ready solution table", desc: "Produce formulas and a downloadable spreadsheet output." })
  }
  if (hasReportIntent) {
    suggestions.push({ title: "Generate a polished DOCX report", desc: "Transform this discussion into a structured document." })
  }
  if (hasDeckIntent) {
    suggestions.push({ title: "Convert this into a PPT outline", desc: "Build slide-ready sections for presentation export." })
  }
  suggestions.push({ title: "Summarize this thread in bullet points", desc: "Create an executive summary from the conversation." })
  suggestions.push({ title: "Give me next-step checklist", desc: "Produce practical action items from this context." })

  const seen = new Set<string>()
  return suggestions.filter((s) => {
    const k = s.title.toLowerCase()
    if (seen.has(k)) return false
    seen.add(k)
    return true
  }).slice(0, 6)
}

interface RagChatProps {
  userId: string
  userName?: string
  isAdmin?: boolean
}

type TraceByMessage = Record<number, RetrievalTrace>

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

function normalizeAssistantContent(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .trim()
}

function toWordHtmlDocument(text: string): string {
  const body = escapeHtml(normalizeAssistantContent(text)).replace(/\n/g, "<br/>")
  return `<!DOCTYPE html><html><head><meta charset="utf-8" /></head><body><h2>NovusSparks AI Chat Output</h2><div>${body}</div></body></html>`
}

function toCsvFromText(text: string): string {
  const normalized = normalizeAssistantContent(text)
  const rows = normalized.split("\n").filter((line) => line.trim().length > 0)
  const tableRows = rows
    .filter((line) => line.includes("|"))
    .map((line) => line.split("|").map((cell) => cell.trim()).filter(Boolean))
    .filter((cells) => cells.length > 0)

  if (tableRows.length >= 2) {
    return tableRows
      .map((cells) => cells.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(","))
      .join("\n")
  }

  return rows.map((line) => `"${line.replace(/"/g, '""')}"`).join("\n")
}

export function RagChat({ userId, userName, isAdmin = false }: RagChatProps) {
  // Use the raw string userId directly — the chat_threads.user_id column
  // is now TEXT to properly support UUID-based user IDs from the backend.
  const dbUserId = userId

  const [threads, setThreads] = useState<ChatThread[]>([])
  const [activeThreadId, setActiveThreadId] = useState<number | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [tracesByMessage, setTracesByMessage] = useState<TraceByMessage>({})
  const [selectedAssistantMessageId, setSelectedAssistantMessageId] = useState<number | null>(null)
  const [mobileTraceOpen, setMobileTraceOpen] = useState(false)
  const [desktopTraceOpen, setDesktopTraceOpen] = useState(false)
  const [mobileThreadsOpen, setMobileThreadsOpen] = useState(false)
  const [input, setInput] = useState("")
  const [isLoadingThreads, setIsLoadingThreads] = useState(true)
  const [isCreatingThread, setIsCreatingThread] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [liveAssistantText, setLiveAssistantText] = useState("")
  const [sendProgress, setSendProgress] = useState(0)
  const [sendStage, setSendStage] = useState<"idle" | "preparing" | "retrieving" | "generating" | "finalizing">("idle")
  const [sendElapsedSec, setSendElapsedSec] = useState(0)
  const [selectedModel, setSelectedModel] = useState("gpt-4.1")
  const [availableModels, setAvailableModels] = useState<AvailableModel[]>(DEFAULT_MODELS)
  const [uploadedFiles, setUploadedFiles] = useState<UploadedContextFile[]>([])
  const [isUploadingFiles, setIsUploadingFiles] = useState(false)
  const [autoIngestToBrain, setAutoIngestToBrain] = useState(true)
  const [postProcessSettings, setPostProcessSettings] = useState<PostProcessSettings>({
    humanizeOnOutput: true,
    preserveFactsStrictly: false,
    matchMyVoice: false,
    postProcessProfile: "creative",
    voiceSample: "",
  })
  const [editingMessageId, setEditingMessageId] = useState<number | null>(null)
  const composerRef = useRef<HTMLTextAreaElement | null>(null)
  const chatScrollRef = useRef<HTMLDivElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (!isSending) {
      setSendElapsedSec(0)
      return
    }
    const started = Date.now()
    const id = window.setInterval(() => {
      setSendElapsedSec(Math.max(1, Math.floor((Date.now() - started) / 1000)))
      setSendProgress((current) => Math.min(92, current + 2))
    }, 900)
    return () => window.clearInterval(id)
  }, [isSending])

  const sendStageLabel =
    sendStage === "preparing"
      ? "Preparing request"
      : sendStage === "retrieving"
        ? "Searching knowledge"
        : sendStage === "generating"
          ? "Generating response"
          : sendStage === "finalizing"
            ? "Finalizing output"
            : ""

  const waitForAuthToken = async (timeoutMs = 1500) => {
    const startedAt = Date.now()
    while (Date.now() - startedAt < timeoutMs) {
      const token = localStorage.getItem("sentinel-auth-token") || localStorage.getItem("sentinel_token")
      if (token) return true
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    return false
  }

  const isAuthError = (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)
    const lower = message.toLowerCase()
    return lower.includes("authentication required") || lower.includes("unauthorized") || lower.includes("forbidden")
  }

  const getReadableError = (error: unknown, fallback: string) => {
    const message = error instanceof Error ? error.message : String(error)
    if (!message || message === "[object Object]") return fallback
    if (isAuthError(error)) return "Session expired. Please refresh and sign in again."
    if (message.toLowerCase().includes("no ai provider configured")) {
      return "AI provider is not configured. Please contact admin."
    }
    return message
  }

  const scrollToTop = () => {
    chatScrollRef.current?.scrollTo({ top: 0, behavior: "smooth" })
  }
  const scrollToBottom = () => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTo({ top: chatScrollRef.current.scrollHeight, behavior: "smooth" })
    }
  }

  const starterPrompts = useMemo(
    () => buildDynamicSuggestions(messages, uploadedFiles),
    [messages, uploadedFiles]
  )

  const activeThread = useMemo(
    () => threads.find((t) => t.id === activeThreadId) ?? null,
    [threads, activeThreadId]
  )

  const extractTextFromFile = async (file: File): Promise<string> => {
    const name = file.name.toLowerCase()
    const extension = name.split(".").pop() || ""

    if (["txt", "md", "csv", "json", "tsv"].includes(extension)) {
      return await file.text()
    }

    if (extension === "docx") {
      try {
        const arrayBuffer = await file.arrayBuffer()
        const extracted = await mammoth.extractRawText({ arrayBuffer })
        return extracted.value || ""
      } catch {
        return ""
      }
    }

    if (extension === "pdf") {
      try {
        const arrayBuffer = await file.arrayBuffer()
        const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise
        const pageTexts: string[] = []
        for (let i = 1; i <= Math.min(pdf.numPages, 20); i++) {
          const page = await pdf.getPage(i)
          const content = await page.getTextContent()
          const text = content.items
            .map((item) => ("str" in item ? item.str : ""))
            .join(" ")
          pageTexts.push(text)
        }
        return pageTexts.join("\n\n")
      } catch {
        return ""
      }
    }

    return ""
  }

  const ingestUploadedFileToBrain = async (file: UploadedContextFile) => {
    if (!isNeonConfigured()) return { ok: false, reason: "Brain ingestion unavailable" }
    try {
      const doc = await addBrainDocument({
        title: file.name,
        source_type: "doc",
      })
      await updateDocumentStatus(doc.id, "processing")
      const chunks = await ingestTextTooBrain(file.content, {
        documentId: doc.id,
        metadata: {
          module: "rag_chat",
          userId: dbUserId,
          source: "chat-upload",
          fileName: file.name,
        },
      })
      await updateDocumentStatus(doc.id, chunks > 0 ? "indexed" : "failed", chunks)
      return { ok: true, chunks }
    } catch {
      return { ok: false, reason: "Ingestion failed" }
    }
  }

  const handleUploadFiles = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const incoming = event.target.files
    if (!incoming || incoming.length === 0) return

    setIsUploadingFiles(true)
    try {
      const parsed: UploadedContextFile[] = []
      for (const file of Array.from(incoming).slice(0, 5)) {
        const text = await extractTextFromFile(file)
        const fallback = text.trim().length > 0
          ? text
          : `[File: ${file.name}] Binary or unsupported format. Parsed text not available.`

        parsed.push({
          id: makeId(),
          name: file.name,
          content: fallback.slice(0, 35000),
          status: "ready",
        })
      }

      let next = [...parsed]
      if (autoIngestToBrain) {
        const withStatus: UploadedContextFile[] = []
        for (const item of parsed) {
          const result = await ingestUploadedFileToBrain(item)
          withStatus.push({
            ...item,
            status: result.ok ? "ingested" : "failed",
            chunksIndexed: result.ok ? result.chunks : undefined,
          })
        }
        next = withStatus
      }

      setUploadedFiles((current) => [...next, ...current].slice(0, 8))
      toast.success(`${next.length} file(s) added to chat context`)
    } catch {
      toast.error("Failed to process uploaded file(s)")
    } finally {
      setIsUploadingFiles(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  const copyMessage = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success("Response copied")
    } catch {
      toast.error("Copy failed")
    }
  }

  const exportMessageTxt = (text: string, prefix = "chat-response") => {
    const file = `${prefix}-${new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-")}.txt`
    triggerDownload(new Blob([text], { type: "text/plain;charset=utf-8" }), file)
  }

  const exportMessageDoc = (text: string) => {
    const payload = toWordHtmlDocument(text)
    triggerDownload(
      new Blob([payload], { type: "application/msword" }),
      `chat-output-${Date.now()}.doc`
    )
  }

  const exportMessageCsv = (text: string) => {
    const csv = toCsvFromText(text)
    triggerDownload(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
      `chat-output-${Date.now()}.csv`
    )
  }

  const exportMessagePptx = async (text: string) => {
    const pptx = new PptxGenJS()
    pptx.layout = "LAYOUT_WIDE"
    pptx.author = "NovusSparks AI"
    pptx.company = "NovusSparks"
    pptx.subject = "AI Chat Export"
    pptx.title = "AI Chat Export"

    const chunks = text.split(/\n\n+/).filter(Boolean).slice(0, 6)
    const titleSlide = pptx.addSlide()
    titleSlide.addText("AI Chat Export", { x: 0.6, y: 0.6, w: 10.5, h: 0.8, fontSize: 34, bold: true })
    titleSlide.addText("Generated by NovusSparks AI", { x: 0.6, y: 1.5, w: 10.5, h: 0.4, fontSize: 14, color: "666666" })

    chunks.forEach((entry, index) => {
      const slide = pptx.addSlide()
      slide.addText(`Section ${index + 1}`, { x: 0.5, y: 0.4, w: 10.5, h: 0.5, fontSize: 24, bold: true })
      slide.addText(entry.slice(0, 1400), { x: 0.6, y: 1.2, w: 12, h: 5.5, fontSize: 14, valign: "top" })
    })

    await pptx.writeFile({ fileName: `chat-output-${Date.now()}.pptx` })
  }

  const exportThreadTxt = () => {
    const content = messages
      .map((m) => `[${m.role.toUpperCase()}] ${new Date(m.created_at).toLocaleString()}\n${m.content}`)
      .join("\n\n----------------\n\n")
    exportMessageTxt(content, "chat-thread")
  }

  useEffect(() => {
    if (!dbUserId?.trim()) return
    void loadThreads()
  }, [dbUserId])

  useEffect(() => {
    if (!activeThreadId) {
      setMessages([])
      setTracesByMessage({})
      setSelectedAssistantMessageId(null)
      setMobileTraceOpen(false)
      setDesktopTraceOpen(false)
      return
    }
    setSelectedAssistantMessageId(null)
    setMobileTraceOpen(false)
    setDesktopTraceOpen(false)
    void loadThreadData(activeThreadId)
  }, [activeThreadId])

  useEffect(() => {
    const token = localStorage.getItem("sentinel-auth-token") || localStorage.getItem("sentinel_token")
    if (!token) return
    fetch("/api/llm/models", {
      headers: { Authorization: `Bearer ${token}` },
      credentials: "include",
    })
      .then((res) => res.ok ? res.json() : null)
      .then((data: { models?: AvailableModel[] } | null) => {
        if (Array.isArray(data?.models) && data.models.length > 0) {
          setAvailableModels(data.models)
        }
      })
      .catch(() => null)
  }, [])

  const loadThreads = async () => {
    if (!dbUserId?.trim()) return

    setIsLoadingThreads(true)
    try {
      const rows = await listChatThreads({ user_id: dbUserId, limit: 50 })
      setThreads(rows)
      if (!activeThreadId && rows.length > 0) {
        setActiveThreadId(rows[0].id)
      }
    } catch (err) {
      console.error("Failed to load chat threads:", err)
      const message = err instanceof Error ? err.message : String(err)
      const authError = message.toLowerCase().includes("authentication required") || message.toLowerCase().includes("unauthorized")

      if (authError) {
        const tokenReady = await waitForAuthToken()
        if (tokenReady) {
          try {
            const retryRows = await listChatThreads({ user_id: dbUserId, limit: 50 })
            setThreads(retryRows)
            if (!activeThreadId && retryRows.length > 0) {
              setActiveThreadId(retryRows[0].id)
            }
            return
          } catch (retryErr) {
            console.error("Retry failed to load chat threads:", retryErr)
          }
        }

        if (!tokenReady) {
          try {
            localStorage.removeItem("sentinel-auth-token")
            localStorage.removeItem("sentinel_token")
          } catch {
            // Ignore storage cleanup failures.
          }
          toast.error("Session expired. Please sign in again.")
          window.location.reload()
          return
        }
      }

      toast.error("Failed to load chat threads")
    } finally {
      setIsLoadingThreads(false)
    }
  }

  const loadThreadData = async (threadId: number) => {
    try {
      const messageRows = await listChatMessages(threadId, 200)

      setMessages(messageRows)
      // Auto-scroll to bottom when loading a thread
      setTimeout(scrollToBottom, 100)

      const traceMap: TraceByMessage = {}
      const assistantMessages = messageRows.filter((msg) => msg.role === "assistant")
      const traceRows = await Promise.all(
        assistantMessages.map((msg) => listRetrievalTraceByMessageId(msg.id))
      )
      for (let i = 0; i < assistantMessages.length; i++) {
        const trace = traceRows[i]
        if (trace) {
          traceMap[assistantMessages[i].id] = trace
        }
      }
      setTracesByMessage(traceMap)

      // Keep trace drawer closed by default; user explicitly opens a trace.
      setSelectedAssistantMessageId(null)
    } catch (err) {
      console.error("Failed to load thread data:", err)
      toast.error("Failed to load conversation history")
    }
  }

  const handleCreateThread = async () => {
    if (!dbUserId?.trim()) {
      toast.error("Session is still loading. Please try again in a moment.")
      return
    }

    setIsCreatingThread(true)

    const createOnce = async () => {
      const thread = await createChatThread({
        user_id: dbUserId,
        module: "rag_chat",
        title: "New Chat",
      })

      setThreads((current) => [thread, ...current])
      setActiveThreadId(thread.id)
      setMessages([])
      setTracesByMessage({})
      setSelectedAssistantMessageId(null)
      setMobileTraceOpen(false)
      setDesktopTraceOpen(false)
      toast.success("New chat created")
    }

    try {
      await createOnce()
    } catch (err) {
      console.error("Failed to create thread:", err)
      if (isAuthError(err)) {
        const tokenReady = await waitForAuthToken()
        if (tokenReady) {
          try {
            await createOnce()
            return
          } catch (retryErr) {
            console.error("Retry failed to create thread:", retryErr)
            toast.error(getReadableError(retryErr, "Failed to create chat"))
            return
          }
        }
      }
      toast.error(getReadableError(err, "Failed to create chat"))
    } finally {
      setIsCreatingThread(false)
    }
  }

  const ensureActiveThread = async (): Promise<number | null> => {
    if (activeThreadId) return activeThreadId
    if (threads.length > 0) {
      const firstThreadId = threads[0].id
      setActiveThreadId(firstThreadId)
      return firstThreadId
    }

    const thread = await createChatThread({
      user_id: dbUserId,
      module: "rag_chat",
      title: "New Chat",
    })

    setThreads((current) => [thread, ...current])
    setActiveThreadId(thread.id)
    return thread.id
  }

  const handleSend = async () => {
    const text = input.trim()
    if (!text || isSending) return
    if (!dbUserId?.trim()) {
      toast.error("Session is still loading. Please try again in a moment.")
      return
    }

    setIsSending(true)
    setLiveAssistantText("")
    setSendStage("preparing")
    setSendProgress(8)
    setInput("")

    const sendOnce = async () => {
      setSendStage("preparing")
      setSendProgress((p) => Math.max(p, 12))
      const threadId = await ensureActiveThread()
      if (!threadId) {
        throw new Error("Unable to resolve chat thread")
      }

      const recentContext = uploadedFiles
        .slice(0, 3)
        .map((f, i) => `[File ${i + 1}: ${f.name}]\n${f.content.slice(0, 2500)}`)
        .join("\n\n")

      const wantsSpreadsheet = /excel|xlsx|spreadsheet|sheet|formula|table/.test(text.toLowerCase())
      const readabilityHint = "\n\nFormat the answer for end users with clear headings, clean bullets, and readable paragraphs. Avoid noisy symbols unless needed."
      const formatHint = wantsSpreadsheet
        ? "\n\nIf solving spreadsheet-related tasks, provide a clear table and include formulas per row/column where relevant."
        : ""

      const enrichedQuery = recentContext
        ? `Use uploaded files as trusted context where relevant. If context is not relevant, ignore it.\n\n${recentContext}\n\nUser query: ${text}${formatHint}${readabilityHint}`
        : `${text}${formatHint}${readabilityHint}`

      setSendStage("retrieving")
      setSendProgress((p) => Math.max(p, 28))

      setSendStage("generating")
      setSendProgress((p) => Math.max(p, 52))
      const result = await sentinelQuery(enrichedQuery, {
        module: "rag_chat",
        contentType: "chat",
        humanizeOnOutput: postProcessSettings.humanizeOnOutput,
        preserveFactsStrictly: postProcessSettings.preserveFactsStrictly,
        matchMyVoice: postProcessSettings.matchMyVoice,
        voiceSample: postProcessSettings.voiceSample,
        postProcessProfile: postProcessSettings.postProcessProfile,
        userId: dbUserId,
        threadId,
        persistConversation: true,
        qualityGateProfile: "lenient",
        enableQualityGate: false,
        preferCopilot: true,
        model: selectedModel,
        onToken: (token) => {
          setSendStage("generating")
          setSendProgress((p) => Math.max(p, 58))
          setLiveAssistantText((current) => `${current}${token}`)
        },
        userMessageMetadata: editingMessageId
          ? {
              edited_from_message_id: editingMessageId,
              edited_at: new Date().toISOString(),
              user_name: userName ?? null,
            }
          : {
              user_name: userName ?? null,
              uploaded_files: uploadedFiles.slice(0, 3).map((f) => ({
                name: f.name,
                status: f.status,
                chunksIndexed: f.chunksIndexed ?? 0,
              })),
            },
      })

      if (result.status === "needs_clarification") {
        toast.info("More details needed for best response")
      }

      setSendStage("finalizing")
      setSendProgress((p) => Math.max(p, 80))
      await loadThreadData(threadId)
      void loadThreads()
      setEditingMessageId(null)
      setSendProgress(100)
      setTimeout(scrollToBottom, 100)
    }

    try {
      await sendOnce()
    } catch (err) {
      console.error("Failed to send message:", err)
      const authError = isAuthError(err)

      if (authError) {
        const tokenReady = await waitForAuthToken()
        if (tokenReady) {
          try {
            await sendOnce()
            return
          } catch (retryErr) {
            console.error("Retry failed to send message:", retryErr)
          }
        }
      }

      toast.error(getReadableError(err, "Failed to send message"))
      setInput(text)
    } finally {
      setIsSending(false)
      setSendStage("idle")
      setSendProgress(0)
      setLiveAssistantText("")
    }
  }

  const handleDeleteThread = async (threadId: number) => {
    const confirmed = window.confirm("Delete this thread and all its messages?")
    if (!confirmed) return

    try {
      const deleted = await deleteChatThread(threadId)
      if (!deleted) {
        toast.error("Failed to delete thread")
        return
      }

      const remaining = threads.filter((thread) => thread.id !== threadId)
      setThreads(remaining)

      if (activeThreadId === threadId) {
        const nextThreadId = remaining[0]?.id ?? null
        setActiveThreadId(nextThreadId)
        if (!nextThreadId) {
          setMessages([])
          setTracesByMessage({})
          setSelectedAssistantMessageId(null)
          setMobileTraceOpen(false)
          setDesktopTraceOpen(false)
        }
      }

      toast.success("Thread deleted")
    } catch (err) {
      console.error("Failed to delete thread:", err)
      toast.error("Failed to delete thread")
    }
  }

  const handleRenameThread = async (threadId: number, currentTitle: string) => {
    const nextTitleRaw = window.prompt("Rename thread", currentTitle)
    if (!nextTitleRaw) return

    const nextTitle = nextTitleRaw.trim()
    if (!nextTitle || nextTitle === currentTitle) return

    try {
      const updated = await updateChatThread(threadId, { title: nextTitle })
      if (!updated) {
        toast.error("Failed to rename thread")
        return
      }
      setThreads((current) => current.map((thread) => (thread.id === threadId ? { ...thread, title: nextTitle } : thread)))
      toast.success("Thread renamed")
    } catch (err) {
      console.error("Failed to rename thread:", err)
      toast.error("Failed to rename thread")
    }
  }

  const handleEditMessage = (message: ChatMessage) => {
    setInput(message.content)
    setEditingMessageId(message.id)
    requestAnimationFrame(() => {
      composerRef.current?.focus()
      composerRef.current?.setSelectionRange(composerRef.current.value.length, composerRef.current.value.length)
    })
    toast.info("Message loaded. Edit and send.")
  }

  const selectedTrace = selectedAssistantMessageId
    ? tracesByMessage[selectedAssistantMessageId] ?? null
    : null

  const tracedAssistantMessageIds = useMemo(
    () => messages
      .filter((msg) => msg.role === "assistant" && Boolean(tracesByMessage[msg.id]))
      .map((msg) => msg.id),
    [messages, tracesByMessage]
  )

  const selectedTraceIndex = useMemo(
    () => selectedAssistantMessageId ? tracedAssistantMessageIds.indexOf(selectedAssistantMessageId) : -1,
    [selectedAssistantMessageId, tracedAssistantMessageIds]
  )

  const goToPreviousTrace = () => {
    if (selectedTraceIndex <= 0) return
    setSelectedAssistantMessageId(tracedAssistantMessageIds[selectedTraceIndex - 1])
  }

  const goToNextTrace = () => {
    if (selectedTraceIndex < 0 || selectedTraceIndex >= tracedAssistantMessageIds.length - 1) return
    setSelectedAssistantMessageId(tracedAssistantMessageIds[selectedTraceIndex + 1])
  }

  const openTraceCenter = (mode: "desktop" | "mobile") => {
    if (tracedAssistantMessageIds.length === 0) {
      toast.info("No trace data available for this thread yet")
      return
    }

    const hasSelectedTrace = selectedAssistantMessageId && tracesByMessage[selectedAssistantMessageId]
    if (!hasSelectedTrace) {
      setSelectedAssistantMessageId(tracedAssistantMessageIds[tracedAssistantMessageIds.length - 1])
    }

    if (mode === "mobile") {
      setMobileTraceOpen(true)
      return
    }

    setDesktopTraceOpen(true)
  }

  const renderAssistantContent = (content: string) => {
    const normalized = normalizeAssistantContent(content)
    const sections = normalized.split(/\n{2,}/).map((s) => s.trim()).filter(Boolean)

    return (
      <div dir="auto" className="text-sm text-foreground leading-relaxed space-y-3">
        {sections.map((section, index) => {
          const heading = section.match(/^#{1,6}\s+(.+)$/)
          if (heading) {
            return <h4 key={`sec-${index}`} className="text-base font-semibold text-foreground">{heading[1]}</h4>
          }

          const lines = section.split("\n").map((line) => line.trim()).filter(Boolean)
          const bullets = lines.filter((line) => /^[-*]\s+/.test(line))
          if (bullets.length === lines.length && bullets.length > 0) {
            return (
              <ul key={`sec-${index}`} className="list-disc pl-5 space-y-1 marker:text-primary">
                {bullets.map((line, bulletIndex) => (
                  <li key={`sec-${index}-bullet-${bulletIndex}`}>{line.replace(/^[-*]\s+/, "")}</li>
                ))}
              </ul>
            )
          }

          return (
            <p key={`sec-${index}`} className="whitespace-pre-wrap">
              {section
                .replace(/\*\*(.*?)\*\*/g, "$1")
                .replace(/`([^`]+)`/g, "$1")
                .replace(/^#{1,6}\s+/gm, "")}
            </p>
          )
        })}
      </div>
    )
  }

  const renderChunkPreview = (chunk: Record<string, unknown>, index: number) => {
    const similarityRaw = chunk.similarity
    const similarity = typeof similarityRaw === "number" ? similarityRaw.toFixed(4) : "n/a"
    const sector = typeof chunk.sector === "string" ? chunk.sector : "n/a"
    const documentId = typeof chunk.document_id === "number" ? chunk.document_id : null
    const chunkIndex = typeof chunk.chunk_index === "number" ? chunk.chunk_index : null
    const preview = typeof chunk.preview === "string" ? chunk.preview : ""

    return (
      <div key={`${index}-${String(chunk.id ?? "chunk")}`} className="rounded-md border border-border/50 bg-background/80 p-2">
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground mb-1">
          <span className="font-medium text-foreground">Chunk {index + 1}</span>
          <span>sim: {similarity}</span>
          <span>sector: {sector}</span>
          {documentId !== null && <span>doc: {documentId}</span>}
          {chunkIndex !== null && <span>index: {chunkIndex}</span>}
        </div>
        <p className="text-[12px] text-foreground whitespace-pre-wrap">{preview || "No preview available."}</p>
      </div>
    )
  }

  const renderTraceContent = () => {
    if (!selectedTrace) {
      return (
        <div className="rounded-md border border-dashed border-border/60 p-3 text-xs text-muted-foreground">
          Open Trace Center to review all traces in this thread.
        </div>
      )
    }

    return (
      <div className="space-y-3">
        <div className="rounded-md border border-border/60 bg-card/60 p-2 flex items-center justify-between gap-2">
          <p className="text-[12px] text-muted-foreground">
            Trace {selectedTraceIndex >= 0 ? selectedTraceIndex + 1 : 0} of {tracedAssistantMessageIds.length}
          </p>
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2 text-[11px]"
              onClick={goToPreviousTrace}
              disabled={selectedTraceIndex <= 0}
            >
              Previous
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2 text-[11px]"
              onClick={goToNextTrace}
              disabled={selectedTraceIndex < 0 || selectedTraceIndex >= tracedAssistantMessageIds.length - 1}
            >
              Next
            </Button>
          </div>
        </div>

        <div className="rounded-md border border-border/60 bg-card/60 p-2 text-[12px] space-y-1">
          <p className="text-foreground">provider: <span className="text-muted-foreground">{selectedTrace.provider ?? "n/a"}</span></p>
          <p className="text-foreground">model: <span className="text-muted-foreground">{selectedTrace.model_used ?? "n/a"}</span></p>
          <p className="text-foreground">module: <span className="text-muted-foreground">{selectedTrace.module ?? "n/a"}</span></p>
          <p className="text-foreground">trace id: <span className="text-muted-foreground">{selectedTrace.id}</span></p>
        </div>

        <div className="rounded-md border border-border/60 bg-card/60 p-2 text-[12px] space-y-1">
          <p className="text-foreground">selected chunks: <span className="text-muted-foreground">{Array.isArray(selectedTrace.selected_chunks) ? selectedTrace.selected_chunks.length : 0}</span></p>
          <p className="text-foreground">total candidates: <span className="text-muted-foreground">{selectedTrace.total_candidates}</span></p>
          <p className="text-foreground">avg similarity: <span className="text-muted-foreground">{selectedTrace.avg_similarity !== null ? selectedTrace.avg_similarity.toFixed(4) : "n/a"}</span></p>
          <p className="text-foreground inline-flex items-center gap-1"><ClockCounterClockwise size={12} /> retrieve: <span className="text-muted-foreground">{selectedTrace.retrieval_latency_ms !== null ? `${selectedTrace.retrieval_latency_ms}ms` : "n/a"}</span></p>
          <p className="text-foreground inline-flex items-center gap-1"><ClockCounterClockwise size={12} /> generate: <span className="text-muted-foreground">{selectedTrace.generation_latency_ms !== null ? `${selectedTrace.generation_latency_ms}ms` : "n/a"}</span></p>
        </div>

        <div className="space-y-2">
          {Array.isArray(selectedTrace.selected_chunks) && selectedTrace.selected_chunks.length > 0 ? (
            selectedTrace.selected_chunks.map((chunk, index) => renderChunkPreview(chunk, index))
          ) : (
            <div className="rounded-md border border-dashed border-border/60 p-2 text-[12px] text-muted-foreground">
              No retrieval chunks were attached for this response.
            </div>
          )}
        </div>
      </div>
    )
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      void handleSend()
    }
  }

  const showThreadsSidebar = true
  const showDesktopTrace = isAdmin && desktopTraceOpen
  const composerSuggestions = starterPrompts.slice(0, 4)

  return (
    <div dir="auto" className={cn("grid gap-4 h-full", showThreadsSidebar ? "grid-cols-1 lg:grid-cols-[280px_1fr]" : "grid-cols-1")}>
      {showThreadsSidebar && (
        <aside className="hidden lg:block bg-card/80 backdrop-blur-sm rounded-2xl border border-border/50 p-3">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <ChatsCircle size={18} weight="duotone" />
              Threads
            </h3>
            <Button size="sm" variant="outline" onClick={handleCreateThread} disabled={isCreatingThread}>
              <Plus size={14} />
            </Button>
          </div>

          <ScrollArea className="h-[calc(100vh-280px)] min-h-[360px] pr-2 scroll-smooth">
            <div className="space-y-1">
              {isLoadingThreads && <p className="text-xs text-muted-foreground">Loading threads...</p>}

              {!isLoadingThreads && threads.length === 0 && (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">No chats yet. Create your first thread.</p>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="w-full"
                    onClick={handleCreateThread}
                    disabled={isCreatingThread}
                  >
                    {isCreatingThread ? "Creating..." : "Start First Thread"}
                  </Button>
                </div>
              )}

                {threads.map((thread) => (
                  <div
                    key={thread.id}
                    className={cn(
                      "w-full rounded-lg border px-2 py-1.5 transition-colors",
                      activeThreadId === thread.id
                        ? "border-primary bg-primary/10"
                        : "border-border/50 hover:bg-secondary/30"
                    )}
                  >
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setActiveThreadId(thread.id)}
                        className="flex-1 text-left min-w-0"
                      >
                        <p className="text-xs font-medium text-foreground whitespace-normal break-words leading-snug">{thread.title}</p>
                      </button>
                      <div className="flex items-center gap-0.5 shrink-0">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6"
                          onClick={() => void handleRenameThread(thread.id, thread.title)}
                          title="Rename thread"
                        >
                          <PencilSimple size={12} />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6 text-destructive hover:text-destructive"
                          onClick={() => void handleDeleteThread(thread.id)}
                          title="Delete thread"
                        >
                          <Trash size={12} />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
          </ScrollArea>
        </aside>
      )}

      <section className={cn("bg-card/80 backdrop-blur-sm rounded-2xl border border-border/50 p-3 md:p-4 flex flex-col", messages.length === 0 ? "min-h-[calc(100vh-160px)] items-center justify-center border-none bg-transparent shadow-none" : "min-h-[calc(100vh-200px)]")}>
        {messages.length > 0 && (
          <div className="flex items-center justify-between mb-3 w-full shrink-0">
            <div>
              <h3 className="text-base font-semibold text-foreground">{activeThread?.title ?? "AI Chat"}</h3>
              <p className="text-xs text-muted-foreground">Intelligent threaded conversations powered by AI</p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={exportThreadTxt}
                disabled={messages.length === 0}
              >
                Export .txt
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploadingFiles}
              >
                {isUploadingFiles ? "Uploading..." : "Upload File"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="lg:hidden"
                onClick={() => setMobileThreadsOpen(true)}
                disabled={threads.length === 0}
              >
                Threads
              </Button>
              {isAdmin && (
                <Button
                  size="sm"
                  variant="outline"
                  className="xl:hidden"
                  onClick={() => openTraceCenter("mobile")}
                  disabled={tracedAssistantMessageIds.length === 0}
                >
                  Trace Center ({tracedAssistantMessageIds.length})
                </Button>
              )}
              {isAdmin && (
                <Button
                  size="sm"
                  variant="outline"
                  className="hidden xl:inline-flex"
                  onClick={() => openTraceCenter("desktop")}
                  disabled={tracedAssistantMessageIds.length === 0}
                >
                  Trace Center ({tracedAssistantMessageIds.length})
                </Button>
              )}
            </div>
          </div>
        )}

        {messages.length === 0 ? (
          <div className="w-full max-w-5xl px-2 md:px-6 flex flex-col items-center justify-center animate-in fade-in zoom-in duration-500">
            <div className="w-full flex items-center justify-end gap-2 mb-8">
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-lg border border-border/70 bg-card/70 px-3 py-2 text-sm text-foreground/90"
              >
                <Gift size={16} />
                <span>7 days left in trial</span>
              </button>
              <button type="button" className="h-9 w-9 rounded-full border border-border/70 bg-card/70 inline-flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">
                <Bell size={16} />
              </button>
              <button type="button" className="h-9 w-9 rounded-full border border-border/70 bg-card/70 inline-flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">
                <Question size={16} />
              </button>
              <button type="button" className="h-9 w-9 rounded-full border border-border/70 bg-card/70 inline-flex items-center justify-center text-primary">
                <UserCircle size={18} weight="fill" />
              </button>
            </div>

            <h1 className="text-4xl md:text-5xl font-semibold tracking-tight text-foreground mb-8 text-center">
              Welcome{userName ? `, ${userName}` : ""}, how can NovusSparks AI help you?
            </h1>
            
            <div className="w-full relative mb-10 rounded-2xl border border-border/60 bg-background shadow-sm overflow-hidden">
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                multiple
                accept=".txt,.md,.csv,.json,.docx,.pdf"
                onChange={handleUploadFiles}
              />
              <div className="p-3 border-b border-border/60">
                <PostProcessControls
                  settings={postProcessSettings}
                  onChange={setPostProcessSettings}
                  compact
                  title="Chat Output Controls"
                />
                <div className="mt-2 flex items-center gap-2 text-xs">
                  <Button size="sm" variant="outline" className="h-7" onClick={() => fileInputRef.current?.click()}>
                    Add Context File
                  </Button>
                  <label className="inline-flex items-center gap-1 text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={autoIngestToBrain}
                      onChange={(e) => setAutoIngestToBrain(e.target.checked)}
                    />
                    Use files in My Knowledge Memory
                  </label>
                </div>
                {uploadedFiles.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {uploadedFiles.slice(0, 4).map((f) => (
                      <span key={f.id} className="rounded-full border border-border/60 px-2 py-1 text-[11px] text-foreground">
                        {f.name} ({f.status}{f.chunksIndexed ? `:${f.chunksIndexed}` : ""})
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <Textarea
                placeholder="How can I help you today?"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                className="min-h-[120px] md:min-h-[140px] resize-none pb-14 text-base md:text-lg rounded-none border-0 bg-transparent focus-visible:ring-0"
              />
              <div className="absolute bottom-3 left-3">
                <select
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  className="h-8 rounded-lg border border-border/60 bg-background/90 px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
                  title="Select AI model"
                >
                  {availableModels.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </div>
              <div className="absolute bottom-3 right-3 flex items-center gap-2">
                <div className="h-9 w-9 rounded-full bg-emerald-600/15 text-emerald-600 flex items-center justify-center">
                  <Robot size={18} weight="fill" />
                </div>
                <Button
                  onClick={handleSend}
                  disabled={!input.trim() || isSending || isCreatingThread}
                  size="icon"
                  className="rounded-full h-10 w-10 shrink-0"
                >
                  <ChatsCircle size={18} weight="fill" />
                </Button>
              </div>
            </div>

            <div className="w-full">
              <div className="flex items-center gap-2 text-muted-foreground mb-4 px-1">
                <Lightning size={18} weight="duotone" />
                <h2 className="text-sm font-medium">Suggested prompts</h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {starterPrompts.map((prompt, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      setInput(prompt.title)
                    }}
                    className={cn(
                      "flex flex-col text-left p-5 rounded-xl border bg-muted/30 hover:bg-card transition-all group",
                      i === 1 ? "border-foreground/40" : "border-border/60 hover:border-primary/40"
                    )}
                  >
                    <span className="text-sm font-medium text-foreground mb-1 group-hover:text-primary transition-colors">{prompt.title}</span>
                    <span className="text-sm text-muted-foreground">{prompt.desc}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className={cn("grid grid-cols-1 gap-3 w-full flex-1 min-h-0", showDesktopTrace && "xl:grid-cols-[1fr_340px]")}>
            <div className="flex flex-col h-full min-h-[400px] relative">
              <ScrollArea className="flex-1 pr-1 md:pr-4 md:-mr-4 h-full scroll-smooth" ref={(node) => {
                if (node) {
                  const viewport = node.querySelector("[data-radix-scroll-area-viewport]") as HTMLDivElement | null
                  chatScrollRef.current = viewport
                }
              }}>
                <div className="space-y-4 pb-4">
                  {messages.map((message) => {
                    const isAssistant = message.role === "assistant"
                    return (
                      <div key={message.id} className={cn("rounded-2xl border p-4", isAssistant ? "border-primary/30 bg-primary/5" : "border-border/60 bg-secondary/20")}>
                        <div className="flex items-center gap-2 text-xs mb-3">
                          <div className={cn("h-6 w-6 rounded-full flex items-center justify-center", isAssistant ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground")}>
                            {isAssistant ? <Robot size={14} weight="fill" /> : <User size={14} weight="fill" />}
                          </div>
                          <span className="font-semibold text-foreground">{isAssistant ? "NovusSparks AI" : "You"}</span>
                          <span className="text-muted-foreground ml-auto">{new Date(message.created_at).toLocaleTimeString()}</span>
                          {!isAssistant && (
                            <Button
                              size="icon"
                              variant="outline"
                              className="h-7 w-7"
                              onClick={() => handleEditMessage(message)}
                              title="Edit this message"
                            >
                              <PencilSimple size={13} />
                            </Button>
                          )}
                        </div>
                        {isAssistant ? renderAssistantContent(message.content) : (
                          <div dir="auto" className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
                            {message.content}
                          </div>
                        )}

                        {isAssistant && (
                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => void copyMessage(message.content)}>
                              Copy
                            </Button>
                            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => exportMessageTxt(message.content)}>
                              .txt
                            </Button>
                            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => exportMessageDoc(message.content)}>
                              .doc
                            </Button>
                            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => exportMessageCsv(message.content)}>
                              .csv
                            </Button>
                            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => void exportMessagePptx(message.content)}>
                              .pptx
                            </Button>
                          </div>
                        )}
                      </div>
                    )
                  })}
                  {isSending && (
                    <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4">
                      <div className="flex items-center gap-2 text-xs mb-3">
                        <div className="h-6 w-6 rounded-full flex items-center justify-center bg-primary/20 text-primary">
                          <Robot size={14} weight="fill" />
                        </div>
                        <span className="font-semibold text-foreground">NovusSparks AI</span>
                        <span className="text-muted-foreground">typing...</span>
                        <span className="text-muted-foreground ml-auto">{sendElapsedSec}s</span>
                      </div>
                      {liveAssistantText ? (
                        renderAssistantContent(liveAssistantText)
                      ) : (
                        <div className="text-sm text-muted-foreground">Working on your response...</div>
                      )}
                    </div>
                  )}
                </div>
              </ScrollArea>

              {/* Scroll navigation buttons */}
              <div className="absolute right-6 top-2 flex flex-col gap-1 z-10">
                <Button
                  size="icon"
                  variant="outline"
                  className="h-7 w-7 rounded-full bg-background/90 backdrop-blur-sm shadow-sm border-border/60"
                  onClick={scrollToTop}
                  title="Scroll to top"
                >
                  <ArrowUp size={14} />
                </Button>
                <Button
                  size="icon"
                  variant="outline"
                  className="h-7 w-7 rounded-full bg-background/90 backdrop-blur-sm shadow-sm border-border/60"
                  onClick={scrollToBottom}
                  title="Scroll to bottom"
                >
                  <ArrowDown size={14} />
                </Button>
              </div>

              <div className="mt-auto pt-4 shrink-0">
                {editingMessageId && (
                  <div className="mb-2 flex items-center justify-between rounded-lg border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
                    <span>Edited from previous message</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-2 text-xs"
                      onClick={() => setEditingMessageId(null)}
                    >
                      Clear
                    </Button>
                  </div>
                )}
                <div className="mb-3 flex flex-wrap gap-2">
                  {composerSuggestions.map((prompt) => (
                    <button
                      key={`composer-${prompt.title}`}
                      type="button"
                      onClick={() => setInput(prompt.title)}
                      className="rounded-full border border-border/70 bg-muted/30 px-3 py-1.5 text-xs text-foreground hover:bg-muted/50 transition-colors"
                    >
                      {prompt.title}
                    </button>
                  ))}
                </div>
                <div className="mb-2 flex items-center gap-2 text-xs">
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    multiple
                    accept=".txt,.md,.csv,.json,.docx,.pdf"
                    onChange={handleUploadFiles}
                  />
                  <Button size="sm" variant="outline" className="h-7" onClick={() => fileInputRef.current?.click()}>
                    {isUploadingFiles ? "Uploading..." : "Attach file"}
                  </Button>
                  <label className="inline-flex items-center gap-1 text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={autoIngestToBrain}
                      onChange={(e) => setAutoIngestToBrain(e.target.checked)}
                    />
                    Use files in My Knowledge Memory
                  </label>
                </div>
                {uploadedFiles.length > 0 && (
                  <div className="mb-2 flex flex-wrap gap-2">
                    {uploadedFiles.slice(0, 6).map((f) => (
                      <span key={`ctx-${f.id}`} className="rounded-full border border-border/70 bg-muted/20 px-2 py-1 text-[11px] text-foreground">
                        {f.name} ({f.status}{f.chunksIndexed ? `:${f.chunksIndexed}` : ""})
                      </span>
                    ))}
                  </div>
                )}
                <div className="relative shadow-sm rounded-xl">
                  <div className="mb-3">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs text-muted-foreground shrink-0">Model:</span>
                      <select
                        value={selectedModel}
                        onChange={(e) => setSelectedModel(e.target.value)}
                        className="h-7 flex-1 rounded-md border border-border/60 bg-background/80 px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
                        title="Select AI model"
                      >
                        {availableModels.map((m) => (
                          <option key={m.id} value={m.id}>{m.name}</option>
                        ))}
                      </select>
                    </div>
                    <PostProcessControls
                      settings={postProcessSettings}
                      onChange={setPostProcessSettings}
                      compact
                      title="Chat Output Controls"
                    />
                  </div>
                  <Textarea
                    ref={composerRef}
                    placeholder="Type your message..."
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    className="min-h-[60px] max-h-[200px] pr-14 resize-none rounded-xl border-border/60 bg-background/80 focus-visible:ring-primary focus-visible:bg-background transition-colors"
                  />
                  {isSending && (
                    <div className="px-2 pt-2 pb-1">
                      <div className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground">
                        <span>{sendStageLabel}</span>
                        <span>{sendElapsedSec}s</span>
                      </div>
                      <Progress value={sendProgress} className="h-1.5" />
                    </div>
                  )}
                  <Button
                    onClick={handleSend}
                    disabled={!input.trim() || isSending || isCreatingThread}
                    size="icon"
                    className="absolute bottom-2 right-2 rounded-lg h-8 w-8 shrink-0"
                  >
                    <ChatsCircle size={16} weight="fill" />
                  </Button>
                </div>
              </div>
            </div>

            {showDesktopTrace && (
              <aside className="hidden xl:block h-full rounded-2xl border border-border/60 bg-background/40 overflow-hidden">
                <div className="h-full flex flex-col">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-border/60 bg-card/40">
                    <div>
                      <p className="text-sm font-semibold text-foreground">Trace Drawer</p>
                      <p className="text-[11px] text-muted-foreground">Selected response metadata</p>
                    </div>
                    {selectedAssistantMessageId && (
                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0 rounded-full" onClick={() => { setSelectedAssistantMessageId(null); setDesktopTraceOpen(false) }}>
                        <X size={14} />
                      </Button>
                    )}
                  </div>
                  <div className="flex-1 overflow-hidden p-3">
                    {renderTraceContent()}
                  </div>
                </div>
              </aside>
            )}
          </div>
        )}
      </section>

      {isAdmin && (
        <Sheet open={mobileTraceOpen} onOpenChange={setMobileTraceOpen}>
          <SheetContent side="right" className="xl:hidden w-full sm:max-w-md p-0">
            <SheetHeader className="border-b border-border/60 p-4">
              <SheetTitle>Trace Drawer</SheetTitle>
              <SheetDescription>Selected assistant response metadata</SheetDescription>
            </SheetHeader>
            <ScrollArea className="h-[calc(100vh-96px)] p-3">
              {renderTraceContent()}
            </ScrollArea>
          </SheetContent>
        </Sheet>
      )}

      <Sheet open={mobileThreadsOpen} onOpenChange={setMobileThreadsOpen}>
        <SheetContent side="left" className="lg:hidden w-full sm:max-w-sm p-0">
          <SheetHeader className="border-b border-border/60 p-4">
            <SheetTitle>Threads</SheetTitle>
            <SheetDescription>Open, create, or delete chat threads</SheetDescription>
          </SheetHeader>
          <div className="p-3 border-b border-border/60">
            <Button size="sm" variant="outline" onClick={handleCreateThread} disabled={isCreatingThread} className="w-full">
              <Plus size={14} className="mr-1" />
              {isCreatingThread ? "Creating..." : "New Thread"}
            </Button>
          </div>
          <ScrollArea className="h-[calc(100vh-150px)] p-3 scroll-smooth">
            <div className="space-y-2">
              {threads.map((thread) => (
                <div key={`mobile-${thread.id}`} className={cn("rounded-lg border px-2 py-2", activeThreadId === thread.id ? "border-primary bg-primary/10" : "border-border/50") }>
                  <div className="flex items-start gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setActiveThreadId(thread.id)
                        setMobileThreadsOpen(false)
                      }}
                      className="flex-1 text-left min-w-0"
                    >
                      <p className="text-sm font-medium text-foreground whitespace-normal break-words leading-snug">{thread.title}</p>
                      <p className="text-[11px] text-muted-foreground whitespace-normal break-words">{thread.module}</p>
                    </button>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        size="icon"
                        variant="outline"
                        className="h-7 w-7"
                        onClick={() => void handleRenameThread(thread.id, thread.title)}
                      >
                        <PencilSimple size={13} />
                      </Button>
                      <Button
                        size="icon"
                        variant="outline"
                        className="h-7 w-7 text-destructive border-destructive/30 hover:text-destructive"
                        onClick={() => void handleDeleteThread(thread.id)}
                      >
                        <Trash size={13} />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
              {threads.length === 0 && (
                <p className="text-xs text-muted-foreground">No threads yet.</p>
              )}
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>
    </div>
  )
}
