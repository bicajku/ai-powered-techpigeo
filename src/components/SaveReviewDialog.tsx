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
      onOpenChange(false)
    }
  }

  const handleDiscard = () => {
    onDiscard()
    setName("")
    setConsentGiven(false)
    onOpenChange(false)
  }

  const handleClose = () => {
    setName("")
    setConsentGiven(false)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FloppyDisk size={24} weight="duotone" className="text-primary" />
            Save Review Document
          </DialogTitle>
          <DialogDescription>
            Save this reviewed document to your library for future reference.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="review-name">Document Name</Label>
            <Input
              id="review-name"
              placeholder="e.g., Research Paper Review - Jan 2024"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
            />
            <p className="text-xs text-muted-foreground">
              Give this review a descriptive name for easy reference
            </p>
          </div>

          <Alert>
            <Info size={18} weight="duotone" className="text-primary" />
            <AlertDescription className="text-sm">
              <div className="space-y-2">
                <p className="font-medium">Privacy & Data Storage</p>
                <ul className="list-disc list-inside space-y-1 text-xs text-muted-foreground ml-2">
                  <li>Your document and review results will be saved to your personal library</li>
                  <li>Admin users can access saved reviews for quality assurance and support</li>
                  <li>You can export your reviews as PDF with Techpigeon branding</li>
                  <li>All data is stored securely and can be deleted at any time</li>
                </ul>
              </div>
            </AlertDescription>
          </Alert>

          <div className="flex items-start space-x-3 space-y-0 rounded-md border border-border p-4">
            <Checkbox
              id="consent"
              checked={consentGiven}
              onCheckedChange={(checked) => setConsentGiven(checked === true)}
            />
            <div className="space-y-1 leading-none">
              <Label
                htmlFor="consent"
                className="text-sm font-medium cursor-pointer"
              >
                I consent to save this review
              </Label>
              <p className="text-xs text-muted-foreground">
                I understand that this review will be stored in my library and accessible to administrators for support purposes.
              </p>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="destructive"
            onClick={handleDiscard}
          >
            Discard Review
          </Button>
          <Button
            type="button"
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
