import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  Sparkle,
  LockKey,
  ClipboardText,
  Clock,
  Gift,
} from "@phosphor-icons/react"
import { motion, AnimatePresence } from "framer-motion"
import { toast } from "sonner"
import { sentinelQuery } from "@/lib/sentinel-query-pipeline"
import { isNeonConfigured } from "@/lib/neon-client"
import { isGeminiConfigured } from "@/lib/gemini-client"
import { HumanizedResult, UserProfile } from "@/types"
import { consumeProCredits, getFeatureEntitlements, addProCredits, requestUpgrade } from "@/lib/subscription"
import { UpgradePaywall } from "@/components/UpgradePaywall"
import type { SubscriptionPlan } from "@/types"

interface HumanizerProps {
  user: UserProfile | null
}

/** Detect gibberish / nonsensical input */
function isGibberish(input: string): boolean {
  const words = input.trim().split(/\s+/).filter(w => w.length > 1)
  if (words.length === 0) return true
  const vowels = /[aeiouy]/i
  const consonantStreak = /[^aeiouy\s\d]{5,}/i
  let suspectWords = 0
  for (const word of words) {
    const clean = word.replace(/[^a-zA-Z]/g, "")
    if (clean.length < 2) continue
    const hasVowel = vowels.test(clean)
    const hasLongConsonants = consonantStreak.test(clean)
    const vowelRatio = (clean.match(/[aeiouy]/gi) || []).length / clean.length
    if (!hasVowel || hasLongConsonants || vowelRatio < 0.1 || clean.length > 18) {
      suspectWords++
    }
  }
  const meaningfulWords = words.filter(w => w.replace(/[^a-zA-Z]/g, "").length >= 2)
  if (meaningfulWords.length === 0) return true
  return (suspectWords / meaningfulWords.length) > 0.5
}

export function Humanizer({ user }: HumanizerProps) {
  if (!user) {
    return (
      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <LockKey size={20} weight="duotone" />
            Authentication Required
          </CardTitle>
          <CardDescription>
            Sign in to access the AI Humanizer module.
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  const [text, setText] = useState("")
  const [isHumanizing, setIsHumanizing] = useState(false)
  const [humanizedResult, setHumanizedResult] = useState<HumanizedResult | null>(null)
  const [subscriptionPlan] = useState<SubscriptionPlan>(user.subscription?.plan || "basic")
  const [proCredits, setProCredits] = useState(user.subscription?.proCredits || 0)

  const entitlements = getFeatureEntitlements({
    ...user,
    subscription: {
      ...(user.subscription || { plan: "basic", status: "active", proCredits: 0, updatedAt: Date.now() }),
      plan: subscriptionPlan,
      proCredits,
    },
  })

  // Welcome bonus info
  const welcomeBonus = user.subscription?.welcomeBonus
  const bonusExpiresAt = entitlements.welcomeBonusExpiresAt
  const daysRemaining = bonusExpiresAt ? Math.max(0, Math.ceil((bonusExpiresAt - Date.now()) / (1000 * 60 * 60 * 24))) : 0

  // Access gate: show UpgradePaywall if no access
  if (user.role !== "admin" && !entitlements.canUseHumanizer) {
    return <UpgradePaywall user={user} feature="humanize" />
  }

  const handleUpgradeToPro = async () => {
    const result = await requestUpgrade(user.id, "pro")
    if (result.success) {
      toast.success("Pro upgrade request submitted! Admin will review and approve your upgrade.")
    } else {
      toast.error(result.error || "Failed to submit upgrade request")
    }
  }

  const handleBuyCredits = async () => {
    const result = await addProCredits(user.id, 25)
    if (result.success) {
      setProCredits(result.credits)
      toast.success(`Credits purchased. New balance: ${result.credits}`)
    } else {
      toast.error(result.error || "Failed to add credits")
    }
  }

  const humanizeText = async () => {
    if (!text.trim()) {
      toast.error("Please enter text to humanize")
      return
    }
    if (isGibberish(text)) {
      toast.error("No meaningful content detected \u2014 please provide real text to humanize.")
      return
    }

    if (!entitlements.canUseHumanizer && user.role !== "admin") {
      toast.error("No credits remaining. Please upgrade to continue using Humanizer.")
      return
    }

    setIsHumanizing(true)

    try {
      if (typeof spark === "undefined" || typeof spark.llmPrompt === "undefined" || typeof spark.llm !== "function") {
        toast.error("Spark is not available. Please refresh the page.")
        setIsHumanizing(false)
        return
      }

      const prompt = spark.llmPrompt`You are an expert text humanizer. Rewrite the following text to sound more natural, authentic, and human-written while preserving the core meaning and information.

Original text:
${text}

Instructions:
- Remove robotic or overly formal language
- Add natural variations in sentence structure
- Include appropriate contractions and colloquialisms where suitable
- Maintain the original meaning and key facts
- Make it sound conversational yet professional
- Vary sentence length and complexity

Return ONLY a valid JSON object:
{
  "humanizedText": "<the fully rewritten text>",
  "changes": [
    {
      "original": "<original phrase>",
      "humanized": "<humanized version>"
    }
  ]
}`

      let response: unknown
      const strPrompt = prompt as string
      if (isNeonConfigured() || isGeminiConfigured()) {
        try {
          const res = await sentinelQuery(strPrompt, {
            module: "humanizer",
            userId: user?.id ? parseInt(user.id) || undefined : undefined,
            sparkFallback: async () => {
              if (typeof spark !== "undefined" && typeof spark.llm === "function") {
                return (await spark.llm(strPrompt, "gpt-4o", false)) as string
              }
              throw new Error("Spark fallback unavailable")
            }
          })
          response = typeof res.response === 'string' ? res.response : JSON.stringify(res.response)
        } catch {
          if (typeof spark !== "undefined" && typeof spark.llm === "function") {
            response = await spark.llm(strPrompt, "gpt-4o", true)
          } else {
            throw new Error("AI service unavailable")
          }
        }
      } else {
        response = await spark.llm(strPrompt, "gpt-4o", true)
      }

      let parsed: Record<string, unknown>
      if (typeof response === "object" && response !== null) {
        parsed = response as Record<string, unknown>
      } else {
        let cleaned = (response as string).trim()
        if (cleaned.startsWith("```json")) {
          cleaned = cleaned.replace(/^```json\s*/, "").replace(/```\s*$/, "")
        } else if (cleaned.startsWith("```")) {
          cleaned = cleaned.replace(/^```\s*/, "").replace(/```\s*$/, "")
        }

        cleaned = cleaned.trim()
        const firstBrace = cleaned.indexOf("{")
        const lastBrace = cleaned.lastIndexOf("}")
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
          cleaned = cleaned.substring(firstBrace, lastBrace + 1)
        }

        parsed = JSON.parse(cleaned)
      }

      const humanized: HumanizedResult = {
        originalText: text,
        humanizedText: typeof parsed.humanizedText === "string" ? parsed.humanizedText : text,
        changes: Array.isArray(parsed.changes) ? parsed.changes as { original: string; humanized: string }[] : [],
        timestamp: Date.now(),
      }

      const creditUse = await consumeProCredits(user.id, 1)
      if (!creditUse.success) {
        toast.error(creditUse.error || "Failed to consume credit")
        return
      }

      setProCredits(creditUse.remainingCredits)
      setHumanizedResult(humanized)
      toast.success(`Text humanized successfully! ${creditUse.remainingCredits} credits remaining.`)
    } catch (error) {
      console.error("Humanization error:", error)
      toast.error("Failed to humanize text. Please try again.")
    } finally {
      setIsHumanizing(false)
    }
  }

  const copyToClipboard = async (content: string) => {
    try {
      await navigator.clipboard.writeText(content)
      toast.success("Copied to clipboard!")
    } catch {
      toast.error("Failed to copy to clipboard")
    }
  }

  return (
    <div className="space-y-6">
      {/* Welcome bonus banner */}
      {entitlements.isWelcomeBonusActive && (
        <Alert className="border-accent/40 bg-accent/5">
          <Gift size={18} className="text-accent" weight="duotone" />
          <AlertDescription className="flex flex-col sm:flex-row sm:items-center gap-2">
            <div className="flex-1">
              <p className="font-semibold text-sm">Welcome Bonus Active</p>
              <p className="text-xs text-muted-foreground">
                {proCredits} credits remaining \u00b7 Expires in {daysRemaining} day{daysRemaining !== 1 ? "s" : ""}. Upgrade to Pro for unlimited access.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="gap-1">
                <Clock size={12} />
                {daysRemaining}d left
              </Badge>
              <Button size="sm" variant="outline" onClick={handleUpgradeToPro}>
                Upgrade to Pro
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Credits info for paid users */}
      {entitlements.isPaidPlan && user.role !== "admin" && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            <Badge variant="secondary" className="mr-2">
              {subscriptionPlan.charAt(0).toUpperCase() + subscriptionPlan.slice(1)}
            </Badge>
            {proCredits} credits remaining
          </span>
          {proCredits <= 3 && (
            <Button size="sm" variant="outline" onClick={handleBuyCredits}>
              Buy Credits
            </Button>
          )}
        </div>
      )}

      {/* Input area */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkle size={24} weight="duotone" className="text-accent" />
            AI Text Humanizer
          </CardTitle>
          <CardDescription>
            Paste your text below and our AI will rewrite it to sound more natural, authentic, and human-written while preserving the core meaning.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            placeholder="Paste your AI-generated or formal text here..."
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="min-h-48 resize-y"
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {text.length > 0 ? `${text.length} characters` : ""}
            </span>
            <div className="flex gap-2">
              {text.trim() && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { setText(""); setHumanizedResult(null) }}
                >
                  Clear
                </Button>
              )}
              <Button
                onClick={humanizeText}
                disabled={!text.trim() || isHumanizing || (entitlements.isPaidPlan && proCredits <= 0 && !entitlements.isWelcomeBonusActive && user.role !== "admin")}
                className="gap-2"
              >
                <Sparkle size={18} weight="bold" />
                {isHumanizing ? "Humanizing..." : "Humanize Text"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Humanized result */}
      <AnimatePresence>
        {humanizedResult && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <Card className="border-accent/30">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkle size={24} weight="duotone" className="text-accent" />
                  Humanized Text
                </CardTitle>
                <CardDescription>
                  Your text has been rewritten to sound more natural and human
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-sm font-medium mb-2 block">Humanized Version</label>
                  <Textarea
                    value={humanizedResult.humanizedText}
                    readOnly
                    className="min-h-64 resize-none"
                  />
                </div>
                {humanizedResult.changes.length > 0 && (
                  <div>
                    <label className="text-sm font-medium mb-2 block">Key Changes</label>
                    <div className="space-y-2">
                      {humanizedResult.changes.slice(0, 5).map((change, index) => (
                        <div key={index} className="p-3 border border-border rounded-lg text-sm">
                          <p className="text-muted-foreground mb-1">
                            <span className="font-mono line-through">&quot;{change.original}&quot;</span>
                          </p>
                          <p className="text-foreground">
                            <span className="font-mono">&quot;{change.humanized}&quot;</span>
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <Button
                  onClick={() => copyToClipboard(humanizedResult.humanizedText)}
                  className="w-full gap-2"
                >
                  <ClipboardText size={18} weight="bold" />
                  Copy to Clipboard
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
