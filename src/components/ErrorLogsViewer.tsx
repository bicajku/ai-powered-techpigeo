import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { ScrollArea } from "@/components/ui/scroll-area"
import { errorLogger } from "@/lib/error-logger"
import { ErrorLog, ErrorSeverity, ErrorCategory } from "@/types"
import { Bug, CheckCircle, Trash, Warning, XCircle, Info } from "@phosphor-icons/react"
import { toast } from "sonner"
import { motion, AnimatePresence } from "framer-motion"

interface ErrorLogsViewerProps {
  userId?: string
}

export function ErrorLogsViewer({ userId }: ErrorLogsViewerProps) {
  const [errorLogs, setErrorLogs] = useState<ErrorLog[]>([])
  const [selectedCategory, setSelectedCategory] = useState<ErrorCategory | "all">("all")
  const [selectedSeverity, setSelectedSeverity] = useState<ErrorSeverity | "all">("all")
  const [showResolved, setShowResolved] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [errorStats, setErrorStats] = useState<{
    total: number
    byCategory: Record<ErrorCategory, number>
    bySeverity: Record<ErrorSeverity, number>
    resolved: number
    unresolved: number
    recentErrors: number
  } | null>(null)

  const loadErrorLogs = async () => {
    setIsLoading(true)
    try {
      const filters: {
        category?: ErrorCategory
        severity?: ErrorSeverity
        userId?: string
        resolved?: boolean
      } = {}

      if (selectedCategory !== "all") {
        filters.category = selectedCategory
      }
      if (selectedSeverity !== "all") {
        filters.severity = selectedSeverity
      }
      if (userId) {
        filters.userId = userId
      }
      if (!showResolved) {
        filters.resolved = false
      }

      const logs = await errorLogger.getErrorLogs(filters)
      const stats = await errorLogger.getErrorStats()
      
      setErrorLogs(logs)
      setErrorStats(stats)
    } catch (error) {
      console.error("Failed to load error logs:", error)
      toast.error("Failed to load error logs")
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadErrorLogs()
  }, [selectedCategory, selectedSeverity, showResolved, userId])

  const handleMarkResolved = async (errorId: string) => {
    try {
      await errorLogger.markErrorAsResolved(errorId)
      toast.success("Error marked as resolved")
      loadErrorLogs()
    } catch (error) {
      console.error("Failed to mark error as resolved:", error)
      toast.error("Failed to mark error as resolved")
    }
  }

  const handleClearResolved = async () => {
    try {
      await errorLogger.clearResolvedErrors()
      toast.success("All resolved errors cleared")
      loadErrorLogs()
    } catch (error) {
      console.error("Failed to clear resolved errors:", error)
      toast.error("Failed to clear resolved errors")
    }
  }

  const handleClearAll = async () => {
    if (!confirm("Are you sure you want to clear all error logs? This action cannot be undone.")) {
      return
    }
    try {
      await errorLogger.clearAllErrors()
      toast.success("All error logs cleared")
      loadErrorLogs()
    } catch (error) {
      console.error("Failed to clear all errors:", error)
      toast.error("Failed to clear all errors")
    }
  }

  const getSeverityIcon = (severity: ErrorSeverity) => {
    switch (severity) {
      case "critical":
        return <XCircle size={20} weight="fill" className="text-destructive" />
      case "high":
        return <Warning size={20} weight="fill" className="text-orange-500" />
      case "medium":
        return <Info size={20} weight="fill" className="text-yellow-500" />
      case "low":
        return <Info size={20} weight="fill" className="text-blue-500" />
    }
  }

  const getSeverityBadge = (severity: ErrorSeverity) => {
    const variants: Record<ErrorSeverity, string> = {
      critical: "bg-destructive text-destructive-foreground",
      high: "bg-orange-500 text-white",
      medium: "bg-yellow-500 text-white",
      low: "bg-blue-500 text-white",
    }
    return (
      <Badge className={variants[severity]}>
        {severity.toUpperCase()}
      </Badge>
    )
  }

  const getCategoryBadge = (category: ErrorCategory) => {
    return (
      <Badge variant="outline">
        {category}
      </Badge>
    )
  }

  return (
    <div className="space-y-6">
      {errorStats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Total Errors</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{errorStats.total}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {errorStats.recentErrors} in last 24h
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Unresolved</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-destructive">{errorStats.unresolved}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Require attention
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Critical Errors</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-orange-500">{errorStats.bySeverity.critical}</div>
              <p className="text-xs text-muted-foreground mt-1">
                High priority issues
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Resolved</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-green-500">{errorStats.resolved}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Fixed issues
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Bug size={24} weight="duotone" className="text-primary" />
                Error Logs
              </CardTitle>
              <CardDescription className="mt-2">
                View and manage application errors
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button
                onClick={handleClearResolved}
                variant="outline"
                size="sm"
                disabled={!errorStats || errorStats.resolved === 0}
              >
                <Trash size={16} weight="bold" className="mr-2" />
                Clear Resolved
              </Button>
              <Button
                onClick={handleClearAll}
                variant="destructive"
                size="sm"
                disabled={!errorStats || errorStats.total === 0}
              >
                <Trash size={16} weight="bold" className="mr-2" />
                Clear All
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex-1 min-w-[200px]">
                <Select
                  value={selectedCategory}
                  onValueChange={(value) => setSelectedCategory(value as ErrorCategory | "all")}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Filter by category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    <SelectItem value="authentication">Authentication</SelectItem>
                    <SelectItem value="generation">Generation</SelectItem>
                    <SelectItem value="storage">Storage</SelectItem>
                    <SelectItem value="export">Export</SelectItem>
                    <SelectItem value="network">Network</SelectItem>
                    <SelectItem value="validation">Validation</SelectItem>
                    <SelectItem value="system">System</SelectItem>
                    <SelectItem value="unknown">Unknown</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex-1 min-w-[200px]">
                <Select
                  value={selectedSeverity}
                  onValueChange={(value) => setSelectedSeverity(value as ErrorSeverity | "all")}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Filter by severity" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Severities</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Button
                variant={showResolved ? "default" : "outline"}
                onClick={() => setShowResolved(!showResolved)}
              >
                {showResolved ? "Hide Resolved" : "Show Resolved"}
              </Button>

              <Button
                variant="outline"
                onClick={loadErrorLogs}
              >
                Refresh
              </Button>
            </div>

            <ScrollArea className="h-[600px] rounded-lg border">
              <div className="p-4 space-y-3">
                {isLoading ? (
                  <div className="text-center py-8 text-muted-foreground">
                    Loading error logs...
                  </div>
                ) : errorLogs.length === 0 ? (
                  <div className="text-center py-8">
                    <CheckCircle size={48} weight="duotone" className="text-green-500 mx-auto mb-2" />
                    <p className="text-muted-foreground">No errors found</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      {showResolved ? "No errors match your filters" : "Try showing resolved errors"}
                    </p>
                  </div>
                ) : (
                  <AnimatePresence>
                    {errorLogs.map((error) => (
                      <motion.div
                        key={error.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                      >
                        <Alert className={error.resolved ? "opacity-60" : ""}>
                          <div className="flex items-start gap-3">
                            <div className="mt-0.5">
                              {getSeverityIcon(error.severity)}
                            </div>
                            <div className="flex-1 space-y-2">
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex items-center gap-2 flex-wrap">
                                  {getSeverityBadge(error.severity)}
                                  {getCategoryBadge(error.category)}
                                  {error.resolved && (
                                    <Badge className="bg-green-500 text-white">
                                      <CheckCircle size={14} weight="fill" className="mr-1" />
                                      Resolved
                                    </Badge>
                                  )}
                                </div>
                                <div className="text-xs text-muted-foreground whitespace-nowrap">
                                  {new Date(error.timestamp).toLocaleString()}
                                </div>
                              </div>

                              <AlertDescription className="space-y-2">
                                <div>
                                  <strong className="text-foreground">{error.message}</strong>
                                </div>

                                {error.stack && (
                                  <details className="text-xs">
                                    <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                                      View stack trace
                                    </summary>
                                    <pre className="mt-2 p-2 bg-muted rounded text-[10px] overflow-x-auto">
                                      {error.stack}
                                    </pre>
                                  </details>
                                )}

                                {error.metadata && Object.keys(error.metadata).length > 0 && (
                                  <details className="text-xs">
                                    <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                                      View metadata
                                    </summary>
                                    <pre className="mt-2 p-2 bg-muted rounded text-[10px] overflow-x-auto">
                                      {JSON.stringify(error.metadata, null, 2)}
                                    </pre>
                                  </details>
                                )}

                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                  <span>Type: {error.errorType}</span>
                                  {error.userId && <span>• User: {error.userId}</span>}
                                </div>
                              </AlertDescription>

                              {!error.resolved && (
                                <div className="flex items-center gap-2 pt-2">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleMarkResolved(error.id)}
                                  >
                                    <CheckCircle size={16} weight="bold" className="mr-1" />
                                    Mark Resolved
                                  </Button>
                                </div>
                              )}
                            </div>
                          </div>
                        </Alert>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                )}
              </div>
            </ScrollArea>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
