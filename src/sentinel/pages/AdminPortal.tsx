/**
 * Sentinel SAAS - Admin Portal Page
 *
 * Routing wrapper for admin-level dashboards.
 * Sentinel Commander → AdminDashboard
 * ORG_ADMIN / TEAM_ADMIN → TeamAdminDashboard
 */

import React from "react"
import { useSentinelAuth } from "../hooks/useSentinelAuth"
import { AdminDashboard } from "../components/Dashboard/AdminDashboard"
import { TeamAdminDashboard } from "../components/Dashboard/TeamAdminDashboard"

export function AdminPortal() {
  const { user, isCommander, isOrgAdmin } = useSentinelAuth()

  if (!user) return null

  if (isCommander) {
    return <AdminDashboard />
  }

  if (isOrgAdmin) {
    return <TeamAdminDashboard />
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center p-8">
        <div className="text-5xl mb-4">🚫</div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">Access Denied</h2>
        <p className="text-gray-600">You don&apos;t have admin access to the Sentinel portal.</p>
      </div>
    </div>
  )
}
