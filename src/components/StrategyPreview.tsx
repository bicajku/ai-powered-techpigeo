import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { SavedStrategy } from "@/types"
import { SavedStrategy } from "@/types"
  open: boolean

}
  open: boolean
  return text.slice(0, maxLength) + "..

  if (!strategy) return n
}

      icon: <ChatsCircle size={18} weight="duotone" className="t
    {
      content: strategy.result.visualStra
 

      icon: <Target size={18} weight="duotone" className="text-primary" />
    {

    },
     
      icon: <Desktop size={18}
    {
      content: strategy.result.databaseWorkflow,
    },
    {
      icon: <DeviceMobile size=
    {
      content: strategy.result.implementationChecklist,
    }
    {
    <Dialog open={open} onOpenC
        <DialogHeader>
            {strategy.name}
    },
    {
            <div key={index} classNa
                {section.icon}
              </div>
    },
    <
      title: "UI Workflow",
      content: strategy.result.uiWorkflow,
      icon: <Desktop size={18} weight="duotone" className="text-primary" />


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

  ]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">























