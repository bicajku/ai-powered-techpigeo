import { useCallback, useEffect, useState } from "react"
import { motion } from "framer-motion"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Brain,
  Gear,
  Plugs,
  Database,
  MagnifyingGlass,
  Plus,
  Trash,
  Lightning,
  CheckCircle,
  XCircle,
  ArrowsClockwise,
  Eye,
  Heartbeat,
  CloudArrowUp,
  FileText,
  Globe,
  GitBranch,
  Note,
  WarningCircle,
} from "@phosphor-icons/react"
import { toast } from "sonner"

import { setNeonDbUrl, isNeonConfigured, testConnection } from "@/lib/neon-client"
import { setGeminiApiKey, isGeminiConfigured, testGeminiConnection } from "@/lib/gemini-client"
import { setCopilotToken, isCopilotConfigured, testCopilotConnection } from "@/lib/copilot-client"
import {
  listBrainDocuments,
  addBrainDocument,
  deleteBrainDocument,
  getBrainStats,
  getRecentQueries,
  type BrainDocument,
  type QueryLogEntry,
} from "@/lib/sentinel-brain"
import { ingestTextTooBrain } from "@/lib/sentinel-query-pipeline"
import {
  listConnectors,
  addConnector,
  deleteConnector,
  testConnectorHealth,
  ensureConnectorsTable,
  type PlatformConnector,
} from "@/lib/platform-connectors"

// ─── Settings Sub-Tab ────────────────────────────────────────────────
function SettingsPanel() {
  const [neonUrl, setNeonUrl] = useState("")
  const [geminiKey, setGeminiKey] = useState("")
  const [copilotToken, setCopilotTokenVal] = useState("")
  const [testing, setTesting] = useState<string | null>(null)

  const handleTestNeon = async () => {
    if (!neonUrl.trim()) { toast.error("Enter Neon DB URL first"); return }
    setTesting("neon")
    setNeonDbUrl(neonUrl.trim())
    const result = await testConnection()
    if (result.ok) {
      toast.success("Neon connection successful")
      await ensureConnectorsTable().catch(() => {})
    } else {
      toast.error(`Neon connection failed: ${result.error}`)
    }
    setTesting(null)
  }

  const handleTestGemini = async () => {
    if (!geminiKey.trim()) { toast.error("Enter Gemini API key first"); return }
    setTesting("gemini")
    setGeminiApiKey(geminiKey.trim())
    const result = await testGeminiConnection()
    toast[result.ok ? "success" : "error"](result.ok ? "Gemini connection successful" : `Gemini failed: ${result.error}`)
    setTesting(null)
  }

  const handleTestCopilot = async () => {
    if (!copilotToken.trim()) { toast.error("Enter Copilot token first"); return }
    setTesting("copilot")
    setCopilotToken(copilotToken.trim())
    const result = await testCopilotConnection()
    toast[result.ok ? "success" : "error"](result.ok ? "Copilot connection successful" : `Copilot failed: ${result.error}`)
    setTesting(null)
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Database size={20} weight="duotone" className="text-primary" />
            Neon Database (pgvector)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2">
            <Badge variant={isNeonConfigured() ? "default" : "secondary"}>
              {isNeonConfigured() ? "Connected" : "Not configured"}
            </Badge>
          </div>
          <Input
            type="password"
            placeholder="postgresql://user:pass@host/sentinel-prod?sslmode=require"
            value={neonUrl}
            onChange={(e) => setNeonUrl(e.target.value)}
          />
          <Button onClick={handleTestNeon} disabled={testing === "neon"} size="sm" className="gap-2">
            <Lightning size={16} weight="bold" />
            {testing === "neon" ? "Testing..." : "Save & Test Connection"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Lightning size={20} weight="duotone" className="text-amber-500" />
            Gemini 2.5 Flash
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2">
            <Badge variant={isGeminiConfigured() ? "default" : "secondary"}>
              {isGeminiConfigured() ? "Connected" : "Not configured"}
            </Badge>
          </div>
          <Input
            type="password"
            placeholder="AIzaSy..."
            value={geminiKey}
            onChange={(e) => setGeminiKey(e.target.value)}
          />
          <Button onClick={handleTestGemini} disabled={testing === "gemini"} size="sm" className="gap-2">
            <Lightning size={16} weight="bold" />
            {testing === "gemini" ? "Testing..." : "Save & Test Connection"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <GitBranch size={20} weight="duotone" className="text-purple-500" />
            Copilot Enterprise
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2">
            <Badge variant={isCopilotConfigured() ? "default" : "secondary"}>
              {isCopilotConfigured() ? "Connected" : "Not configured"}
            </Badge>
          </div>
          <Input
            type="password"
            placeholder="ghp_..."
            value={copilotToken}
            onChange={(e) => setCopilotTokenVal(e.target.value)}
          />
          <Button onClick={handleTestCopilot} disabled={testing === "copilot"} size="sm" className="gap-2">
            <Lightning size={16} weight="bold" />
            {testing === "copilot" ? "Testing..." : "Save & Test Connection"}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

// ─── Platform Connectors Sub-Tab ─────────────────────────────────────
function ConnectorsPanel() {
  const [connectors, setConnectors] = useState<PlatformConnector[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showAddForm, setShowAddForm] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null)
  const [testingId, setTestingId] = useState<number | null>(null)

  const [name, setName] = useState("")
  const [baseUrl, setBaseUrl] = useState("")
  const [platformType, setPlatformType] = useState<PlatformConnector["platform_type"]>("rest_api")
  const [authType, setAuthType] = useState<PlatformConnector["auth_type"]>("none")
  const [authKey, setAuthKey] = useState("")
  const [description, setDescription] = useState("")
  const [sector, setSector] = useState("")

  const loadConnectors = useCallback(async () => {
    if (!isNeonConfigured()) { setIsLoading(false); return }
    try {
      const data = await listConnectors()
      setConnectors(data)
    } catch (err) {
      console.warn("Failed to load connectors:", err)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { loadConnectors() }, [loadConnectors])

  const handleAdd = async () => {
    if (!name.trim() || !baseUrl.trim()) { toast.error("Name and URL are required"); return }
    try {
      const authConfig: Record<string, string> = {}
      if (authType === "bearer" && authKey) authConfig.token = authKey
      if (authType === "api_key" && authKey) authConfig.key = authKey

      await addConnector({
        name: name.trim(),
        platform_type: platformType,
        base_url: baseUrl.trim(),
        auth_type: authType,
        auth_config: authConfig,
        description: description.trim(),
        sector: sector.trim() || undefined,
      })
      toast.success("Connector added")
      setShowAddForm(false)
      setName(""); setBaseUrl(""); setAuthKey(""); setDescription(""); setSector("")
      await loadConnectors()
    } catch (err) {
      toast.error("Failed to add connector: " + (err instanceof Error ? err.message : "Unknown error"))
    }
  }

  const handleDelete = async () => {
    if (deleteTarget === null) return
    try {
      await deleteConnector(deleteTarget)
      toast.success("Connector deleted")
      await loadConnectors()
    } catch {
      toast.error("Failed to delete connector")
    } finally {
      setDeleteTarget(null)
    }
  }

  const handleHealthCheck = async (connector: PlatformConnector) => {
    setTestingId(connector.id)
    const result = await testConnectorHealth(connector)
    if (result.ok) {
      toast.success(`${connector.name}: healthy (${result.latencyMs}ms)`)
    } else {
      toast.error(`${connector.name}: ${result.error || "unreachable"}`)
    }
    await loadConnectors()
    setTestingId(null)
  }

  if (!isNeonConfigured()) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <WarningCircle size={40} weight="duotone" className="mx-auto text-amber-500 mb-3" />
          <p className="text-muted-foreground">Configure Neon Database in Settings first to manage platform connectors.</p>
        </CardContent>
      </Card>
    )
  }

  const healthColor: Record<string, string> = {
    healthy: "bg-green-500/20 text-green-600 border-green-500/30",
    degraded: "bg-amber-500/20 text-amber-600 border-amber-500/30",
    down: "bg-red-500/20 text-red-600 border-red-500/30",
    unknown: "bg-muted text-muted-foreground border-border",
  }

  return (
    <div className="space-y-4">
      <AlertDialog open={deleteTarget !== null} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Connector</AlertDialogTitle>
            <AlertDialogDescription>This will permanently remove this platform connector.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Plugs size={22} weight="duotone" className="text-primary" />
          Platform Connectors
        </h3>
        <Button size="sm" className="gap-2" onClick={() => setShowAddForm(!showAddForm)}>
          <Plus size={16} weight="bold" />
          Add Connector
        </Button>
      </div>

      {showAddForm && (
        <Card className="border-primary/30">
          <CardContent className="pt-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium mb-1 block">Name *</label>
                <Input placeholder="e.g., Stripe API" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Base URL *</label>
                <Input placeholder="https://api.stripe.com/v1" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Platform Type</label>
                <Select value={platformType} onValueChange={(v) => setPlatformType(v as PlatformConnector["platform_type"])}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="rest_api">REST API</SelectItem>
                    <SelectItem value="graphql">GraphQL</SelectItem>
                    <SelectItem value="webhook">Webhook</SelectItem>
                    <SelectItem value="oauth2">OAuth2</SelectItem>
                    <SelectItem value="custom">Custom</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Auth Type</label>
                <Select value={authType} onValueChange={(v) => setAuthType(v as PlatformConnector["auth_type"])}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No Auth</SelectItem>
                    <SelectItem value="api_key">API Key</SelectItem>
                    <SelectItem value="bearer">Bearer Token</SelectItem>
                    <SelectItem value="basic">Basic Auth</SelectItem>
                    <SelectItem value="oauth2">OAuth2</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {authType !== "none" && (
                <div>
                  <label className="text-sm font-medium mb-1 block">API Key / Token</label>
                  <Input type="password" placeholder="Enter key or token" value={authKey} onChange={(e) => setAuthKey(e.target.value)} />
                </div>
              )}
              <div>
                <label className="text-sm font-medium mb-1 block">Sector</label>
                <Input placeholder="e.g., fintech, ecommerce" value={sector} onChange={(e) => setSector(e.target.value)} />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Description</label>
              <Input placeholder="What does this connector do?" value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={handleAdd} size="sm" className="gap-2">
                <Plus size={16} weight="bold" />
                Add
              </Button>
              <Button onClick={() => setShowAddForm(false)} variant="ghost" size="sm">Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <ArrowsClockwise size={24} className="animate-spin text-primary" />
        </div>
      ) : connectors.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Plugs size={40} weight="duotone" className="mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">No platform connectors configured yet.</p>
            <p className="text-xs text-muted-foreground mt-1">Add external APIs, services, and webhooks to extend Sentinel AI Suite.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>URL</TableHead>
                <TableHead>Auth</TableHead>
                <TableHead>Health</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {connectors.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">
                    <div>
                      <span>{c.name}</span>
                      {c.description && <p className="text-xs text-muted-foreground mt-0.5">{c.description}</p>}
                    </div>
                  </TableCell>
                  <TableCell><Badge variant="outline" className="capitalize">{c.platform_type.replace("_", " ")}</Badge></TableCell>
                  <TableCell className="max-w-[200px] truncate text-xs text-muted-foreground">{c.base_url}</TableCell>
                  <TableCell><Badge variant="secondary" className="capitalize">{c.auth_type.replace("_", " ")}</Badge></TableCell>
                  <TableCell>
                    <Badge className={healthColor[c.health_status]}>{c.health_status}</Badge>
                  </TableCell>
                  <TableCell>
                    {c.enabled ? (
                      <CheckCircle size={18} weight="fill" className="text-green-500" />
                    ) : (
                      <XCircle size={18} weight="fill" className="text-muted-foreground" />
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost" size="sm"
                        onClick={() => handleHealthCheck(c)}
                        disabled={testingId === c.id}
                        title="Health Check"
                      >
                        <Heartbeat size={16} weight="bold" className={testingId === c.id ? "animate-pulse" : ""} />
                      </Button>
                      <Button
                        variant="ghost" size="sm"
                        onClick={() => setDeleteTarget(c.id)}
                        className="text-destructive hover:text-destructive"
                        title="Delete"
                      >
                        <Trash size={16} weight="bold" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}

// ─── Knowledge Base Sub-Tab ──────────────────────────────────────────
function KnowledgeBasePanel() {
  const [documents, setDocuments] = useState<BrainDocument[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [stats, setStats] = useState({ totalChunks: 0, totalDocuments: 0, sectors: [] as string[] })
  const [showAddForm, setShowAddForm] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null)
  const [ingesting, setIngesting] = useState(false)

  const [docTitle, setDocTitle] = useState("")
  const [docType, setDocType] = useState<BrainDocument["source_type"]>("note")
  const [docUrl, setDocUrl] = useState("")
  const [docContent, setDocContent] = useState("")
  const [docSector, setDocSector] = useState("")

  const loadData = useCallback(async () => {
    if (!isNeonConfigured()) { setIsLoading(false); return }
    try {
      const [docs, brainStats] = await Promise.all([
        listBrainDocuments(),
        getBrainStats(),
      ])
      setDocuments(docs)
      setStats(brainStats)
    } catch (err) {
      console.warn("Failed to load brain data:", err)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const handleIngest = async () => {
    if (!docTitle.trim()) { toast.error("Title is required"); return }
    if (!docContent.trim()) { toast.error("Content is required for ingestion"); return }
    if (!isGeminiConfigured()) { toast.error("Configure Gemini API key in Settings first (needed for embeddings)"); return }

    setIngesting(true)
    try {
      const doc = await addBrainDocument({
        title: docTitle.trim(),
        source_url: docUrl.trim() || undefined,
        source_type: docType,
      })

      const chunksIndexed = await ingestTextTooBrain(docContent, {
        documentId: doc.id,
        sector: docSector.trim() || undefined,
        metadata: { title: docTitle.trim(), source_url: docUrl.trim() || null },
      })

      toast.success(`Ingested "${docTitle}" — ${chunksIndexed} chunks indexed`)
      setShowAddForm(false)
      setDocTitle(""); setDocUrl(""); setDocContent(""); setDocSector("")
      await loadData()
    } catch (err) {
      toast.error("Ingestion failed: " + (err instanceof Error ? err.message : "Unknown error"))
    } finally {
      setIngesting(false)
    }
  }

  const handleDelete = async () => {
    if (deleteTarget === null) return
    try {
      await deleteBrainDocument(deleteTarget)
      toast.success("Document and chunks deleted")
      await loadData()
    } catch {
      toast.error("Failed to delete document")
    } finally {
      setDeleteTarget(null)
    }
  }

  if (!isNeonConfigured()) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <WarningCircle size={40} weight="duotone" className="mx-auto text-amber-500 mb-3" />
          <p className="text-muted-foreground">Configure Neon Database in Settings first to manage the knowledge base.</p>
        </CardContent>
      </Card>
    )
  }

  const sourceIcon: Record<string, typeof Globe> = {
    article: Globe,
    doc: FileText,
    github_repo: GitBranch,
    note: Note,
    manual: FileText,
  }

  return (
    <div className="space-y-4">
      <AlertDialog open={deleteTarget !== null} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Document</AlertDialogTitle>
            <AlertDialogDescription>This will permanently remove this document and all its indexed chunks from the knowledge base.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6 flex items-center gap-3">
            <Database size={28} weight="duotone" className="text-primary" />
            <div>
              <p className="text-2xl font-bold">{stats.totalDocuments}</p>
              <p className="text-xs text-muted-foreground">Documents</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 flex items-center gap-3">
            <Brain size={28} weight="duotone" className="text-accent-foreground" />
            <div>
              <p className="text-2xl font-bold">{stats.totalChunks}</p>
              <p className="text-xs text-muted-foreground">Knowledge Chunks</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 flex items-center gap-3">
            <Globe size={28} weight="duotone" className="text-blue-500" />
            <div>
              <p className="text-2xl font-bold">{stats.sectors.length}</p>
              <p className="text-xs text-muted-foreground">Sectors</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Brain size={22} weight="duotone" className="text-primary" />
          Knowledge Base
        </h3>
        <Button size="sm" className="gap-2" onClick={() => setShowAddForm(!showAddForm)}>
          <CloudArrowUp size={16} weight="bold" />
          Ingest Document
        </Button>
      </div>

      {/* Add Form */}
      {showAddForm && (
        <Card className="border-primary/30">
          <CardContent className="pt-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium mb-1 block">Title *</label>
                <Input placeholder="Document title" value={docTitle} onChange={(e) => setDocTitle(e.target.value)} />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Source Type</label>
                <Select value={docType} onValueChange={(v) => setDocType(v as BrainDocument["source_type"])}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="article">Article / URL</SelectItem>
                    <SelectItem value="doc">Document</SelectItem>
                    <SelectItem value="github_repo">GitHub Repo</SelectItem>
                    <SelectItem value="note">Note / Manual Entry</SelectItem>
                    <SelectItem value="manual">Manual / Policy</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Source URL (optional)</label>
                <Input placeholder="https://..." value={docUrl} onChange={(e) => setDocUrl(e.target.value)} />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Sector (optional)</label>
                <Input placeholder="e.g., fintech, healthcare" value={docSector} onChange={(e) => setDocSector(e.target.value)} />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Content to Ingest *</label>
              <Textarea
                placeholder="Paste text content, article body, documentation, README content..."
                value={docContent}
                onChange={(e) => setDocContent(e.target.value)}
                className="min-h-[200px]"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Content will be split into chunks, embedded via Gemini, and stored in the vector database for semantic search.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={handleIngest} disabled={ingesting} size="sm" className="gap-2">
                <CloudArrowUp size={16} weight="bold" />
                {ingesting ? "Ingesting..." : "Ingest & Index"}
              </Button>
              <Button onClick={() => setShowAddForm(false)} variant="ghost" size="sm">Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Documents List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <ArrowsClockwise size={24} className="animate-spin text-primary" />
        </div>
      ) : documents.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Brain size={40} weight="duotone" className="mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">No documents in the knowledge base yet.</p>
            <p className="text-xs text-muted-foreground mt-1">Ingest articles, docs, repos, and notes to power Sentinel Brain's context-aware responses.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Document</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Chunks</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {documents.map((doc) => {
                const Icon = sourceIcon[doc.source_type] || FileText
                return (
                  <TableRow key={doc.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Icon size={18} weight="duotone" className="text-primary shrink-0" />
                        <div className="min-w-0">
                          <span className="font-medium block truncate">{doc.title}</span>
                          {doc.source_url && (
                            <a href={doc.source_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline truncate block">
                              {doc.source_url}
                            </a>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell><Badge variant="outline" className="capitalize">{doc.source_type.replace("_", " ")}</Badge></TableCell>
                    <TableCell>{doc.chunks_count}</TableCell>
                    <TableCell>
                      <Badge variant={doc.status === "indexed" ? "default" : doc.status === "failed" ? "destructive" : "secondary"}>
                        {doc.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(doc.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(doc.id)} className="text-destructive hover:text-destructive">
                        <Trash size={16} weight="bold" />
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}

// ─── Query Logs Sub-Tab ──────────────────────────────────────────────
function QueryLogsPanel() {
  const [logs, setLogs] = useState<QueryLogEntry[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (!isNeonConfigured()) { setIsLoading(false); return }
    getRecentQueries(undefined, 50)
      .then(setLogs)
      .catch((err) => console.warn("Failed to load query logs:", err))
      .finally(() => setIsLoading(false))
  }, [])

  if (!isNeonConfigured()) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <WarningCircle size={40} weight="duotone" className="mx-auto text-amber-500 mb-3" />
          <p className="text-muted-foreground">Configure Neon Database in Settings to view query logs.</p>
        </CardContent>
      </Card>
    )
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <ArrowsClockwise size={24} className="animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold flex items-center gap-2">
        <MagnifyingGlass size={22} weight="duotone" className="text-primary" />
        Query Logs
        <Badge variant="secondary">{logs.length}</Badge>
      </h3>

      {logs.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <MagnifyingGlass size={40} weight="duotone" className="mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">No queries logged yet. The pipeline will log queries once configured.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Query</TableHead>
                <TableHead>Module</TableHead>
                <TableHead>Providers</TableHead>
                <TableHead>Brain Hits</TableHead>
                <TableHead>Time</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="max-w-[300px]">
                    <p className="text-sm truncate">{log.query_text}</p>
                  </TableCell>
                  <TableCell>
                    {log.module && <Badge variant="outline">{log.module}</Badge>}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {(log.providers_used || []).map((p) => (
                        <Badge key={p} variant="secondary" className="text-[10px]">{p}</Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>{log.brain_hits}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(log.created_at).toLocaleString()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}

// ─── Main Sentinel Brain Component ───────────────────────────────────
export function SentinelBrain() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="space-y-6"
    >
      <div className="flex items-center gap-3 mb-2">
        <Brain size={32} weight="duotone" className="text-primary" />
        <div>
          <h2 className="text-2xl font-bold text-foreground">Sentinel Brain</h2>
          <p className="text-sm text-muted-foreground">Enterprise AI knowledge base, platform connectors, and configuration</p>
        </div>
      </div>

      <Tabs defaultValue="settings" className="w-full">
        <div className="mb-4 overflow-x-auto pb-1">
          <TabsList className="grid min-w-[640px] grid-cols-4">
            <TabsTrigger value="settings" className="gap-2">
              <Gear size={18} weight="bold" />
              Settings
            </TabsTrigger>
            <TabsTrigger value="connectors" className="gap-2">
              <Plugs size={18} weight="bold" />
              Connectors
            </TabsTrigger>
            <TabsTrigger value="knowledge" className="gap-2">
              <Brain size={18} weight="bold" />
              Knowledge Base
            </TabsTrigger>
            <TabsTrigger value="logs" className="gap-2">
              <Eye size={18} weight="bold" />
              Query Logs
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="settings">
          <SettingsPanel />
        </TabsContent>

        <TabsContent value="connectors">
          <ConnectorsPanel />
        </TabsContent>

        <TabsContent value="knowledge">
          <KnowledgeBasePanel />
        </TabsContent>

        <TabsContent value="logs">
          <QueryLogsPanel />
        </TabsContent>
      </Tabs>
    </motion.div>
  )
}
