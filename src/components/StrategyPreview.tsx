import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Separator } from "@/components/ui/separator"
import { SavedStrategy } from "@/types"
import { ChatsCircle, Palette, Target, Code, Desktop, Database, DeviceMobile, ListChecks } from "@phosphor-icons/react"

interface StrategyPreviewProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  strategy: SavedStrategy | null
  onViewFull?: () => void
}

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength) + "..."
}

export function StrategyPreview({ open, onOpenChange, strategy }: StrategyPreviewProps) {
  if (!strategy) return null

  const sections = [
    {
      title: "Marketing Copy",
      content: strategy.result.marketingCopy,
      icon: <ChatsCircle size={18} weight="duotone" className="text-primary" />
    },
    {
      title: "Visual Strategy",
      content: strategy.result.visualStrategy,
      icon: <Palette size={18} weight="duotone" className="text-primary" />
    },
    {
      title: "Target Audience",
      content: strategy.result.targetAudience,
      icon: <Target size={18} weight="duotone" className="text-primary" />
    },
    {
      title: "Application Workflow",
      content: strategy.result.applicationWorkflow,
      icon: <Code size={18} weight="duotone" className="text-primary" />
    },
    {
      title: "UI Workflow",
      content: strategy.result.uiWorkflow,
      icon: <Desktop size={18} weight="duotone" className="text-primary" />
    },
    {
      title: "Database Workflow",
      content: strategy.result.databaseWorkflow,
      icon: <Database size={18} weight="duotone" className="text-primary" />
    },
    {
      title: "Mobile Workflow",
      content: strategy.result.mobileWorkflow,
      icon: <DeviceMobile size={18} weight="duotone" className="text-primary" />
    },
    {
      title: "Implementation Checklist",
      content: strategy.result.implementationChecklist,
      icon: <ListChecks size={18} weight="duotone" className="text-primary" />
    }
  ]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">
            {strategy.name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          {sections.map((section, index) => (
            <div key={index} className="space-y-2">
              <div className="flex items-center gap-2">
                {section.icon}
                <h3 className="font-semibold text-sm">{section.title}</h3>
              </div>
              <p className="text-sm text-muted-foreground">
                {truncateText(section.content || "", 200)}
              </p>
              {index < sections.length - 1 && <Separator />}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
