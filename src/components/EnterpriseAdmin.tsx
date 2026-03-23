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
} from "@/lib/enterprise-subscription"
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
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null)
  const [grantingNGOAccess, setGrantingNGOAccess] = useState<string | null>(null)

  useEffect(() => {
    loadSubscription()
  }, [organizationId])

  async function loadSubscription() {
    try {
      setLoading(true)
      const sub = await getEnterpriseSubscription(organizationId)
      if (!sub) {
        setError("Enterprise subscription not found")
      } else {
        setSubscription(sub)
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
        newMemberRole
      )

      if (result.success) {
        setNewMemberEmail("")
        setNewMemberName("")
        setNewMemberRole("contributor")
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
      setGrantingNGOAccess(memberId)
      const result = await grantNGOAccess(organizationId, memberId, level)
      if (result.success) {
        await loadSubscription()
      } else {
        setError(result.error || "Failed to grant NGO access")
      }
    } catch (err) {
      setError("Failed to grant NGO access")
      console.error(err)
    } finally {
      setGrantingNGOAccess(null)
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
  if (!subscription) return <div>Subscription not found</div>

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
              <p className="font-semibold">{new Date(subscription.renewalDate).toLocaleDateString()}</p>
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
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleRemoveMember(member.id)}
                      >
                        Remove
                      </Button>
                    </TableCell>
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
