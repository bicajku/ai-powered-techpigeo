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

interface SaveIdeaDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (name: string) => void
}

export function SaveIdeaDialog({ open, onOpenChange, onSave }: SaveIdeaDialogProps) {
  const [name, setName] = useState("")

  const handleSave = () => {
    if (name.trim()) {
      onSave(name.trim())
      setName("")
      onOpenChange(false)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && name.trim()) {
      handleSave()
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Save Idea</DialogTitle>
          <DialogDescription>
            Give your refined idea a memorable name to save it for later
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="idea-name">Idea Name</Label>
            <Input
              id="idea-name"
              placeholder="e.g., Farm-to-Consumer App"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={handleKeyPress}
              autoFocus
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!name.trim()}>
            Save Idea
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
