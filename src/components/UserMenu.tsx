import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { UserProfile } from "@/types"
import { Palette, SignOut, PencilSimple } from "@phosphor-icons/react"
import { ProfileEdit } from "./ProfileEdit"
import { authService } from "@/lib/auth"
import { BRAND_THEME_OPTIONS, isBrandThemeName, type BrandThemeName } from "@/lib/brand-theme"

interface UserMenuProps {
  user: UserProfile
  brandTheme: BrandThemeName
  onBrandThemeChange: (theme: BrandThemeName) => void
  onLogout: () => void
  onProfileUpdate: (user: UserProfile) => void
}

export function UserMenu({ user, brandTheme, onBrandThemeChange, onLogout, onProfileUpdate }: UserMenuProps) {
  const [showProfileEdit, setShowProfileEdit] = useState(false)

  const handleLogout = async () => {
    await authService.logout()
    onLogout()
  }

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map(n => n[0])
      .join("")
      .toUpperCase()
      .substring(0, 2)
  }

  return (
    <>
      <ProfileEdit
        user={user}
        open={showProfileEdit}
        onOpenChange={setShowProfileEdit}
        onProfileUpdate={onProfileUpdate}
      />
      
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="relative h-10 w-10 rounded-full">
            <Avatar className="h-10 w-10 border-2 border-primary/20">
              {user.avatarUrl && <AvatarImage src={user.avatarUrl} alt={user.fullName} />}
              <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                {getInitials(user.fullName)}
              </AvatarFallback>
            </Avatar>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-64" align="end">
          <DropdownMenuLabel>
            <div className="flex flex-col space-y-1">
              <p className="text-sm font-medium leading-none">{user.fullName}</p>
              <p className="text-xs leading-none text-muted-foreground">{user.email}</p>
              <p className="text-xs leading-none text-muted-foreground mt-1">
                Role: {user.role === "admin" ? "Administrator" : "Client"}
              </p>
              <p className="text-xs leading-none text-muted-foreground">
                Plan: {user.subscription?.plan === "pro" ? "Pro" : "Basic"}
              </p>
              {user.subscription?.plan === "pro" && (
                <p className="text-xs leading-none text-muted-foreground">
                  Pro Credits: {user.subscription.proCredits}
                </p>
              )}
              {user.company && (
                <p className="text-xs leading-none text-muted-foreground">
                  {user.company}
                </p>
              )}
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setShowProfileEdit(true)} className="cursor-pointer">
            <PencilSimple className="mr-2 h-4 w-4" weight="bold" />
            <span>Edit Profile</span>
          </DropdownMenuItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Palette className="mr-2 h-4 w-4" weight="duotone" />
              <span>Theme</span>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-72">
              <DropdownMenuLabel>Brand Theme</DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={brandTheme}
                onValueChange={(value) => {
                  if (isBrandThemeName(value)) {
                    onBrandThemeChange(value)
                  }
                }}
              >
                {BRAND_THEME_OPTIONS.map((theme) => (
                  <DropdownMenuRadioItem key={theme.name} value={theme.name} className="items-start">
                    <div className="flex flex-col gap-0.5">
                      <span className="font-medium leading-none">{theme.label}</span>
                      <span className="text-xs leading-snug text-muted-foreground">{theme.description}</span>
                    </div>
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleLogout} className="cursor-pointer text-destructive focus:text-destructive">
            <SignOut className="mr-2 h-4 w-4" weight="bold" />
            <span>Log Out</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  )
}
