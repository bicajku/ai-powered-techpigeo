function getBackendBaseUrl(): string {
  if (typeof import.meta !== "undefined" && import.meta.env?.VITE_BACKEND_API_BASE_URL) {
    return import.meta.env.VITE_BACKEND_API_BASE_URL as string
  }
  return ""
}

function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" }
  const token = typeof localStorage !== "undefined"
    ? localStorage.getItem("sentinel-auth-token") || localStorage.getItem("sentinel_token")
    : null

  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  try {
    const csrfMatch = document.cookie
      .split(";")
      .map((c) => c.trim())
      .find((c) => c.startsWith("__csrf="))
    if (csrfMatch) {
      headers["X-CSRF-Token"] = csrfMatch.slice("__csrf=".length)
    }
  } catch {
    // Cookie access unavailable
  }

  return headers
}

export async function createOrganizationMember(payload: {
  email: string
  fullName: string
  password: string
  role: "owner" | "admin" | "contributor" | "viewer"
}): Promise<{ success: boolean; member?: Record<string, unknown>; error?: string }> {
  const roleMap: Record<string, string> = {
    owner: "ORG_ADMIN",
    admin: "ORG_ADMIN",
    contributor: "TEAM_MEMBER",
    viewer: "USER",
  }

  try {
    const res = await fetch(`${getBackendBaseUrl()}/api/sentinel/org/members`, {
      method: "POST",
      headers: getAuthHeaders(),
      credentials: "include",
      body: JSON.stringify({
        email: payload.email,
        fullName: payload.fullName,
        password: payload.password,
        role: roleMap[payload.role] || "TEAM_MEMBER",
      }),
    })

    const data = await res.json().catch(() => null)
    if (!res.ok || !data?.ok) {
      return { success: false, error: data?.error || "Failed to create organization member" }
    }

    return { success: true, member: data.member }
  } catch {
    return { success: false, error: "Backend unavailable" }
  }
}
