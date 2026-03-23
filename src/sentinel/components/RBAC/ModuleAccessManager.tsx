/**
 * Sentinel SAAS - Module Access Manager (RBAC UI)
 *
 * Allows admins to grant/revoke module access for team members.
 */

import React, { useEffect, useState } from "react"
import { useSentinelAuth } from "../../hooks/useSentinelAuth"
import { useRBAC } from "../../hooks/useRBAC"
import { dbListUsers, dbGetUserModulePermissions } from "../../api/db"
import { grantModuleAccess, revokeModuleAccess } from "../../api/rbac"
import { SENTINEL_MODULES } from "../../config"
import type { SentinelUser, UserModulePermission, ModuleAccessLevel } from "../../types/index"

interface ModuleAccessManagerProps {
  organizationId: string
}

export function ModuleAccessManager({ organizationId }: ModuleAccessManagerProps) {
  const { user } = useSentinelAuth()
  const { isAdmin, isCommander } = useRBAC()
  const [members, setMembers] = useState<SentinelUser[]>([])
  const [selectedUser, setSelectedUser] = useState<string | null>(null)
  const [permissions, setPermissions] = useState<UserModulePermission[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)

  const allModules = Object.values(SENTINEL_MODULES)

  useEffect(() => {
    const load = async () => {
      setIsLoading(true)
      try {
        const users = await dbListUsers(organizationId)
        setMembers(users.filter((u) => u.id !== user?.id))
      } catch (err) {
        console.error("ModuleAccessManager load error:", err)
      } finally {
        setIsLoading(false)
      }
    }
    void load()
  }, [organizationId, user?.id])

  const loadUserPermissions = async (userId: string) => {
    setSelectedUser(userId)
    setIsLoading(true)
    try {
      const perms = await dbGetUserModulePermissions(userId)
      setPermissions(perms)
    } catch (err) {
      console.error("Load permissions error:", err)
    } finally {
      setIsLoading(false)
    }
  }

  const hasPermission = (moduleName: string): boolean =>
    permissions.some((p) => p.moduleName === moduleName)

  const getPermissionLevel = (moduleName: string): ModuleAccessLevel | null =>
    permissions.find((p) => p.moduleName === moduleName)?.accessLevel ?? null

  const handleToggle = async (moduleName: string, hasAccess: boolean) => {
    if (!user || !selectedUser) return
    setIsSaving(true)
    setMessage(null)

    try {
      if (hasAccess) {
        // Revoke
        const result = await revokeModuleAccess({
          userId: selectedUser,
          organizationId,
          moduleName,
          revokedBy: user.id,
        })
        if (result.success) {
          setPermissions((prev) => prev.filter((p) => p.moduleName !== moduleName))
          setMessage({ type: "success", text: `Access to "${moduleName}" revoked` })
        } else {
          setMessage({ type: "error", text: result.error ?? "Failed to revoke" })
        }
      } else {
        // Grant
        const result = await grantModuleAccess({
          userId: selectedUser,
          organizationId,
          moduleName,
          accessLevel: "READ_WRITE",
          grantedBy: user.id,
        })
        if (result.success && result.permission) {
          setPermissions((prev) => [...prev.filter((p) => p.moduleName !== moduleName), result.permission!])
          setMessage({ type: "success", text: `Access to "${moduleName}" granted` })
        } else {
          setMessage({ type: "error", text: result.error ?? "Failed to grant" })
        }
      }
    } catch {
      setMessage({ type: "error", text: "An error occurred" })
    } finally {
      setIsSaving(false)
    }
  }

  if (!isAdmin && !isCommander) {
    return (
      <div className="text-center py-8 text-gray-500">
        You don&apos;t have permission to manage module access.
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold text-gray-900 mb-1">Module Access Manager</h3>
        <p className="text-sm text-gray-500">
          Assign or revoke module access for team members. NGO SAAS module can only be granted
          to Enterprise users.
        </p>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        {/* User List */}
        <div>
          <h4 className="text-sm font-medium text-gray-700 mb-2">Select Team Member</h4>
          <div className="bg-white rounded-xl border overflow-hidden">
            {isLoading && !selectedUser ? (
              <div className="p-4 text-center text-gray-400 text-sm">Loading…</div>
            ) : members.length === 0 ? (
              <div className="p-4 text-center text-gray-400 text-sm">No team members</div>
            ) : (
              members.map((member) => (
                <button
                  key={member.id}
                  onClick={() => loadUserPermissions(member.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 border-b last:border-b-0 transition-colors ${
                    selectedUser === member.id ? "bg-indigo-50" : ""
                  }`}
                >
                  <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 text-sm font-bold">
                    {member.fullName.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{member.fullName}</p>
                    <p className="text-xs text-gray-500 truncate">{member.email}</p>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Module Permissions */}
        <div>
          <h4 className="text-sm font-medium text-gray-700 mb-2">Module Permissions</h4>
          {!selectedUser ? (
            <div className="bg-gray-50 rounded-xl border p-8 text-center text-gray-400 text-sm">
              Select a team member to manage permissions
            </div>
          ) : (
            <div className="bg-white rounded-xl border overflow-hidden">
              {allModules.map((moduleName) => {
                const hasAccess = hasPermission(moduleName)
                const isNGO = moduleName === SENTINEL_MODULES.NGO_SAAS
                const canToggleNGO = isCommander

                return (
                  <div
                    key={moduleName}
                    className="flex items-center justify-between px-4 py-3 border-b last:border-b-0 hover:bg-gray-50"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 capitalize">
                        {moduleName.replace(/-/g, " ")}
                      </p>
                      {isNGO && (
                        <p className="text-xs text-amber-600 mt-0.5">
                          Enterprise only — Commander can grant
                        </p>
                      )}
                      {hasAccess && (
                        <p className="text-xs text-green-600 mt-0.5">
                          {getPermissionLevel(moduleName)}
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      disabled={isSaving || (isNGO && !canToggleNGO)}
                      onClick={() => handleToggle(moduleName, hasAccess)}
                      className={`relative inline-flex h-5 w-10 items-center rounded-full transition-colors disabled:opacity-40 ${
                        hasAccess ? "bg-indigo-600" : "bg-gray-300"
                      }`}
                      role="switch"
                      aria-checked={hasAccess}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                          hasAccess ? "translate-x-5" : "translate-x-1"
                        }`}
                      />
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {message && (
        <div
          className={`rounded-lg px-4 py-3 text-sm ${
            message.type === "success"
              ? "bg-green-50 border border-green-200 text-green-700"
              : "bg-red-50 border border-red-200 text-red-700"
          }`}
        >
          {message.text}
        </div>
      )}
    </div>
  )
}
