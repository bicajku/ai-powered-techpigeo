import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { FloppyDisk } from "@phosphor-icons/react"

interface SaveStrategyDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (name: string) => void
  defaultName?: string
}

export function SaveStrategyDialog({ 
  open, 
  onOpenChange, 
  onSave,
  defaultName = ""
}: SaveStrategyDialogProps) {
  const [name, setName] = useState(defaultName)

  const handleSave = () => {
    if (name.trim()) {
      onSave(name.trim())
      setName("")
      onOpenChange(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && name.trim()) {
      e.preventDefault()
      handleSave()
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FloppyDisk size={24} weight="duotone" className="text-primary" />
            Save Strategy
          </DialogTitle>
          <DialogDescription>
            Give your marketing strategy a memorable name
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="strategy-name">Strategy Name</Label>
            <Input
              id="strategy-name"
              placeholder="e.g., Summer Campaign 2024"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={handleKeyDown}
              autoFocus
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!name.trim()}>
            Save Strategy
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
