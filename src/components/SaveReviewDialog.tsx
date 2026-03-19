import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { FloppyDisk, Info } from "@phosphor-icons/react"

interface SaveReviewDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (name: string, consentGiven: boolean) => void
  onDiscard: () => void
}

export function SaveReviewDialog({ open, onOpenChange, onSave, onDiscard }: SaveReviewDialogProps) {
  const [name, setName] = useState("")
  const [consentGiven, setConsentGiven] = useState(false)

  const handleSave = () => {
    if (name.trim() && consentGiven) {
      onSave(name.trim(), consentGiven)
      setName("")
      setConsentGiven(false)
    }
  }

  const handleDiscard = () => {
    onDiscard()
    setName("")
    setConsentGiven(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Save Review</DialogTitle>
          <DialogDescription>
            Give your review a name to save it for future reference.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="review-name">Review Name</Label>
            <Input
              id="review-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Marketing Copy Review - Jan 2024"
              className="w-full"
            />
            <p className="text-xs text-muted-foreground">
              Choose a descriptive name to easily identify this review later.
            </p>
          </div>

          <Alert>
            <Info size={18} weight="bold" className="text-muted-foreground" />
            <AlertDescription className="text-xs space-y-2">
              <p className="font-medium">Important Information:</p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>All data is stored locally in your browser</li>
                <li>Reviews are private and only visible to you</li>
                <li>Your content is never sent to external servers</li>
              </ul>
            </AlertDescription>
          </Alert>

          <div className="flex items-start gap-2 pt-2">
            <Checkbox
              id="consent"
              checked={consentGiven}
              onCheckedChange={(checked) => setConsentGiven(checked === true)}
            />
            <Label
              htmlFor="consent"
              className="text-sm font-normal leading-relaxed cursor-pointer"
            >
              I understand that this review will be stored locally in my browser and can be deleted at any time.
            </Label>
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={handleDiscard}
          >
            Discard Review
          </Button>
          <Button
            onClick={handleSave}
            disabled={!name.trim() || !consentGiven}
            className="gap-2"
          >
            <FloppyDisk size={18} weight="bold" />
            Save Review
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
