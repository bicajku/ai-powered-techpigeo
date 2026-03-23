/**
 * Sentinel SAAS - Super Admin (Sentinel Commander) Dashboard
 */

import React, { useEffect, useState } from "react"
import { useSentinelAuth } from "../../hooks/useSentinelAuth"
import { dbListUsers, dbGetAuditLogs } from "../../api/db"
import {
  listAllSubscriptions,
  assignSubscription,
  getUpgradeRequests,
  reviewUpgradeRequest,
  type UpgradeRequest,
} from "../../api/subscription"
import { SUBSCRIPTION_DEFINITIONS } from "../../config"
import type { SentinelUser, UserSubscription, SubscriptionTier } from "../../types/index"

type AdminTab = "users" | "subscriptions" | "requests" | "audit"

export function AdminDashboard() {
  const { user, logout } = useSentinelAuth()
  const [activeTab, setActiveTab] = useState<AdminTab>("users")

  const [users, setUsers] = useState<SentinelUser[]>([])
  const [subscriptions, setSubscriptions] = useState<UserSubscription[]>([])
  const [upgradeRequests, setUpgradeRequests] = useState<UpgradeRequest[]>([])
  const [auditLogs, setAuditLogs] = useState<Awaited<ReturnType<typeof dbGetAuditLogs>>>([])
  const [isLoading, setIsLoading] = useState(true)

  // Assignment dialog
  const [assignTarget, setAssignTarget] = useState<string | null>(null)
  const [assignTier, setAssignTier] = useState<SubscriptionTier>("BASIC")
  const [isAssigning, setIsAssigning] = useState(false)
  const [assignError, setAssignError] = useState<string | null>(null)

  const loadData = async () => {
    setIsLoading(true)
    try {
      const [u, s, r, a] = await Promise.all([
        dbListUsers(),
        listAllSubscriptions(),
        getUpgradeRequests(),
        dbGetAuditLogs(50),
      ])
      setUsers(u)
      setSubscriptions(s)
      setUpgradeRequests(r)
      setAuditLogs(a)
    } catch (err) {
      console.error("AdminDashboard load error:", err)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void loadData()
  }, [])

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
      await loadData()
    } else {
      setAssignError(result.error ?? "Assignment failed")
    }
    setIsAssigning(false)
  }

  const handleReviewRequest = async (requestId: string, action: "APPROVED" | "REJECTED") => {
    if (!user) return
    await reviewUpgradeRequest(requestId, action, user.id)
    await loadData()
  }

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
          <span className="text-2xl">🛡</span>
          <div>
            <h1 className="font-bold text-lg leading-tight">Sentinel Commander</h1>
            <p className="text-indigo-300 text-xs">{user?.email}</p>
          </div>
        </div>
        <button
          onClick={logout}
          className="text-indigo-200 hover:text-white text-sm transition-colors"
        >
          Sign out
        </button>
      </header>

      {/* Stats Bar */}
      <div className="bg-white border-b px-6 py-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Total Users", value: users.length, icon: "👤" },
          { label: "Active Subscriptions", value: subscriptions.filter((s) => s.status === "ACTIVE").length, icon: "📋" },
          { label: "Pending Requests", value: upgradeRequests.filter((r) => r.status === "PENDING").length, icon: "⏳" },
          { label: "Audit Events", value: auditLogs.length, icon: "📊" },
        ].map((stat) => (
          <div key={stat.label} className="text-center">
            <div className="text-2xl">{stat.icon}</div>
            <div className="text-xl font-bold text-gray-900">{stat.value}</div>
            <div className="text-xs text-gray-500">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="px-6 pt-4 bg-gray-50 border-b flex gap-1">
        {(["users", "subscriptions", "requests", "audit"] as AdminTab[]).map((tab) => (
          <button key={tab} className={tabClass(tab)} onClick={() => setActiveTab(tab)}>
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
            {tab === "requests" && upgradeRequests.filter((r) => r.status === "PENDING").length > 0 && (
              <span className="ml-1 bg-red-500 text-white text-xs rounded-full px-1.5">
                {upgradeRequests.filter((r) => r.status === "PENDING").length}
              </span>
            )}
          </button>
        ))}
      </div>

      <main className="p-6">
        {isLoading ? (
          <div className="text-center py-12 text-gray-500">Loading…</div>
        ) : (
          <>
            {/* Users Tab */}
            {activeTab === "users" && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-gray-900">All Users</h2>
                </div>
                <div className="bg-white rounded-xl shadow-sm border overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        {["Name", "Email", "Role", "Organization", "Status", "Actions"].map((h) => (
                          <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            {h}
                          </th>
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
                              u.role === "SENTINEL_COMMANDER"
                                ? "bg-purple-100 text-purple-800"
                                : u.role === "ORG_ADMIN"
                                ? "bg-indigo-100 text-indigo-800"
                                : "bg-gray-100 text-gray-800"
                            }`}>
                              {u.role}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-gray-500">{u.organizationId ?? "—"}</td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs ${
                              u.isActive ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                            }`}>
                              {u.isActive ? "Active" : "Inactive"}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <button
                              onClick={() => {
                                setAssignTarget(u.id)
                                setAssignError(null)
                              }}
                              className="text-indigo-600 hover:underline text-xs"
                            >
                              Assign Subscription
                            </button>
                          </td>
                        </tr>
                      ))}
                      {users.length === 0 && (
                        <tr>
                          <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                            No users found
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Subscriptions Tab */}
            {activeTab === "subscriptions" && (
              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Active Subscriptions</h2>
                <div className="bg-white rounded-xl shadow-sm border overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        {["User ID", "Tier", "Status", "Assigned At", "Expires At"].map((h) => (
                          <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {subscriptions.map((s) => (
                        <tr key={s.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-gray-600 font-mono text-xs">{s.userId}</td>
                          <td className="px-4 py-3">
                            <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800">
                              {s.tier}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs ${
                              s.status === "ACTIVE" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"
                            }`}>
                              {s.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-gray-500 text-xs">
                            {new Date(s.assignedAt).toLocaleDateString()}
                          </td>
                          <td className="px-4 py-3 text-gray-500 text-xs">
                            {s.expiresAt ? new Date(s.expiresAt).toLocaleDateString() : "Never"}
                          </td>
                        </tr>
                      ))}
                      {subscriptions.length === 0 && (
                        <tr>
                          <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                            No subscriptions assigned yet
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Upgrade Requests Tab */}
            {activeTab === "requests" && (
              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Upgrade Requests</h2>
                <div className="space-y-4">
                  {upgradeRequests.map((req) => (
                    <div
                      key={req.id}
                      className="bg-white rounded-xl shadow-sm border p-4 flex items-start justify-between gap-4"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-gray-900">{req.userName}</span>
                          <span className="text-gray-500 text-sm">{req.userEmail}</span>
                          <span className={`ml-auto inline-flex px-2 py-0.5 rounded-full text-xs ${
                            req.status === "PENDING"
                              ? "bg-yellow-100 text-yellow-800"
                              : req.status === "APPROVED"
                              ? "bg-green-100 text-green-800"
                              : "bg-red-100 text-red-800"
                          }`}>
                            {req.status}
                          </span>
                        </div>
                        <p className="text-sm text-gray-600">
                          {req.fromTier ?? "None"} → <strong>{req.toTier}</strong>
                        </p>
                        {req.message && (
                          <p className="text-sm text-gray-500 mt-1 italic">&ldquo;{req.message}&rdquo;</p>
                        )}
                        <p className="text-xs text-gray-400 mt-1">
                          {new Date(req.createdAt).toLocaleString()}
                        </p>
                      </div>
                      {req.status === "PENDING" && (
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleReviewRequest(req.id, "APPROVED")}
                            className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white text-xs rounded-lg"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => handleReviewRequest(req.id, "REJECTED")}
                            className="px-3 py-1 bg-red-100 hover:bg-red-200 text-red-700 text-xs rounded-lg"
                          >
                            Reject
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                  {upgradeRequests.length === 0 && (
                    <div className="text-center py-12 text-gray-400">No upgrade requests</div>
                  )}
                </div>
              </div>
            )}

            {/* Audit Tab */}
            {activeTab === "audit" && (
              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Audit Log</h2>
                <div className="bg-white rounded-xl shadow-sm border overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        {["Time", "User", "Action", "Resource", "Status"].map((h) => (
                          <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {auditLogs.map((log) => (
                        <tr key={log.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                            {new Date(log.timestamp).toLocaleString()}
                          </td>
                          <td className="px-4 py-3 font-mono text-xs text-gray-600">
                            {log.userId.slice(0, 12)}…
                          </td>
                          <td className="px-4 py-3">
                            <span className="inline-flex px-2 py-0.5 rounded-full text-xs bg-blue-100 text-blue-800">
                              {log.action}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-gray-600">{log.resource}</td>
                          <td className="px-4 py-3">
                            <span className={`text-xs ${log.success ? "text-green-600" : "text-red-600"}`}>
                              {log.success ? "✓" : "✗"}
                            </span>
                          </td>
                        </tr>
                      ))}
                      {auditLogs.length === 0 && (
                        <tr>
                          <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                            No audit events yet
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
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
                <option key={tier} value={tier}>
                  {SUBSCRIPTION_DEFINITIONS[tier].label}
                </option>
              ))}
            </select>

            {assignError && (
              <div className="mb-4 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">
                {assignError}
              </div>
            )}

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setAssignTarget(null)}
                className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleAssignSubscription}
                disabled={isAssigning}
                className="px-4 py-2 text-sm bg-indigo-700 hover:bg-indigo-800 text-white rounded-lg disabled:opacity-50"
              >
                {isAssigning ? "Assigning…" : "Assign"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
