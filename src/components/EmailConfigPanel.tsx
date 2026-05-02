import { useCallback, useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ArrowsClockwise, FloppyDisk, PaperPlaneTilt, ShieldCheck, Warning } from "@phosphor-icons/react"
import { toast } from "sonner"
import {
  fetchEmailConfig,
  saveEmailConfig,
  testEmailConnectivity,
  sendTestEmail,
  type EmailConfigView,
  type EmailConfigStatus,
  type EmailConfigSavePayload,
  type EmailProvider,
} from "@/lib/email-config"

interface EmailConfigPanelProps {
  /** When false the panel renders read-only with an explanatory banner. */
  canManage?: boolean
}

interface FormState {
  provider: EmailProvider
  fromEmail: string
  fromName: string
  replyTo: string
  adminNotificationEmail: string
  smtp: {
    host: string
    port: string
    secure: boolean
    user: string
    password: string
    /** When true, password field has been edited and will be persisted. */
    passwordTouched: boolean
  }
  imap: {
    host: string
    port: string
    secure: boolean
    user: string
    password: string
    passwordTouched: boolean
  }
  graph: {
    tenantId: string
    clientId: string
    clientSecret: string
    clientSecretTouched: boolean
    senderEmail: string
    senderName: string
  }
}

const EMPTY_FORM: FormState = {
  provider: "graph",
  fromEmail: "agentic@novussparks.com",
  fromName: "NovusSparks",
  replyTo: "",
  adminNotificationEmail: "",
  smtp: { host: "", port: "587", secure: true, user: "", password: "", passwordTouched: false },
  imap: { host: "", port: "993", secure: true, user: "", password: "", passwordTouched: false },
  graph: { tenantId: "", clientId: "", clientSecret: "", clientSecretTouched: false, senderEmail: "agentic@novussparks.com", senderName: "NovusSparks" },
}

function viewToForm(view: EmailConfigView | null): FormState {
  if (!view) return { ...EMPTY_FORM }
  return {
    provider: view.provider,
    fromEmail: view.fromEmail || "",
    fromName: view.fromName || "",
    replyTo: view.replyTo || "",
    adminNotificationEmail: view.adminNotificationEmail || "",
    smtp: {
      host: view.smtp.host || "",
      port: view.smtp.port ? String(view.smtp.port) : "",
      secure: view.smtp.secure,
      user: view.smtp.user || "",
      password: "",
      passwordTouched: false,
    },
    imap: {
      host: view.imap.host || "",
      port: view.imap.port ? String(view.imap.port) : "",
      secure: view.imap.secure,
      user: view.imap.user || "",
      password: "",
      passwordTouched: false,
    },
    graph: {
      tenantId: view.graph.tenantId || "",
      clientId: view.graph.clientId || "",
      clientSecret: "",
      clientSecretTouched: false,
      senderEmail: view.graph.senderEmail || "",
      senderName: view.graph.senderName || "",
    },
  }
}

function formToPayload(form: FormState): EmailConfigSavePayload {
  // Omit passwords/secrets when they were not touched so the server preserves stored values.
  return {
    provider: form.provider,
    fromEmail: form.fromEmail.trim() || undefined,
    fromName: form.fromName.trim() || undefined,
    replyTo: form.replyTo.trim() || undefined,
    adminNotificationEmail: form.adminNotificationEmail.trim() || undefined,
    smtp: {
      host: form.smtp.host.trim() || undefined,
      port: form.smtp.port ? Number(form.smtp.port) : null,
      secure: form.smtp.secure,
      user: form.smtp.user.trim() || undefined,
      ...(form.smtp.passwordTouched ? { password: form.smtp.password } : {}),
    },
    imap: {
      host: form.imap.host.trim() || undefined,
      port: form.imap.port ? Number(form.imap.port) : null,
      secure: form.imap.secure,
      user: form.imap.user.trim() || undefined,
      ...(form.imap.passwordTouched ? { password: form.imap.password } : {}),
    },
    graph: {
      tenantId: form.graph.tenantId.trim() || undefined,
      clientId: form.graph.clientId.trim() || undefined,
      ...(form.graph.clientSecretTouched ? { clientSecret: form.graph.clientSecret } : {}),
      senderEmail: form.graph.senderEmail.trim() || undefined,
      senderName: form.graph.senderName.trim() || undefined,
    },
  }
}

export function EmailConfigPanel({ canManage = false }: EmailConfigPanelProps) {
  const [view, setView] = useState<EmailConfigView | null>(null)
  const [status, setStatus] = useState<EmailConfigStatus | null>(null)
  const [form, setForm] = useState<FormState>({ ...EMPTY_FORM })
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState<null | "smtp" | "imap" | "graph" | "send">(null)
  const [testRecipient, setTestRecipient] = useState("")

  const reload = useCallback(async () => {
    if (!canManage) {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const { config, status: stat } = await fetchEmailConfig()
      setView(config)
      setStatus(stat)
      setForm(viewToForm(config))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load email config")
    } finally {
      setLoading(false)
    }
  }, [canManage])

  useEffect(() => {
    void reload()
  }, [reload])

  const handleSave = async () => {
    if (!canManage) return
    setSaving(true)
    try {
      const payload = formToPayload(form)
      const { config, status: stat } = await saveEmailConfig(payload)
      setView(config)
      setStatus(stat)
      setForm(viewToForm(config))
      toast.success("Email configuration saved")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed")
    } finally {
      setSaving(false)
    }
  }

  const handleConnectivityTest = async (mode: "smtp" | "imap" | "graph") => {
    setTesting(mode)
    try {
      const payload = formToPayload(form)
      const result = await testEmailConnectivity(mode, payload)
      if (result.ok) {
        toast.success(`${mode.toUpperCase()} connectivity verified`)
      } else {
        toast.error(`${mode.toUpperCase()} test failed: ${result.error || "unknown error"}`)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Test failed")
    } finally {
      setTesting(null)
    }
  }

  const handleSendTest = async () => {
    const to = testRecipient.trim()
    if (!to) {
      toast.error("Enter a recipient email first")
      return
    }
    setTesting("send")
    try {
      // Send via the saved/active config (no override) so the live signup flow is exercised.
      const result = await sendTestEmail(to)
      if (result.ok) toast.success(`Test email queued for ${result.sentTo}`)
      else toast.error("Send failed")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Send failed")
    } finally {
      setTesting(null)
    }
  }

  const statusLabel = useMemo(() => {
    if (!status) return null
    if (!status.configured) return { tone: "warn", text: "No mail provider is configured — signup emails are skipped." }
    return { tone: "ok", text: `Active provider: ${status.activeProvider}` }
  }, [status])

  if (!canManage) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Warning size={20} weight="bold" />
            Email Settings
          </CardTitle>
          <CardDescription>You need the SENTINEL_COMMANDER role to manage email configuration.</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-lg font-semibold">Email Configuration</CardTitle>
              <CardDescription>
                Configure transactional email for welcome, password reset, invites, and admin notifications.
                Choose Microsoft Graph (M365) or SMTP. IMAP credentials are stored for future inbound features.
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {statusLabel && (
                <Badge variant={statusLabel.tone === "ok" ? "default" : "destructive"} className="gap-1">
                  {statusLabel.tone === "ok" ? <ShieldCheck size={14} weight="bold" /> : <Warning size={14} weight="bold" />}
                  {statusLabel.text}
                </Badge>
              )}
              <Button size="sm" variant="outline" onClick={() => void reload()} disabled={loading}>
                <ArrowsClockwise size={16} weight="bold" className="mr-1" />
                Refresh
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Provider + general */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Active provider</Label>
              <Select
                value={form.provider}
                onValueChange={(v) => setForm({ ...form, provider: v as EmailProvider })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="graph">Microsoft 365 Graph</SelectItem>
                  <SelectItem value="smtp">SMTP</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Admin notification email</Label>
              <Input
                placeholder="ops@novussparks.com"
                value={form.adminNotificationEmail}
                onChange={(e) => setForm({ ...form, adminNotificationEmail: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>Default From address</Label>
              <Input
                placeholder="agentic@novussparks.com"
                value={form.fromEmail}
                onChange={(e) => setForm({ ...form, fromEmail: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>Default From name</Label>
              <Input
                placeholder="NovusSparks"
                value={form.fromName}
                onChange={(e) => setForm({ ...form, fromName: e.target.value })}
              />
            </div>
            <div className="space-y-1 md:col-span-2">
              <Label>Reply-To (optional)</Label>
              <Input
                placeholder="support@novussparks.com"
                value={form.replyTo}
                onChange={(e) => setForm({ ...form, replyTo: e.target.value })}
              />
            </div>
          </div>

          {/* Provider-specific tabs */}
          <Tabs defaultValue={form.provider}>
            <TabsList className="grid grid-cols-3 w-full md:w-auto md:inline-grid">
              <TabsTrigger value="graph">Microsoft Graph</TabsTrigger>
              <TabsTrigger value="smtp">SMTP (outbound)</TabsTrigger>
              <TabsTrigger value="imap">IMAP (inbound)</TabsTrigger>
            </TabsList>

            {/* Graph */}
            <TabsContent value="graph" className="space-y-3 pt-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Tenant ID</Label>
                  <Input
                    value={form.graph.tenantId}
                    onChange={(e) => setForm({ ...form, graph: { ...form.graph, tenantId: e.target.value } })}
                    placeholder="00000000-0000-0000-0000-000000000000"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Client ID</Label>
                  <Input
                    value={form.graph.clientId}
                    onChange={(e) => setForm({ ...form, graph: { ...form.graph, clientId: e.target.value } })}
                  />
                </div>
                <div className="space-y-1 md:col-span-2">
                  <Label>
                    Client Secret {view?.graph.hasClientSecret && !form.graph.clientSecretTouched && (
                      <span className="text-xs text-muted-foreground ml-1">(stored — leave blank to keep)</span>
                    )}
                  </Label>
                  <Input
                    type="password"
                    value={form.graph.clientSecret}
                    placeholder={view?.graph.hasClientSecret ? "•••••••• (unchanged)" : "Paste secret"}
                    onChange={(e) =>
                      setForm({ ...form, graph: { ...form.graph, clientSecret: e.target.value, clientSecretTouched: true } })
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label>Sender email (mailbox)</Label>
                  <Input
                    value={form.graph.senderEmail}
                    onChange={(e) => setForm({ ...form, graph: { ...form.graph, senderEmail: e.target.value } })}
                    placeholder="agentic@novussparks.com"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Sender display name</Label>
                  <Input
                    value={form.graph.senderName}
                    onChange={(e) => setForm({ ...form, graph: { ...form.graph, senderName: e.target.value } })}
                  />
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={() => void handleConnectivityTest("graph")} disabled={testing === "graph"}>
                {testing === "graph" ? "Testing…" : "Test Graph token"}
              </Button>
            </TabsContent>

            {/* SMTP */}
            <TabsContent value="smtp" className="space-y-3 pt-3">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="space-y-1 md:col-span-2">
                  <Label>SMTP host</Label>
                  <Input
                    value={form.smtp.host}
                    onChange={(e) => setForm({ ...form, smtp: { ...form.smtp, host: e.target.value } })}
                    placeholder="smtp.office365.com"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Port</Label>
                  <Input
                    type="number"
                    value={form.smtp.port}
                    onChange={(e) => setForm({ ...form, smtp: { ...form.smtp, port: e.target.value } })}
                    placeholder="587"
                  />
                </div>
                <div className="flex items-center gap-2 pt-6">
                  <Switch
                    checked={form.smtp.secure}
                    onCheckedChange={(v) => setForm({ ...form, smtp: { ...form.smtp, secure: v } })}
                  />
                  <Label>Use TLS / STARTTLS</Label>
                </div>
                <div className="space-y-1 md:col-span-2">
                  <Label>SMTP username</Label>
                  <Input
                    value={form.smtp.user}
                    onChange={(e) => setForm({ ...form, smtp: { ...form.smtp, user: e.target.value } })}
                    autoComplete="off"
                  />
                </div>
                <div className="space-y-1 md:col-span-3">
                  <Label>
                    SMTP password{" "}
                    {view?.smtp.hasPassword && !form.smtp.passwordTouched && (
                      <span className="text-xs text-muted-foreground ml-1">(stored — leave blank to keep)</span>
                    )}
                  </Label>
                  <Input
                    type="password"
                    autoComplete="new-password"
                    value={form.smtp.password}
                    placeholder={view?.smtp.hasPassword ? "•••••••• (unchanged)" : ""}
                    onChange={(e) =>
                      setForm({ ...form, smtp: { ...form.smtp, password: e.target.value, passwordTouched: true } })
                    }
                  />
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={() => void handleConnectivityTest("smtp")} disabled={testing === "smtp"}>
                {testing === "smtp" ? "Testing…" : "Test SMTP login"}
              </Button>
            </TabsContent>

            {/* IMAP */}
            <TabsContent value="imap" className="space-y-3 pt-3">
              <p className="text-xs text-muted-foreground">
                IMAP credentials are stored for future inbound features (mail processing, bounce handling). They are not
                required for outbound email.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="space-y-1 md:col-span-2">
                  <Label>IMAP host</Label>
                  <Input
                    value={form.imap.host}
                    onChange={(e) => setForm({ ...form, imap: { ...form.imap, host: e.target.value } })}
                    placeholder="outlook.office365.com"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Port</Label>
                  <Input
                    type="number"
                    value={form.imap.port}
                    onChange={(e) => setForm({ ...form, imap: { ...form.imap, port: e.target.value } })}
                    placeholder="993"
                  />
                </div>
                <div className="flex items-center gap-2 pt-6">
                  <Switch
                    checked={form.imap.secure}
                    onCheckedChange={(v) => setForm({ ...form, imap: { ...form.imap, secure: v } })}
                  />
                  <Label>Use SSL/TLS</Label>
                </div>
                <div className="space-y-1 md:col-span-2">
                  <Label>IMAP username</Label>
                  <Input
                    value={form.imap.user}
                    onChange={(e) => setForm({ ...form, imap: { ...form.imap, user: e.target.value } })}
                    autoComplete="off"
                  />
                </div>
                <div className="space-y-1 md:col-span-3">
                  <Label>
                    IMAP password{" "}
                    {view?.imap.hasPassword && !form.imap.passwordTouched && (
                      <span className="text-xs text-muted-foreground ml-1">(stored — leave blank to keep)</span>
                    )}
                  </Label>
                  <Input
                    type="password"
                    autoComplete="new-password"
                    value={form.imap.password}
                    placeholder={view?.imap.hasPassword ? "•••••••• (unchanged)" : ""}
                    onChange={(e) =>
                      setForm({ ...form, imap: { ...form.imap, password: e.target.value, passwordTouched: true } })
                    }
                  />
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={() => void handleConnectivityTest("imap")} disabled={testing === "imap"}>
                {testing === "imap" ? "Testing…" : "Test IMAP login"}
              </Button>
            </TabsContent>
          </Tabs>

          {/* Save */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t">
            <p className="text-xs text-muted-foreground">
              Saving applies the configuration immediately to all outgoing email (welcome, password reset, invites,
              admin notifications). Stored secrets are encrypted at rest with AES-256-GCM.
            </p>
            <Button onClick={() => void handleSave()} disabled={saving || loading}>
              <FloppyDisk size={16} weight="bold" className="mr-1" />
              {saving ? "Saving…" : "Save configuration"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Send test card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Send a test email</CardTitle>
          <CardDescription>Uses the currently saved/active provider — verifies the live signup pipeline.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[220px] space-y-1">
            <Label>Recipient</Label>
            <Input
              type="email"
              placeholder="you@example.com"
              value={testRecipient}
              onChange={(e) => setTestRecipient(e.target.value)}
            />
          </div>
          <Button onClick={() => void handleSendTest()} disabled={testing === "send"}>
            <PaperPlaneTilt size={16} weight="bold" className="mr-1" />
            {testing === "send" ? "Sending…" : "Send test"}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
