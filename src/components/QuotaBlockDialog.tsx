import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { LockKey, Clock, Lightning } from "@phosphor-icons/react"
import type { QuotaCheckResult, QuotaReason } from "@/lib/usage-quotas"
import { formatRemainingMs } from "@/lib/usage-quotas"

interface QuotaBlockDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  result: QuotaCheckResult | null
  /** Optional callback to switch the user to the upgrade flow. */
  onUpgrade?: () => void
  /** Override the human-readable title. */
  title?: string
}

const REASON_TITLE: Record<QuotaReason, string> = {
  rag_words_exceeded: "Chat word limit reached",
  rag_file_daily_cap: "Daily file upload limit reached",
  review_daily_cap: "Daily review limit reached",
  humanizer_word_cap: "Humanizer word limit per submission",
  humanizer_daily_cap: "Daily humanizer limit reached",
}

export function QuotaBlockDialog({
  open,
  onOpenChange,
  result,
  onUpgrade,
  title,
}: QuotaBlockDialogProps) {
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!open || !result?.resetAt) return
    const id = window.setInterval(() => setTick((t) => t + 1), 30_000)
    return () => window.clearInterval(id)
  }, [open, result?.resetAt])

  if (!result) return null

  const headerTitle = title || (result.reason ? REASON_TITLE[result.reason] : "Usage limit reached")
  const liveResetLabel = result.resetAt
    ? `Resets in ${formatRemainingMs(result.resetAt - Date.now())}`
    : null
  // Touch tick so eslint doesn't drop the timer dependency.
  void tick

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LockKey size={20} weight="duotone" className="text-primary" />
            {headerTitle}
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            {result.message || "You have reached the limit for this action on your current plan."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          {typeof result.remaining === "number" && typeof result.limit === "number" && (
            <div className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/30 p-3">
              <span className="text-muted-foreground">Remaining</span>
              <Badge variant={result.remaining > 0 ? "secondary" : "destructive"}>
                {result.remaining} / {result.limit}
              </Badge>
            </div>
          )}
          {liveResetLabel && (
            <div className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/30 p-3">
              <span className="text-muted-foreground flex items-center gap-2">
                <Clock size={16} weight="duotone" /> Reset
              </span>
              <span className="font-medium">{liveResetLabel}</span>
            </div>
          )}
          <p className="text-xs text-muted-foreground leading-relaxed">
            Upgrade to Pro or Team for unlimited chat words, uploads, reviews, and humanizations.
            You can also wait for the reset window above.
          </p>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Wait for reset
          </Button>
          {onUpgrade && (
            <Button onClick={onUpgrade} className="gap-2">
              <Lightning size={16} weight="bold" />
              Upgrade
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
