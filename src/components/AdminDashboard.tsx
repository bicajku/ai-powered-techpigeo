import { useEffect, useState } from "react"
import { motion } from "framer-motion"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
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
  Users,
  ShieldCheck,
  User,
  Sparkle,
  Trash,
  UserSwitch,
  ChartBar,
} from "@phosphor-icons/react"
import { toast } from "sonner"
import { UserProfile, UserRole } from "@/types"
import { adminService } from "@/lib/admin"

export function AdminDashboard() {
  const [users, setUsers] = useState<UserProfile[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [stats, setStats] = useState({
    totalUsers: 0,
    totalAdmins: 0,
    totalClients: 0,
    totalStrategies: 0,
    recentUsers: 0,
  })
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [roleChangeTarget, setRoleChangeTarget] = useState<{ email: string; newRole: UserRole } | null>(null)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setIsLoading(true)
    try {
      const [allUsers, systemStats] = await Promise.all([
        adminService.getAllUsers(),
        adminService.getSystemStats(),
      ])
      setUsers(allUsers)
      setStats(systemStats)
    } catch (error) {
      console.error("Failed to load admin data:", error)
      toast.error("Failed to load admin data")
    } finally {
      setIsLoading(false)
    }
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
        await loadData()
      } else {
        toast.error(result.error || "Failed to update role")
      }
    } catch (error) {
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
        await loadData()
      } else {
        toast.error(result.error || "Failed to delete user")
      }
    } catch (error) {
      toast.error("Failed to delete user")
    } finally {
      setDeleteTarget(null)
    }
  }

  const formatDate = (timestamp: number) => {
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

      <div className="space-y-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <h2 className="text-2xl font-bold text-foreground mb-6 flex items-center gap-2">
            <ShieldCheck size={28} weight="duotone" className="text-primary" />
            Admin Dashboard
          </h2>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
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
                <div className="text-3xl font-bold text-foreground">{stats.totalStrategies}</div>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.5 }}
          >
            <Card className="border-green-500/30 bg-gradient-to-br from-green-500/5 to-green-500/10">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <ChartBar size={16} weight="duotone" />
                  New (7d)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-foreground">{stats.recentUsers}</div>
              </CardContent>
            </Card>
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.6 }}
        >
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
                      <TableHead>Created</TableHead>
                      <TableHead>Last Login</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
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
                                </SelectContent>
                              </Select>
                            )}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {formatDate(user.createdAt)}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {formatDate(user.lastLoginAt)}
                          </TableCell>
                          <TableCell className="text-right">
                            {user.email !== "admin" && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDelete(user.email)}
                                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                              >
                                <Trash size={16} weight="bold" />
                              </Button>
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
        </motion.div>
      </div>
    </>
  )
}
