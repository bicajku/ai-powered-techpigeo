import { Lightbulb, Sparkle, MagnifyingGlass, ChartBar, FolderOpen, ShieldCheck, ClockCounterClockwise } from "@phosphor-icons/react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface MobileNavProps {
  activeTab: string
  onTabChange: (tab: string) => void
  isAdmin: boolean
  savedCount: number
}

export function MobileNav({ activeTab, onTabChange, isAdmin, savedCount }: MobileNavProps) {
  const handleTabSelect = (tab: string) => {
    onTabChange(tab)
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  const navItems = [
    { value: "generate", label: "Strategy", icon: Lightbulb },
    { value: "ideas", label: "Ideas", icon: Sparkle },
    { value: "plagiarism", label: "Review", icon: MagnifyingGlass },
    { value: "dashboard", label: "Stats", icon: ChartBar },
    { value: "saved", label: `Saved`, shortLabel: `${savedCount}`, icon: FolderOpen },
    { value: "timeline", label: "Timeline", icon: ClockCounterClockwise },
  ]

  if (isAdmin) {
    navItems.push({ value: "admin", label: "Admin", icon: ShieldCheck })
  }

  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-sm border-t border-border shadow-lg">
      <nav className="flex items-center justify-around p-1.5 gap-0.5 max-w-full overflow-x-auto">
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = activeTab === item.value
          const displayLabel = item.value === "saved" && item.shortLabel ? item.shortLabel : item.label
          
          return (
            <Button
              key={item.value}
              onClick={() => handleTabSelect(item.value)}
              variant={isActive ? "default" : "ghost"}
              size="sm"
              className={cn(
                "flex-1 min-w-[60px] max-w-[80px] flex-col h-auto py-1.5 px-1 gap-0.5 text-[10px] leading-tight",
                isActive && "bg-primary text-primary-foreground shadow-sm"
              )}
            >
              <Icon size={18} weight={isActive ? "fill" : "regular"} />
              <span className="truncate w-full text-center">{displayLabel}</span>
            </Button>
          )
        })}
      </nav>
    </div>
  )
}
