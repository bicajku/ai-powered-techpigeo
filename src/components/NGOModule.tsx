import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
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
} from "@phosphor-icons/react"
import { motion, AnimatePresence } from "framer-motion"
import { toast } from "sonner"
import { sentinelQuery } from "@/lib/sentinel-query-pipeline"
import { consumeProCredits, consumeReviewCredit, getFeatureEntitlements } from "@/lib/subscription"
import { isNeonConfigured } from "@/lib/neon-client"
import { isGeminiConfigured } from "@/lib/gemini-client"
import { logQuery } from "@/lib/sentinel-brain"
import { UserProfile } from "@/types"

// ─── Types ────────────────────────────────────────────────────────────────────

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
  icon: React.ComponentType<any>
  description: string
  placeholder: string
  inputLabel: string
}

// ─── Action Definitions ───────────────────────────────────────────────────────

const NGO_ACTIONS: NGOAction[] = [
  {
    id: "grant",
    label: "Grant Alignment",
    icon: Scroll,
    description: "Map your project to UN SDGs and generate a structured 5-section donor proposal.",
    placeholder:
      "Enter your project title, rough description, and target donor.\n\nExample:\nProject: Girls Digital Literacy in AJK\nDescription: Teaching coding and digital skills to 500 girls in rural AJK communities, ages 12-18.\nDonor: USAID / UN Women",
    inputLabel: "Project Title + Description + Target Donor",
  },
  {
    id: "impact",
    label: "Impact Scan",
    icon: ChartBar,
    description: "Extract measurable Outputs vs Outcomes from past project reports and generate a LogFrame.",
    placeholder:
      "Paste your past project report or summary here.\n\nExample:\nOver 6 months we trained 200 women in tailoring. 150 completed the course. 80 are now self-employed. 30% reported income increase...",
    inputLabel: "Past Project Report / Summary",
  },
  {
    id: "narrative",
    label: "Ethical Narrative",
    icon: HandHeart,
    description: "Convert raw field notes into a donor-ready story with automatic PII anonymization.",
    placeholder:
      "Paste your raw field notes or beneficiary interviews here.\n\nExample:\nMet with Amina, 32, from village of Chakothi. She told us her husband lost his job in 2023. Her daughter Zara, 14, had to leave school...",
    inputLabel: "Raw Field Notes / Interview Transcripts",
  },
  {
    id: "outreach",
    label: "Plain Language",
    icon: Translate,
    description: "Simplify complex policy or technical text to a 6th-grade reading level for communities.",
    placeholder:
      "Paste the technical policy, legal, or donor text you want simplified.\n\nExample:\nThe multi-dimensional poverty index (MPI) encompasses deprivations across health, education, and living standards dimensions using micro-data from household surveys...",
    inputLabel: "Technical / Policy Text to Simplify",
  },
  {
    id: "email",
    label: "Donor Email",
    icon: EnvelopeSimple,
    description: "Generate 3 professionally crafted email variations: Cold Outreach, Follow-up, and Thank You.",
    placeholder:
      "Describe your organization, project, and donor context.\n\nExample:\nOrg: Glimpse Foundation (education NGO in AJK, Pakistan)\nProject: Solar-powered learning centers for 1,000 students\nDonor: Bill & Melinda Gates Foundation — we met at the Education Summit in Islamabad last month",
    inputLabel: "Organization + Project + Donor Context",
  },
]

// ─── Prompt Builders ──────────────────────────────────────────────────────────

const PAKISTAN_AJK_CONTEXT = `
Regional Context (MANDATORY — inject into every response):
- Region: Pakistan & Azad Jammu and Kashmir (AJK)
- Local NGO compliance standards: SECP NPO registration, FBR exemption, PCP code of ethics
- Socio-economic context: Post-flood recovery, high youth unemployment, girls' education barriers, digital divide in rural areas
- Local terminology: Use "beneficiaries" not "users", "field officers" not "staff", "community" not "target population"
- Currency: Pakistani Rupee (PKR) alongside USD for international donors
- UN SDGs most relevant to Pakistan/AJK: SDG 1 (No Poverty), SDG 2 (Zero Hunger), SDG 3 (Health), SDG 4 (Quality Education), SDG 5 (Gender Equality), SDG 6 (Clean Water), SDG 13 (Climate Action)
`

function buildGrantPrompt(input: string): string {
  return `${PAKISTAN_AJK_CONTEXT}

You are a senior grant writer for an international NGO. Generate a structured donor proposal based on the following information.

INPUT:
${input}

INSTRUCTIONS:
1. Map to 2-4 relevant UN SDGs with specific targets
2. Write a 5-section proposal:
   - Executive Summary (150 words max)
   - Problem Statement (with localized Pakistan/AJK statistics)
   - Proposed Solution (with activities and timeline)
   - Sustainability Plan (post-funding continuation)
   - Budget Narrative (high-level cost categories in PKR and USD)
3. Suggest 3-5 measurable KPIs
4. Flag any ethical considerations

Respond ONLY with valid JSON matching this schema exactly:
{
  "header": "Proposal title",
  "mainContent": "Full 5-section proposal in Markdown with ## section headers",
  "sdgTags": ["SDG X: Name — Target X.X"],
  "ethicalWarnings": ["Any ethical flags or empty array"],
  "suggestedKPIs": ["KPI 1", "KPI 2", "KPI 3"]
}`
}

function buildImpactPrompt(input: string): string {
  return `${PAKISTAN_AJK_CONTEXT}

You are an M&E (Monitoring & Evaluation) specialist. Analyze the project report and create a structured LogFrame (Logical Framework Matrix).

INPUT:
${input}

INSTRUCTIONS:
1. Extract clear Outputs (what was produced/delivered) vs Outcomes (changes in beneficiaries' lives)
2. Create a LogFrame table in Markdown with columns: Level | Description | Indicator | Means of Verification | Assumptions
3. Levels: Goal > Purpose > Outputs > Activities
4. Identify data gaps or missing metrics
5. Suggest 3-5 impact KPIs for future measurement

Respond ONLY with valid JSON matching this schema exactly:
{
  "header": "Impact Scan Report — [Project Name]",
  "mainContent": "LogFrame analysis in Markdown including the table and commentary",
  "sdgTags": ["Relevant SDG tags based on the project"],
  "ethicalWarnings": ["Data gaps or missing attribution issues"],
  "suggestedKPIs": ["KPI 1", "KPI 2", "KPI 3"]
}`
}

function buildNarrativePrompt(input: string): string {
  return `${PAKISTAN_AJK_CONTEXT}

You are a humanitarian storytelling specialist and ethical communications officer. Convert raw field notes into a compelling, human-centered story while protecting beneficiary privacy.

INPUT:
${input}

INSTRUCTIONS:
1. Write a compelling 3-paragraph story for a donor newsletter (400-500 words)
2. MANDATORY PII SCAN: Identify and replace:
   - Full names → [BENEFICIARY_1], [BENEFICIARY_2], etc.
   - Village/location names → [COMMUNITY_LOCATION]
   - Ages combined with identifying details → generalize
   - Any other identifying information
3. List every PII replacement in ethicalWarnings
4. Preserve emotional authenticity while protecting privacy
5. End with a forward-looking statement about impact

Respond ONLY with valid JSON matching this schema exactly:
{
  "header": "Beneficiary Story — [Thematic Title]",
  "mainContent": "The full anonymized story in Markdown",
  "sdgTags": ["Relevant SDG tags"],
  "ethicalWarnings": ["PII Detected: 'Original text' replaced with [PLACEHOLDER]"],
  "suggestedKPIs": ["Story impact KPIs like 'Beneficiaries reached by publication'"]
}`
}

function buildOutreachPrompt(input: string): string {
  return `${PAKISTAN_AJK_CONTEXT}

You are a plain language specialist. Simplify the following technical, legal, or policy text so it can be understood by a community member with a 6th-grade reading level in Pakistan/AJK.

INPUT:
${input}

INSTRUCTIONS:
1. Rewrite in simple, clear Pakistani English (or include Urdu equivalents for key terms in brackets)
2. Break complex sentences into short ones (max 15 words each)
3. Replace jargon with everyday words
4. Use bullet points where possible
5. Add a "What This Means For You" section at the end
6. Preserve ALL key information — never remove important content, only simplify it

Respond ONLY with valid JSON matching this schema exactly:
{
  "header": "Plain Language Version — [Topic]",
  "mainContent": "The simplified content in Markdown",
  "sdgTags": ["SDG 4: Quality Education", "SDG 16: Peace Justice and Strong Institutions"],
  "ethicalWarnings": ["Any concerns about the original text's accuracy or completeness"],
  "suggestedKPIs": ["Readability score improvement", "Community comprehension rate"]
}`
}

function buildEmailPrompt(input: string): string {
  return `${PAKISTAN_AJK_CONTEXT}

You are a fundraising communications expert. Generate 3 professional donor email variations.

INPUT:
${input}

INSTRUCTIONS:
Generate exactly 3 email variations:
1. Cold Outreach - First contact, build awareness and interest
2. Follow-up - After initial contact or meeting, advance the relationship
3. Thank You - Acknowledge a donation or meeting, strengthen the relationship

Each email should:
- Have a compelling subject line
- Be 150-250 words
- Have a clear call to action
- Reference Pakistan/AJK regional context authentically
- Be culturally appropriate for international donors

Respond ONLY with valid JSON matching this schema exactly:
{
  "header": "Donor Email Suite — [Organization/Project Name]",
  "mainContent": "Summary of the 3 email variations and communication strategy in Markdown",
  "sdgTags": ["Relevant SDG tags for fundraising context"],
  "ethicalWarnings": [],
  "suggestedKPIs": ["Email open rate target: 25%+", "Response rate target: 5%+", "Meeting conversion rate: 2%+"],
  "emailVariants": [
    {"type": "Cold Outreach", "subject": "Subject line here", "body": "Full email body"},
    {"type": "Follow-up", "subject": "Subject line here", "body": "Full email body"},
    {"type": "Thank You", "subject": "Subject line here", "body": "Full email body"}
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

// ─── Response Parser ──────────────────────────────────────────────────────────

function parseNGOResult(raw: unknown): NGOResult {
  if (typeof raw === "object" && raw !== null) {
    return raw as NGOResult
  }
  if (typeof raw !== "string") {
    throw new Error("Unexpected response format")
  }
  let cleaned = raw.trim()
  if (cleaned.startsWith("```json")) cleaned = cleaned.replace(/^```json\s*/, "").replace(/```\s*$/, "")
  else if (cleaned.startsWith("```")) cleaned = cleaned.replace(/^```\s*/, "").replace(/```\s*$/, "")
  return JSON.parse(cleaned.trim()) as NGOResult
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface NGOModuleProps {
  userId: string
  user?: UserProfile
}

export function NGOModule({ userId, user }: NGOModuleProps) {
  const [activeAction, setActiveAction] = useState<string>("grant")
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [result, setResult] = useState<NGOResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copiedEmail, setCopiedEmail] = useState<number | null>(null)

  const entitlements = user ? getFeatureEntitlements(user) : null
  const canAccessNGOModule = user?.role === "admin" || !!entitlements?.isTeam

  const currentAction = NGO_ACTIONS.find((a) => a.id === activeAction) ?? NGO_ACTIONS[0]
  const neonReady = isNeonConfigured()
  const geminiReady = isGeminiConfigured()

  const handleActionChange = (actionId: string) => {
    setActiveAction(actionId)
    setInput("")
    setResult(null)
    setError(null)
  }

  const handleGenerate = async () => {
    if (!user) {
      toast.error("Please sign in to use the NGO module.")
      return
    }
    if (!canAccessNGOModule) {
      toast.error("NGO-SAAS is available for Team plan and Super Admin only.")
      return
    }
    if (input.trim().length < 30) {
      toast.error("Please provide more detail (at least 30 characters).")
      return
    }

    setIsLoading(true)
    setError(null)
    setResult(null)

    try {
      // Deduct 1 credit
      const creditResult = await consumeReviewCredit(user.id)
      if (!creditResult.success) {
        toast.error(creditResult.error ?? "You've used all your credits. Please upgrade your plan.")
        setIsLoading(false)
        return
      }

      const prompt = getPromptForAction(activeAction, input)

      const res = await sentinelQuery(prompt, {
        module: "ngo_module",
        userId: typeof user.id === "number" ? user.id : undefined,
        skipCache: false,
      })

      const parsed = parseNGOResult(res.response)
      setResult(parsed)

      // Log to Neon if available
      if (neonReady) {
        await logQuery({
          module: "ngo_module",
          user_id: typeof user.id === "number" ? user.id : undefined,
          query_text: `[${activeAction.toUpperCase()}] ${input.substring(0, 200)}`,
          response_json: parsed as unknown as Record<string, unknown>,
          providers_used: res.providers,
          brain_hits: res.brainHits,
        }).catch(() => {/* silent */})
      }

      toast.success(`${currentAction.label} generated successfully!`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Generation failed. Please try again."
      setError(msg)
      toast.error(msg)
    } finally {
      setIsLoading(false)
    }
  }

  const copyToClipboard = async (text: string, idx?: number) => {
    await navigator.clipboard.writeText(text)
    if (idx !== undefined) {
      setCopiedEmail(idx)
      setTimeout(() => setCopiedEmail(null), 2000)
    } else {
      toast.success("Copied to clipboard!")
    }
  }

  const clearAll = () => {
    setInput("")
    setResult(null)
    setError(null)
  }

  if (!canAccessNGOModule) {
    return (
      <Card className="border-amber-400/30 bg-amber-500/5">
        <CardHeader>
          <CardTitle className="text-base font-semibold">NGO-SAAS Access Restricted</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            This module is reserved for social sector and NGO organizations and is available only on the Team plan and Super Admin access.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
          <Users size={24} weight="bold" className="text-emerald-500" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-foreground">NGO-SAAS Module</h2>
          <p className="text-sm text-muted-foreground">
            Sentinel Social — AI-powered tools for NGOs, nonprofits & social sector organizations in Pakistan & AJK
          </p>
        </div>
        {(geminiReady || neonReady) && (
          <div className="ml-auto flex gap-2">
            {geminiReady && (
              <Badge variant="outline" className="text-xs text-emerald-600 border-emerald-400/40 bg-emerald-500/5">
                Gemini 2.5 Flash
              </Badge>
            )}
            {neonReady && (
              <Badge variant="outline" className="text-xs text-blue-600 border-blue-400/40 bg-blue-500/5">
                Neon Logging
              </Badge>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
        {/* ── Sidebar: Action Selector ── */}
        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1 mb-1">
            5 Core Actions
          </p>
          {NGO_ACTIONS.map((action) => {
            const Icon = action.icon
            const isActive = action.id === activeAction
            return (
              <button
                key={action.id}
                onClick={() => handleActionChange(action.id)}
                className={`w-full text-left rounded-xl border p-3.5 transition-all duration-200 group ${
                  isActive
                    ? "bg-emerald-500/10 border-emerald-500/30 shadow-sm"
                    : "bg-card border-border hover:border-emerald-400/30 hover:bg-emerald-500/5"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`p-1.5 rounded-lg transition-colors ${
                      isActive ? "bg-emerald-500/20" : "bg-muted group-hover:bg-emerald-500/10"
                    }`}
                  >
                    <Icon
                      size={18}
                      weight="bold"
                      className={isActive ? "text-emerald-500" : "text-muted-foreground group-hover:text-emerald-500"}
                    />
                  </div>
                  <div className="min-w-0">
                    <p className={`text-sm font-semibold ${isActive ? "text-emerald-700 dark:text-emerald-400" : "text-foreground"}`}>
                      {action.label}
                    </p>
                    <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{action.description}</p>
                  </div>
                </div>
              </button>
            )
          })}

          {/* Credits note */}
          <div className="mt-3 rounded-xl border border-amber-400/20 bg-amber-500/5 p-3">
            <p className="text-xs text-amber-700 dark:text-amber-400 font-medium flex items-center gap-1.5">
              <Sparkle size={14} weight="fill" />
              1 credit per generation
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Outputs are logged to your Neon DB with status <code className="text-xs bg-muted px-1 rounded">ngo_module</code>.
            </p>
          </div>
        </div>

        {/* ── Main Editor ── */}
        <div className="flex flex-col gap-4">
          <Card className="border-border/50 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                {(() => { const Icon = currentAction.icon; return <Icon size={18} weight="bold" className="text-emerald-500" /> })()}
                {currentAction.label}
              </CardTitle>
              <p className="text-sm text-muted-foreground">{currentAction.description}</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  {currentAction.inputLabel}
                </label>
                <Textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={currentAction.placeholder}
                  className="min-h-[180px] text-sm resize-y font-mono"
                  disabled={isLoading}
                />
                <p className="text-xs text-muted-foreground mt-1.5">
                  {input.length} chars · Minimum 30 characters required
                </p>
              </div>

              <div className="flex items-center gap-3">
                <Button
                  onClick={handleGenerate}
                  disabled={isLoading || input.trim().length < 30}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
                >
                  {isLoading ? (
                    <>
                      <ArrowClockwise size={16} weight="bold" className="animate-spin" />
                      Generating…
                    </>
                  ) : (
                    <>
                      <Sparkle size={16} weight="fill" />
                      Generate with Sentinel AI
                    </>
                  )}
                </Button>
                {(result || error) && (
                  <Button variant="ghost" size="sm" onClick={clearAll} className="text-muted-foreground">
                    <ArrowClockwise size={14} weight="bold" className="mr-1.5" />
                    Clear
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* ── Loading State ── */}
          <AnimatePresence>
            {isLoading && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="rounded-xl border border-emerald-400/20 bg-emerald-500/5 p-6 flex items-center gap-4"
              >
                <div className="w-8 h-8 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin" />
                <div>
                  <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                    Sentinel AI is generating your {currentAction.label}…
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Applying Pakistan & AJK regional context · SDG alignment · Ethical review
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Error State ── */}
          <AnimatePresence>
            {error && !isLoading && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="rounded-xl border border-red-400/30 bg-red-500/5 p-4 flex items-start gap-3"
              >
                <Warning size={20} weight="bold" className="text-red-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-red-700 dark:text-red-400">Generation Failed</p>
                  <p className="text-xs text-muted-foreground mt-1">{error}</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Result ── */}
          <AnimatePresence>
            {result && !isLoading && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="space-y-4"
              >
                {/* Result Header */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <CheckCircle size={18} weight="fill" className="text-emerald-500" />
                    <h3 className="font-semibold text-foreground">{result.header}</h3>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copyToClipboard(result.mainContent)}
                    className="shrink-0 text-xs"
                  >
                    Copy Content
                  </Button>
                </div>

                {/* SDG Tags */}
                {result.sdgTags && result.sdgTags.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {result.sdgTags.map((tag, i) => (
                      <Badge
                        key={i}
                        variant="outline"
                        className="text-xs text-emerald-700 dark:text-emerald-400 border-emerald-400/30 bg-emerald-500/5"
                      >
                        {tag}
                      </Badge>
                    ))}
                  </div>
                )}

                {/* Ethical Warnings */}
                {result.ethicalWarnings && result.ethicalWarnings.length > 0 && (
                  <Card className="border-amber-400/30 bg-amber-500/5">
                    <CardContent className="p-4">
                      <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-1.5 mb-2">
                        <Warning size={14} weight="fill" />
                        Ethical Flags & PII Notes
                      </p>
                      <ul className="space-y-1">
                        {result.ethicalWarnings.map((w, i) => (
                          <li key={i} className="text-xs text-amber-800 dark:text-amber-300 flex items-start gap-1.5">
                            <span className="text-amber-500 mt-0.5">•</span>
                            {w}
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                )}

                {/* Main Content */}
                <Card className="border-border/50">
                  <CardContent className="p-5">
                    <div
                      className="prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed"
                      style={{ whiteSpace: "pre-wrap" }}
                    >
                      {result.mainContent}
                    </div>
                  </CardContent>
                </Card>

                {/* Email Variants */}
                {result.emailVariants && result.emailVariants.length > 0 && (
                  <div className="space-y-3">
                    <p className="text-sm font-semibold text-foreground flex items-center gap-2">
                      <EnvelopeSimple size={16} weight="bold" className="text-emerald-500" />
                      3 Email Variations
                    </p>
                    {result.emailVariants.map((variant, i) => (
                      <Card key={i} className="border-border/50">
                        <CardContent className="p-4 space-y-3">
                          <div className="flex items-center justify-between">
                            <Badge
                              variant="outline"
                              className={`text-xs ${
                                i === 0
                                  ? "text-blue-600 border-blue-400/30 bg-blue-500/5"
                                  : i === 1
                                  ? "text-purple-600 border-purple-400/30 bg-purple-500/5"
                                  : "text-emerald-600 border-emerald-400/30 bg-emerald-500/5"
                              }`}
                            >
                              {variant.type}
                            </Badge>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-xs h-7"
                              onClick={() =>
                                copyToClipboard(
                                  `Subject: ${variant.subject}\n\n${variant.body}`,
                                  i
                                )
                              }
                            >
                              {copiedEmail === i ? (
                                <><CheckCircle size={12} weight="fill" className="mr-1 text-emerald-500" /> Copied!</>
                              ) : (
                                "Copy Email"
                              )}
                            </Button>
                          </div>
                          <div>
                            <p className="text-xs font-semibold text-muted-foreground mb-1">Subject Line</p>
                            <p className="text-sm font-medium text-foreground bg-muted/50 rounded-lg px-3 py-2">
                              {variant.subject}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs font-semibold text-muted-foreground mb-1">Email Body</p>
                            <div className="text-sm text-foreground bg-muted/30 rounded-lg px-3 py-2 whitespace-pre-wrap leading-relaxed">
                              {variant.body}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}

                {/* Suggested KPIs */}
                {result.suggestedKPIs && result.suggestedKPIs.length > 0 && (
                  <Card className="border-border/50 bg-card/50">
                    <CardContent className="p-4">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                        <Target size={14} weight="bold" />
                        Suggested KPIs
                      </p>
                      <ul className="space-y-1.5">
                        {result.suggestedKPIs.map((kpi, i) => (
                          <li key={i} className="text-sm text-foreground flex items-start gap-2">
                            <CheckCircle size={14} weight="fill" className="text-emerald-500 shrink-0 mt-0.5" />
                            {kpi}
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
    </div>
  )
}
