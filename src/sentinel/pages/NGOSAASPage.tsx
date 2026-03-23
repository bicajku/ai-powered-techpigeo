/**
 * Sentinel SAAS - NGO SAAS Page
 *
 * Renders the NGO SAAS module for Enterprise users.
 * Blocked for non-Enterprise users at the RBAC level.
 */

import React, { useEffect, useState } from "react"
import { useSentinelAuth } from "../hooks/useSentinelAuth"
import { useRBAC } from "../hooks/useRBAC"
import { NGOSAASModule } from "../components/NGO/NGOSAASModule"
import { dbGetProjectsByOrg } from "../api/db"
import { dbCreateProject } from "../api/db"
import type { SentinelProject } from "../types/index"
import { v4 as uuidv4 } from "uuid"

export function NGOSAASPage() {
  const { user } = useSentinelAuth()
  const { hasNGOAccess } = useRBAC()
  const [projects, setProjects] = useState<SentinelProject[]>([])
  const [selectedProject, setSelectedProject] = useState<SentinelProject | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [showNewProject, setShowNewProject] = useState(false)
  const [newProjectName, setNewProjectName] = useState("")
  const [newProjectDesc, setNewProjectDesc] = useState("")
  const [isCreating, setIsCreating] = useState(false)

  const orgId = user?.organizationId ?? ""

  useEffect(() => {
    if (!orgId || !hasNGOAccess) {
      setIsLoading(false)
      return
    }
    const load = async () => {
      setIsLoading(true)
      try {
        const projs = await dbGetProjectsByOrg(orgId)
        setProjects(projs)
        setSelectedProject((prev) => prev ?? (projs.length > 0 ? projs[0] : null))
      } catch (err) {
        console.error("NGOSAASPage load error:", err)
      } finally {
        setIsLoading(false)
      }
    }
    void load()
  }, [orgId, hasNGOAccess])

  const handleCreateProject = async () => {
    if (!user || !newProjectName) return
    setIsCreating(true)

    const project: SentinelProject = {
      id: uuidv4(),
      organizationId: orgId,
      name: newProjectName,
      description: newProjectDesc,
      modulesEnabled: ["ngo-saas"],
      teamMemberIds: [user.id],
      createdBy: user.id,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      status: "ACTIVE",
    }

    try {
      await dbCreateProject(project)
      setProjects((prev) => [project, ...prev])
      setSelectedProject(project)
      setShowNewProject(false)
      setNewProjectName("")
      setNewProjectDesc("")
    } catch (err) {
      console.error("Create project error:", err)
    } finally {
      setIsCreating(false)
    }
  }

  if (!hasNGOAccess) {
    return (
      <div className="flex flex-col items-center justify-center min-h-64 py-16 px-6 text-center">
        <div className="text-5xl mb-4">🔒</div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">NGO SAAS Module</h2>
        <p className="text-gray-600 max-w-sm">
          This module is exclusively available to Enterprise subscribers with explicit access.
          Contact your administrator or{" "}
          <a href="mailto:sales@techpigeon.com.pk" className="text-indigo-600 underline">
            sales@techpigeon.com.pk
          </a>
          .
        </p>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Project Selector */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">NGO SAAS Module</h1>
          <p className="text-sm text-gray-500 mt-0.5">Enterprise — Project Management</p>
        </div>
        <button
          onClick={() => setShowNewProject(true)}
          className="px-4 py-2 bg-indigo-700 hover:bg-indigo-800 text-white text-sm font-medium rounded-lg transition-colors"
        >
          + New Project
        </button>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-gray-500">Loading projects…</div>
      ) : projects.length === 0 ? (
        <div className="text-center py-16 bg-gray-50 rounded-2xl border">
          <div className="text-4xl mb-3">📁</div>
          <h3 className="text-lg font-semibold text-gray-900 mb-1">No projects yet</h3>
          <p className="text-sm text-gray-500 mb-4">Create your first project to get started</p>
          <button
            onClick={() => setShowNewProject(true)}
            className="px-4 py-2 bg-indigo-700 hover:bg-indigo-800 text-white text-sm font-medium rounded-lg"
          >
            Create Project
          </button>
        </div>
      ) : (
        <div className="flex gap-6">
          {/* Project Sidebar */}
          <div className="w-56 flex-shrink-0">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              Projects
            </h3>
            <div className="space-y-1">
              {projects.map((project) => (
                <button
                  key={project.id}
                  onClick={() => setSelectedProject(project)}
                  className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors ${
                    selectedProject?.id === project.id
                      ? "bg-indigo-700 text-white"
                      : "text-gray-700 hover:bg-gray-100"
                  }`}
                >
                  <p className="font-medium truncate">{project.name}</p>
                  <p className={`text-xs truncate mt-0.5 ${
                    selectedProject?.id === project.id ? "text-indigo-200" : "text-gray-400"
                  }`}>
                    {project.id.slice(0, 8)}…
                  </p>
                </button>
              ))}
            </div>
          </div>

          {/* Project Content */}
          <div className="flex-1 min-w-0 bg-white rounded-2xl border p-6">
            {selectedProject ? (
              <NGOSAASModule
                projectId={selectedProject.id}
                organizationId={orgId}
              />
            ) : (
              <div className="text-center py-12 text-gray-400">Select a project</div>
            )}
          </div>
        </div>
      )}

      {/* New Project Dialog */}
      {showNewProject && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Create New Project</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Project Name *
                </label>
                <input
                  type="text"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  placeholder="e.g. Youth Empowerment Program 2026"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <textarea
                  value={newProjectDesc}
                  onChange={(e) => setNewProjectDesc(e.target.value)}
                  placeholder="Brief description of this project"
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <p className="text-xs text-gray-500">
                A UUID will be automatically generated for this project.
              </p>
            </div>
            <div className="flex gap-3 justify-end mt-6">
              <button
                onClick={() => {
                  setShowNewProject(false)
                  setNewProjectName("")
                  setNewProjectDesc("")
                }}
                className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateProject}
                disabled={isCreating || !newProjectName}
                className="px-4 py-2 text-sm bg-indigo-700 hover:bg-indigo-800 text-white rounded-lg disabled:opacity-50"
              >
                {isCreating ? "Creating…" : "Create Project"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
