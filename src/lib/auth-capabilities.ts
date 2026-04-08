export interface AuthCapabilities {
  canSetPasswords: boolean
  canManageProviderRouting: boolean
  canSendInviteEmails: boolean
  isSentinelCommander: boolean
}

const DEFAULT_CAPABILITIES: AuthCapabilities = {
  canSetPasswords: false,
  canManageProviderRouting: false,
  canSendInviteEmails: false,
  isSentinelCommander: false,
}

function getBackendBaseUrl(): string {
  if (typeof import.meta !== "undefined" && import.meta.env?.VITE_BACKEND_API_BASE_URL) {
    return import.meta.env.VITE_BACKEND_API_BASE_URL as string
  }
  return ""
}

function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  }

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
    // ignore cookie parse failures
  }

  return headers
}

export async function fetchAuthCapabilities(): Promise<AuthCapabilities> {
  const base = getBackendBaseUrl()
  const response = await fetch(`${base}/api/auth/capabilities`, {
    method: "GET",
    headers: getAuthHeaders(),
    credentials: "include",
  })

  if (!response.ok) {
    throw new Error(`Capabilities request failed (${response.status})`)
  }

  const data = await response.json() as {
    ok?: boolean
    capabilities?: Partial<AuthCapabilities>
  }

  return {
    ...DEFAULT_CAPABILITIES,
    ...(data.capabilities || {}),
  }
}
