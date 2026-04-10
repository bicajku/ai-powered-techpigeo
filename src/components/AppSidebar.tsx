import { useMemo, useState } from "react"
import {
  Brain,
  Buildings,
  CaretDoubleLeft,
  CaretDoubleRight,
  ChartBar,
  EnvelopeSimple,
  GithubLogo,
  Globe,
  List,
  ShieldCheck,
  SignOut,
  UserCircle,
} from "@phosphor-icons/react"
import type { Icon } from "@phosphor-icons/react"
import type { UserProfile } from "@/types"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { cn } from "@/lib/utils"
import novussparksLogo from "@/assets/images/novussparks-icon.svg"

type SidebarNavItem = {
  id: string
  label: string
  icon: Icon
  onClick: () => void
  active?: boolean
}

interface AppSidebarProps {
  user: UserProfile
  activeTab: string
  collapsed: boolean
  isSentinelCommander?: boolean
  onToggleCollapsed: () => void
  onTabChange: (tab: string) => void
  onOpenProfile: () => void
  onSignOut: () => void
}

function SidebarLink({ item, collapsed }: { item: SidebarNavItem; collapsed: boolean }) {
  const Icon = item.icon
  return (
    <Button
      variant={item.active ? "default" : "ghost"}
      onClick={item.onClick}
      className={cn(
        "w-full justify-start gap-3 rounded-xl h-10",
        collapsed && "justify-center px-2",
        item.active && "shadow-sm"
      )}
    >
      <Icon size={18} weight={item.active ? "fill" : "regular"} />
      {!collapsed && <span className="truncate">{item.label}</span>}
    </Button>
  )
}

export function AppSidebar({
  user,
  activeTab,
  collapsed,
  isSentinelCommander = false,
  onToggleCollapsed,
  onTabChange,
  onOpenProfile,
  onSignOut,
}: AppSidebarProps) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const isAdmin = user.role === "admin"

  const roleNavItems = useMemo<SidebarNavItem[]>(() => {
    if (isAdmin) {
      return [
        ...(isSentinelCommander ? [{
          id: "global-dashboard",
          label: "Global Dashboard",
          icon: ChartBar,
          onClick: () => onTabChange("global-dashboard"),
          active: activeTab === "global-dashboard",
        }] : []),
        {
          id: "admin",
          label: "Admin Dashboard",
          icon: ShieldCheck,
          onClick: () => onTabChange("admin"),
          active: activeTab === "admin",
        },
        {
          id: "enterprise",
          label: "Enterprise",
          icon: Buildings,
          onClick: () => onTabChange("enterprise"),
          active: activeTab === "enterprise",
        },
        {
          id: "sentinel-brain",
          label: "Sentinel Brain",
          icon: Brain,
          onClick: () => onTabChange("sentinel-brain"),
          active: activeTab === "sentinel-brain",
        },
      ]
    }

    return [
      {
        id: "dashboard",
        label: "User Dashboard",
        icon: ChartBar,
        onClick: () => onTabChange("dashboard"),
        active: activeTab === "dashboard",
      },
    ]
  }, [activeTab, isAdmin, isSentinelCommander, onTabChange])

  const accountItems: SidebarNavItem[] = [
    {
      id: "profile",
      label: "User Profile",
      icon: UserCircle,
      onClick: onOpenProfile,
    },
    {
      id: "signout",
      label: "Sign Out",
      icon: SignOut,
      onClick: onSignOut,
    },
  ]

  const socialItems = [
    { href: "https://novussparks.com", label: "Website", icon: Globe },
    { href: "mailto:info@novussparks.com", label: "Email", icon: EnvelopeSimple },
    { href: "https://github.com/bicajku", label: "GitHub", icon: GithubLogo },
  ]

  return (
    <>
      <aside
        className={cn(
          "hidden lg:flex fixed inset-y-0 left-0 z-40 border-r border-border/60 bg-card/75 backdrop-blur-xl px-3 py-4",
          collapsed ? "w-20" : "w-72"
        )}
      >
        <div className="flex h-full w-full flex-col">
          <div className="mb-6 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => onTabChange(isAdmin ? "admin" : "dashboard")}
              className={cn("flex items-center gap-3 min-w-0", collapsed && "justify-center w-full")}
            >
              <img src={novussparksLogo} alt="NovusSparks" className="h-9 w-9 rounded-md" />
              {!collapsed && (
                <div className="min-w-0 text-left">
                  <p className="text-sm font-semibold text-foreground truncate">NovusSparks</p>
                  <p className="text-xs text-muted-foreground truncate">Control Panel</p>
                </div>
              )}
            </button>
            {!collapsed && (
              <Button variant="ghost" size="icon" onClick={onToggleCollapsed} className="h-8 w-8">
                <CaretDoubleLeft size={16} weight="bold" />
              </Button>
            )}
            {collapsed && (
              <Button variant="ghost" size="icon" onClick={onToggleCollapsed} className="h-8 w-8">
                <CaretDoubleRight size={16} weight="bold" />
              </Button>
            )}
          </div>

          <div className="space-y-1.5">
            {roleNavItems.map((item) => (
              <SidebarLink key={item.id} item={item} collapsed={collapsed} />
            ))}
          </div>

          <div className="mt-6 border-t border-border/60 pt-4 space-y-1.5">
            {accountItems.map((item) => (
              <SidebarLink key={item.id} item={item} collapsed={collapsed} />
            ))}
          </div>

          <div className="mt-auto border-t border-border/60 pt-4">
            <div className={cn("flex gap-2", collapsed ? "flex-col" : "flex-row")}>
              {socialItems.map((item) => {
                const Icon = item.icon
                return (
                  <a
                    key={item.label}
                    href={item.href}
                    target={item.href.startsWith("http") ? "_blank" : undefined}
                    rel={item.href.startsWith("http") ? "noopener noreferrer" : undefined}
                    className={cn(
                      "h-9 rounded-lg border border-border/60 bg-background/40 hover:bg-accent/60 transition-colors inline-flex items-center",
                      collapsed ? "justify-center" : "px-3 gap-2"
                    )}
                  >
                    <Icon size={16} weight="regular" />
                    {!collapsed && <span className="text-xs text-muted-foreground">{item.label}</span>}
                  </a>
                )
              })}
            </div>
          </div>
        </div>
      </aside>

      <div className="lg:hidden fixed top-4 left-4 z-50">
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild>
            <Button size="icon" className="h-10 w-10 rounded-xl shadow-lg">
              <List size={18} weight="bold" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-[86vw] max-w-[320px] p-0">
            <SheetHeader className="border-b border-border/60">
              <SheetTitle className="flex items-center gap-2">
                <img src={novussparksLogo} alt="NovusSparks" className="h-7 w-7" />
                <span>Navigation</span>
              </SheetTitle>
            </SheetHeader>
            <div className="p-4 space-y-2">
              {roleNavItems.map((item) => (
                <Button
                  key={item.id}
                  variant={item.active ? "default" : "ghost"}
                  className="w-full justify-start gap-3 rounded-xl"
                  onClick={() => {
                    item.onClick()
                    setMobileOpen(false)
                  }}
                >
                  <item.icon size={18} weight={item.active ? "fill" : "regular"} />
                  <span>{item.label}</span>
                </Button>
              ))}

              <div className="border-t border-border/60 pt-3 mt-3" />

              {accountItems.map((item) => (
                <Button
                  key={item.id}
                  variant="ghost"
                  className="w-full justify-start gap-3 rounded-xl"
                  onClick={() => {
                    item.onClick()
                    setMobileOpen(false)
                  }}
                >
                  <item.icon size={18} weight="regular" />
                  <span>{item.label}</span>
                </Button>
              ))}

              <div className="border-t border-border/60 pt-3 mt-3 flex gap-2">
                {socialItems.map((item) => {
                  const Icon = item.icon
                  return (
                    <a
                      key={item.label}
                      href={item.href}
                      target={item.href.startsWith("http") ? "_blank" : undefined}
                      rel={item.href.startsWith("http") ? "noopener noreferrer" : undefined}
                      className="h-9 px-3 rounded-lg border border-border/60 bg-background/40 hover:bg-accent/60 transition-colors inline-flex items-center gap-2"
                    >
                      <Icon size={16} weight="regular" />
                      <span className="text-xs text-muted-foreground">{item.label}</span>
                    </a>
                  )
                })}
              </div>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </>
  )
}
