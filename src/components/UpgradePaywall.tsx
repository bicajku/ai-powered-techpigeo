import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  LockKey,
  Lightning,
  Crown,
  Users,
  CheckCircle,
  SpinnerGap,
  Gift,
  ArrowRight,
  PaperPlaneTilt,
  Clock,
} from "@phosphor-icons/react"
import { motion } from "framer-motion"
import { toast } from "sonner"
import { UserProfile } from "@/types"
import { PLAN_CONFIG, requestTrial, requestUpgrade, TRIAL_CREDITS, TRIAL_MAX_SUBMISSIONS } from "@/lib/subscription"

interface UpgradePaywallProps {
  user: UserProfile
  feature: "review" | "humanize"
}

export function UpgradePaywall({ user, feature }: UpgradePaywallProps) {
  const [isRequesting, setIsRequesting] = useState(false)
  const [upgradeDialog, setUpgradeDialog] = useState<"pro" | "team" | null>(null)
  const [paymentProof, setPaymentProof] = useState("")
  const [upgradeMessage, setUpgradeMessage] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [requestSubmitted, setRequestSubmitted] = useState(false)
  const [trialRequested, setTrialRequested] = useState(false)

  const trial = user.subscription?.trial
  const hasUsedTrial = !!trial?.requested
  const isTrialExhausted = !!trial?.exhausted

  const welcomeBonus = user.subscription?.welcomeBonus
  const isWelcomeBonusExpired = !!welcomeBonus?.granted && (
    Date.now() > (welcomeBonus.expiresAt || 0) || (user.subscription?.proCredits || 0) <= 0
  )

  const featureLabel = feature === "review" ? "Document Review" : "AI Humanizer"
  const featureDescription = feature === "review"
    ? "Plagiarism detection, AI content analysis, and document review require a Pro or Team subscription."
    : "The AI Humanizer module requires a Pro or Team subscription with active credits, or an active welcome bonus."

  const handleRequestTrial = async () => {
    setIsRequesting(true)
    try {
      const result = await requestTrial(user.id)
      if (result.success) {
        toast.success("Trial request submitted! The admin will review and approve your request shortly.")
        setTrialRequested(true)
      } else {
        toast.error(result.error || "Failed to submit trial request")
      }
    } finally {
      setIsRequesting(false)
    }
  }

  const handleSubmitUpgradeRequest = async () => {
    if (!upgradeDialog) return
    setIsSubmitting(true)
    try {
      const result = await requestUpgrade(user.id, upgradeDialog, paymentProof || undefined, upgradeMessage || undefined)
      if (result.success) {
        toast.success(`${PLAN_CONFIG[upgradeDialog].name} upgrade request submitted! The admin will review your payment and approve shortly.`)
        setRequestSubmitted(true)
        setUpgradeDialog(null)
        setPaymentProof("")
        setUpgradeMessage("")
      } else {
        toast.error(result.error || "Failed to submit upgrade request")
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <>
      {/* Upgrade request dialog */}
      <Dialog open={!!upgradeDialog} onOpenChange={() => { setUpgradeDialog(null); setPaymentProof(""); setUpgradeMessage("") }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request {upgradeDialog ? PLAN_CONFIG[upgradeDialog].name : ""} Plan Upgrade</DialogTitle>
          </DialogHeader>
          {upgradeDialog && (
            <div className="space-y-4">
              <div className="p-3 bg-muted/50 rounded-lg text-sm space-y-1">
                <p><span className="text-muted-foreground">Plan:</span> <span className="font-semibold">{PLAN_CONFIG[upgradeDialog].name}</span></p>
                <p><span className="text-muted-foreground">Price:</span> <span className="font-semibold">{PLAN_CONFIG[upgradeDialog].priceLabel}</span></p>
                <p><span className="text-muted-foreground">Credits:</span> <span className="font-semibold">{PLAN_CONFIG[upgradeDialog].creditsPerMonth}/month</span></p>
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Payment Proof / Transaction ID</label>
                <Input
                  value={paymentProof}
                  onChange={(e) => setPaymentProof(e.target.value)}
                  placeholder="e.g. TXN-123456, or receipt reference"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Provide your payment receipt, transaction ID, or bank transfer reference for admin verification.
                </p>
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Message (optional)</label>
                <Textarea
                  value={upgradeMessage}
                  onChange={(e) => setUpgradeMessage(e.target.value)}
                  placeholder="Any additional notes for the admin..."
                  rows={2}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setUpgradeDialog(null)}>Cancel</Button>
            <Button onClick={handleSubmitUpgradeRequest} disabled={isSubmitting} className="gap-2">
              {isSubmitting ? <SpinnerGap size={16} className="animate-spin" /> : <PaperPlaneTilt size={16} weight="bold" />}
              Submit Request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="space-y-6"
      >
        <Card className="border-primary/30 bg-gradient-to-br from-card to-primary/5">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
              <LockKey size={28} weight="duotone" className="text-primary" />
            </div>
            <CardTitle className="text-xl">{featureLabel} — Premium Feature</CardTitle>
            <CardDescription className="text-sm max-w-lg mx-auto">
              {featureDescription}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Request submitted confirmation */}
            {(requestSubmitted || trialRequested) && (
              <Alert className="border-green-500/40 bg-green-500/5">
                <Clock size={18} className="text-green-600" weight="duotone" />
                <AlertDescription className="text-sm">
                  <p className="font-semibold text-green-700">Request submitted successfully!</p>
                  <p className="text-muted-foreground text-xs mt-1">
                    Your {trialRequested ? "trial" : "upgrade"} request is pending admin approval. You'll be notified once it's processed.
                  </p>
                </AlertDescription>
              </Alert>
            )}

            {/* Trial section - only for review, not for humanize */}
            {feature === "review" && !hasUsedTrial && !trialRequested && (
              <Alert className="border-accent/40 bg-accent/5">
                <Gift size={18} className="text-accent" weight="duotone" />
                <AlertDescription className="flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex-1">
                    <p className="font-semibold text-sm">Try it free first!</p>
                    <p className="text-xs text-muted-foreground">
                      Request {TRIAL_CREDITS} credits for {TRIAL_MAX_SUBMISSIONS} document reviews. No payment required.
                      Admin will review and approve your trial request.
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleRequestTrial}
                    disabled={isRequesting}
                    className="gap-2 shrink-0 border-accent/50 hover:bg-accent/10"
                  >
                    {isRequesting ? (
                      <SpinnerGap size={16} className="animate-spin" />
                    ) : (
                      <Gift size={16} weight="bold" />
                    )}
                    Request Trial
                  </Button>
                </AlertDescription>
              </Alert>
            )}

            {isTrialExhausted && (
              <Alert className="border-destructive/40 bg-destructive/5">
                <AlertDescription className="text-sm">
                  Your free trial has been used. Upgrade to Pro or Team to continue using {featureLabel}.
                </AlertDescription>
              </Alert>
            )}

            {isWelcomeBonusExpired && (
              <Alert className="border-destructive/40 bg-destructive/5">
                <AlertDescription className="text-sm">
                  Your welcome bonus has expired. Upgrade to Pro or Team to continue using {featureLabel}.
                </AlertDescription>
              </Alert>
            )}

            {/* Plan comparison */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Pro Plan */}
              <Card className="border-primary/30 relative overflow-hidden">
                <div className="absolute top-0 left-0 right-0 h-1 bg-primary" />
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    <Lightning size={20} weight="bold" className="text-primary" />
                    <CardTitle className="text-base">{PLAN_CONFIG.pro.name}</CardTitle>
                    <Badge variant="secondary" className="ml-auto text-xs">Popular</Badge>
                  </div>
                  <div className="flex items-baseline gap-1 mt-1">
                    <span className="text-2xl font-bold">${PLAN_CONFIG.pro.price}</span>
                    <span className="text-sm text-muted-foreground">/month</span>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <ul className="space-y-2">
                    {PLAN_CONFIG.pro.features.map((f, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs">
                        <CheckCircle size={14} weight="fill" className="text-primary mt-0.5 shrink-0" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                  <Button
                    className="w-full gap-2"
                    onClick={() => setUpgradeDialog("pro")}
                    disabled={requestSubmitted}
                  >
                    <ArrowRight size={16} weight="bold" />
                    {requestSubmitted ? "Request Pending" : "Upgrade to Pro"}
                  </Button>
                </CardContent>
              </Card>

              {/* Team Plan */}
              <Card className="border-accent/30 relative overflow-hidden">
                <div className="absolute top-0 left-0 right-0 h-1 bg-accent" />
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    <Users size={20} weight="bold" className="text-accent" />
                    <CardTitle className="text-base">{PLAN_CONFIG.team.name}</CardTitle>
                    <Badge className="ml-auto text-xs bg-accent/10 text-accent border-accent/30">Best Value</Badge>
                  </div>
                  <div className="flex items-baseline gap-1 mt-1">
                    <span className="text-2xl font-bold">${PLAN_CONFIG.team.price}</span>
                    <span className="text-sm text-muted-foreground">/month</span>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <ul className="space-y-2">
                    {PLAN_CONFIG.team.features.map((f, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs">
                        <CheckCircle size={14} weight="fill" className="text-accent mt-0.5 shrink-0" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                  <Button
                    className="w-full gap-2"
                    variant="outline"
                    onClick={() => setUpgradeDialog("team")}
                    disabled={requestSubmitted}
                  >
                    <Crown size={16} weight="bold" />
                    {requestSubmitted ? "Request Pending" : "Upgrade to Team"}
                  </Button>
                </CardContent>
              </Card>
            </div>

            <p className="text-xs text-center text-muted-foreground">
              After submitting your upgrade request with payment proof, an admin will verify and activate your plan.
            </p>
          </CardContent>
        </Card>
      </motion.div>
    </>
  )
}
