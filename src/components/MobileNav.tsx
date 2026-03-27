import { useState } from "react"
import { Lightbulb, Sparkle, MagnifyingGlass, ChartBar, ShieldCheck, LockSimple, Brain, Target, List, X } from "@phosphor-icons/react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface MobileNavProps {
  activeTab: string
  onTabChange: (tab: string) => void
  isAdmin: boolean
  savedCount: number
  canAccessReview?: boolean
  canUseHumanizer?: boolean
  canAccessNGOSaaS?: boolean
  canAccessRagChat?: boolean
}

export function MobileNav({
  activeTab,
  onTabChange,
  isAdmin,
  savedCount,
  canAccessReview = true,
  canUseHumanizer = true,
  canAccessNGOSaaS = false,
  canAccessRagChat = false,
}: MobileNavProps) {
  const [isOpen, setIsOpen] = useState(false)

  const handleTabSelect = (tab: string) => {
    onTabChange(tab)
    setIsOpen(false)
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  const navItems = [
    { value: "generate", label: "Strategy", icon: Lightbulb },
    ...(canAccessRagChat ? [{ value: "rag-chat", label: "AI Chat", icon: Brain }] : []),
    { value: "ideas", label: "Ideas", icon: Sparkle },
    { value: "plagiarism", label: "Review", icon: canAccessReview ? MagnifyingGlass : LockSimple },
    { value: "humanizer", label: "Humanizer", icon: canUseHumanizer ? Sparkle : LockSimple },
    { value: "dashboard", label: "Stats", icon: ChartBar },
  ]

  if (isAdmin) {
    navItems.push({ value: "sentinel-brain", label: "Sentinel Brain", icon: Brain })
    navItems.push({ value: "admin", label: "Admin", icon: ShieldCheck })
    navItems.push({ value: "enterprise", label: "Enterprise", icon: ShieldCheck })
  }

  if (canAccessNGOSaaS) {
    navItems.push({ value: "ngo-saas", label: "NGO-SAAS", icon: Target })
  }

  return (
    <div className="md:hidden fixed bottom-3 right-3 z-50">
      {isOpen && (
        <button
          type="button"
          aria-label="Close mobile navigation"
          onClick={() => setIsOpen(false)}
          className="fixed inset-0 bg-background/35 backdrop-blur-[1px]"
        />
      )}

      {isOpen && (
        <nav className="absolute bottom-14 right-0 w-[min(420px,calc(100vw-1rem))] grid grid-cols-4 sm:grid-cols-5 gap-1 p-2 bg-card/95 backdrop-blur-sm border border-border shadow-lg rounded-2xl">
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = activeTab === item.value
          const displayLabel = item.label
          
          return (
            <Button
              key={item.value}
              onClick={() => handleTabSelect(item.value)}
              variant={isActive ? "default" : "ghost"}
              size="sm"
              className={cn(
                "w-full flex-col h-auto min-h-[56px] py-1.5 px-1.5 gap-0.5 text-[10px] leading-tight rounded-lg",
                isActive && "bg-primary text-primary-foreground shadow-sm"
              )}
            >
              <Icon size={16} weight={isActive ? "fill" : "regular"} />
              <span className="w-full text-center break-words leading-tight max-w-[68px]">{displayLabel}</span>
            </Button>
          )
        })}
        </nav>
      )}

      <Button
        type="button"
        aria-label={isOpen ? "Close menu" : "Open menu"}
        onClick={() => setIsOpen((v) => !v)}
        className="h-12 px-4 rounded-full shadow-lg border border-border/70"
      >
        {isOpen ? <X size={18} weight="bold" className="mr-2" /> : <List size={18} weight="bold" className="mr-2" />}
        Menu
      </Button>
    </div>
  )
}
