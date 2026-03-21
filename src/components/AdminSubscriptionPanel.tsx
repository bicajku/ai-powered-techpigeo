import { useCallback, useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import {
  CheckCircle,
  XCircle,
  Clock,
  CurrencyDollar,
  Lightning,
  Crown,
  Gift,
  SpinnerGap,
  Eye,
  Plus,
} from "@phosphor-icons/react"
import { toast } from "sonner"
import { SubscriptionRequest, UserProfile, SubscriptionPlan } from "@/types"
import {
  getSubscriptionRequests,
  approveTrialRequest,
  approveUpgradeRequest,
  rejectRequest,
  adminAddCredits,
  adminSetPlan,
  PLAN_CONFIG,
} from "@/lib/subscription"

interface AdminSubscriptionPanelProps {
  users: UserProfile[]
  adminEmail: string
  onDataChanged: () => void
}

export function AdminSubscriptionPanel({ users, adminEmail, onDataChanged }: AdminSubscriptionPanelProps) {
  const [requests, setRequests] = useState<SubscriptionRequest[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [actionInProgress, setActionInProgress] = useState<string | null>(null)
  const [rejectTarget, setRejectTarget] = useState<SubscriptionRequest | null>(null)
  const [rejectNote, setRejectNote] = useState("")
  const [paymentProofView, setPaymentProofView] = useState<SubscriptionRequest | null>(null)
  const [creditDialog, setCreditDialog] = useState<{ userId: string; userName: string; email: string } | null>(null)
  const [creditAmount, setCreditAmount] = useState("10")
  const [planDialog, setPlanDialog] = useState<{ userId: string; userName: string; email: string; currentPlan: SubscriptionPlan } | null>(null)
  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlan>("pro")

  const loadRequests = useCallback(async () => {
    setIsLoading(true)
    try {
      const data = await getSubscriptionRequests()
      setRequests(data.sort((a, b) => b.createdAt - a.createdAt))
    } catch {
      toast.error("Failed to load subscription requests")
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadRequests()
  }, [loadRequests])

  const pendingRequests = requests.filter((r) => r.status === "pending")
  const resolvedRequests = requests.filter((r) => r.status !== "pending")
  const pendingTrials = pendingRequests.filter((r) => r.type === "trial")
  const pendingUpgrades = pendingRequests.filter((r) => r.type === "upgrade")

  const handleApprove = async (request: SubscriptionRequest) => {
    setActionInProgress(request.id)
    try {
      const result = request.type === "trial"
        ? await approveTrialRequest(request.id, adminEmail)
        : await approveUpgradeRequest(request.id, adminEmail)

      if (result.success) {
        toast.success(`${request.type === "trial" ? "Trial" : "Upgrade"} approved for ${request.userName}`)
        await loadRequests()
        onDataChanged()
      } else {
        toast.error(result.error || "Failed to approve request")
      }
    } finally {
      setActionInProgress(null)
    }
  }

  const handleReject = async () => {
    if (!rejectTarget) return
    setActionInProgress(rejectTarget.id)
    try {
      const result = await rejectRequest(rejectTarget.id, adminEmail, rejectNote || undefined)
      if (result.success) {
        toast.success(`Request rejected for ${rejectTarget.userName}`)
        await loadRequests()
      } else {
        toast.error(result.error || "Failed to reject request")
      }
    } finally {
      setActionInProgress(null)
      setRejectTarget(null)
      setRejectNote("")
    }
  }

  const handleAddCredits = async () => {
    if (!creditDialog) return
    const amount = parseInt(creditAmount, 10)
    if (!amount || amount <= 0) {
      toast.error("Enter a valid credit amount")
      return
    }
    setActionInProgress(creditDialog.userId)
    try {
      const result = await adminAddCredits(creditDialog.userId, amount)
      if (result.success) {
        toast.success(`Added ${amount} credits to ${creditDialog.userName}. New balance: ${result.credits}`)
        onDataChanged()
      } else {
        toast.error(result.error || "Failed to add credits")
      }
    } finally {
      setActionInProgress(null)
      setCreditDialog(null)
      setCreditAmount("10")
    }
  }

  const handleSetPlan = async () => {
    if (!planDialog) return
    setActionInProgress(planDialog.userId)
    try {
      const result = await adminSetPlan(planDialog.userId, selectedPlan)
      if (result.success) {
        toast.success(`Set ${planDialog.userName} to ${PLAN_CONFIG[selectedPlan].name} plan`)
        onDataChanged()
      } else {
        toast.error(result.error || "Failed to set plan")
      }
    } finally {
      setActionInProgress(null)
      setPlanDialog(null)
    }
  }

  const formatDate = (timestamp: number) =>
    new Date(timestamp).toLocaleDateString("en-US", {
      year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
    })

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending": return <Badge variant="outline" className="gap-1 text-yellow-600 border-yellow-300"><Clock size={12} />Pending</Badge>
      case "approved": return <Badge className="gap-1 bg-green-600"><CheckCircle size={12} weight="fill" />Approved</Badge>
      case "rejected": return <Badge variant="destructive" className="gap-1"><XCircle size={12} weight="fill" />Rejected</Badge>
      default: return <Badge variant="secondary">{status}</Badge>
    }
  }

  const getTypeBadge = (type: string, targetPlan?: string) => {
    if (type === "trial") return <Badge variant="outline" className="gap-1 border-accent/50 text-accent"><Gift size={12} weight="bold" />Trial</Badge>
    if (targetPlan === "team") return <Badge className="gap-1 bg-accent/10 text-accent border-accent/30"><Crown size={12} weight="bold" />Team Upgrade</Badge>
    return <Badge className="gap-1 bg-primary/10 text-primary border-primary/30"><Lightning size={12} weight="bold" />Pro Upgrade</Badge>
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <SpinnerGap size={32} className="animate-spin text-primary" />
      </div>
    )
  }

  return (
    <>
      {/* Reject dialog */}
      <AlertDialog open={!!rejectTarget} onOpenChange={() => setRejectTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reject Request</AlertDialogTitle>
            <AlertDialogDescription>
              Reject {rejectTarget?.type} request from {rejectTarget?.userName} ({rejectTarget?.userEmail})?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            placeholder="Reason for rejection (optional, visible to user)"
            value={rejectNote}
            onChange={(e) => setRejectNote(e.target.value)}
            className="mt-2"
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleReject} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Reject
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Payment proof viewer */}
      <Dialog open={!!paymentProofView} onOpenChange={() => setPaymentProofView(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Upgrade Request Details</DialogTitle>
          </DialogHeader>
          {paymentProofView && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-muted-foreground">User:</span>
                  <p className="font-medium">{paymentProofView.userName}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Email:</span>
                  <p className="font-medium">{paymentProofView.userEmail}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Current Plan:</span>
                  <p className="font-medium capitalize">{paymentProofView.currentPlan}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Target Plan:</span>
                  <p className="font-medium capitalize">{paymentProofView.targetPlan}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Requested:</span>
                  <p className="font-medium">{formatDate(paymentProofView.createdAt)}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Price:</span>
                  <p className="font-medium">{paymentProofView.targetPlan ? PLAN_CONFIG[paymentProofView.targetPlan as "pro" | "team"].priceLabel : "N/A"}</p>
                </div>
              </div>
              {paymentProofView.paymentProof && (
                <div>
                  <span className="text-sm text-muted-foreground">Payment Proof / Transaction ID:</span>
                  <div className="mt-1 p-3 bg-muted/50 rounded-lg text-sm font-mono break-all">
                    {paymentProofView.paymentProof}
                  </div>
                </div>
              )}
              {paymentProofView.message && (
                <div>
                  <span className="text-sm text-muted-foreground">Message from user:</span>
                  <div className="mt-1 p-3 bg-muted/30 rounded-lg text-sm">
                    {paymentProofView.message}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Add credits dialog */}
      <Dialog open={!!creditDialog} onOpenChange={() => setCreditDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Credits to {creditDialog?.userName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">{creditDialog?.email}</p>
            <Input
              type="number"
              min={1}
              max={500}
              value={creditAmount}
              onChange={(e) => setCreditAmount(e.target.value)}
              placeholder="Number of credits to add"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreditDialog(null)}>Cancel</Button>
            <Button onClick={handleAddCredits} disabled={actionInProgress !== null} className="gap-2">
              <Plus size={14} weight="bold" />
              Add Credits
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Set plan dialog */}
      <Dialog open={!!planDialog} onOpenChange={() => setPlanDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Set Plan for {planDialog?.userName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Current plan: <span className="font-medium capitalize">{planDialog?.currentPlan}</span>
            </p>
            <Select value={selectedPlan} onValueChange={(v) => setSelectedPlan(v as SubscriptionPlan)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="basic">Basic (Free)</SelectItem>
                <SelectItem value="pro">Pro ({PLAN_CONFIG.pro.priceLabel})</SelectItem>
                <SelectItem value="team">Team ({PLAN_CONFIG.team.priceLabel})</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPlanDialog(null)}>Cancel</Button>
            <Button onClick={handleSetPlan} disabled={actionInProgress !== null}>
              Set Plan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="space-y-4">
        {/* Summary cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Card className="border-yellow-500/30 bg-gradient-to-br from-yellow-500/5 to-yellow-500/10">
            <CardContent className="py-4 flex items-center gap-3">
              <Clock size={24} weight="duotone" className="text-yellow-600" />
              <div>
                <p className="text-2xl font-bold">{pendingRequests.length}</p>
                <p className="text-xs text-muted-foreground">Pending Requests</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-accent/30 bg-gradient-to-br from-accent/5 to-accent/10">
            <CardContent className="py-4 flex items-center gap-3">
              <Gift size={24} weight="duotone" className="text-accent" />
              <div>
                <p className="text-2xl font-bold">{pendingTrials.length}</p>
                <p className="text-xs text-muted-foreground">Trial Requests</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-primary/10">
            <CardContent className="py-4 flex items-center gap-3">
              <CurrencyDollar size={24} weight="duotone" className="text-primary" />
              <div>
                <p className="text-2xl font-bold">{pendingUpgrades.length}</p>
                <p className="text-xs text-muted-foreground">Upgrade Requests</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="pending" className="w-full">
          <TabsList className="grid w-full grid-cols-3 max-w-lg mb-4">
            <TabsTrigger value="pending" className="gap-1">
              <Clock size={14} />
              Pending ({pendingRequests.length})
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-1">
              <CheckCircle size={14} />
              History ({resolvedRequests.length})
            </TabsTrigger>
            <TabsTrigger value="manage" className="gap-1">
              <CurrencyDollar size={14} />
              Manage Users
            </TabsTrigger>
          </TabsList>

          {/* Pending requests */}
          <TabsContent value="pending">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Pending Requests</CardTitle>
              </CardHeader>
              <CardContent>
                {pendingRequests.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8 text-sm">No pending requests</p>
                ) : (
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>User</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Current</TableHead>
                          <TableHead>Requested</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pendingRequests.map((req) => (
                          <TableRow key={req.id}>
                            <TableCell>
                              <div className="flex flex-col">
                                <span className="text-sm font-medium">{req.userName}</span>
                                <span className="text-xs text-muted-foreground">{req.userEmail}</span>
                              </div>
                            </TableCell>
                            <TableCell>{getTypeBadge(req.type, req.targetPlan)}</TableCell>
                            <TableCell><Badge variant="secondary" className="capitalize">{req.currentPlan}</Badge></TableCell>
                            <TableCell className="text-sm capitalize">{req.type === "trial" ? "Trial (10 credits)" : `${req.targetPlan} (${req.targetPlan === "team" ? PLAN_CONFIG.team.priceLabel : PLAN_CONFIG.pro.priceLabel})`}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">{formatDate(req.createdAt)}</TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                {req.type === "upgrade" && (
                                  <Button variant="ghost" size="sm" onClick={() => setPaymentProofView(req)} title="View Details">
                                    <Eye size={16} weight="bold" />
                                  </Button>
                                )}
                                <Button
                                  size="sm"
                                  onClick={() => handleApprove(req)}
                                  disabled={actionInProgress !== null}
                                  className="gap-1 bg-green-600 hover:bg-green-700"
                                >
                                  {actionInProgress === req.id ? <SpinnerGap size={14} className="animate-spin" /> : <CheckCircle size={14} weight="fill" />}
                                  Approve
                                </Button>
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  onClick={() => setRejectTarget(req)}
                                  disabled={actionInProgress !== null}
                                  className="gap-1"
                                >
                                  <XCircle size={14} weight="fill" />
                                  Reject
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* History */}
          <TabsContent value="history">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Request History</CardTitle>
              </CardHeader>
              <CardContent>
                {resolvedRequests.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8 text-sm">No resolved requests yet</p>
                ) : (
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>User</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Resolved By</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead>Note</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {resolvedRequests.slice(0, 50).map((req) => (
                          <TableRow key={req.id} className={req.status === "rejected" ? "opacity-60" : ""}>
                            <TableCell>
                              <div className="flex flex-col">
                                <span className="text-sm font-medium">{req.userName}</span>
                                <span className="text-xs text-muted-foreground">{req.userEmail}</span>
                              </div>
                            </TableCell>
                            <TableCell>{getTypeBadge(req.type, req.targetPlan)}</TableCell>
                            <TableCell>{getStatusBadge(req.status)}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">{req.resolvedBy || "-"}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">{req.resolvedAt ? formatDate(req.resolvedAt) : "-"}</TableCell>
                            <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">{req.adminNote || "-"}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Manage users */}
          <TabsContent value="manage">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">User Subscription Management</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>User</TableHead>
                        <TableHead>Plan</TableHead>
                        <TableHead>Credits</TableHead>
                        <TableHead>Trial</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {users.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center text-muted-foreground py-8">No users found</TableCell>
                        </TableRow>
                      ) : (
                        users
                          .map((user) => {
                            const sub = user.subscription
                            const trial = sub?.trial
                            return (
                              <TableRow key={user.id}>
                                <TableCell>
                                  <div className="flex flex-col">
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-sm font-medium">{user.fullName}</span>
                                      {user.role === "admin" && (
                                        <Badge variant="outline" className="text-[10px] px-1 py-0 border-primary/40 text-primary">Admin</Badge>
                                      )}
                                    </div>
                                    <span className="text-xs text-muted-foreground">{user.email}</span>
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <Badge variant={sub?.plan === "team" ? "default" : sub?.plan === "pro" ? "default" : "secondary"} className="capitalize">
                                    {sub?.plan || "basic"}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-sm font-medium">{sub?.proCredits ?? 0}</TableCell>
                                <TableCell>
                                  {trial?.requested ? (
                                    trial.exhausted ? (
                                      <Badge variant="destructive" className="text-xs">Exhausted</Badge>
                                    ) : (
                                      <Badge variant="outline" className="text-xs">{trial.submissionsUsed}/{trial.maxSubmissions} used</Badge>
                                    )
                                  ) : (
                                    <span className="text-xs text-muted-foreground">-</span>
                                  )}
                                </TableCell>
                                <TableCell className="text-right">
                                  <div className="flex items-center justify-end gap-1">
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => setCreditDialog({ userId: user.id, userName: user.fullName, email: user.email })}
                                      className="gap-1 text-xs"
                                    >
                                      <Plus size={12} weight="bold" />
                                      Credits
                                    </Button>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => {
                                        setPlanDialog({
                                          userId: user.id,
                                          userName: user.fullName,
                                          email: user.email,
                                          currentPlan: sub?.plan || "basic",
                                        })
                                        setSelectedPlan(sub?.plan || "pro")
                                      }}
                                      className="gap-1 text-xs"
                                    >
                                      <Lightning size={12} weight="bold" />
                                      Set Plan
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            )
                          })
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </>
  )
}
