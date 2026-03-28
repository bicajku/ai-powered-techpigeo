import React, { useState, useEffect, useCallback } from "react"
import { format } from "date-fns"
import { Download, MagnifyingGlass, Funnel, FunnelX, CaretDown, CaretUp } from "@phosphor-icons/react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { fetchApi } from "../../../lib/utils"

interface AuditLogEntry {
  id: string
  userId: string
  action: string
  resource: string
  resourceId?: string
  ipAddress?: string
  metadata?: Record<string, any>
  success: boolean
  timestamp: string
}

interface AuditStats {
  totalEvents: number
  failedEvents: number
  byDay: { day: string; count: number }[]
  byAction: { action: string; count: number }[]
}

interface AuditLogQuery {
  userId?: string
  action?: string
  resource?: string
  success?: boolean
  limit?: number
  offset?: number
}

interface AuditPageResponse {
  logs: AuditLogEntry[]
  total: number
}

const ACTION_COLORS: Record<string, string> = {
  LOGIN: "bg-blue-100 text-blue-700",
  LOGOUT: "bg-gray-100 text-gray-700",
  REGISTER: "bg-green-100 text-green-700",
  PASSWORD_RESET: "bg-amber-100 text-amber-700",
  MODULE_GRANT: "bg-purple-100 text-purple-700",
  MODULE_REVOKE: "bg-red-100 text-red-700",
  SUB_CREATED: "bg-indigo-100 text-indigo-700",
  REPORT_SIGN: "bg-teal-100 text-teal-700",
}

export function AuditLogViewer() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([])
  const [total, setTotal] = useState(0)
  const [stats, setStats] = useState<AuditStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [expandedRow, setExpandedRow] = useState<string | null>(null)
  const [showFilters, setShowFilters] = useState(false)
  
  const [query, setQuery] = useState<AuditLogQuery>({
    limit: 50,
    offset: 0
  })

  const loadLogs = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (query.limit) params.set("limit", String(query.limit))
      if (query.offset) params.set("offset", String(query.offset))
      if (query.userId) params.set("userId", query.userId)
      if (query.action) params.set("action", query.action)
      if (query.resource) params.set("resource", query.resource)
      if (query.success !== undefined) params.set("success", String(query.success))

      const resp = await fetchApi<AuditPageResponse>(`/api/sentinel/audit?${params}`)
      setLogs(resp.logs)
      setTotal(resp.total)
    } catch (err) {
      console.error("Failed to load audit logs", err)
    } finally {
      setLoading(false)
    }
  }, [query])

  const loadStats = useCallback(async () => {
    try {
      const resp = await fetchApi<AuditStats>(`/api/sentinel/audit/stats`)
      setStats(resp)
    } catch (err) {
      console.error("Failed to load stats", err)
    }
  }, [])

  useEffect(() => {
    void loadLogs()
    void loadStats()
  }, [loadLogs, loadStats])

  const handlePageChange = (newOffset: number) => {
    setQuery(prev => ({ ...prev, offset: newOffset }))
  }

  const exportCsv = () => {
    const headers = ["Timestamp,User ID,Action,Resource,Resource ID,IP Address,Status,Metadata"]
    const rows = logs.map(log => {
      return [
        log.timestamp,
        log.userId,
        log.action,
        log.resource,
        log.resourceId || "",
        log.ipAddress || "",
        log.success ? "SUCCESS" : "FAILED",
        log.metadata ? JSON.stringify(log.metadata).replace(/"/g, '""') : ""
      ].map(field => `"${field}"`).join(",")
    })
    const csv = headers.concat(rows).join("\n")
    const blob = new Blob([csv], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `audit-logs-${format(new Date(), "yyyy-MM-dd")}.csv`
    a.click()
  }

  const currentPage = Math.floor((query.offset || 0) / (query.limit || 50)) + 1
  const totalPages = Math.ceil(total / (query.limit || 50))

  return (
    <div className="space-y-6">
      {/* Stats Summary */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">{stats.totalEvents.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">Total Events (30d)</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-red-600">{stats.failedEvents.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">Failed Events (30d)</p>
            </CardContent>
          </Card>
          <Card className="md:col-span-2">
            <CardContent className="pt-6 flex gap-4 overflow-x-auto">
              {stats.byAction.slice(0, 4).map(action => (
                <div key={action.action} className="flex-1 min-w-[100px]">
                  <div className="text-sm font-medium">{action.action}</div>
                  <div className="text-2xl font-bold text-muted-foreground">{action.count}</div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Toolbar & Filters */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowFilters(!showFilters)}>
              {showFilters ? <FunnelX size={16} className="mr-2" /> : <Funnel size={16} className="mr-2" />}
              {showFilters ? "Hide Filters" : "Show Filters"}
            </Button>
            <Button variant="outline" size="sm" onClick={exportCsv} disabled={logs.length === 0}>
              <Download size={16} className="mr-2" />
              Export CSV
            </Button>
          </div>
          <div className="text-sm text-muted-foreground">
            Showing {logs.length} of {total} events
          </div>
        </div>

        {showFilters && (
          <Card className="bg-muted/30">
            <CardContent className="p-4 grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-medium">User ID</label>
                <div className="relative">
                  <MagnifyingGlass size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input 
                    placeholder="Search user ID..." 
                    className="pl-8"
                    value={query.userId || ""}
                    onChange={e => setQuery(p => ({ ...p, userId: e.target.value || undefined, offset: 0 }))}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium">Action</label>
                <Input 
                  placeholder="e.g. LOGIN, REPORT_SIGN" 
                  value={query.action || ""}
                  onChange={e => setQuery(p => ({ ...p, action: e.target.value || undefined, offset: 0 }))}
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium">Status</label>
                <Select
                  value={query.success === undefined ? "all" : String(query.success)}
                  onValueChange={(val) => setQuery(p => ({ 
                    ...p, 
                    success: val === "all" ? undefined : val === "true",
                    offset: 0
                  }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Events</SelectItem>
                    <SelectItem value="true">Success Only</SelectItem>
                    <SelectItem value="false">Failed Only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 flex items-end">
                <Button 
                  variant="ghost" 
                  className="w-full"
                  onClick={() => setQuery({ limit: 50, offset: 0 })}
                >
                  Clear Filters
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Data Table */}
      <Card>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[180px]">Timestamp</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Resource</TableHead>
                <TableHead>IP Address</TableHead>
                <TableHead className="w-[100px]">Status</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                    Loading audit logs...
                  </TableCell>
                </TableRow>
              ) : logs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                    No audit logs found matching criteria.
                  </TableCell>
                </TableRow>
              ) : (
                logs.map((log) => (
                  <React.Fragment key={log.id}>
                    <TableRow 
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => setExpandedRow(expandedRow === log.id ? null : log.id)}
                    >
                      <TableCell className="font-mono text-xs whitespace-nowrap">
                        {format(new Date(log.timestamp), "MMM d, yyyy HH:mm:ss")}
                      </TableCell>
                      <TableCell className="font-mono text-xs truncate max-w-[150px]" title={log.userId}>
                        {log.userId}
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium ${ACTION_COLORS[log.action] || "bg-secondary text-secondary-foreground"}`}>
                          {log.action}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs">
                        {log.resource}
                        {log.resourceId && <span className="block text-[10px] text-muted-foreground font-mono">{log.resourceId}</span>}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {log.ipAddress || "--"}
                      </TableCell>
                      <TableCell>
                        {log.success ? (
                          <span className="text-xs font-medium text-green-600">SUCCESS</span>
                        ) : (
                          <span className="text-xs font-medium text-red-600">FAILED</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {expandedRow === log.id ? <CaretUp size={16} /> : <CaretDown size={16} />}
                      </TableCell>
                    </TableRow>
                    {expandedRow === log.id && (
                      <TableRow className="bg-muted/30 hover:bg-muted/30">
                        <TableCell colSpan={7} className="p-4">
                          <div className="space-y-4">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                              <div>
                                <div className="font-medium text-muted-foreground mb-1">Event ID</div>
                                <div className="font-mono text-xs">{log.id}</div>
                              </div>
                              {log.resourceId && (
                                <div>
                                  <div className="font-medium text-muted-foreground mb-1">Resource ID</div>
                                  <div className="font-mono text-xs">{log.resourceId}</div>
                                </div>
                              )}
                            </div>
                            
                            {log.metadata && Object.keys(log.metadata).length > 0 && (
                              <div>
                                <div className="font-medium text-muted-foreground mb-2 text-sm">Event Metadata</div>
                                <pre className="bg-background border rounded-md p-4 overflow-x-auto text-xs font-mono">
                                  {JSON.stringify(log.metadata, null, 2)}
                                </pre>
                              </div>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination */}
        {total > (query.limit || 50) && (
          <div className="flex items-center justify-between p-4 border-t">
            <div className="text-sm text-muted-foreground">
              Page {currentPage} of {totalPages}
            </div>
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                disabled={currentPage <= 1 || loading}
                onClick={() => handlePageChange((query.offset || 0) - (query.limit || 50))}
              >
                Previous
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                disabled={currentPage >= totalPages || loading}
                onClick={() => handlePageChange((query.offset || 0) + (query.limit || 50))}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}
