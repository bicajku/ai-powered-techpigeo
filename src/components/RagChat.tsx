import { useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { ScrollArea } from "@/components/ui/scroll-area"
import { PostProcessControls, type PostProcessSettings } from "@/components/PostProcessControls"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Plus, ChatsCircle, User, Robot, ClockCounterClockwise, LinkSimple, X, Lightning, Bell, Question, UserCircle, Gift, Trash, PencilSimple, ArrowUp, ArrowDown } from "@phosphor-icons/react"
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
} from "@/lib/sentinel-brain"
import { sentinelQuery } from "@/lib/sentinel-query-pipeline"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

type AvailableModel = { id: string; name: string; provider: string; tier: string }

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
]

interface RagChatProps {
  userId: string
  isAdmin?: boolean
}

type TraceByMessage = Record<number, RetrievalTrace>

export function RagChat({ userId, isAdmin = false }: RagChatProps) {
  // Use the raw string userId directly — the chat_threads.user_id column
  // is now TEXT to properly support UUID-based user IDs from the backend.
  const dbUserId = userId

  const [threads, setThreads] = useState<ChatThread[]>([])
  const [activeThreadId, setActiveThreadId] = useState<number | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [tracesByMessage, setTracesByMessage] = useState<TraceByMessage>({})
  const [selectedAssistantMessageId, setSelectedAssistantMessageId] = useState<number | null>(null)
  const [mobileTraceOpen, setMobileTraceOpen] = useState(false)
  const [mobileThreadsOpen, setMobileThreadsOpen] = useState(false)
  const [input, setInput] = useState("")
  const [isLoadingThreads, setIsLoadingThreads] = useState(true)
  const [isCreatingThread, setIsCreatingThread] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [selectedModel, setSelectedModel] = useState("gpt-4.1")
  const [availableModels, setAvailableModels] = useState<AvailableModel[]>(DEFAULT_MODELS)
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
    () => [
      {
        title: "How do I collect Google Maps business data?",
        desc: "Get structured names, addresses, and phone numbers from listings.",
      },
      {
        title: "How do I use proxies with Puppeteer or Selenium?",
        desc: "Step-by-step setup for using proxies in browser automation scripts.",
      },
      {
        title: "How to connect my AI agent with MCP",
        desc: "Integrate your AI agent with MCP tools and external data workflows.",
      },
      {
        title: "How do I get a proxy from a specific country or city?",
        desc: "Route traffic by geo-location using residential, ISP, or mobile proxies.",
      },
      {
        title: "What is the platform's free tier?",
        desc: "See free-tier limits, quotas, and available capabilities.",
      },
      {
        title: "I need proxies",
        desc: "Quickly identify the right proxy solution for your use case.",
      },
    ],
    []
  )

  const activeThread = useMemo(
    () => threads.find((t) => t.id === activeThreadId) ?? null,
    [threads, activeThreadId]
  )

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
      return
    }
    setSelectedAssistantMessageId(null)
    setMobileTraceOpen(false)
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
    setInput("")

    const sendOnce = async () => {
      const threadId = await ensureActiveThread()
      if (!threadId) {
        throw new Error("Unable to resolve chat thread")
      }

      const result = await sentinelQuery(text, {
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
        userMessageMetadata: editingMessageId
          ? {
              edited_from_message_id: editingMessageId,
              edited_at: new Date().toISOString(),
            }
          : undefined,
      })

      if (result.status === "needs_clarification") {
        toast.info("More details needed for best response")
      }

      await loadThreadData(threadId)
      await loadThreads()
      setEditingMessageId(null)
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
    }
  }

  const handleDeleteThread = async (threadId: number) => {
    const confirmed = window.confirm("Delete this thread and all its messages?")
    if (!confirmed) return

    try {
      const deleted = await deleteChatThread(threadId, dbUserId)
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

  const openTraceForMessage = (messageId: number) => {
    setSelectedAssistantMessageId(messageId)
    setMobileTraceOpen(true)
  }

  const goToPreviousTrace = () => {
    if (selectedTraceIndex <= 0) return
    setSelectedAssistantMessageId(tracedAssistantMessageIds[selectedTraceIndex - 1])
  }

  const goToNextTrace = () => {
    if (selectedTraceIndex < 0 || selectedTraceIndex >= tracedAssistantMessageIds.length - 1) return
    setSelectedAssistantMessageId(tracedAssistantMessageIds[selectedTraceIndex + 1])
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
          Select any assistant message trace using "Open trace".
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
  const showDesktopTrace = isAdmin && Boolean(selectedAssistantMessageId)
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
                  onClick={() => setMobileTraceOpen(true)}
                  disabled={!selectedTrace}
                >
                  Open Trace
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
              Welcome, how can NovusSparks AI help you?
            </h1>
            
            <div className="w-full relative mb-10 rounded-2xl border border-border/60 bg-background shadow-sm overflow-hidden">
              <div className="p-3 border-b border-border/60">
                <PostProcessControls
                  settings={postProcessSettings}
                  onChange={setPostProcessSettings}
                  compact
                  title="Chat Output Controls"
                />
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
                    const trace = tracesByMessage[message.id]
                    const isSelected = selectedAssistantMessageId === message.id
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
                        <div dir="auto" className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
                          {message.content}
                        </div>

                        {isAdmin && isAssistant && trace && (
                          <div className="mt-4 rounded-xl border border-border/50 bg-background/80 p-3 text-xs text-muted-foreground space-y-2">
                            <div className="flex flex-wrap items-center gap-4">
                              <span className="inline-flex items-center gap-1 font-medium"><LinkSimple size={14} /> Chunks: {Array.isArray(trace.selected_chunks) ? trace.selected_chunks.length : 0}</span>
                              <span>Candidates: {trace.total_candidates}</span>
                              {trace.avg_similarity !== null && <span>Avg Sim: {trace.avg_similarity.toFixed(3)}</span>}
                            </div>

                            <div className="flex justify-end">
                              <Button
                                size="sm"
                                variant={isSelected ? "default" : "secondary"}
                                className="h-8 px-3 text-xs rounded-lg"
                                onClick={() => openTraceForMessage(message.id)}
                              >
                                {isSelected ? "Trace selected" : "Open trace"}
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
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
                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0 rounded-full" onClick={() => setSelectedAssistantMessageId(null)}>
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
