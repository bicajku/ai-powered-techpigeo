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

import { isNeonConfigured } from "@/lib/neon-client"
import { isGeminiConfigured } from "@/lib/gemini-client"
import {
  pushLocalToNeon,
  pullNeonToLocal,
  syncBidirectional,
  getSyncStatus,
  ensureKVTable,
} from "@/lib/kv-sync"
import {
  listBrainDocuments,
  addBrainDocument,
  deleteBrainDocument,
  getBrainStats,
  getRecentQueries,
  updateDocumentStatus,
  type BrainDocument,
  type QueryLogEntry,
} from "@/lib/sentinel-brain"
import { ingestTextTooBrain } from "@/lib/sentinel-query-pipeline"
import {
  listConnectors,
  addConnector,
  deleteConnector,
  testConnectorHealth,
  type PlatformConnector,
} from "@/lib/platform-connectors"

// ─── Settings Sub-Tab ────────────────────────────────────────────────
function SettingsPanel() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Database size={20} weight="duotone" className="text-primary" />
            Sentinel Vertox Database
            <Badge variant="outline" className="ml-1 text-[10px] text-blue-600 border-blue-400/40 bg-blue-500/5 animate-pulse">Bridge</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2">
            <Badge variant="default" className="bg-emerald-500 hover:bg-emerald-600">
              <CheckCircle size={14} className="mr-1" />
              Connected
            </Badge>
            <span className="text-xs text-muted-foreground font-medium">Configured securely via Server Environment (Heroku)</span>
          </div>
          <p className="text-sm text-muted-foreground mt-2">
            The database connection is managed directly by the backend architecture. Local configuration is no longer required or permitted for security reasons.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Lightning size={20} weight="duotone" className="text-amber-500" />
            NovusSparks AI Cloud
            <Badge variant="outline" className="ml-1 text-[10px] text-emerald-600 border-emerald-400/40 bg-emerald-500/5 animate-pulse">Bridge</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2">
            <Badge variant="default" className="bg-emerald-500 hover:bg-emerald-600">
              <CheckCircle size={14} className="mr-1" />
              Connected
            </Badge>
            <span className="text-xs text-muted-foreground font-medium">Configured securely via Server Environment (Heroku)</span>
          </div>
          <p className="text-sm text-muted-foreground mt-2">
            Gemini AI API keys are securely stored on the backend. Proxy routing ensures your keys are never exposed to the browser.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <GitBranch size={20} weight="duotone" className="text-purple-500" />
            NovusSparks AI MCP
            <Badge variant="outline" className="ml-1 text-[10px] text-blue-600 border-blue-400/40 bg-blue-500/5 animate-pulse">Bridge</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2">
            <Badge variant="default" className="bg-emerald-500 hover:bg-emerald-600">
              <CheckCircle size={14} className="mr-1" />
              Connected
            </Badge>
            <span className="text-xs text-muted-foreground font-medium">Configured securely via Server Environment (Heroku)</span>
          </div>
          <p className="text-sm text-muted-foreground mt-2">
            GitHub Copilot integration tokens are securely managed by the server environment.
          </p>
        </CardContent>
      </Card>

      {/* ─── Data Sync Panel ──────────────────────────────────────── */}
      <DataSyncPanel />
    </div>
  )
}

// ─── Data Sync Sub-Component ─────────────────────────────────────────
function DataSyncPanel() {
  const [syncing, setSyncing] = useState<string | null>(null)
  const [status, setStatus] = useState<{
    localKeyCount: number
    neonKeyCount: number
    lastSync: string | null
    neonConfigured: boolean
  } | null>(null)

  const loadStatus = useCallback(async () => {
    try {
      const s = await getSyncStatus()
      setStatus(s)
    } catch {
      // Non-critical
    }
  }, [])

  useEffect(() => { loadStatus() }, [loadStatus])

  const handlePush = async () => {
    setSyncing("push")
    try {
      await ensureKVTable()
      const result = await pushLocalToNeon()
      toast.success(`Pushed ${result.pushed} keys to Neon${result.errors ? ` (${result.errors} errors)` : ""}`)
      await loadStatus()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Push failed")
    }
    setSyncing(null)
  }

  const handlePull = async () => {
    setSyncing("pull")
    try {
      await ensureKVTable()
      const result = await pullNeonToLocal()
      toast.success(`Pulled ${result.pulled} keys from Neon${result.errors ? ` (${result.errors} errors)` : ""}`)
      await loadStatus()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Pull failed")
    }
    setSyncing(null)
  }

  const handleSync = async () => {
    setSyncing("sync")
    try {
      await ensureKVTable()
      const result = await syncBidirectional()
      toast.success(`Synced: ${result.pushedToNeon} pushed, ${result.pulledToLocal} pulled${result.errors ? ` (${result.errors} errors)` : ""}`)
      await loadStatus()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sync failed")
    }
    setSyncing(null)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <ArrowsClockwise size={20} weight="duotone" className="text-emerald-500" />
          Data Sync — LocalStorage ↔ Sentinel Vertox DB
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground leading-relaxed">
          Sync your app data between this browser's localStorage and Sentinel Vertox DB.
          Once synced, your data persists across browsers and devices.
        </p>

        {/* Status row */}
        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="p-2 rounded-lg bg-muted/50">
            <div className="text-lg font-bold">{status?.localKeyCount ?? "—"}</div>
            <div className="text-[10px] text-muted-foreground">Local Keys</div>
          </div>
          <div className="p-2 rounded-lg bg-muted/50">
            <div className="text-lg font-bold">{status?.neonKeyCount ?? "—"}</div>
            <div className="text-[10px] text-muted-foreground">Neon Keys</div>
          </div>
          <div className="p-2 rounded-lg bg-muted/50">
            <div className="text-xs font-medium truncate">{status?.lastSync ? new Date(status.lastSync).toLocaleString() : "Never"}</div>
            <div className="text-[10px] text-muted-foreground">Last Sync</div>
          </div>
        </div>

        {!status?.neonConfigured && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-600 text-xs">
            <WarningCircle size={16} weight="fill" />
            Configure Neon DB connection above before syncing.
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={handlePush}
            disabled={!!syncing || !status?.neonConfigured}
            size="sm"
            variant="outline"
            className="gap-2"
          >
            <CloudArrowUp size={16} weight="bold" />
            {syncing === "push" ? "Pushing..." : "Push Local → Neon"}
          </Button>
          <Button
            onClick={handlePull}
            disabled={!!syncing || !status?.neonConfigured}
            size="sm"
            variant="outline"
            className="gap-2"
          >
            <Database size={16} weight="bold" />
            {syncing === "pull" ? "Pulling..." : "Pull Neon → Local"}
          </Button>
          <Button
            onClick={handleSync}
            disabled={!!syncing || !status?.neonConfigured}
            size="sm"
            className="gap-2"
          >
            <ArrowsClockwise size={16} weight="bold" className={syncing === "sync" ? "animate-spin" : ""} />
            {syncing === "sync" ? "Syncing..." : "Full Bi-directional Sync"}
          </Button>
        </div>

        <p className="text-[10px] text-muted-foreground">
          <strong>Push</strong> = local wins (upload).{" "}
          <strong>Pull</strong> = cloud wins (download).{" "}
          <strong>Sync</strong> = merge both (Neon wins conflicts).{" "}
          Live writes auto-sync to Neon when configured.
        </p>
      </CardContent>
    </Card>
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
                  <p className="text-[10px] text-emerald-600 mt-1 flex items-center gap-1">
                    <CheckCircle size={12} weight="fill" />
                    Keys are encrypted securely in the Sentinel Vertox Database
                  </p>
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
            <p className="text-xs text-muted-foreground mt-1">Add external APIs, services, and webhooks to extend NovusSparks AI.</p>
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
    if (docType !== "github_repo" && !docContent.trim()) { 
      toast.error("Content is required for ingestion (unless providing a GitHub URL)")
      return 
    }
    if (docType === "github_repo" && !docUrl.trim() && !docContent.trim()) {
      toast.error("Please provide a GitHub URL or content manually")
      return
    }
    if (!isGeminiConfigured()) { toast.error("Configure Gemini API key in Settings first (needed for embeddings)"); return }

    setIngesting(true)
    let finalContent = docContent
    let docId: number | null = null

    try {
      if (docType === "github_repo" && docUrl.trim() && !finalContent.trim()) {
        toast.info("Fetching repository README...")
        const match = docUrl.match(/github\.com\/([^/]+)\/([^/]+)/)
        if (match) {
          const owner = match[1]
          const repo = match[2].replace(/\.git$/, '')
          const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/readme`)
          if (res.ok) {
            const data = await res.json()
            if (data.content) {
              finalContent = atob(data.content)
            }
          }
        }
        if (!finalContent.trim()) {
          throw new Error("Could not automatically fetch repository content. Please paste it manually.")
        }
      }

      const doc = await addBrainDocument({
        title: docTitle.trim(),
        source_url: docUrl.trim() || undefined,
        source_type: docType,
      })
      docId = doc.id

      await updateDocumentStatus(doc.id, "processing")

      const chunksIndexed = await ingestTextTooBrain(finalContent, {
        documentId: doc.id,
        sector: docSector.trim() || undefined,
        metadata: { title: docTitle.trim(), source_url: docUrl.trim() || null },
      })

      await updateDocumentStatus(doc.id, "indexed", chunksIndexed)

      toast.success(`Ingested "${docTitle}" — ${chunksIndexed} chunks indexed`)
      setShowAddForm(false)
      setDocTitle(""); setDocUrl(""); setDocContent(""); setDocSector("")
      await loadData()
    } catch (err) {
      if (docId) {
        await updateDocumentStatus(docId, "failed").catch(console.error)
        await loadData()
      }
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
                          {doc.source_url && /^https?:\/\//i.test(doc.source_url) && (
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
                <TableHead>Model</TableHead>
                <TableHead>Brain Hits</TableHead>
                <TableHead>Time</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((log) => {
                const meta = log.response_json?._meta as { model?: string } | undefined
                return (
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
                  <TableCell>
                    {meta?.model ? <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">{meta.model}</span> : <span className="text-xs text-muted-foreground">-</span>}
                  </TableCell>
                  <TableCell>{log.brain_hits}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(log.created_at).toLocaleString()}
                  </TableCell>
                </TableRow>
              )})}
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
        <Brain size={32} weight="duotone" className="text-white drop-shadow-[0_0_12px_rgba(255,255,255,0.7)]" />
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
