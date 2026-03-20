import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Copy, QrCode, Trash, Link as LinkIcon } from "@phosphor-icons/react"
import { toast } from "sonner"
import { inviteService, buildInviteLink, type InviteLink } from "@/lib/invite-system"
import { QRCodeGenerator } from "@/components/QRCodeGenerator"
import { UserProfile } from "@/types"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

interface InviteManagerProps {
  user: UserProfile
}

export function InviteManager({ user }: InviteManagerProps) {
  const [invites, setInvites] = useState<InviteLink[]>([])
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    loadInvites()
  }, [])

  const loadInvites = async () => {
    const links = await inviteService.getInviteLinks(user.id)
    setInvites(links)
  }

  const handleGenerateInvite = async () => {
    setIsLoading(true)
    const result = await inviteService.generateInviteLink(user.id, 30)

    if (result.success && result.link) {
      toast.success("Invite link generated!")
      await loadInvites()
    } else {
      toast.error(result.error || "Failed to generate invite link")
    }

    setIsLoading(false)
  }

  const handleCopyLink = (link: string) => {
    navigator.clipboard.writeText(link)
    toast.success("Link copied to clipboard!")
  }

  const handleRevokeInvite = async (code: string) => {
    const result = await inviteService.revokeInviteLink(code)

    if (result.success) {
      toast.success("Invite link revoked")
      await loadInvites()
    } else {
      toast.error(result.error || "Failed to revoke invite link")
    }
  }

  const getTimeRemaining = (expiresAt: number) => {
    const now = Date.now()
    const diff = expiresAt - now

    if (diff <= 0) return "Expired"

    const days = Math.floor(diff / (1000 * 60 * 60 * 24))
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))

    if (days > 0) return `${days}d ${hours}h`
    return `${hours}h`
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-foreground mb-2">Invite Management</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Generate shareable registration links with QR codes for new users
        </p>

        <Button onClick={handleGenerateInvite} disabled={isLoading} className="gap-2">
          <LinkIcon size={18} weight="bold" />
          Generate New Invite Link
        </Button>
      </div>

      <div className="space-y-3">
        <h4 className="font-medium text-foreground">Active Invites</h4>

        {invites.length === 0 ? (
          <Card className="p-6 text-center">
            <p className="text-muted-foreground">No invite links yet.</p>
          </Card>
        ) : (
          <div className="space-y-3">
            {invites.map((invite) => {
              const link = buildInviteLink(invite.code)
              const timeRemaining = getTimeRemaining(invite.expiresAt)
              const isExpired = invite.expiresAt < Date.now()
              const isUsed = !invite.isActive && invite.usedAt

              return (
                <Card key={invite.code} className="p-4">
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <code className="text-xs bg-muted px-2 py-1 rounded font-mono truncate">
                          {invite.code.slice(0, 20)}...
                        </code>

                        {isUsed && (
                          <Badge variant="secondary" className="text-xs">
                            Used
                          </Badge>
                        )}
                        {isExpired && !isUsed && (
                          <Badge variant="destructive" className="text-xs">
                            Expired
                          </Badge>
                        )}
                        {invite.isActive && !isExpired && (
                          <Badge variant="default" className="text-xs">
                            Active
                          </Badge>
                        )}
                      </div>

                      <p className="text-xs text-muted-foreground">
                        Expires in: {timeRemaining}
                        {isUsed && ` • Used by ${invite.usedBy}`}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1.5"
                            disabled={Boolean(isExpired || isUsed)}
                          >
                            <QrCode size={16} />
                            QR
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-sm">
                          <DialogHeader>
                            <DialogTitle>Registration QR Code</DialogTitle>
                            <DialogDescription>
                              Scan this QR code to register with this invite link
                            </DialogDescription>
                          </DialogHeader>

                          <div className="flex flex-col items-center gap-4 py-6">
                            <QRCodeGenerator value={link} size={200} className="border rounded-lg" />

                            <Button
                              onClick={() => handleCopyLink(link)}
                              variant="outline"
                              className="w-full gap-2"
                            >
                              <Copy size={16} />
                              Copy Link
                            </Button>
                          </div>
                        </DialogContent>
                      </Dialog>

                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5"
                        onClick={() => handleCopyLink(link)}
                        disabled={Boolean(isExpired || isUsed)}
                      >
                        <Copy size={16} />
                      </Button>

                      {invite.isActive && !isExpired && (
                        <Button
                          variant="destructive"
                          size="sm"
                          className="gap-1.5"
                          onClick={() => handleRevokeInvite(invite.code)}
                        >
                          <Trash size={16} />
                        </Button>
                      )}
                    </div>
                  </div>
                </Card>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
