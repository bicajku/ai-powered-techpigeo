import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { ClockCounterClockwise, ArrowCounterClockwise } from "@phosphor-icons/react"
import { SavedStrategy } from "@/types"

interface StrategyHistoryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  strategy: SavedStrategy | null
  onRestore: (strategyId: string, versionId: string) => void
}

export function StrategyHistoryDialog({
  open,
  onOpenChange,
  strategy,
  onRestore,
}: StrategyHistoryDialogProps) {
  if (!strategy) return null

  const versions = strategy.versions || []

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClockCounterClockwise size={24} className="text-primary" />
            Version History
          </DialogTitle>
          <DialogDescription>
            View past versions of "{strategy.name}" and restore if needed.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="h-[400px] mt-4 pr-4">
          {versions.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground py-12">
              <ClockCounterClockwise size={48} weight="duotone" className="mb-4 opacity-50" />
              <p>No previous versions found.</p>
              <p className="text-sm">Regenerate and save to create versions.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Current Version */}
              <div className="p-4 rounded-lg border bg-accent/10 border-accent/20">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="default" className="bg-accent text-accent-foreground">Current Version</Badge>
                    <span className="text-sm text-muted-foreground">
                      {new Date(strategy.timestamp).toLocaleString()}
                    </span>
                  </div>
                </div>
                <p className="text-sm line-clamp-2">{strategy.description}</p>
              </div>

              {/* Past Versions */}
              {versions.sort((a, b) => b.timestamp - a.timestamp).map((version, idx) => (
                <div key={version.id} className="p-4 rounded-lg border bg-card">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">Version {versions.length - idx}</Badge>
                      <span className="text-sm text-muted-foreground">
                        {new Date(version.timestamp).toLocaleString()}
                      </span>
                    </div>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => {
                        onRestore(strategy.id, version.id)
                        onOpenChange(false)
                      }}
                      className="gap-2 shrink-0"
                    >
                      <ArrowCounterClockwise size={16} />
                      Restore This Version
                    </Button>
                  </div>
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {version.description}
                  </p>
                  {version.message && (
                    <p className="text-xs text-muted-foreground mt-2 italic">
                      "{version.message}"
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
