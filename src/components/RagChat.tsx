import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Plus, ChatsCircle, User, Robot, ClockCounterClockwise, LinkSimple, X } from "@phosphor-icons/react"
import {
  createChatThread,
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

interface RagChatProps {
  userId: string
  isAdmin?: boolean
}

type TraceByMessage = Record<number, RetrievalTrace>

export function RagChat({ userId, isAdmin = false }: RagChatProps) {
  const dbUserId = useMemo(() => {
    const numericUserId = Number(userId)
    if (Number.isFinite(numericUserId)) {
      return numericUserId
    }

    // Deterministic fallback for string-based auth IDs so we can safely map
    // per-user chat data into INTEGER-backed database columns.
    let hash = 0
    for (let i = 0; i < userId.length; i++) {
      hash = ((hash << 5) - hash + userId.charCodeAt(i)) | 0
    }
    return Math.abs(hash)
  }, [userId])

  const [threads, setThreads] = useState<ChatThread[]>([])
  const [activeThreadId, setActiveThreadId] = useState<number | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [tracesByMessage, setTracesByMessage] = useState<TraceByMessage>({})
  const [selectedAssistantMessageId, setSelectedAssistantMessageId] = useState<number | null>(null)
  const [mobileTraceOpen, setMobileTraceOpen] = useState(false)
  const [input, setInput] = useState("")
  const [isLoadingThreads, setIsLoadingThreads] = useState(true)
  const [isCreatingThread, setIsCreatingThread] = useState(false)
  const [isSending, setIsSending] = useState(false)

  const starterPrompts = useMemo(
    () => [
      "Summarize my platform architecture and suggest 3 immediate reliability improvements.",
      "Draft a secure API rollout checklist for this project with priorities.",
      "Review the current deployment setup and suggest a safer staging-to-production process.",
      "Create a 7-day execution plan to improve product UX, performance, and observability.",
    ],
    []
  )

  const activeThread = useMemo(
    () => threads.find((t) => t.id === activeThreadId) ?? null,
    [threads, activeThreadId]
  )

  useEffect(() => {
    void loadThreads()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!activeThreadId) {
      setMessages([])
      setTracesByMessage({})
      setSelectedAssistantMessageId(null)
      setMobileTraceOpen(false)
      return
    }
    void loadThreadData(activeThreadId)
  }, [activeThreadId])

  const loadThreads = async () => {
    setIsLoadingThreads(true)
    try {
      const rows = await listChatThreads({ user_id: dbUserId, limit: 50 })
      setThreads(rows)
      if (!activeThreadId && rows.length > 0) {
        setActiveThreadId(rows[0].id)
      }
    } catch (err) {
      console.error("Failed to load chat threads:", err)
      toast.error("Failed to load chat threads")
    } finally {
      setIsLoadingThreads(false)
    }
  }

  const loadThreadData = async (threadId: number) => {
    try {
      const messageRows = await listChatMessages(threadId, 200)

      setMessages(messageRows)

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

      const firstAssistantWithTrace = assistantMessages.find((msg) => traceMap[msg.id])
      setSelectedAssistantMessageId(firstAssistantWithTrace?.id ?? null)
    } catch (err) {
      console.error("Failed to load thread data:", err)
      toast.error("Failed to load conversation history")
    }
  }

  const handleCreateThread = async () => {
    setIsCreatingThread(true)
    try {
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
    } catch (err) {
      console.error("Failed to create thread:", err)
      toast.error("Failed to create chat")
    } finally {
      setIsCreatingThread(false)
    }
  }

  const handleSend = async () => {
    const text = input.trim()
    if (!text || !activeThreadId || isSending) return

    setIsSending(true)
    setInput("")
    try {
      const result = await sentinelQuery(text, {
        module: "rag_chat",
        userId: dbUserId,
        threadId: activeThreadId,
        persistConversation: true,
        qualityGateProfile: "lenient",
        enableQualityGate: false,
      })

      if (result.status === "needs_clarification") {
        toast.info("More details needed for best response")
      }

      await loadThreadData(activeThreadId)
      await loadThreads()
    } catch (err) {
      console.error("Failed to send message:", err)
      toast.error("Failed to send message")
      setInput(text)
    } finally {
      setIsSending(false)
    }
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

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4">
      <aside className="bg-card/80 backdrop-blur-sm rounded-2xl border border-border/50 p-3">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <ChatsCircle size={18} weight="duotone" />
            Threads
          </h3>
          <Button size="sm" variant="outline" onClick={handleCreateThread} disabled={isCreatingThread}>
            <Plus size={14} />
          </Button>
        </div>

        <ScrollArea className="h-[360px] pr-2">
          <div className="space-y-2">
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
              <button
                key={thread.id}
                type="button"
                onClick={() => setActiveThreadId(thread.id)}
                className={cn(
                  "w-full text-left rounded-lg border px-3 py-2 transition-colors",
                  activeThreadId === thread.id
                    ? "border-primary bg-primary/10"
                    : "border-border/50 hover:bg-secondary/30"
                )}
              >
                <p className="text-sm font-medium text-foreground truncate">{thread.title}</p>
                <p className="text-[11px] text-muted-foreground truncate">{thread.module}</p>
              </button>
            ))}
          </div>
        </ScrollArea>
      </aside>

      <section className="bg-card/80 backdrop-blur-sm rounded-2xl border border-border/50 p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-base font-semibold text-foreground">{activeThread?.title ?? "AI Chat"}</h3>
            <p className="text-xs text-muted-foreground">Intelligent threaded conversations powered by AI</p>
          </div>
          {isAdmin && (
            <Button
              size="sm"
              variant="outline"
              className="xl:hidden"
              onClick={() => setMobileTraceOpen(true)}
              disabled={!selectedTrace}
            >
              Open Trace Drawer
            </Button>
          )}
        </div>

        <div className={cn("grid grid-cols-1 gap-3", isAdmin && "xl:grid-cols-[1fr_340px]")}>
          <ScrollArea className="h-[420px] pr-2">
            <div className="space-y-3">
              {messages.length === 0 && (
                <div className="rounded-lg border border-dashed border-border/60 p-4 text-sm text-muted-foreground space-y-3">
                  <div>
                    <p className="text-foreground font-semibold">Welcome from Techpigeon AI</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Start with one of these examples, or type your own question to begin.
                    </p>
                  </div>
                  <div className="grid grid-cols-1 gap-2">
                    {starterPrompts.map((prompt) => (
                      <Button
                        key={prompt}
                        type="button"
                        variant="outline"
                        className="justify-start text-left h-auto whitespace-normal"
                        onClick={() => setInput(prompt)}
                        disabled={isSending}
                      >
                        {prompt}
                      </Button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((message) => {
                const isAssistant = message.role === "assistant"
                const trace = tracesByMessage[message.id]
                const isSelected = selectedAssistantMessageId === message.id
                return (
                  <div key={message.id} className={cn("rounded-xl border p-3", isAssistant ? "border-primary/30 bg-primary/5" : "border-border/60 bg-secondary/20")}>
                    <div className="flex items-center gap-2 text-xs mb-2">
                      {isAssistant ? <Robot size={14} /> : <User size={14} />}
                      <span className="font-medium text-foreground">{isAssistant ? "Assistant" : "You"}</span>
                      <span className="text-muted-foreground">{new Date(message.created_at).toLocaleTimeString()}</span>
                    </div>
                    <p className="text-sm text-foreground whitespace-pre-wrap">{message.content}</p>

                    {isAdmin && isAssistant && trace && (
                      <div className="mt-2 rounded-md border border-border/50 bg-background/60 p-2 text-[11px] text-muted-foreground space-y-2">
                        <div className="flex flex-wrap items-center gap-3">
                          <span className="inline-flex items-center gap-1"><LinkSimple size={12} /> chunks: {Array.isArray(trace.selected_chunks) ? trace.selected_chunks.length : 0}</span>
                          <span>candidates: {trace.total_candidates}</span>
                          {trace.avg_similarity !== null && <span>avg sim: {trace.avg_similarity.toFixed(3)}</span>}
                        </div>

                        <div className="flex justify-end">
                          <Button
                            size="sm"
                            variant={isSelected ? "default" : "ghost"}
                            className="h-7 px-2 text-[11px]"
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

          {isAdmin && (
            <aside className="hidden xl:block h-[420px] rounded-xl border border-border/60 bg-background/40 overflow-hidden">
              <div className="h-full flex flex-col">
                <div className="flex items-center justify-between px-3 py-2 border-b border-border/60">
                  <div>
                    <p className="text-sm font-semibold text-foreground">Trace Drawer</p>
                    <p className="text-[11px] text-muted-foreground">Selected assistant response metadata</p>
                  </div>
                  {selectedAssistantMessageId && (
                    <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setSelectedAssistantMessageId(null)}>
                      <X size={12} />
                    </Button>
                  )}
                </div>

                <ScrollArea className="flex-1 p-3">
                  {renderTraceContent()}
                </ScrollArea>
              </div>
            </aside>
          )}
        </div>

        {isAdmin && (
          <Sheet open={mobileTraceOpen} onOpenChange={setMobileTraceOpen}>
            <SheetContent side="right" className="xl:hidden w-full sm:max-w-md p-0">
              <SheetHeader className="border-b border-border/60">
                <SheetTitle>Trace Drawer</SheetTitle>
                <SheetDescription>Selected assistant response metadata</SheetDescription>
              </SheetHeader>
              <ScrollArea className="h-[calc(100vh-96px)] p-3">
                {renderTraceContent()}
              </ScrollArea>
            </SheetContent>
          </Sheet>
        )}

        <div className="mt-4 space-y-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={activeThreadId ? "Ask a question..." : "Create a thread first"}
            className="min-h-20"
            disabled={!activeThreadId || isSending}
          />
          <div className="flex justify-end">
            <Button onClick={handleSend} disabled={!activeThreadId || isSending || input.trim().length === 0}>
              {isSending ? "Sending..." : "Send"}
            </Button>
          </div>
        </div>
      </section>
    </div>
  )
}
