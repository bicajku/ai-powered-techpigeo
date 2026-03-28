/**
 * Sentinel SAAS - Super Admin (Sentinel Commander) Dashboard
 *
 * Phase 4: Enhanced with filterable/paginated audit log, audit stats,
 * system overview, and module subscription management tab.
 */

import React, { useEffect, useState, useCallback } from "react"
import { useSentinelAuth } from "../../hooks/useSentinelAuth"
import { AuditLogViewer } from "./AuditLogViewer"
import { dbListUsers } from "../../api/db"
import {
  listAllSubscriptions,
  assignSubscription,
  getUpgradeRequests,
  reviewUpgradeRequest,
  type UpgradeRequest,
} from "../../api/subscription"
import { SUBSCRIPTION_DEFINITIONS, SENTINEL_MODULES } from "../../config"
import type {
  SentinelUser,
  UserSubscription,
  SubscriptionTier,
  AuditLogEntry,
  AuditAction,
  AuditLogQuery,
  AuditStats,
  SystemStats,
  OrgModuleSubscription,
} from "../../types/index"

// ─────────────────────────── Backend API helpers ─────────────────

function getApiBase(): string {
  if (typeof import.meta !== "undefined" && import.meta.env?.VITE_BACKEND_API_BASE_URL) {
    return import.meta.env.VITE_BACKEND_API_BASE_URL;
  }
  return "";
}

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem("sentinel-auth-token")
  const headers: Record<string, string> = token
    ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
    : { "Content-Type": "application/json" }
  // M1 fix: Attach CSRF token from cookie
  try {
    const csrfMatch = document.cookie
      .split(";")
      .map((c: string) => c.trim())
      .find((c: string) => c.startsWith("__csrf="))
    if (csrfMatch) {
      headers["X-CSRF-Token"] = csrfMatch.slice("__csrf=".length)
    }
  } catch {
    // cookie unavailable
  }
  return headers
}

async function fetchApi<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${getApiBase()}${path}`, {
    ...init,
    headers: { ...getAuthHeaders(), ...(init?.headers || {}) },
    credentials: "include", // M1: Send CSRF cookie
  })
  return res.json() as Promise<T>
}

// ─────────────────────────── Types ───────────────────────────────

type AdminTab = "overview" | "users" | "subscriptions" | "requests" | "audit" | "module-subs"

interface AuditPageResponse {
  ok: boolean
  logs: AuditLogEntry[]
  total: number
  limit: number
  offset: number
}

interface AuditStatsResponse extends AuditStats {
  ok: boolean
}

interface SystemStatsResponse extends SystemStats {
  ok: boolean
}

interface OrgModSubsResponse {
  ok: boolean
  subscriptions: OrgModuleSubscription[]
}

// ─────────────────────────── Helpers ─────────────────────────────

const ACTION_COLORS: Record<string, string> = {
  LOGIN: "bg-blue-100 text-blue-800",
  LOGOUT: "bg-gray-100 text-gray-600",
  CREATE: "bg-green-100 text-green-800",
  READ: "bg-sky-100 text-sky-700",
  UPDATE: "bg-yellow-100 text-yellow-800",
  DELETE: "bg-red-100 text-red-700",
  EXPORT: "bg-purple-100 text-purple-700",
  UPLOAD: "bg-teal-100 text-teal-700",
  ASSIGN_ROLE: "bg-indigo-100 text-indigo-700",
  ASSIGN_SUBSCRIPTION: "bg-orange-100 text-orange-700",
  SUBMIT: "bg-cyan-100 text-cyan-700",
  APPROVE: "bg-emerald-100 text-emerald-700",
  SIGN: "bg-violet-100 text-violet-700",
  PUBLISH: "bg-lime-100 text-lime-800",
  REVERT: "bg-amber-100 text-amber-800",
}

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: "bg-green-100 text-green-700",
  TRIAL: "bg-blue-100 text-blue-700",
  GRACE_PERIOD: "bg-yellow-100 text-yellow-700",
  EXPIRED: "bg-red-100 text-red-700",
  CANCELLED: "bg-gray-100 text-gray-600",
  SUSPENDED: "bg-orange-100 text-orange-700",
}

const ALL_ACTIONS: AuditAction[] = [
  "LOGIN", "LOGOUT", "CREATE", "READ", "UPDATE", "DELETE",
  "EXPORT", "UPLOAD", "ASSIGN_ROLE", "ASSIGN_SUBSCRIPTION",
  "SUBMIT", "APPROVE", "SIGN", "PUBLISH", "REVERT",
]

function formatTs(ts: number): string {
  return new Date(ts).toLocaleString()
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString()
}

// ─────────────────────────── Component ───────────────────────────

export function AdminDashboard() {
  const { user, logout } = useSentinelAuth()
  const [activeTab, setActiveTab] = useState<AdminTab>("overview")

  // Legacy data (users, subs, requests)
  const [users, setUsers] = useState<SentinelUser[]>([])
  const [subscriptions, setSubscriptions] = useState<UserSubscription[]>([])
  const [upgradeRequests, setUpgradeRequests] = useState<UpgradeRequest[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // System stats (overview tab)
  const [systemStats, setSystemStats] = useState<SystemStats | null>(null)

  // Module subscriptions (module-subs tab)
  const [modSubs, setModSubs] = useState<OrgModuleSubscription[]>([])
  const [modSubsLoading, setModSubsLoading] = useState(false)

  // Assignment dialog
  const [assignTarget, setAssignTarget] = useState<string | null>(null)
  const [assignTier, setAssignTier] = useState<SubscriptionTier>("BASIC")
  const [isAssigning, setIsAssigning] = useState(false)
  const [assignError, setAssignError] = useState<string | null>(null)

  // ── Data loading ──

  const loadLegacyData = useCallback(async () => {
    setIsLoading(true)
    try {
      const [u, s, r] = await Promise.all([
        dbListUsers(),
        listAllSubscriptions(),
        getUpgradeRequests(),
      ])
      setUsers(u)
      setSubscriptions(s)
      setUpgradeRequests(r)
    } catch (err) {
      console.error("AdminDashboard load error:", err)
    } finally {
      setIsLoading(false)
    }
  }, [])

  const loadSystemStats = useCallback(async () => {
    try {
      const resp = await fetchApi<SystemStatsResponse>("/api/sentinel/admin/stats")
      if (resp.ok) setSystemStats(resp)
    } catch (err) {
      console.error("System stats error:", err)
    }
  }, [])

  const loadModSubs = useCallback(async () => {
    setModSubsLoading(true)
    try {
      // Sentinel Commander sees all orgs — for now load current user's org
      const resp = await fetchApi<OrgModSubsResponse>("/api/sentinel/org/subscriptions")
      if (resp.ok) setModSubs(resp.subscriptions)
    } catch (err) {
      console.error("Module subs error:", err)
    } finally {
      setModSubsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadLegacyData()
    void loadSystemStats()
  }, [loadLegacyData, loadSystemStats])

  useEffect(() => {
    if (activeTab === "module-subs") void loadModSubs()
  }, [activeTab, loadModSubs])

  // ── Handlers ──

  const handleAssignSubscription = async () => {
    if (!assignTarget || !user) return
    setIsAssigning(true)
    setAssignError(null)

    const targetUser = users.find((u) => u.id === assignTarget)
    if (!targetUser?.organizationId) {
      setAssignError("User has no organization. Create one first.")
      setIsAssigning(false)
      return
    }

    const result = await assignSubscription({
      userId: assignTarget,
      tier: assignTier,
      assignedBy: user.id,
      organizationId: targetUser.organizationId,
    })

    if (result.success) {
      setAssignTarget(null)
      await loadLegacyData()
    } else {
      setAssignError(result.error ?? "Assignment failed")
    }
    setIsAssigning(false)
  }

  const handleReviewRequest = async (requestId: string, action: "APPROVED" | "REJECTED") => {
    if (!user) return
    await reviewUpgradeRequest(requestId, action, user.id)
    await loadLegacyData()
  }

  const TABS: { id: AdminTab; label: string; badge?: number }[] = [
    { id: "overview", label: "Overview" },
    { id: "users", label: "Users" },
    { id: "subscriptions", label: "Subscriptions" },
    { id: "requests", label: "Requests", badge: upgradeRequests.filter((r) => r.status === "PENDING").length },
    { id: "audit", label: "Audit Log" },
    { id: "module-subs", label: "Module Subs" },
  ]

  const tabClass = (tab: AdminTab) =>
    `px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
      activeTab === tab
        ? "bg-white text-indigo-700 border-b-2 border-indigo-600"
        : "text-gray-600 hover:text-gray-900"
    }`

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-indigo-900 text-white px-6 py-4 flex items-center justify-between shadow">
        <div className="flex items-center gap-3">
          <span className="text-2xl">&#x1F6E1;</span>
          <div>
            <h1 className="font-bold text-lg leading-tight">Sentinel Commander</h1>
            <p className="text-indigo-300 text-xs">{user?.email}</p>
          </div>
        </div>
        <button onClick={logout} className="text-indigo-200 hover:text-white text-sm transition-colors">
          Sign out
        </button>
      </header>

      {/* Tabs */}
      <div className="px-6 pt-4 bg-gray-50 border-b flex gap-1 overflow-x-auto">
        {TABS.map((tab) => (
          <button key={tab.id} className={tabClass(tab.id)} onClick={() => setActiveTab(tab.id)}>
            {tab.label}
            {tab.badge ? (
              <span className="ml-1 bg-red-500 text-white text-xs rounded-full px-1.5">{tab.badge}</span>
            ) : null}
          </button>
        ))}
      </div>

      <main className="p-6">
        {isLoading && activeTab !== "audit" && activeTab !== "overview" && activeTab !== "module-subs" ? (
          <div className="text-center py-12 text-gray-500">Loading...</div>
        ) : (
          <>
            {/* ═══ Overview Tab ═══ */}
            {activeTab === "overview" && (
              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-4">System Overview</h2>
                {systemStats ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 mb-6">
                    {[
                      { label: "Total Users", value: systemStats.users.total, sub: `${systemStats.users.active} active` },
                      { label: "Organizations", value: systemStats.organizations.total },
                      { label: "User Subscriptions", value: systemStats.subscriptions.total, sub: `${systemStats.subscriptions.active} active` },
                      { label: "Logins (7d)", value: systemStats.recentLogins7d },
                      { label: "Reports Total", value: systemStats.reports.total },
                      { label: "Reports - Draft", value: systemStats.reports.drafts },
                      { label: "Reports - Published", value: systemStats.reports.published },
                      { label: "Module Subs", value: systemStats.moduleSubscriptions.total, sub: `${systemStats.moduleSubscriptions.active} active` },
                    ].map((s) => (
                      <div key={s.label} className="bg-white rounded-xl border p-4 shadow-sm">
                        <div className="text-2xl font-bold text-gray-900">{s.value}</div>
                        <div className="text-sm text-gray-600">{s.label}</div>
                        {s.sub && <div className="text-xs text-gray-400 mt-1">{s.sub}</div>}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-400">Loading stats...</div>
                )}

                {/* Quick audit stats */}
                {auditStats ? (
                  <div className="bg-white rounded-xl border p-4 shadow-sm">
                    <h3 className="text-sm font-semibold text-gray-700 mb-3">Audit Activity (30 days)</h3>
                    <div className="flex gap-6 text-sm">
                      <div><span className="font-bold text-gray-900">{auditStats.totalEvents}</span> <span className="text-gray-500">events</span></div>
                      <div><span className="font-bold text-red-600">{auditStats.failedEvents}</span> <span className="text-gray-500">failures</span></div>
                    </div>
                    {auditStats.byAction.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {auditStats.byAction.slice(0, 8).map((b) => (
                          <span key={b.action} className={`inline-flex px-2 py-0.5 rounded-full text-xs ${ACTION_COLORS[b.action || ""] || "bg-gray-100 text-gray-700"}`}>
                            {b.action}: {b.count}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            )}

            {/* ═══ Users Tab ═══ */}
            {activeTab === "users" && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-gray-900">All Users ({users.length})</h2>
                </div>
                <div className="bg-white rounded-xl shadow-sm border overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        {["Name", "Email", "Role", "Organization", "Status", "Actions"].map((h) => (
                          <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {users.map((u) => (
                        <tr key={u.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 font-medium text-gray-900">{u.fullName}</td>
                          <td className="px-4 py-3 text-gray-600">{u.email}</td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                              u.role === "SENTINEL_COMMANDER" ? "bg-purple-100 text-purple-800"
                              : u.role === "ORG_ADMIN" ? "bg-indigo-100 text-indigo-800"
                              : "bg-gray-100 text-gray-800"
                            }`}>{u.role}</span>
                          </td>
                          <td className="px-4 py-3 text-gray-500 font-mono text-xs">{u.organizationId ? u.organizationId.slice(0, 12) + "..." : "--"}</td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs ${u.isActive ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                              {u.isActive ? "Active" : "Inactive"}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <button onClick={() => { setAssignTarget(u.id); setAssignError(null) }} className="text-indigo-600 hover:underline text-xs">
                              Assign Sub
                            </button>
                          </td>
                        </tr>
                      ))}
                      {users.length === 0 && (
                        <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">No users found</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ═══ Subscriptions Tab ═══ */}
            {activeTab === "subscriptions" && (
              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-4">User Subscriptions ({subscriptions.length})</h2>
                <div className="bg-white rounded-xl shadow-sm border overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        {["User ID", "Tier", "Status", "Assigned At", "Expires At"].map((h) => (
                          <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {subscriptions.map((s) => (
                        <tr key={s.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-gray-600 font-mono text-xs">{s.userId}</td>
                          <td className="px-4 py-3">
                            <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800">{s.tier}</span>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs ${s.status === "ACTIVE" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`}>
                              {s.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-gray-500 text-xs">{formatDate(s.assignedAt)}</td>
                          <td className="px-4 py-3 text-gray-500 text-xs">{s.expiresAt ? formatDate(s.expiresAt) : "Never"}</td>
                        </tr>
                      ))}
                      {subscriptions.length === 0 && (
                        <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">No subscriptions assigned yet</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ═══ Upgrade Requests Tab ═══ */}
            {activeTab === "requests" && (
              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Upgrade Requests</h2>
                <div className="space-y-4">
                  {upgradeRequests.map((req) => (
                    <div key={req.id} className="bg-white rounded-xl shadow-sm border p-4 flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-gray-900">{req.userName}</span>
                          <span className="text-gray-500 text-sm">{req.userEmail}</span>
                          <span className={`ml-auto inline-flex px-2 py-0.5 rounded-full text-xs ${
                            req.status === "PENDING" ? "bg-yellow-100 text-yellow-800"
                            : req.status === "APPROVED" ? "bg-green-100 text-green-800"
                            : "bg-red-100 text-red-800"
                          }`}>{req.status}</span>
                        </div>
                        <p className="text-sm text-gray-600">
                          {req.fromTier ?? "None"} &rarr; <strong>{req.toTier}</strong>
                        </p>
                        {req.message && <p className="text-sm text-gray-500 mt-1 italic">&ldquo;{req.message}&rdquo;</p>}
                        <p className="text-xs text-gray-400 mt-1">{new Date(req.createdAt).toLocaleString()}</p>
                      </div>
                      {req.status === "PENDING" && (
                        <div className="flex gap-2">
                          <button onClick={() => handleReviewRequest(req.id, "APPROVED")} className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white text-xs rounded-lg">Approve</button>
                          <button onClick={() => handleReviewRequest(req.id, "REJECTED")} className="px-3 py-1 bg-red-100 hover:bg-red-200 text-red-700 text-xs rounded-lg">Reject</button>
                        </div>
                      )}
                    </div>
                  ))}
                  {upgradeRequests.length === 0 && <div className="text-center py-12 text-gray-400">No upgrade requests</div>}
                </div>
              </div>
            )}

            {/* ═══ Audit Log Tab (Enhanced) ═══ */}
            {activeTab === "audit" && (
              <AuditLogViewer />
            )}

            {/* ═══ Module Subscriptions Tab ═══ */}
            {activeTab === "module-subs" && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-gray-900">
                    Org Module Subscriptions <span className="text-sm font-normal text-gray-500">({modSubs.length})</span>
                  </h2>
                  <button onClick={() => void loadModSubs()} className="text-sm text-indigo-600 hover:text-indigo-800">
                    Refresh
                  </button>
                </div>

                {modSubsLoading ? (
                  <div className="text-center py-8 text-gray-400">Loading...</div>
                ) : (
                  <div className="bg-white rounded-xl shadow-sm border overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 border-b">
                        <tr>
                          {["Module", "Tier", "Status", "Seats (used/max)", "Starts", "Expires", "Auto-Renew"].map((h) => (
                            <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {modSubs.map((s) => (
                          <tr key={s.id} className="hover:bg-gray-50">
                            <td className="px-4 py-3 font-medium text-gray-900">{s.moduleName}</td>
                            <td className="px-4 py-3">
                              <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800">{s.tier}</span>
                            </td>
                            <td className="px-4 py-3">
                              <span className={`inline-flex px-2 py-0.5 rounded-full text-xs ${STATUS_COLORS[s.status] || "bg-gray-100 text-gray-600"}`}>
                                {s.status}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-gray-600">
                              <span className="font-mono text-xs">-- / {s.maxSeats}</span>
                            </td>
                            <td className="px-4 py-3 text-gray-500 text-xs">{formatDate(s.startsAt)}</td>
                            <td className="px-4 py-3 text-gray-500 text-xs">{s.expiresAt ? formatDate(s.expiresAt) : "Never"}</td>
                            <td className="px-4 py-3">
                              <span className={`text-xs ${s.autoRenew ? "text-green-600" : "text-gray-400"}`}>
                                {s.autoRenew ? "Yes" : "No"}
                              </span>
                            </td>
                          </tr>
                        ))}
                        {modSubs.length === 0 && (
                          <tr>
                            <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                              No module subscriptions provisioned yet
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Available modules reference */}
                <div className="mt-6 bg-white rounded-xl border p-4 shadow-sm">
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">Available Modules</h3>
                  <div className="flex flex-wrap gap-2">
                    {Object.values(SENTINEL_MODULES).map((mod) => (
                      <span key={mod} className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs">{mod}</span>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </main>

      {/* Assign Subscription Dialog */}
      {assignTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Assign Subscription</h3>
            <p className="text-sm text-gray-600 mb-4">
              User: <code className="text-xs bg-gray-100 px-1 rounded">{assignTarget}</code>
            </p>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tier</label>
            <select
              value={assignTier}
              onChange={(e) => setAssignTier(e.target.value as SubscriptionTier)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-4"
            >
              {(Object.keys(SUBSCRIPTION_DEFINITIONS) as SubscriptionTier[]).map((tier) => (
                <option key={tier} value={tier}>{SUBSCRIPTION_DEFINITIONS[tier].label}</option>
              ))}
            </select>
            {assignError && (
              <div className="mb-4 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">{assignError}</div>
            )}
            <div className="flex gap-3 justify-end">
              <button onClick={() => setAssignTarget(null)} className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg">Cancel</button>
              <button onClick={handleAssignSubscription} disabled={isAssigning} className="px-4 py-2 text-sm bg-indigo-700 hover:bg-indigo-800 text-white rounded-lg disabled:opacity-50">
                {isAssigning ? "Assigning..." : "Assign"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
