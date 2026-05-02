import { useEffect, useState, useCallback } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { toast } from "sonner"
import {
  Sparkle,
  PaperPlaneTilt,
  Users,
  ArrowsClockwise,
  Eye,
  PencilSimple,
  Stop,
  CheckCircle,
  WarningCircle,
} from "@phosphor-icons/react"
import {
  fetchBrandIdentity,
  saveBrandIdentity,
  generateEmailDraft,
  previewAudience,
  sendStudioTest,
  listCampaignsApi,
  createCampaignApi,
  sendCampaignApi,
  cancelCampaignApi,
  getCampaignApi,
  type BrandIdentity,
  type AudienceFilter,
  type EmailDraft,
  type EmailCampaign,
  type AudiencePreview,
  type CampaignRecipient,
} from "@/lib/email-studio"

const INTENT_OPTIONS = [
  { value: "marketing", label: "Marketing / promo" },
  { value: "product", label: "Product update" },
  { value: "launch", label: "Launch announcement" },
  { value: "upgrade", label: "Upgrade nudge" },
  { value: "welcome", label: "Welcome / onboarding" },
  { value: "bonus", label: "Bonus / reward" },
  { value: "re-engagement", label: "Re-engagement" },
  { value: "newsletter", label: "Newsletter" },
  { value: "announcement", label: "General announcement" },
]

const TIER_OPTIONS = ["BASIC", "PRO", "TEAM", "ENTERPRISE"]
const SOURCE_OPTIONS = [
  { value: "email", label: "Email/password" },
  { value: "google", label: "Google" },
  { value: "github", label: "GitHub" },
  { value: "microsoft", label: "Microsoft" },
]

interface Props {
  canManage?: boolean
}

export function EmailStudioPanel({ canManage = true }: Props) {
  // ── Tab state ──
  const [tab, setTab] = useState("compose")

  // ── Brand identity ──
  const [brand, setBrand] = useState<BrandIdentity | null>(null)
  const [savingBrand, setSavingBrand] = useState(false)

  // ── Composer state ──
  const [intent, setIntent] = useState("marketing")
  const [tone, setTone] = useState("founder-personal")
  const [prompt, setPrompt] = useState("")
  const [generating, setGenerating] = useState(false)
  const [draft, setDraft] = useState<EmailDraft | null>(null)
  const [subject, setSubject] = useState("")
  const [bodyHtml, setBodyHtml] = useState("")

  // ── Audience state ──
  const [audienceFilter, setAudienceFilter] = useState<AudienceFilter>({
    onlyActive: true,
    excludeDeleted: true,
    excludeOptedOut: true,
    tiers: [],
    sources: [],
  })
  const [audience, setAudience] = useState<AudiencePreview | null>(null)
  const [loadingAudience, setLoadingAudience] = useState(false)

  // ── Send state ──
  const [testTo, setTestTo] = useState("")
  const [sending, setSending] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  // ── Campaigns list ──
  const [campaigns, setCampaigns] = useState<EmailCampaign[]>([])
  const [loadingCampaigns, setLoadingCampaigns] = useState(false)
  const [detailCampaign, setDetailCampaign] = useState<EmailCampaign | null>(null)
  const [detailRecipients, setDetailRecipients] = useState<CampaignRecipient[]>([])

  // ── Initial loads ──
  useEffect(() => {
    if (!canManage) return
    fetchBrandIdentity()
      .then(setBrand)
      .catch((err) => toast.error(`Failed to load brand: ${err.message}`))
    void refreshCampaigns()
    void refreshAudience()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canManage])

  const refreshAudience = useCallback(async () => {
    setLoadingAudience(true)
    try {
      const data = await previewAudience(audienceFilter)
      setAudience(data)
    } catch (err) {
      toast.error(`Audience preview failed: ${(err as Error).message}`)
    } finally {
      setLoadingAudience(false)
    }
  }, [audienceFilter])

  // Re-run audience preview whenever filter changes (debounced).
  useEffect(() => {
    if (!canManage) return
    const t = setTimeout(() => void refreshAudience(), 400)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audienceFilter, canManage])

  const refreshCampaigns = useCallback(async () => {
    setLoadingCampaigns(true)
    try {
      const list = await listCampaignsApi(50)
      setCampaigns(list)
    } catch (err) {
      toast.error(`Failed to load campaigns: ${(err as Error).message}`)
    } finally {
      setLoadingCampaigns(false)
    }
  }, [])

  // ── Composer actions ──
  const handleGenerate = async () => {
    if (!prompt.trim()) {
      toast.error("Please describe what you want the email to say")
      return
    }
    setGenerating(true)
    try {
      const audienceSummary = describeAudience(audienceFilter, audience?.count ?? 0)
      const result = await generateEmailDraft({
        prompt,
        intent,
        tone,
        audienceSummary,
      })
      setDraft(result)
      setSubject(result.subject)
      setBodyHtml(result.bodyHtml)
      toast.success(`Draft generated via ${result.provider} (spam score ${result.spamScore}/10)`)
    } catch (err) {
      toast.error(`AI generation failed: ${(err as Error).message}`)
    } finally {
      setGenerating(false)
    }
  }

  const handleSendTest = async () => {
    if (!subject || !bodyHtml) {
      toast.error("Generate or write an email first")
      return
    }
    setSending(true)
    try {
      const result = await sendStudioTest({ subject, bodyHtml, intent, to: testTo || undefined })
      toast.success(`Test sent to ${result.sentTo}`)
    } catch (err) {
      toast.error(`Test send failed: ${(err as Error).message}`)
    } finally {
      setSending(false)
    }
  }

  const handleCreateAndSend = async (sendImmediately: boolean) => {
    if (!subject || !bodyHtml) {
      toast.error("Generate or write an email first")
      return
    }
    if (!audience || audience.count === 0) {
      toast.error("Audience is empty — adjust your filters")
      return
    }
    setSending(true)
    try {
      const c = await createCampaignApi({
        subject,
        bodyHtml,
        intent,
        audienceFilter,
        sendImmediately,
        name: subject,
      })
      toast.success(
        sendImmediately
          ? `Campaign "${c.name}" queued — ${c.totalRecipients} recipients`
          : `Campaign "${c.name}" saved as draft (${c.totalRecipients} recipients)`,
      )
      setConfirmOpen(false)
      void refreshCampaigns()
      setTab("campaigns")
    } catch (err) {
      toast.error(`Campaign creation failed: ${(err as Error).message}`)
    } finally {
      setSending(false)
    }
  }

  // ── Campaign list actions ──
  const handleSendNow = async (id: number) => {
    try {
      await sendCampaignApi(id)
      toast.success("Send started — refresh to track progress")
      void refreshCampaigns()
    } catch (err) {
      toast.error(`Send failed: ${(err as Error).message}`)
    }
  }

  const handleCancelCampaign = async (id: number) => {
    try {
      await cancelCampaignApi(id)
      toast.success("Campaign cancelled")
      void refreshCampaigns()
    } catch (err) {
      toast.error(`Cancel failed: ${(err as Error).message}`)
    }
  }

  const handleViewDetails = async (id: number) => {
    try {
      const data = await getCampaignApi(id)
      setDetailCampaign(data.campaign)
      setDetailRecipients(data.recipients)
    } catch (err) {
      toast.error(`Failed to load detail: ${(err as Error).message}`)
    }
  }

  // ── Brand save ──
  const handleSaveBrand = async () => {
    if (!brand) return
    setSavingBrand(true)
    try {
      const updated = await saveBrandIdentity(brand)
      setBrand(updated)
      toast.success("Brand identity saved")
    } catch (err) {
      toast.error(`Save failed: ${(err as Error).message}`)
    } finally {
      setSavingBrand(false)
    }
  }

  // ── Filter helpers ──
  const toggleTier = (tier: string, on: boolean) => {
    const current = audienceFilter.tiers || []
    setAudienceFilter({
      ...audienceFilter,
      tiers: on ? [...current, tier] : current.filter((t) => t !== tier),
    })
  }
  const toggleSource = (source: string, on: boolean) => {
    const current = audienceFilter.sources || []
    setAudienceFilter({
      ...audienceFilter,
      sources: on ? [...current, source] : current.filter((s) => s !== source),
    })
  }

  if (!canManage) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Email Studio</CardTitle>
          <CardDescription>Sentinel Commander role required.</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  // ─────────────────────── Render ───────────────────────
  return (
    <div className="space-y-6">
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="compose">
            <Sparkle className="w-4 h-4 mr-2" />
            Compose
          </TabsTrigger>
          <TabsTrigger value="campaigns">
            <PaperPlaneTilt className="w-4 h-4 mr-2" />
            Campaigns
          </TabsTrigger>
          <TabsTrigger value="brand">Brand identity</TabsTrigger>
        </TabsList>

        {/* ───── Compose ───── */}
        <TabsContent value="compose" className="space-y-6 mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left: composer + audience */}
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>AI composer</CardTitle>
                  <CardDescription>
                    Describe what you want to send. The AI uses your brand voice and audience context.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Intent</Label>
                      <Select value={intent} onValueChange={setIntent}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {INTENT_OPTIONS.map((o) => (
                            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Tone</Label>
                      <Select value={tone} onValueChange={setTone}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="founder-personal">Founder-personal</SelectItem>
                          <SelectItem value="professional">Professional</SelectItem>
                          <SelectItem value="enthusiastic">Enthusiastic</SelectItem>
                          <SelectItem value="concise">Concise</SelectItem>
                          <SelectItem value="warm">Warm</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div>
                    <Label>What should this email say?</Label>
                    <Textarea
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      placeholder="e.g. Announce that PRO tier now includes unlimited Gemini Pro access this week. Push a soft upgrade for BASIC users."
                      rows={5}
                    />
                  </div>

                  <Button onClick={handleGenerate} disabled={generating} className="w-full">
                    {generating ? (
                      <><ArrowsClockwise className="w-4 h-4 mr-2 animate-spin" /> Generating…</>
                    ) : (
                      <><Sparkle className="w-4 h-4 mr-2" /> Generate draft</>
                    )}
                  </Button>

                  {draft && (
                    <div className="text-xs text-muted-foreground flex items-center gap-2">
                      <Badge variant="outline">{draft.provider}</Badge>
                      <Badge variant={draft.spamScore >= 8 ? "default" : draft.spamScore >= 5 ? "secondary" : "destructive"}>
                        Spam score {draft.spamScore}/10
                      </Badge>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="w-4 h-4" /> Audience
                    {audience && (
                      <Badge variant="secondary" className="ml-2">
                        {loadingAudience ? "…" : `${audience.count} recipients`}
                      </Badge>
                    )}
                  </CardTitle>
                  <CardDescription>Filter who receives this email.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label className="mb-2 block">Tiers (empty = all)</Label>
                    <div className="flex flex-wrap gap-3">
                      {TIER_OPTIONS.map((t) => (
                        <label key={t} className="flex items-center gap-2 text-sm">
                          <Checkbox
                            checked={(audienceFilter.tiers || []).includes(t)}
                            onCheckedChange={(v) => toggleTier(t, !!v)}
                          />
                          {t}
                        </label>
                      ))}
                    </div>
                  </div>

                  <div>
                    <Label className="mb-2 block">Sign-up sources (empty = all)</Label>
                    <div className="flex flex-wrap gap-3">
                      {SOURCE_OPTIONS.map((s) => (
                        <label key={s.value} className="flex items-center gap-2 text-sm">
                          <Checkbox
                            checked={(audienceFilter.sources || []).includes(s.value)}
                            onCheckedChange={(v) => toggleSource(s.value, !!v)}
                          />
                          {s.label}
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={audienceFilter.onlyActive !== false}
                        onCheckedChange={(v) =>
                          setAudienceFilter({ ...audienceFilter, onlyActive: !!v })
                        }
                      />
                      Only active accounts
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={audienceFilter.excludeDeleted !== false}
                        onCheckedChange={(v) =>
                          setAudienceFilter({ ...audienceFilter, excludeDeleted: !!v })
                        }
                      />
                      Exclude deleted emails
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={audienceFilter.excludeOptedOut !== false}
                        onCheckedChange={(v) =>
                          setAudienceFilter({ ...audienceFilter, excludeOptedOut: !!v })
                        }
                      />
                      Exclude opted-out
                    </label>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Created after</Label>
                      <Input
                        type="date"
                        value={audienceFilter.createdAfter?.slice(0, 10) || ""}
                        onChange={(e) =>
                          setAudienceFilter({
                            ...audienceFilter,
                            createdAfter: e.target.value ? new Date(e.target.value).toISOString() : null,
                          })
                        }
                      />
                    </div>
                    <div>
                      <Label>Inactive since</Label>
                      <Input
                        type="date"
                        value={audienceFilter.inactiveSince?.slice(0, 10) || ""}
                        onChange={(e) =>
                          setAudienceFilter({
                            ...audienceFilter,
                            inactiveSince: e.target.value ? new Date(e.target.value).toISOString() : null,
                          })
                        }
                      />
                    </div>
                  </div>

                  {audience && audience.sample.length > 0 && (
                    <details className="text-xs text-muted-foreground">
                      <summary className="cursor-pointer">Sample (first {audience.sample.length})</summary>
                      <ul className="mt-2 space-y-0.5">
                        {audience.sample.map((u) => (
                          <li key={u.email}>
                            {u.email} · <span className="opacity-70">{u.tier}</span>
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Right: editor + preview + send */}
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <PencilSimple className="w-4 h-4" /> Email content
                  </CardTitle>
                  <CardDescription>
                    Variables: <code>{`{{firstName}}`}</code>, <code>{`{{fullName}}`}</code>, <code>{`{{tier}}`}</code>, <code>{`{{appUrl}}`}</code>.
                    Branded shell, signature, logo, and unsubscribe footer are added automatically.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <Label>Subject</Label>
                    <Input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} />
                  </div>
                  <div>
                    <Label>Body HTML</Label>
                    <Textarea
                      value={bodyHtml}
                      onChange={(e) => setBodyHtml(e.target.value)}
                      rows={14}
                      className="font-mono text-xs"
                    />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Eye className="w-4 h-4" /> Preview
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {bodyHtml ? (
                    <div
                      className="rounded border p-4 max-h-96 overflow-auto bg-white text-black text-sm"
                      // eslint-disable-next-line react/no-danger
                      dangerouslySetInnerHTML={{ __html: bodyHtml }}
                    />
                  ) : (
                    <p className="text-sm text-muted-foreground">No content yet. Generate or paste HTML to preview.</p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Send</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex gap-2">
                    <Input
                      type="email"
                      placeholder="Send test to (defaults to your email)"
                      value={testTo}
                      onChange={(e) => setTestTo(e.target.value)}
                    />
                    <Button variant="outline" onClick={handleSendTest} disabled={sending || !subject || !bodyHtml}>
                      Send test
                    </Button>
                  </div>
                  <Button
                    onClick={() => setConfirmOpen(true)}
                    disabled={sending || !subject || !bodyHtml || !audience || audience.count === 0}
                    className="w-full"
                  >
                    <PaperPlaneTilt className="w-4 h-4 mr-2" />
                    Send to {audience?.count ?? 0} recipients
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* ───── Campaigns list ───── */}
        <TabsContent value="campaigns" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Campaigns</CardTitle>
                <CardDescription>All sent and scheduled campaigns.</CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={() => void refreshCampaigns()} disabled={loadingCampaigns}>
                <ArrowsClockwise className={`w-4 h-4 mr-2 ${loadingCampaigns ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Subject</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Sent</TableHead>
                    <TableHead className="text-right">Failed</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {campaigns.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                        No campaigns yet.
                      </TableCell>
                    </TableRow>
                  )}
                  {campaigns.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium max-w-xs truncate">{c.subject}</TableCell>
                      <TableCell>{renderStatusBadge(c.status)}</TableCell>
                      <TableCell className="text-right">{c.sentCount}</TableCell>
                      <TableCell className="text-right">{c.failedCount}</TableCell>
                      <TableCell className="text-right">{c.totalRecipients}</TableCell>
                      <TableCell className="text-xs">{new Date(c.createdAt).toLocaleString()}</TableCell>
                      <TableCell className="text-right space-x-1">
                        <Button size="sm" variant="ghost" onClick={() => void handleViewDetails(c.id)}>
                          <Eye className="w-3 h-3" />
                        </Button>
                        {(c.status === "draft" || c.status === "scheduled") && (
                          <Button size="sm" variant="outline" onClick={() => void handleSendNow(c.id)}>
                            Send now
                          </Button>
                        )}
                        {(c.status === "draft" || c.status === "scheduled" || c.status === "sending") && (
                          <Button size="sm" variant="ghost" onClick={() => void handleCancelCampaign(c.id)}>
                            <Stop className="w-3 h-3" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ───── Brand identity ───── */}
        <TabsContent value="brand" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Brand identity</CardTitle>
              <CardDescription>Drives email visuals and AI voice.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!brand ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Brand name</Label>
                      <Input value={brand.brandName} onChange={(e) => setBrand({ ...brand, brandName: e.target.value })} />
                    </div>
                    <div>
                      <Label>Tagline</Label>
                      <Input value={brand.tagline ?? ""} onChange={(e) => setBrand({ ...brand, tagline: e.target.value })} />
                    </div>
                  </div>
                  <div>
                    <Label>AI voice description</Label>
                    <Textarea
                      rows={3}
                      value={brand.voiceDescription}
                      onChange={(e) => setBrand({ ...brand, voiceDescription: e.target.value })}
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <Label>Primary color</Label>
                      <Input value={brand.primaryColor} onChange={(e) => setBrand({ ...brand, primaryColor: e.target.value })} />
                    </div>
                    <div>
                      <Label>Accent color</Label>
                      <Input value={brand.accentColor} onChange={(e) => setBrand({ ...brand, accentColor: e.target.value })} />
                    </div>
                    <div>
                      <Label>Logo URL</Label>
                      <Input value={brand.logoUrl} onChange={(e) => setBrand({ ...brand, logoUrl: e.target.value })} />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <Label>Founder name</Label>
                      <Input value={brand.founderName} onChange={(e) => setBrand({ ...brand, founderName: e.target.value })} />
                    </div>
                    <div>
                      <Label>Founder title</Label>
                      <Input value={brand.founderTitle} onChange={(e) => setBrand({ ...brand, founderTitle: e.target.value })} />
                    </div>
                    <div>
                      <Label>Support email</Label>
                      <Input value={brand.supportEmail} onChange={(e) => setBrand({ ...brand, supportEmail: e.target.value })} />
                    </div>
                  </div>
                  <Button onClick={handleSaveBrand} disabled={savingBrand}>
                    {savingBrand ? "Saving…" : "Save brand identity"}
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ───── Confirm bulk send dialog ───── */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm send</DialogTitle>
            <DialogDescription>
              You're about to send <strong>{audience?.count ?? 0}</strong> emails. This cannot be undone.
              <br />
              Subject: <em>{subject}</em>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setConfirmOpen(false)} disabled={sending}>
              Cancel
            </Button>
            <Button variant="outline" onClick={() => void handleCreateAndSend(false)} disabled={sending}>
              Save as draft
            </Button>
            <Button onClick={() => void handleCreateAndSend(true)} disabled={sending}>
              {sending ? "Sending…" : "Send now"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ───── Campaign detail dialog ───── */}
      <Dialog open={!!detailCampaign} onOpenChange={(open) => !open && setDetailCampaign(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-auto">
          {detailCampaign && (
            <>
              <DialogHeader>
                <DialogTitle>{detailCampaign.subject}</DialogTitle>
                <DialogDescription>
                  {renderStatusBadge(detailCampaign.status)} · {detailCampaign.sentCount}/{detailCampaign.totalRecipients} sent ·{" "}
                  {detailCampaign.failedCount} failed
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Recipients (first {detailRecipients.length})</Label>
                  <div className="border rounded max-h-72 overflow-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Email</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Sent at</TableHead>
                          <TableHead>Error</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {detailRecipients.map((r) => (
                          <TableRow key={r.id}>
                            <TableCell className="text-xs">{r.email}</TableCell>
                            <TableCell>
                              {r.status === "sent" && <CheckCircle className="w-4 h-4 text-green-600" />}
                              {r.status === "failed" && <WarningCircle className="w-4 h-4 text-red-600" />}
                              {r.status === "pending" && <span className="text-xs">pending</span>}
                              {r.status === "skipped" && <span className="text-xs">skipped</span>}
                            </TableCell>
                            <TableCell className="text-xs">{r.sent_at ? new Date(r.sent_at).toLocaleString() : "—"}</TableCell>
                            <TableCell className="text-xs text-red-600">{r.error || ""}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function describeAudience(filter: AudienceFilter, count: number): string {
  const parts: string[] = []
  if (filter.tiers && filter.tiers.length) parts.push(`tiers: ${filter.tiers.join(", ")}`)
  else parts.push("all tiers")
  if (filter.sources && filter.sources.length) parts.push(`sources: ${filter.sources.join(", ")}`)
  if (filter.inactiveSince) parts.push(`inactive since ${filter.inactiveSince.slice(0, 10)}`)
  if (filter.createdAfter) parts.push(`signed up after ${filter.createdAfter.slice(0, 10)}`)
  return `${count} recipients (${parts.join("; ")})`
}

function renderStatusBadge(status: string) {
  const map: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
    draft: "outline",
    scheduled: "secondary",
    sending: "default",
    completed: "default",
    cancelled: "destructive",
  }
  return <Badge variant={map[status] || "outline"}>{status}</Badge>
}
