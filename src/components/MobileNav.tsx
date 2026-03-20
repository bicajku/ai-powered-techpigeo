import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { List, Lightbulb, Sparkle, MagnifyingGlass, ChartBar, FolderOpen, ShieldCheck } from "@phosphor-icons/react"
import { cn } from "@/lib/utils"

interface MobileNavProps {
  activeTab: string
  onTabChange: (tab: string) => void
  isAdmin: boolean
  savedCount: number
}

export function MobileNav({ activeTab, onTabChange, isAdmin, savedCount }: MobileNavProps) {
  const [open, setOpen] = useState(false)

  const handleTabSelect = (tab: string) => {
    onTabChange(tab)
    setOpen(false)
  }

  const navItems = [
    { value: "generate", label: "Strategy", icon: Lightbulb },
    { value: "ideas", label: "Ideas", icon: Sparkle },
    { value: "plagiarism", label: "Review", icon: MagnifyingGlass },
    { value: "dashboard", label: "Dashboard", icon: ChartBar },
    { value: "saved", label: `Saved (${savedCount})`, icon: FolderOpen },
  ]

  if (isAdmin) {
    navItems.push({ value: "admin", label: "Admin", icon: ShieldCheck })
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="md:hidden fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-lg bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground z-50 border-2 border-primary-foreground/20"
        >
          <List size={24} weight="bold" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-[280px] sm:w-[320px]">
        <SheetHeader className="mb-6">
          <SheetTitle className="text-xl font-bold flex items-center gap-2">
            <Sparkle size={24} weight="duotone" className="text-primary" />
            Navigation
          </SheetTitle>
        </SheetHeader>
        <nav className="flex flex-col gap-2">
          {navItems.map((item) => {
            const Icon = item.icon
            const isActive = activeTab === item.value
            return (
              <Button
                key={item.value}
                variant={isActive ? "default" : "ghost"}
                className={cn(
                  "w-full justify-start gap-3 h-12 text-base",
                  isActive && "bg-primary text-primary-foreground shadow-md"
                )}
                onClick={() => handleTabSelect(item.value)}
              >
                <Icon size={20} weight="bold" />
                {item.label}
              </Button>
            )
          })}
        </nav>
      </SheetContent>
    </Sheet>
  )
}
