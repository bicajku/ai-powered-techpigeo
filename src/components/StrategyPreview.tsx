import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ChatsCircle, Palette, Target, 
import { ChatsCircle, Palette, Target, Code, Desktop, Database, DeviceMobile, ListChecks } from "@phosphor-icons/react"

interface StrategyPreviewProps {
  strategy: SavedStrategy | null
  open: boolean
  onOpenChange: (open: boolean) => void
c


  if (!strategy) return null
  const sections = [
 

    {
      content: strategy.resu

      title: "Target
    {
      title: "Marketing Copy",
      content: strategy.result.marketingCopy,
      icon: <ChatsCircle size={18} weight="duotone" className="text-primary" />
    {
     
      title: "Visual Strategy",
      content: strategy.result.visualStrategy,
      icon: <Palette size={18} weight="duotone" className="text-primary" />
    {
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
      <DialogContent classN
          <DialogTitle>{strategy.name}</Di
        <div className="space-y-4 mt-4">
    },
    {
              </div>
                {section.content}
            </div>
      
    <
}







    }





        <DialogHeader>
          <DialogTitle>{strategy.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-4">
          {sections.map((section, index) => (
            <div key={index} className="space-y-2">
              <div className="flex items-center gap-2 font-semibold text-foreground">
                {section.icon}
                <span>{section.title}</span>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {section.content}
              </p>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
