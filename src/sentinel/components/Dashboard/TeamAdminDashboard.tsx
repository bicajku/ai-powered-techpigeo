/**
 * Sentinel SAAS - Team Admin Dashboard
 *
 * For ORG_ADMIN and TEAM_ADMIN roles.
 */

import React, { useEffect, useState } from "react"
import { useSentinelAuth } from "../../hooks/useSentinelAuth"
import { useSubscription } from "../../hooks/useSubscription"
import { useRBAC } from "../../hooks/useRBAC"
import { dbListUsers, dbGetProjectsByOrg } from "../../api/db"
import { SENTINEL_MODULES, SUBSCRIPTION_DEFINITIONS } from "../../config"
import type { SentinelUser, SentinelProject } from "../../types/index"

export function TeamAdminDashboard() {
  const { user, logout } = useSentinelAuth()
  const { tier, label, color } = useSubscription()
  const { isAdmin, isCommander } = useRBAC()

  const [teamMembers, setTeamMembers] = useState<SentinelUser[]>([])
  const [projects, setProjects] = useState<SentinelProject[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<"members" | "projects" | "modules">("members")

  const orgId = user?.organizationId ?? ""

  useEffect(() => {
    const load = async () => {
      if (!orgId) {
        setIsLoading(false)
        return
      }
      setIsLoading(true)
      try {
        const [members, projs] = await Promise.all([
          dbListUsers(orgId),
          dbGetProjectsByOrg(orgId),
        ])
        setTeamMembers(members)
        setProjects(projs)
      } catch (err) {
        console.error("TeamAdminDashboard load error:", err)
      } finally {
        setIsLoading(false)
      }
    }
    void load()
  }, [orgId])

  const tierDef = tier ? SUBSCRIPTION_DEFINITIONS[tier] : null
  const canManageModules = isAdmin || isCommander

  const tabClass = (tab: "members" | "projects" | "modules") =>
    `px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
      activeTab === tab
        ? "bg-white text-indigo-700 border-b-2 border-indigo-600"
        : "text-gray-600 hover:text-gray-900"
    }`

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="text-white px-6 py-4 flex items-center justify-between shadow" style={{ backgroundColor: color }}>
        <div className="flex items-center gap-3">
          <span className="text-2xl">🏢</span>
          <div>
            <h1 className="font-bold text-lg leading-tight">Team Dashboard</h1>
            <p className="text-xs opacity-80">{label} &bull; {user?.email}</p>
          </div>
        </div>
        <button onClick={logout} className="text-white/70 hover:text-white text-sm">
          Sign out
        </button>
      </header>

      {/* Subscription Banner */}
      <div className="bg-white border-b px-6 py-3 flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">Subscription:</span>
          <span
            className="inline-flex px-2.5 py-1 rounded-full text-xs font-semibold text-white"
            style={{ backgroundColor: color }}
          >
            {label}
          </span>
        </div>
        {tierDef && (
          <div className="flex gap-3 ml-4">
            <span className="text-xs text-gray-500">
              Members: {tierDef.maxMembers === null ? "Unlimited" : `${teamMembers.length}/${tierDef.maxMembers}`}
            </span>
            {tierDef.includesNGOSAAS && (
              <span className="text-xs text-green-600 font-medium">✓ NGO SAAS</span>
            )}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="px-6 pt-4 bg-gray-50 border-b flex gap-1">
        {(["members", "projects", "modules"] as const).map((tab) => (
          <button key={tab} className={tabClass(tab)} onClick={() => setActiveTab(tab)}>
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      <main className="p-6">
        {isLoading ? (
          <div className="text-center py-12 text-gray-500">Loading…</div>
        ) : (
          <>
            {/* Team Members */}
            {activeTab === "members" && (
              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Team Members ({teamMembers.length})</h2>
                <div className="bg-white rounded-xl shadow-sm border overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        {["Name", "Email", "Role", "Status"].map((h) => (
                          <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {teamMembers.map((m) => (
                        <tr key={m.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 font-medium text-gray-900">{m.fullName}</td>
                          <td className="px-4 py-3 text-gray-600">{m.email}</td>
                          <td className="px-4 py-3">
                            <span className="inline-flex px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-700">
                              {m.role}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs ${
                              m.isActive ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                            }`}>
                              {m.isActive ? "Active" : "Inactive"}
                            </span>
                          </td>
                        </tr>
                      ))}
                      {teamMembers.length === 0 && (
                        <tr>
                          <td colSpan={4} className="px-4 py-8 text-center text-gray-400">
                            No team members yet
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Projects */}
            {activeTab === "projects" && (
              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Projects ({projects.length})</h2>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {projects.map((project) => (
                    <div
                      key={project.id}
                      className="bg-white rounded-xl shadow-sm border p-4 hover:shadow-md transition-shadow"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <h3 className="font-medium text-gray-900 text-sm">{project.name}</h3>
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs ${
                          project.status === "ACTIVE" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"
                        }`}>
                          {project.status}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 mb-3 line-clamp-2">{project.description}</p>
                      <div className="text-xs text-gray-400">
                        <span>UUID: <code>{project.id.slice(0, 8)}…</code></span>
                        <br />
                        <span>{project.teamMemberIds.length} members</span>
                      </div>
                    </div>
                  ))}
                  {projects.length === 0 && (
                    <div className="col-span-3 text-center py-12 text-gray-400">
                      No projects yet. Enterprise users can create projects with UUID.
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Module Access */}
            {activeTab === "modules" && canManageModules && (
              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Module Access Management</h2>
                <p className="text-sm text-gray-600 mb-6">
                  Manage module access for team members. NGO SAAS module is exclusive to Enterprise subscribers.
                </p>
                <div className="grid gap-4 sm:grid-cols-2">
                  {Object.values(SENTINEL_MODULES).map((moduleName) => (
                    <div key={moduleName} className="bg-white rounded-xl shadow-sm border p-4">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="font-medium text-gray-900 text-sm capitalize">
                          {moduleName.replace(/-/g, " ")}
                        </h3>
                        {moduleName === SENTINEL_MODULES.NGO_SAAS && (
                          <span className="inline-flex px-2 py-0.5 rounded-full text-xs bg-amber-100 text-amber-800">
                            Enterprise Only
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500">
                        {teamMembers.length} team member{teamMembers.length !== 1 ? "s" : ""} in this organization
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}
