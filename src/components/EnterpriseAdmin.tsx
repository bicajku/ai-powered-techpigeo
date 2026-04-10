import { useState, useEffect } from "react"
import { UserProfile } from "@/types"
import {
  getEnterpriseSubscription,
  saveEnterpriseSubscription,
  addEnterpriseTeamMember,
  removeEnterpriseTeamMember,
  updateTeamMemberRole,
  grantNGOAccess,
  revokeNGOAccess,
  getEnterpriseFeatures,
  canManageEnterprise,
  type EnterpriseSubscription,
  type EnterpriseRole,
  type EnterpriseTeamMember,
  reconcileEnterpriseMemberEntitlements,
  updateEnterpriseMemberModuleAccess,
  updateEnterpriseMemberIndividualProLicense,
  listEnterpriseCreditUsage,
  type EnterpriseCreditUsageEntry,
} from "@/lib/enterprise-subscription"
import { bootstrapOrganization } from "@/lib/org-members"
import { NGOAccessLevel } from "@/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import { adminService } from "@/lib/admin"
import { safeDateFormatters } from "@/lib/date-utils"

interface EnterpriseAdminProps {
  user: UserProfile
  organizationId: string
}

export function EnterpriseAdmin({ user, organizationId }: EnterpriseAdminProps) {
  const [subscription, setSubscription] = useState<EnterpriseSubscription | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [newMemberEmail, setNewMemberEmail] = useState("")
  const [newMemberName, setNewMemberName] = useState("")
  const [newMemberRole, setNewMemberRole] = useState<EnterpriseRole>("contributor")
  const [newMemberPassword, setNewMemberPassword] = useState("")
  const [setupPlan, setSetupPlan] = useState<EnterpriseSubscription["plan"]>("enterprise")
  const [setupTier, setSetupTier] = useState<EnterpriseSubscription["tier"]>("ENTERPRISE")
  const [setupBillingCycle, setSetupBillingCycle] = useState<EnterpriseSubscription["billingCycle"]>("annual")
  const [setupMaxMembers, setSetupMaxMembers] = useState<number>(500)
  const [setupRenewalDate, setSetupRenewalDate] = useState<string>(
    new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  )
  const [setupActive, setSetupActive] = useState<boolean>(true)
  const [creditUsage, setCreditUsage] = useState<EnterpriseCreditUsageEntry[]>([])

  useEffect(() => {
    loadSubscription()
  }, [organizationId])

  async function loadSubscription() {
    try {
      setLoading(true)
      const sub = await getEnterpriseSubscription(organizationId)

      if (sub) {
        // Auto-repair backend organization if missing
        try {
          const bootstrap = await bootstrapOrganization({
            name: `${user.fullName || user.email} Enterprise`,
            tier: sub.tier,
          })
          if (bootstrap.success && bootstrap.organization?.id && bootstrap.organization.id !== organizationId) {
             // A new backend organization was created, or it differs from our KV org ID.
             // Update the KV subscription to use the correct backend ID.
             const repairedSub = { ...sub, organizationId: bootstrap.organization.id }
             await saveEnterpriseSubscription(repairedSub)
             await reconcileEnterpriseMemberEntitlements(bootstrap.organization.id)
             // Continue loading with repaired subscription (no reload needed)
             setSubscription(repairedSub)
             setSetupPlan(repairedSub.plan)
             setSetupTier(repairedSub.tier)
             setSetupBillingCycle(repairedSub.billingCycle)
             setSetupMaxMembers(repairedSub.features.maxTeamMembers)
             setSetupRenewalDate(new Date(repairedSub.renewalDate).toISOString().slice(0, 10))
             setSetupActive(repairedSub.isActive)
             const usage = await listEnterpriseCreditUsage(bootstrap.organization.id)
             setCreditUsage(usage)
             setLoading(false)
             return
          }
        } catch (e) {
          console.warn("Silent backend org bootstrap failed:", e)
        }
      }

      if (!sub) {
        setSubscription(null)
        setError(null)
        setCreditUsage([])
      } else {
        setSubscription(sub)
        setSetupPlan(sub.plan)
        setSetupTier(sub.tier)
        setSetupBillingCycle(sub.billingCycle)
        setSetupMaxMembers(sub.features.maxTeamMembers)
        setSetupRenewalDate(new Date(sub.renewalDate).toISOString().slice(0, 10))
        setSetupActive(sub.isActive)
        const usage = await listEnterpriseCreditUsage(organizationId)
        setCreditUsage(usage)
      }
    } catch (err) {
      setError("Failed to load subscription")
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  async function handleAddMember() {
    if (!newMemberEmail || !newMemberName || !subscription) return

    try {
      setError(null)
      const result = await addEnterpriseTeamMember(
        organizationId,
        newMemberEmail,
        newMemberName,
        newMemberRole,
        newMemberPassword,
      )

      if (result.success) {
        setNewMemberEmail("")
        setNewMemberName("")
        setNewMemberRole("contributor")
        setNewMemberPassword("")
        if (result.warning) {
          setError(result.warning)
        }
        await loadSubscription()
      } else {
        setError(result.error || "Failed to add team member")
      }
    } catch (err) {
      setError("Failed to add team member")
      console.error(err)
    }
  }

  async function handleRemoveMember(memberId: string) {
    if (!confirm("Are you sure you want to remove this team member?")) return

    try {
      setError(null)
      const result = await removeEnterpriseTeamMember(organizationId, memberId)
      if (result.success) {
        await loadSubscription()
      } else {
        setError(result.error || "Failed to remove team member")
      }
    } catch (err) {
      setError("Failed to remove team member")
      console.error(err)
    }
  }

  async function handleUpdateRole(memberId: string, newRole: EnterpriseRole) {
    try {
      setError(null)
      const result = await updateTeamMemberRole(organizationId, memberId, newRole)
      if (result.success) {
        await loadSubscription()
      } else {
        setError(result.error || "Failed to update member role")
      }
    } catch (err) {
      setError("Failed to update member role")
      console.error(err)
    }
  }

  async function handleGrantNGOAccess(memberId: string, level: NGOAccessLevel) {
    try {
      setError(null)
      const result = await grantNGOAccess(organizationId, memberId, level)
      if (result.success) {
        await loadSubscription()
      } else {
        setError(result.error || "Failed to grant NGO access")
      }
    } catch (err) {
      setError("Failed to grant NGO access")
      console.error(err)
    }
  }

  async function handleCreateSubscription() {
    try {
      setError(null)
      const bootstrap = await bootstrapOrganization({
        name: `${user.fullName || user.email} Enterprise`,
        tier: setupTier,
      })
      if (!bootstrap.success) {
        setError(bootstrap.error || "Failed to create backend organization")
        return
      }

      const backendOrganizationId = typeof bootstrap.organization?.id === "string"
        ? bootstrap.organization.id
        : organizationId
      const tierFeatures = getEnterpriseFeatures(setupTier)
      const created: EnterpriseSubscription = {
        organizationId: backendOrganizationId,
        plan: setupPlan,
        tier: setupTier,
        ownerId: user.id,
        teamMembers: [],
        features: {
          ...tierFeatures,
          maxTeamMembers: setupMaxMembers > 0 ? setupMaxMembers : tierFeatures.maxTeamMembers,
        },
        billingCycle: setupBillingCycle,
        renewalDate: new Date(setupRenewalDate).getTime(),
        isActive: setupActive,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }

      await saveEnterpriseSubscription(created)
      await reconcileEnterpriseMemberEntitlements(backendOrganizationId)
      await loadSubscription()
    } catch (err) {
      setError("Failed to create subscription")
      console.error(err)
    }
  }

  async function handleSaveSubscriptionSettings() {
    if (!subscription) return

    try {
      setError(null)
      const tierFeatures = getEnterpriseFeatures(setupTier)
      const updated: EnterpriseSubscription = {
        ...subscription,
        plan: setupPlan,
        tier: setupTier,
        billingCycle: setupBillingCycle,
        renewalDate: new Date(setupRenewalDate).getTime(),
        isActive: setupActive,
        features: {
          ...tierFeatures,
          maxTeamMembers: setupMaxMembers > 0 ? setupMaxMembers : tierFeatures.maxTeamMembers,
        },
        updatedAt: Date.now(),
      }

      await saveEnterpriseSubscription(updated)
      await reconcileEnterpriseMemberEntitlements(organizationId)
      await loadSubscription()
    } catch (err) {
      setError("Failed to update subscription settings")
      console.error(err)
    }
  }

  async function handleRevokeNGOAccess(memberId: string) {
    try {
      setError(null)
      const result = await revokeNGOAccess(organizationId, memberId)
      if (result.success) {
        await loadSubscription()
      } else {
        setError(result.error || "Failed to revoke NGO access")
      }
    } catch (err) {
      setError("Failed to revoke NGO access")
      console.error(err)
    }
  }

  async function handleSetMemberPassword(member: EnterpriseTeamMember) {
    const nextPassword = prompt(`Set password for ${member.email} (min 6 chars):`)
    if (!nextPassword) return

    try {
      const result = await adminService.updateUserPassword(member.email, nextPassword)
      if (result.success) {
        toast.success(`Password updated for ${member.email}`)
      } else {
        toast.error(result.error || "Failed to update password")
      }
    } catch {
      toast.error("Failed to update password")
    }
  }

  async function handleModuleToggle(
    member: EnterpriseTeamMember,
    moduleName: "review" | "humanizer",
    enabled: boolean
  ) {
    try {
      setError(null)
    const baseModules: Array<"strategy" | "ideas" | "review" | "humanizer"> = ["strategy", "ideas"]
    const current = member.moduleAccess || baseModules
    const next = new Set(current)
    if (enabled) {
      next.add(moduleName)
    } else {
      next.delete(moduleName)
    }
    next.add("strategy")
    next.add("ideas")

    const result = await updateEnterpriseMemberModuleAccess(
      organizationId,
      member.id,
      Array.from(next) as Array<"strategy" | "ideas" | "review" | "humanizer">
    )

    if (result.success) {
      await loadSubscription()
    } else {
      setError(result.error || "Failed to update module access")
    }
    } catch (err) {
      setError("Failed to update module access")
      console.error(err)
    }
  }

  async function handleIndividualProToggle(member: EnterpriseTeamMember, enabled: boolean) {
    try {
      setError(null)
      const result = await updateEnterpriseMemberIndividualProLicense(organizationId, member.id, enabled)
      if (result.success) {
        await loadSubscription()
      } else {
        setError(result.error || "Failed to update individual Pro license")
      }
    } catch (err) {
      setError("Failed to update individual Pro license")
      console.error(err)
    }
  }

  if (!canManageEnterprise(user, "admin")) {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          You don't have permission to access enterprise admin panel
        </AlertDescription>
      </Alert>
    )
  }

  if (loading) return <div>Loading subscription...</div>

  if (!subscription) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Enterprise Subscription Setup</CardTitle>
            <CardDescription>Create a subscription to manage users, licenses, plans, and access control.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <p className="text-sm font-medium">Plan</p>
                <Select value={setupPlan} onValueChange={(v) => setSetupPlan(v as EnterpriseSubscription["plan"])}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="starter">Starter</SelectItem>
                    <SelectItem value="professional">Professional</SelectItem>
                    <SelectItem value="enterprise">Enterprise</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium">Tier</p>
                <Select
                  value={setupTier}
                  onValueChange={(v) => {
                    const nextTier = v as EnterpriseSubscription["tier"]
                    setSetupTier(nextTier)
                    setSetupMaxMembers(getEnterpriseFeatures(nextTier).maxTeamMembers)
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="BASIC">BASIC</SelectItem>
                    <SelectItem value="PRO">PRO</SelectItem>
                    <SelectItem value="TEAMS">TEAMS</SelectItem>
                    <SelectItem value="ENTERPRISE">ENTERPRISE</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium">Billing Cycle</p>
                <Select value={setupBillingCycle} onValueChange={(v) => setSetupBillingCycle(v as EnterpriseSubscription["billingCycle"])}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="annual">Annual</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium">Licenses (Max Members)</p>
                <Input
                  type="number"
                  min={1}
                  value={setupMaxMembers}
                  onChange={(e) => setSetupMaxMembers(Math.max(1, Number(e.target.value) || 1))}
                />
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium">Renewal Date</p>
                <Input type="date" value={setupRenewalDate} onChange={(e) => setSetupRenewalDate(e.target.value)} />
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium">Subscription Status</p>
                <Select value={setupActive ? "active" : "inactive"} onValueChange={(v) => setSetupActive(v === "active")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Button onClick={handleCreateSubscription} className="w-full md:w-auto">
              Create Subscription
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  const features = getEnterpriseFeatures(subscription.tier)
  const memberCount = subscription.teamMembers.length
  const canAddMore = memberCount < features.maxTeamMembers

  return (
    <div className="space-y-6">
      {/* Subscription Overview */}
      <Card>
        <CardHeader>
          <CardTitle>Enterprise Subscription</CardTitle>
          <CardDescription>Organization ID: {organizationId}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border rounded-lg p-4">
            <div className="space-y-2">
              <p className="text-sm font-medium">Plan</p>
              <Select value={setupPlan} onValueChange={(v) => setSetupPlan(v as EnterpriseSubscription["plan"])}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="starter">Starter</SelectItem>
                  <SelectItem value="professional">Professional</SelectItem>
                  <SelectItem value="enterprise">Enterprise</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium">Tier</p>
              <Select
                value={setupTier}
                onValueChange={(v) => {
                  const nextTier = v as EnterpriseSubscription["tier"]
                  setSetupTier(nextTier)
                  setSetupMaxMembers(getEnterpriseFeatures(nextTier).maxTeamMembers)
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="BASIC">BASIC</SelectItem>
                  <SelectItem value="PRO">PRO</SelectItem>
                  <SelectItem value="TEAMS">TEAMS</SelectItem>
                  <SelectItem value="ENTERPRISE">ENTERPRISE</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium">Billing Cycle</p>
              <Select value={setupBillingCycle} onValueChange={(v) => setSetupBillingCycle(v as EnterpriseSubscription["billingCycle"])}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="annual">Annual</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium">Licenses (Max Members)</p>
              <Input
                type="number"
                min={1}
                value={setupMaxMembers}
                onChange={(e) => setSetupMaxMembers(Math.max(1, Number(e.target.value) || 1))}
              />
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium">Renewal Date</p>
              <Input type="date" value={setupRenewalDate} onChange={(e) => setSetupRenewalDate(e.target.value)} />
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium">Subscription Status</p>
              <Select value={setupActive ? "active" : "inactive"} onValueChange={(v) => setSetupActive(v === "active")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex justify-end">
            <Button onClick={handleSaveSubscriptionSettings}>Save Subscription Settings</Button>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-gray-600">Plan</p>
              <p className="font-semibold">{subscription.plan}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Tier</p>
              <Badge>{subscription.tier}</Badge>
            </div>
            <div>
              <p className="text-sm text-gray-600">Status</p>
              <Badge variant={subscription.isActive ? "default" : "destructive"}>
                {subscription.isActive ? "Active" : "Inactive"}
              </Badge>
            </div>
            <div>
              <p className="text-sm text-gray-600">Billing</p>
              <p className="font-semibold capitalize">{subscription.billingCycle}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Team Members</p>
              <p className="font-semibold">
                {memberCount} / {features.maxTeamMembers}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Renewal</p>
              <p className="font-semibold">{safeDateFormatters.toLocaleDateString(subscription.renewalDate)}</p>
            </div>
          </div>

          {/* Features */}
          <div className="border-t pt-4">
            <p className="text-sm font-semibold mb-2">Enabled Features</p>
            <div className="space-y-1 text-sm">
              <p>
                ✓ Custom Branding:{" "}
                <span className={features.canCustomizeBranding ? "text-green-600" : "text-gray-400"}>
                  {features.canCustomizeBranding ? "Yes" : "No"}
                </span>
              </p>
              <p>
                ✓ NGO-SAAS Module:{" "}
                <span className={features.canAccessNGOSaaS ? "text-green-600" : "text-gray-400"}>
                  {features.canAccessNGOSaaS ? "Yes" : "No"}
                </span>
              </p>
              <p>
                ✓ RBAC:{" "}
                <span className={features.canManageRBAC ? "text-green-600" : "text-gray-400"}>
                  {features.canManageRBAC ? "Yes" : "No"}
                </span>
              </p>
              <p>
                ✓ Audit Logs:{" "}
                <span className={features.canAuditLogs ? "text-green-600" : "text-gray-400"}>
                  {features.canAuditLogs ? "Yes" : "No"}
                </span>
              </p>
              <p>
                ✓ Advanced Analytics:{" "}
                <span className={features.advancedAnalytics ? "text-green-600" : "text-gray-400"}>
                  {features.advancedAnalytics ? "Yes" : "No"}
                </span>
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Add Team Member */}
      {canAddMore && (
        <Card>
          <CardHeader>
            <CardTitle>Add Team Member</CardTitle>
            <CardDescription>
              Add a new team member to your enterprise ({memberCount} / {features.maxTeamMembers})
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {error && <Alert variant="destructive">{error}</Alert>}
            <div className="space-y-3">
              <Input
                placeholder="Email"
                value={newMemberEmail}
                onChange={(e) => setNewMemberEmail(e.target.value)}
              />
              <Input
                placeholder="Full Name"
                value={newMemberName}
                onChange={(e) => setNewMemberName(e.target.value)}
              />
              <Select value={newMemberRole} onValueChange={(v) => setNewMemberRole(v as EnterpriseRole)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="owner">Owner</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="contributor">Contributor</SelectItem>
                  <SelectItem value="viewer">Viewer</SelectItem>
                </SelectContent>
              </Select>
              <Input
                type="password"
                placeholder="Password (min 6 chars for new login)"
                value={newMemberPassword}
                onChange={(e) => setNewMemberPassword(e.target.value)}
              />
              <Button onClick={handleAddMember} className="w-full">
                Add Member
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Team Members */}
      <Card>
        <CardHeader>
          <CardTitle>Team Members</CardTitle>
          <CardDescription>{subscription.teamMembers.length} members</CardDescription>
        </CardHeader>
        <CardContent>
          {subscription.teamMembers.length === 0 ? (
            <p className="text-sm text-gray-500">No team members yet</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                  <TableHead>Plan Eligibility</TableHead>
                    <TableHead>Modules</TableHead>
                    <TableHead>Individual Pro</TableHead>
                    <TableHead>NGO Access</TableHead>
                  <TableHead>Added</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {subscription.teamMembers.map((member) => (
                  <TableRow key={member.id}>
                    <TableCell>{member.fullName}</TableCell>
                    <TableCell className="text-sm">{member.email}</TableCell>
                    <TableCell>
                      <Select value={member.role} onValueChange={(v) => handleUpdateRole(member.id, v as EnterpriseRole)}>
                        <SelectTrigger className="w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="owner">Owner</SelectItem>
                          <SelectItem value="admin">Admin</SelectItem>
                          <SelectItem value="contributor">Contributor</SelectItem>
                          <SelectItem value="viewer">Viewer</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="capitalize">
                        {subscription.plan}
                      </Badge>
                      <p className="text-[11px] text-muted-foreground mt-1">Tier {subscription.tier}</p>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <p className="text-xs">Strategy, Ideas (always)</p>
                        <label className="flex items-center gap-2 text-xs">
                          <input
                            type="checkbox"
                            checked={(member.moduleAccess || ["strategy", "ideas"]).includes("review")}
                            onChange={(e) => void handleModuleToggle(member, "review", e.target.checked)}
                          />
                          Review
                        </label>
                        <label className="flex items-center gap-2 text-xs">
                          <input
                            type="checkbox"
                            checked={(member.moduleAccess || ["strategy", "ideas"]).includes("humanizer")}
                            onChange={(e) => void handleModuleToggle(member, "humanizer", e.target.checked)}
                          />
                          Humanizer
                        </label>
                      </div>
                    </TableCell>
                    <TableCell>
                      <label className="flex items-center gap-2 text-xs">
                        <input
                          type="checkbox"
                          checked={Boolean(member.individualProLicense)}
                          onChange={(e) => void handleIndividualProToggle(member, e.target.checked)}
                        />
                        {member.individualProLicense ? "Enabled" : "Disabled"}
                      </label>
                    </TableCell>
                    <TableCell>
                      {features.canAccessNGOSaaS ? (
                        <div className="flex gap-1">
                          {member.ngoAccessLevel ? (
                            <>
                              <Badge variant="outline">{member.ngoAccessLevel}</Badge>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleRevokeNGOAccess(member.id)}
                              >
                                Revoke
                              </Button>
                            </>
                          ) : (
                            <Select
                              onValueChange={(v) =>
                                handleGrantNGOAccess(member.id, v as NGOAccessLevel)
                              }
                            >
                              <SelectTrigger className="w-28">
                                <SelectValue placeholder="Grant" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="owner">Owner</SelectItem>
                                <SelectItem value="contributor">Contributor</SelectItem>
                                <SelectItem value="user">User</SelectItem>
                              </SelectContent>
                            </Select>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">Not available</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {new Date(member.addedAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleSetMemberPassword(member)}
                        >
                          Set Password
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleRemoveMember(member.id)}
                        >
                          Remove
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Enterprise Credit Usage</CardTitle>
          <CardDescription>
            Credits consumed by enterprise members are charged to enterprise owner/admin wallet.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {creditUsage.length === 0 ? (
            <p className="text-sm text-gray-500">No credit usage yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Module</TableHead>
                  <TableHead>Credits</TableHead>
                  <TableHead>Charged To</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>When</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {creditUsage.slice(0, 50).map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell>{entry.actorEmail}</TableCell>
                    <TableCell className="capitalize">{entry.module}</TableCell>
                    <TableCell>{entry.credits}</TableCell>
                    <TableCell>{entry.chargedToUserId}</TableCell>
                    <TableCell>{entry.reason}</TableCell>
                    <TableCell>{new Date(entry.createdAt).toLocaleString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
