import { useCallback, useEffect, useRef, useState } from "react"
import { motion } from "framer-motion"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
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
} from "@/components/ui/dialog"
import {
  Users,
  ShieldCheck,
  User,
  Sparkle,
  Trash,
  ChartBar,
  FolderOpen,
  MagnifyingGlass,
  Eye,
  FileText,
  Bug,
  Key,
  Archive,
  ArrowCounterClockwise,
  Link as LinkIcon,
  ArrowsClockwise,
  CurrencyDollar,
} from "@phosphor-icons/react"
import { toast } from "sonner"
import { UserProfile, UserRole, SavedStrategy, SavedReviewDocument } from "@/types"
import { adminService } from "@/lib/admin"
import { ErrorLogsViewer } from "@/components/ErrorLogsViewer"
import { InviteManager } from "@/components/InviteManager"
import { BudgetConfigManager } from "@/components/BudgetConfigManager"
import { AdminSubscriptionPanel } from "@/components/AdminSubscriptionPanel"
import { AdminProviderRoutingPanel } from "@/components/AdminProviderRoutingPanel"
import { getSafeKVClient } from "@/lib/spark-shim"
import { fetchBackendProviderStatus, type BackendProviderStatus } from "@/lib/platform-client"
import { fetchAuthCapabilities, type AuthCapabilities } from "@/lib/auth-capabilities"
import { errorLogger } from "@/lib/error-logger"
import { getEnvConfig } from "@/lib/env-config"

export function AdminDashboard() {
  const [activeTab, setActiveTab] = useState("users")
  const [users, setUsers] = useState<UserProfile[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [stats, setStats] = useState({
    totalUsers: 0,
    totalAdmins: 0,
    totalClients: 0,
    totalStrategies: 0,
    totalReviews: 0,
    recentUsers: 0,
  })
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [roleChangeTarget, setRoleChangeTarget] = useState<{ email: string; newRole: UserRole } | null>(null)
  const [allStrategies, setAllStrategies] = useState<{ user: UserProfile; strategies: SavedStrategy[] }[]>([])
  const [allReviews, setAllReviews] = useState<{ user: UserProfile; reviews: SavedReviewDocument[] }[]>([])
  const [selectedStrategy, setSelectedStrategy] = useState<{ user: UserProfile; strategy: SavedStrategy } | null>(null)
  const [selectedReview, setSelectedReview] = useState<{ user: UserProfile; review: SavedReviewDocument } | null>(null)
  const [reviewActionTarget, setReviewActionTarget] = useState<{ userId: string; reviewId: string; action: "archive" | "unarchive" | "delete" } | null>(null)
  const [testerActionTarget, setTesterActionTarget] = useState<{ id: string; email: string; fullName: string; action: "promote" | "revoke" } | null>(null)
  const [providerStatus, setProviderStatus] = useState<BackendProviderStatus | null>(null)
  const [providerStatusError, setProviderStatusError] = useState<string | null>(null)
  const [providerStatusLoading, setProviderStatusLoading] = useState(false)
  const [authCapabilities, setAuthCapabilities] = useState<AuthCapabilities>({
    canSetPasswords: false,
    canManageProviderRouting: false,
    canSendInviteEmails: false,
    isSentinelCommander: false,
  })
  const hasLoadedOnceRef = useRef(false)
  const loadInFlightRef = useRef(false)
  const [testerUsers, setTesterUsers] = useState<Array<Pick<UserProfile, "id" | "email" | "fullName" | "role" | "lastLoginAt" | "createdAt">>>([])
  const [testerMaxUsers, setTesterMaxUsers] = useState(0)
  const [testerLoading, setTesterLoading] = useState(false)
  const [hasLoadedTesters, setHasLoadedTesters] = useState(false)
  const [strategiesLoading, setStrategiesLoading] = useState(false)
  const [reviewsLoading, setReviewsLoading] = useState(false)
  const [hasLoadedStrategies, setHasLoadedStrategies] = useState(false)
  const [hasLoadedReviews, setHasLoadedReviews] = useState(false)
  const [creatingTester, setCreatingTester] = useState(false)
  const [testerActionInFlight, setTesterActionInFlight] = useState(false)
  const [testerForm, setTesterForm] = useState({ email: "", fullName: "", password: "" })
  const envConfig = getEnvConfig()

  const loadTesterUsers = useCallback(async (force = false) => {
    if (!authCapabilities.isSentinelCommander) return
    if (testerLoading || (hasLoadedTesters && !force)) return
    setTesterLoading(true)
    try {
      const result = await adminService.listTesterUsers()
      setTesterUsers(result.testers)
      setTesterMaxUsers(result.maxTesters)
      setHasLoadedTesters(true)
    } catch (error) {
      console.error("Failed to load tester users:", error)
      toast.error(error instanceof Error ? error.message : "Failed to load tester users")
    } finally {
      setTesterLoading(false)
    }
  }, [authCapabilities.isSentinelCommander, hasLoadedTesters, testerLoading])

  const handleCreateTester = async () => {
    const email = testerForm.email.trim().toLowerCase()
    const fullName = testerForm.fullName.trim()
    const password = testerForm.password
    if (!email || !fullName || !password) {
      toast.error("Email, full name, and password are required")
      return
    }
    if (password.length < 8) {
      toast.error("Tester password must be at least 8 characters")
      return
    }

    setCreatingTester(true)
    try {
      const result = await adminService.createTesterUser({ email, fullName, password })
      if (!result.success) {
        toast.error(result.error || "Failed to create tester")
        return
      }
      toast.success("Tester account created (PRO tier, testing credits seeded)")
      setTesterForm({ email: "", fullName: "", password: "" })
      const refreshedUsers = await loadData(false, true)
      if (refreshedUsers) {
        await refreshLoadedSections(refreshedUsers)
      }
    } finally {
      setCreatingTester(false)
    }
  }

  const handleGenerateTesterPassword = () => {
    const randomChunk = () => Math.random().toString(36).slice(-4)
    const generated = `Ns-${randomChunk()}-${Date.now().toString().slice(-4)}!`
    setTesterForm((prev) => ({ ...prev, password: generated }))
    toast.success("Temporary tester password generated")
  }

  const handleCopyTesterInvite = async () => {
    const email = testerForm.email.trim().toLowerCase()
    const password = testerForm.password
    if (!email || !password) {
      toast.error("Enter tester email and password first")
      return
    }

    const accessUrl = window.location.origin
    const inviteText = [
      "NovusSparks Testing Access",
      "",
      `URL: ${accessUrl}`,
      `Email: ${email}`,
      `Temporary Password: ${password}`,
      "",
      "Access policy:",
      "- Available on configured NovusSparks environments",
      "- Tester role with PRO testing access",
      "- Please change your password after first login",
    ].join("\n")

    try {
      await navigator.clipboard.writeText(inviteText)
      toast.success("Tester invite text copied")
    } catch (error) {
      console.error("Failed to copy tester invite:", error)
      toast.error("Could not copy invite text")
    }
  }

  const loadProviderStatus = useCallback(async () => {
    setProviderStatusLoading(true)
    setProviderStatusError(null)
    try {
      const status = await fetchBackendProviderStatus()
      setProviderStatus(status)
    } catch (error) {
      setProviderStatus(null)
      setProviderStatusError(error instanceof Error ? error.message : "Failed to load backend provider status")
      await errorLogger.logError(
        "Failed to load backend provider status",
        error,
        "network",
        "medium"
      )
    } finally {
      setProviderStatusLoading(false)
    }
  }, [])

  const loadCapabilities = useCallback(async () => {
    try {
      const capabilities = await fetchAuthCapabilities()
      setAuthCapabilities(capabilities)
    } catch (error) {
      setAuthCapabilities({
        canSetPasswords: false,
        canManageProviderRouting: false,
        canSendInviteEmails: false,
        isSentinelCommander: false,
      })
      await errorLogger.logError(
        "Failed to load auth capabilities",
        error,
        "authentication",
        "medium"
      )
    }
  }, [])

  const buildBaseStats = (allUsers: UserProfile[]) => {
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
    const recentUsers = allUsers.filter((user) => user.lastLoginAt && user.lastLoginAt >= sevenDaysAgo).length

    return {
      totalUsers: allUsers.length,
      totalAdmins: allUsers.filter((user) => user.role === "admin").length,
      totalClients: allUsers.filter((user) => user.role === "client").length,
      recentUsers,
    }
  }

  const loadStrategiesData = useCallback(async (targetUsers: UserProfile[], force = false) => {
    if (strategiesLoading || (hasLoadedStrategies && !force)) {
      return
    }

    setStrategiesLoading(true)
    try {
      const strategies = await adminService.getAllStrategies(targetUsers)
      setAllStrategies(strategies)
      setHasLoadedStrategies(true)
      setStats((prev) => ({
        ...prev,
        totalStrategies: strategies.reduce((sum, item) => sum + item.strategies.length, 0),
      }))
    } catch (error) {
      console.error("Failed to load strategies:", error)
      toast.error("Failed to load strategies")
    } finally {
      setStrategiesLoading(false)
    }
  }, [hasLoadedStrategies, strategiesLoading])

  const loadReviewsData = useCallback(async (targetUsers: UserProfile[], force = false) => {
    if (reviewsLoading || (hasLoadedReviews && !force)) {
      return
    }

    setReviewsLoading(true)
    try {
      const reviews = await adminService.getAllReviews(targetUsers)
      setAllReviews(reviews)
      setHasLoadedReviews(true)
      setStats((prev) => ({
        ...prev,
        totalReviews: reviews.reduce((sum, item) => sum + item.reviews.length, 0),
      }))
    } catch (error) {
      console.error("Failed to load reviews:", error)
      toast.error("Failed to load reviews")
    } finally {
      setReviewsLoading(false)
    }
  }, [hasLoadedReviews, reviewsLoading])

  const loadData = useCallback(async (showRefreshToast = false, force = false): Promise<UserProfile[] | null> => {
    if (loadInFlightRef.current) {
      return users
    }

    if (!force && !showRefreshToast && hasLoadedOnceRef.current) {
      return users
    }

    loadInFlightRef.current = true

    if (showRefreshToast) {
      setIsRefreshing(true)
      toast.info("Refreshing admin data...")
    } else {
      setIsLoading(true)
    }

    try {
      const allUsers = await adminService.getAllUsers()
      setUsers(allUsers)
      setStats((prev) => ({
        ...prev,
        ...buildBaseStats(allUsers),
      }))

      if (showRefreshToast) {
        toast.success("Admin data refreshed successfully")
      }
      return allUsers
    } catch (error) {
      console.error("Failed to load admin data:", error)
      toast.error("Failed to load admin data")
      await errorLogger.logError(
        "Failed to load admin dashboard data",
        error,
        "network",
        "medium"
      )
      return null
    } finally {
      hasLoadedOnceRef.current = true
      loadInFlightRef.current = false
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [users])

  useEffect(() => {
    void loadData(false, true)
  }, [])

  useEffect(() => {
    void loadProviderStatus()
    void loadCapabilities()
  }, [loadProviderStatus, loadCapabilities])

  useEffect(() => {
    if (!hasLoadedOnceRef.current) return
    if (activeTab === "strategies") {
      void loadStrategiesData(users)
    }
    if (activeTab === "reviews") {
      void loadReviewsData(users)
    }
    if (activeTab === "testers") {
      void loadTesterUsers()
    }
  }, [activeTab, loadReviewsData, loadStrategiesData, loadTesterUsers, users])

  const refreshLoadedSections = useCallback(async (refreshedUsers: UserProfile[]) => {
    if (activeTab === "strategies" || hasLoadedStrategies) {
      await loadStrategiesData(refreshedUsers, true)
    }
    if (activeTab === "reviews" || hasLoadedReviews) {
      await loadReviewsData(refreshedUsers, true)
    }
    if ((activeTab === "testers" || hasLoadedTesters) && authCapabilities.isSentinelCommander) {
      await loadTesterUsers(true)
    }
  }, [activeTab, authCapabilities.isSentinelCommander, hasLoadedReviews, hasLoadedStrategies, hasLoadedTesters, loadReviewsData, loadStrategiesData, loadTesterUsers])

  const handleRefresh = async () => {
    const refreshedUsers = await loadData(true, true)
    await Promise.all([loadProviderStatus(), loadCapabilities()])

    if (!refreshedUsers) {
      return
    }
    await refreshLoadedSections(refreshedUsers)
  }

  const handleRoleChange = async (email: string, newRole: UserRole) => {
    if (email === "admin") {
      toast.error("Cannot change master admin role")
      return
    }

    setRoleChangeTarget({ email, newRole })
  }

  const confirmRoleChange = async () => {
    if (!roleChangeTarget) return

    try {
      const result = await adminService.updateUserRole(roleChangeTarget.email, roleChangeTarget.newRole)
      if (result.success) {
        toast.success("Role updated successfully")
        const refreshedUsers = await loadData(false, true)
        if (refreshedUsers) {
          await refreshLoadedSections(refreshedUsers)
        }
      } else {
        toast.error(result.error || "Failed to update role")
      }
    } catch {
      toast.error("Failed to update role")
    } finally {
      setRoleChangeTarget(null)
    }
  }

  const handleDelete = async (email: string) => {
    if (email === "admin") {
      toast.error("Cannot delete master admin")
      return
    }

    setDeleteTarget(email)
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return

    try {
      const result = await adminService.deleteUser(deleteTarget)
      if (result.success) {
        toast.success("User deleted successfully")
        const refreshedUsers = await loadData(false, true)
        if (refreshedUsers) {
          await refreshLoadedSections(refreshedUsers)
        }
      } else {
        toast.error(result.error || "Failed to delete user")
      }
    } catch {
      toast.error("Failed to delete user")
    } finally {
      setDeleteTarget(null)
    }
  }

  const handleResetPassword = async (email: string) => {
    const newPassword = prompt(`Set a new password for ${email} (min 8 chars):`)
    if (!newPassword) return

    try {
      const result = await adminService.updateUserPassword(email, newPassword)
      if (result.success) {
        toast.success("Password updated successfully")
      } else {
        toast.error(result.error || "Failed to update password")
      }
    } catch (error) {
      toast.error("Failed to update password")
      await errorLogger.logError(
        "Admin password reset request failed",
        error,
        "authentication",
        "high",
        undefined,
        { targetEmail: email }
      )
    }
  }

  const handleTesterAction = (tester: { id: string; email: string; fullName: string }, action: "promote" | "revoke") => {
    setTesterActionTarget({
      id: tester.id,
      email: tester.email,
      fullName: tester.fullName,
      action,
    })
  }

  const confirmTesterAction = async () => {
    if (!testerActionTarget) return

    setTesterActionInFlight(true)
    try {
      const result = await adminService.manageTesterUser(testerActionTarget.id, testerActionTarget.action)
      if (!result.success) {
        toast.error(result.error || "Failed to update tester account")
        return
      }

      toast.success(
        testerActionTarget.action === "promote"
          ? "Tester migrated to general user successfully"
          : "Tester access revoked successfully"
      )

      await loadTesterUsers(true)
    } catch {
      toast.error(
        testerActionTarget.action === "promote"
          ? "Failed to migrate tester"
          : "Failed to revoke tester access"
      )
    } finally {
      setTesterActionInFlight(false)
      setTesterActionTarget(null)
    }
  }

  const handleArchiveReview = async (userId: string, reviewId: string) => {
    setReviewActionTarget({ userId, reviewId, action: "archive" })
  }

  const handleUnarchiveReview = async (userId: string, reviewId: string) => {
    setReviewActionTarget({ userId, reviewId, action: "unarchive" })
  }

  const handleDeleteReview = async (userId: string, reviewId: string) => {
    setReviewActionTarget({ userId, reviewId, action: "delete" })
  }

  const confirmReviewAction = async () => {
    if (!reviewActionTarget) return

    try {
      const { userId, reviewId, action } = reviewActionTarget
      const kv = getSafeKVClient()
      const reviews = await kv.get<SavedReviewDocument[]>(`saved-reviews-${userId}`) || []

      if (action === "delete") {
        const updatedReviews = reviews.filter(r => r.id !== reviewId)
        await kv.set(`saved-reviews-${userId}`, updatedReviews)
        toast.success("Review deleted successfully")
      } else if (action === "archive") {
        const updatedReviews = reviews.map(r =>
          r.id === reviewId ? { ...r, archived: true } : r
        )
        await kv.set(`saved-reviews-${userId}`, updatedReviews)
        toast.success("Review archived successfully")
      } else if (action === "unarchive") {
        const updatedReviews = reviews.map(r =>
          r.id === reviewId ? { ...r, archived: false } : r
        )
        await kv.set(`saved-reviews-${userId}`, updatedReviews)
        toast.success("Review unarchived successfully")
      }

      const refreshedUsers = await loadData(false, true)
      if (refreshedUsers) {
        await refreshLoadedSections(refreshedUsers)
      }
    } catch (error) {
      console.error("Failed to perform review action:", error)
      toast.error(`Failed to ${reviewActionTarget.action} review`)
    } finally {
      setReviewActionTarget(null)
    }
  }

  const formatDate = (timestamp: number | null | undefined) => {
    if (!timestamp || timestamp <= 0) return "-"
    return new Date(timestamp).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Sparkle size={40} weight="duotone" className="text-primary animate-pulse" />
      </div>
    )
  }

  return (
    <>
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete User</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this user? This will permanently delete their account and all associated data including saved strategies.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!roleChangeTarget} onOpenChange={() => setRoleChangeTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Change User Role</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to change this user's role to {roleChangeTarget?.newRole}?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmRoleChange}>
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!reviewActionTarget} onOpenChange={() => setReviewActionTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {reviewActionTarget?.action === "delete" && "Delete Review"}
              {reviewActionTarget?.action === "archive" && "Archive Review"}
              {reviewActionTarget?.action === "unarchive" && "Unarchive Review"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {reviewActionTarget?.action === "delete" && "Are you sure you want to permanently delete this review? This action cannot be undone."}
              {reviewActionTarget?.action === "archive" && "This will move the review to the archived section. You can unarchive it later if needed."}
              {reviewActionTarget?.action === "unarchive" && "This will restore the review to the active section."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={confirmReviewAction}
              className={reviewActionTarget?.action === "delete" ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""}
            >
              {reviewActionTarget?.action === "delete" && "Delete"}
              {reviewActionTarget?.action === "archive" && "Archive"}
              {reviewActionTarget?.action === "unarchive" && "Unarchive"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!testerActionTarget} onOpenChange={() => !testerActionInFlight && setTesterActionTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {testerActionTarget?.action === "promote" ? "Migrate Tester to General User" : "Revoke Tester Access"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {testerActionTarget?.action === "promote"
                ? `This converts ${testerActionTarget?.email} into a regular user while keeping the same login.`
                : `This immediately disables sign-in for ${testerActionTarget?.email} and removes the tester account from the active list.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={testerActionInFlight}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmTesterAction}
              disabled={testerActionInFlight}
              className={testerActionTarget?.action === "revoke" ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : undefined}
            >
              {testerActionInFlight
                ? testerActionTarget?.action === "promote" ? "Migrating..." : "Revoking..."
                : testerActionTarget?.action === "promote" ? "Migrate User" : "Revoke Access"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="space-y-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <ShieldCheck size={28} weight="duotone" className="text-primary" />
              Admin Dashboard
            </h2>
            <Button
              onClick={() => {
                void handleRefresh()
              }}
              disabled={isRefreshing}
              variant="outline"
              size="sm"
              className="gap-2"
            >
              <ArrowsClockwise 
                size={16} 
                weight="bold" 
                className={isRefreshing ? "animate-spin" : ""}
              />
              {isRefreshing ? "Refreshing..." : "Refresh Stats"}
            </Button>
          </div>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-primary/10">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Users size={16} weight="duotone" />
                  Total Users
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-foreground">{stats.totalUsers}</div>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            <Card className="border-accent/30 bg-gradient-to-br from-accent/5 to-accent/10">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <ShieldCheck size={16} weight="duotone" />
                  Admins
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-foreground">{stats.totalAdmins}</div>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
          >
            <Card className="border-secondary/30 bg-gradient-to-br from-secondary/5 to-secondary/10">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <User size={16} weight="duotone" />
                  Clients
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-foreground">{stats.totalClients}</div>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.4 }}
          >
            <Card className="border-muted bg-gradient-to-br from-muted/30 to-muted/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Sparkle size={16} weight="duotone" />
                  Strategies
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-foreground">{hasLoadedStrategies ? stats.totalStrategies : "-"}</div>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.5 }}
          >
            <Card className="border-blue-500/30 bg-gradient-to-br from-blue-500/5 to-blue-500/10">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <FileText size={16} weight="duotone" />
                  Reviews
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-foreground">{hasLoadedReviews ? stats.totalReviews : "-"}</div>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.6 }}
          >
            <Card className="border-green-500/30 bg-gradient-to-br from-green-500/5 to-green-500/10">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <ChartBar size={16} weight="duotone" />
                  Active (7d)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-foreground">{stats.recentUsers}</div>
              </CardContent>
            </Card>
          </motion.div>
        </div>

        <Card className="border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center justify-between gap-3 flex-wrap">
              <span className="flex items-center gap-2"><Key size={16} weight="duotone" />Backend Provider Status</span>
              <Badge variant={providerStatus?.ok ? "default" : "secondary"}>{providerStatus?.ok ? "Connected" : "Not connected"}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <div className="rounded-lg border border-border/60 p-3 min-w-0">
                <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Backend API</p>
                <p className="font-medium break-all">{envConfig.backendApiBaseUrl || "Same-origin (/api)"}</p>
              </div>
              <div className="rounded-lg border border-border/60 p-3 min-w-0">
                <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Runtime</p>
                <p className="font-medium">{providerStatus?.runtime?.nodeVersion || "Unknown"}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <div className="rounded-lg border border-border/60 p-3 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Copilot</p>
                  <Badge variant={providerStatus?.providers?.copilot?.configured ? "default" : "secondary"}>
                    {providerStatus?.providers?.copilot?.configured ? "Configured" : "Missing"}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-2 break-all">Source: {providerStatus?.providers?.copilot?.authSource || "None"}</p>
              </div>
              <div className="rounded-lg border border-border/60 p-3 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Gemini</p>
                  <Badge variant={providerStatus?.providers?.gemini?.configured ? "default" : "secondary"}>
                    {providerStatus?.providers?.gemini?.configured ? "Configured" : "Missing"}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-2 break-all">Source: {providerStatus?.providers?.gemini?.authSource || "None"}</p>
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              Fallback order: {(providerStatus?.fallbackOrder || []).join(" -> ") || "Not available"}
            </p>
            {!envConfig.backendApiBaseUrl && (
              <p className="text-xs text-muted-foreground">Using same-origin backend discovery because VITE_BACKEND_API_BASE_URL is not set.</p>
            )}
            {providerStatusLoading && <p className="text-xs text-muted-foreground">Loading provider status...</p>}
            {providerStatusError && <p className="text-xs text-red-600 break-all">{providerStatusError}</p>}
          </CardContent>
        </Card>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.7 }}
        >
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <div className="mb-4 overflow-x-auto pb-1">
              <TabsList className="grid min-w-[1320px] grid-cols-9">
                <TabsTrigger value="users" className="gap-2">
                  <Users size={18} weight="bold" />
                  User Management
                </TabsTrigger>
                <TabsTrigger value="subscriptions" className="gap-2">
                  <CurrencyDollar size={18} weight="bold" />
                  Subscriptions
                </TabsTrigger>
                <TabsTrigger value="budget" className="gap-2">
                  <CurrencyDollar size={18} weight="bold" />
                  Budget & Limits
                </TabsTrigger>
                <TabsTrigger value="strategies" className="gap-2">
                  <FolderOpen size={18} weight="bold" />
                  All Strategies ({hasLoadedStrategies ? allStrategies.reduce((sum, item) => sum + item.strategies.length, 0) : "..."})
                </TabsTrigger>
                <TabsTrigger value="reviews" className="gap-2">
                  <MagnifyingGlass size={18} weight="bold" />
                  All Reviews ({hasLoadedReviews ? allReviews.reduce((sum, item) => sum + item.reviews.length, 0) : "..."})
                </TabsTrigger>
                <TabsTrigger value="invites" className="gap-2">
                  <LinkIcon size={18} weight="bold" />
                  Invites
                </TabsTrigger>
                <TabsTrigger value="testers" className="gap-2" disabled={!authCapabilities.isSentinelCommander}>
                  <Users size={18} weight="bold" />
                  Testers
                </TabsTrigger>
                <TabsTrigger value="errors" className="gap-2">
                  <Bug size={18} weight="bold" />
                  Error Logs
                </TabsTrigger>
                <TabsTrigger value="routing" className="gap-2" disabled={!authCapabilities.canManageProviderRouting}>
                  <Key size={18} weight="bold" />
                  Provider Routing
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="subscriptions">
              <AdminSubscriptionPanel
                users={users}
                adminEmail={users.find(u => u.email === "admin")?.email || "admin"}
                onDataChanged={() => {
                  void (async () => {
                    const refreshedUsers = await loadData(false, true)
                    if (refreshedUsers) {
                      await refreshLoadedSections(refreshedUsers)
                    }
                  })()
                }}
              />
            </TabsContent>

            <TabsContent value="budget">
              <BudgetConfigManager />
            </TabsContent>

            <TabsContent value="users">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg font-semibold">User Management</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>User</TableHead>
                          <TableHead>Email</TableHead>
                          <TableHead>Role</TableHead>
                          <TableHead>Plan</TableHead>
                          <TableHead>Pro Credits</TableHead>
                          <TableHead>Created</TableHead>
                          <TableHead>Last Login</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {users.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                              No users found
                            </TableCell>
                          </TableRow>
                        ) : (
                          users.map((user) => (
                            <TableRow key={user.id}>
                              <TableCell className="font-medium">{user.fullName}</TableCell>
                              <TableCell>{user.email}</TableCell>
                              <TableCell>
                                {user.email === "admin" ? (
                                  <Badge variant="default" className="bg-primary">
                                    <ShieldCheck size={14} weight="bold" className="mr-1" />
                                    Admin
                                  </Badge>
                                ) : (
                                  <Select
                                    value={user.role}
                                    onValueChange={(value) => handleRoleChange(user.email, value as UserRole)}
                                  >
                                    <SelectTrigger className="w-32 h-8">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="admin">
                                        <div className="flex items-center gap-1">
                                          <ShieldCheck size={14} />
                                          Admin
                                        </div>
                                      </SelectItem>
                                      <SelectItem value="client">
                                        <div className="flex items-center gap-1">
                                          <User size={14} />
                                          Client
                                        </div>
                                      </SelectItem>
                                      <SelectItem value="tester">
                                        <div className="flex items-center gap-1">
                                          <Users size={14} />
                                          Tester
                                        </div>
                                      </SelectItem>
                                    </SelectContent>
                                  </Select>
                                )}
                              </TableCell>
                              <TableCell>
                                <Badge variant={user.subscription?.plan === "pro" || user.subscription?.plan === "team" ? "default" : "secondary"} className="capitalize">
                                  {user.subscription?.plan || "Basic"}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                {user.subscription?.plan === "pro" || user.subscription?.plan === "team" ? user.subscription.proCredits : "-"}
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                {formatDate(user.createdAt)}
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                {formatDate(user.lastLoginAt)}
                              </TableCell>
                              <TableCell className="text-right">
                                {user.email !== "admin" && (
                                  <div className="flex items-center justify-end gap-1">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => handleResetPassword(user.email)}
                                      title={authCapabilities.canSetPasswords ? "Set Password" : "Requires Sentinel Commander permissions"}
                                      disabled={!authCapabilities.canSetPasswords}
                                    >
                                      <Key size={16} weight="bold" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => handleDelete(user.email)}
                                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                      title="Delete User"
                                    >
                                      <Trash size={16} weight="bold" />
                                    </Button>
                                  </div>
                                )}
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="strategies">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg font-semibold">All User Strategies</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Strategy Name</TableHead>
                          <TableHead>User</TableHead>
                          <TableHead>Description</TableHead>
                          <TableHead>Created</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {!hasLoadedStrategies || strategiesLoading ? (
                          <TableRow>
                            <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                              Loading strategies...
                            </TableCell>
                          </TableRow>
                        ) : allStrategies.reduce((sum, item) => sum + item.strategies.length, 0) === 0 ? (
                          <TableRow>
                            <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                              No strategies found
                            </TableCell>
                          </TableRow>
                        ) : (
                          allStrategies.flatMap(({ user, strategies }) =>
                            strategies.map((strategy) => (
                              <TableRow key={strategy.id}>
                                <TableCell className="font-medium">{strategy.name}</TableCell>
                                <TableCell>
                                  <div className="flex flex-col">
                                    <span className="text-sm">{user.fullName}</span>
                                    <span className="text-xs text-muted-foreground">{user.email}</span>
                                  </div>
                                </TableCell>
                                <TableCell className="max-w-md">
                                  <p className="text-sm line-clamp-2">{strategy.description}</p>
                                </TableCell>
                                <TableCell className="text-sm text-muted-foreground">
                                  {formatDate(strategy.timestamp)}
                                </TableCell>
                                <TableCell className="text-right">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setSelectedStrategy({ user, strategy })}
                                  >
                                    <Eye size={16} weight="bold" />
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))
                          )
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="reviews">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg font-semibold">All User Reviews</CardTitle>
                </CardHeader>
                <CardContent>
                  <Tabs defaultValue="active" className="w-full">
                    <TabsList className="grid w-full grid-cols-2 max-w-md mb-4">
                      <TabsTrigger value="active" className="gap-2">
                        <FileText size={16} weight="duotone" />
                        Active ({hasLoadedReviews ? allReviews.reduce((sum, item) => sum + item.reviews.filter(r => !r.archived).length, 0) : "..."})
                      </TabsTrigger>
                      <TabsTrigger value="archived" className="gap-2">
                        <FileText size={16} weight="duotone" />
                        Archived ({hasLoadedReviews ? allReviews.reduce((sum, item) => sum + item.reviews.filter(r => r.archived).length, 0) : "..."})
                      </TabsTrigger>
                    </TabsList>

                    <TabsContent value="active">
                      <div className="rounded-md border">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Review Name</TableHead>
                              <TableHead>User</TableHead>
                              <TableHead>File Name</TableHead>
                              <TableHead>Score</TableHead>
                              <TableHead>Created</TableHead>
                              <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {!hasLoadedReviews || reviewsLoading ? (
                              <TableRow>
                                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                                  Loading reviews...
                                </TableCell>
                              </TableRow>
                            ) : allReviews.reduce((sum, item) => sum + item.reviews.filter(r => !r.archived).length, 0) === 0 ? (
                              <TableRow>
                                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                                  No active reviews found
                                </TableCell>
                              </TableRow>
                            ) : (
                              allReviews.flatMap(({ user, reviews }) =>
                                reviews.filter(r => !r.archived).map((review) => (
                                  <TableRow key={review.id}>
                                    <TableCell className="font-medium">{review.name}</TableCell>
                                    <TableCell>
                                      <div className="flex flex-col">
                                        <span className="text-sm">{user.fullName}</span>
                                        <span className="text-xs text-muted-foreground">{user.email}</span>
                                      </div>
                                    </TableCell>
                                    <TableCell className="text-sm">{review.fileName}</TableCell>
                                    <TableCell>
                                      <Badge 
                                        variant={review.plagiarismResult.overallScore >= 80 ? "default" : "destructive"}
                                        className="gap-1"
                                      >
                                        {review.plagiarismResult.overallScore}%
                                      </Badge>
                                    </TableCell>
                                    <TableCell className="text-sm text-muted-foreground">
                                      {formatDate(review.timestamp)}
                                    </TableCell>
                                    <TableCell className="text-right">
                                      <div className="flex items-center justify-end gap-1">
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => setSelectedReview({ user, review })}
                                          title="View Details"
                                        >
                                          <Eye size={16} weight="bold" />
                                        </Button>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => handleArchiveReview(user.id, review.id)}
                                          title="Archive Review"
                                        >
                                          <Archive size={16} weight="bold" />
                                        </Button>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => handleDeleteReview(user.id, review.id)}
                                          className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                          title="Delete Review"
                                        >
                                          <Trash size={16} weight="bold" />
                                        </Button>
                                      </div>
                                    </TableCell>
                                  </TableRow>
                                ))
                              )
                            )}
                          </TableBody>
                        </Table>
                      </div>
                    </TabsContent>

                    <TabsContent value="archived">
                      <div className="rounded-md border">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Review Name</TableHead>
                              <TableHead>User</TableHead>
                              <TableHead>File Name</TableHead>
                              <TableHead>Score</TableHead>
                              <TableHead>Created</TableHead>
                              <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {!hasLoadedReviews || reviewsLoading ? (
                              <TableRow>
                                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                                  Loading reviews...
                                </TableCell>
                              </TableRow>
                            ) : allReviews.reduce((sum, item) => sum + item.reviews.filter(r => r.archived).length, 0) === 0 ? (
                              <TableRow>
                                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                                  No archived reviews found
                                </TableCell>
                              </TableRow>
                            ) : (
                              allReviews.flatMap(({ user, reviews }) =>
                                reviews.filter(r => r.archived).map((review) => (
                                  <TableRow key={review.id} className="opacity-75">
                                    <TableCell className="font-medium">{review.name}</TableCell>
                                    <TableCell>
                                      <div className="flex flex-col">
                                        <span className="text-sm">{user.fullName}</span>
                                        <span className="text-xs text-muted-foreground">{user.email}</span>
                                      </div>
                                    </TableCell>
                                    <TableCell className="text-sm">{review.fileName}</TableCell>
                                    <TableCell>
                                      <Badge 
                                        variant={review.plagiarismResult.overallScore >= 80 ? "default" : "destructive"}
                                        className="gap-1"
                                      >
                                        {review.plagiarismResult.overallScore}%
                                      </Badge>
                                    </TableCell>
                                    <TableCell className="text-sm text-muted-foreground">
                                      {formatDate(review.timestamp)}
                                    </TableCell>
                                    <TableCell className="text-right">
                                      <div className="flex items-center justify-end gap-1">
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => setSelectedReview({ user, review })}
                                          title="View Details"
                                        >
                                          <Eye size={16} weight="bold" />
                                        </Button>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => handleUnarchiveReview(user.id, review.id)}
                                          title="Unarchive Review"
                                          className="text-accent hover:text-accent hover:bg-accent/10"
                                        >
                                          <ArrowCounterClockwise size={16} weight="bold" />
                                        </Button>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => handleDeleteReview(user.id, review.id)}
                                          className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                          title="Delete Review"
                                        >
                                          <Trash size={16} weight="bold" />
                                        </Button>
                                      </div>
                                    </TableCell>
                                  </TableRow>
                                ))
                              )
                            )}
                          </TableBody>
                        </Table>
                      </div>
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="invites">
              <Card>
                <CardContent className="pt-6">
                  <InviteManager
                    user={users.find(u => u.email === "admin") || { id: "admin", email: "admin", fullName: "Admin", role: "admin", createdAt: Date.now(), lastLoginAt: Date.now() } as UserProfile}
                    canSendInviteEmails={authCapabilities.canSendInviteEmails}
                  />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="testers">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg font-semibold">Tester Accounts</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="rounded-lg border border-border/60 bg-muted/20 p-3 text-sm text-muted-foreground">
                    Tester users are available on configured environments, default to PRO tier, and are seeded with testing credits. 
                    Limit: {testerMaxUsers || "-"}. Current: {testerUsers.length}. Use the key icon to reset passwords, the user icon to migrate a tester into a regular account, and the archive icon to revoke access.
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                    <input
                      className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                      placeholder="tester email"
                      value={testerForm.email}
                      onChange={(e) => setTesterForm((prev) => ({ ...prev, email: e.target.value }))}
                    />
                    <input
                      className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                      placeholder="full name"
                      value={testerForm.fullName}
                      onChange={(e) => setTesterForm((prev) => ({ ...prev, fullName: e.target.value }))}
                    />
                    <input
                      className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                      placeholder="temporary password"
                      type="password"
                      value={testerForm.password}
                      onChange={(e) => setTesterForm((prev) => ({ ...prev, password: e.target.value }))}
                    />
                    <Button onClick={handleCreateTester} disabled={creatingTester || !authCapabilities.isSentinelCommander}>
                      {creatingTester ? "Creating..." : "Create Tester"}
                    </Button>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" onClick={handleGenerateTesterPassword}>
                      <Sparkle size={14} weight="bold" className="mr-2" />
                      Generate Temporary Password
                    </Button>
                    <Button variant="outline" onClick={handleCopyTesterInvite}>
                      <LinkIcon size={14} weight="bold" className="mr-2" />
                      Copy Invite Text
                    </Button>
                  </div>

                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Email</TableHead>
                          <TableHead>Role</TableHead>
                          <TableHead>Created</TableHead>
                          <TableHead>Last Login</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {testerLoading || !hasLoadedTesters ? (
                          <TableRow>
                            <TableCell colSpan={6} className="text-center text-muted-foreground py-6">Loading tester accounts...</TableCell>
                          </TableRow>
                        ) : testerUsers.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={6} className="text-center text-muted-foreground py-6">No tester accounts found.</TableCell>
                          </TableRow>
                        ) : (
                          testerUsers.map((tester) => (
                            <TableRow key={tester.id}>
                              <TableCell className="font-medium">{tester.fullName}</TableCell>
                              <TableCell>{tester.email}</TableCell>
                              <TableCell>
                                <Badge variant="secondary">TESTER</Badge>
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground">{formatDate(tester.createdAt)}</TableCell>
                              <TableCell className="text-sm text-muted-foreground">{formatDate(tester.lastLoginAt)}</TableCell>
                              <TableCell className="text-right">
                                <div className="flex items-center justify-end gap-1">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleResetPassword(tester.email)}
                                    title={authCapabilities.canSetPasswords ? "Reset tester password" : "Requires Sentinel Commander permissions"}
                                    disabled={!authCapabilities.canSetPasswords}
                                  >
                                    <Key size={16} weight="bold" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleTesterAction(tester, "promote")}
                                    title={authCapabilities.isSentinelCommander ? "Migrate to general user" : "Requires Sentinel Commander permissions"}
                                    disabled={!authCapabilities.isSentinelCommander}
                                    className="text-primary hover:text-primary"
                                  >
                                    <User size={16} weight="bold" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleTesterAction(tester, "revoke")}
                                    title={authCapabilities.isSentinelCommander ? "Revoke tester access" : "Requires Sentinel Commander permissions"}
                                    disabled={!authCapabilities.isSentinelCommander}
                                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                  >
                                    <Archive size={16} weight="bold" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="errors">
              <ErrorLogsViewer />
            </TabsContent>

            <TabsContent value="routing">
              <AdminProviderRoutingPanel canManageProviderRouting={authCapabilities.canManageProviderRouting} />
            </TabsContent>
          </Tabs>
        </motion.div>
      </div>

      <Dialog open={!!selectedStrategy} onOpenChange={() => setSelectedStrategy(null)}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Strategy Details</DialogTitle>
          </DialogHeader>
          {selectedStrategy && (
            <div className="space-y-4">
              <div className="p-4 bg-muted/50 rounded-lg">
                <h4 className="font-semibold mb-2">Strategy Information</h4>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-muted-foreground">Name:</span>
                    <p className="font-medium">{selectedStrategy.strategy.name}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">User:</span>
                    <p className="font-medium">{selectedStrategy.user.fullName} ({selectedStrategy.user.email})</p>
                  </div>
                  <div className="col-span-2">
                    <span className="text-muted-foreground">Description:</span>
                    <p className="font-medium">{selectedStrategy.strategy.description}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Created:</span>
                    <p className="font-medium">{formatDate(selectedStrategy.strategy.timestamp)}</p>
                  </div>
                </div>
              </div>
              
              <div className="space-y-3">
                <div>
                  <h4 className="font-semibold mb-2">Marketing Copy</h4>
                  <div className="p-3 bg-muted/30 rounded-lg text-sm whitespace-pre-wrap">
                    {selectedStrategy.strategy.result.marketingCopy}
                  </div>
                </div>
                
                <div>
                  <h4 className="font-semibold mb-2">Visual Strategy</h4>
                  <div className="p-3 bg-muted/30 rounded-lg text-sm whitespace-pre-wrap">
                    {selectedStrategy.strategy.result.visualStrategy}
                  </div>
                </div>
                
                <div>
                  <h4 className="font-semibold mb-2">Target Audience</h4>
                  <div className="p-3 bg-muted/30 rounded-lg text-sm whitespace-pre-wrap">
                    {selectedStrategy.strategy.result.targetAudience}
                  </div>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!selectedReview} onOpenChange={() => setSelectedReview(null)}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Review Details</DialogTitle>
          </DialogHeader>
          {selectedReview && (
            <div className="space-y-4">
              <div className="p-4 bg-muted/50 rounded-lg">
                <h4 className="font-semibold mb-2">Review Information</h4>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-muted-foreground">Name:</span>
                    <p className="font-medium">{selectedReview.review.name}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">User:</span>
                    <p className="font-medium">{selectedReview.user.fullName} ({selectedReview.user.email})</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">File:</span>
                    <p className="font-medium">{selectedReview.review.fileName}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Created:</span>
                    <p className="font-medium">{formatDate(selectedReview.review.timestamp)}</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 bg-muted/30 rounded-lg text-center">
                  <div className="text-xs text-muted-foreground mb-1">Originality Score</div>
                  <div className="text-2xl font-bold">{selectedReview.review.plagiarismResult.overallScore}%</div>
                </div>
                <div className="p-3 bg-muted/30 rounded-lg text-center">
                  <div className="text-xs text-muted-foreground mb-1">Plagiarism</div>
                  <div className="text-2xl font-bold">{selectedReview.review.plagiarismResult.plagiarismPercentage}%</div>
                </div>
                <div className="p-3 bg-muted/30 rounded-lg text-center">
                  <div className="text-xs text-muted-foreground mb-1">AI Content</div>
                  <div className="text-2xl font-bold">{selectedReview.review.plagiarismResult.aiContentPercentage}%</div>
                </div>
              </div>

              <div>
                <h4 className="font-semibold mb-2">Summary</h4>
                <div className="p-3 bg-muted/30 rounded-lg text-sm whitespace-pre-wrap">
                  {selectedReview.review.summary}
                </div>
              </div>

              {selectedReview.review.plagiarismResult.highlights.length > 0 && (
                <div>
                  <h4 className="font-semibold mb-2">Plagiarism Highlights ({selectedReview.review.plagiarismResult.highlights.length})</h4>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {selectedReview.review.plagiarismResult.highlights.slice(0, 3).map((highlight, idx) => (
                      <div key={idx} className="p-2 bg-destructive/10 border border-destructive/20 rounded text-xs">
                        <Badge variant="destructive" className="mb-1">{highlight.severity}</Badge>
                        <p className="font-mono">{highlight.text.substring(0, 150)}...</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedReview.review.plagiarismResult.recommendations.length > 0 && (
                <div>
                  <h4 className="font-semibold mb-2">Recommendations</h4>
                  <ul className="space-y-1 text-sm">
                    {selectedReview.review.plagiarismResult.recommendations.slice(0, 5).map((rec, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <span className="text-primary mt-0.5">•</span>
                        <span>{rec}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
