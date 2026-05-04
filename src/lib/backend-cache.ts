/**
 * INVARIANT[enterprise-org-source-of-truth]
 * INVARIANT[ngo-team-source-of-truth]
 *
 * Read-through TTL cache for the new Phase 1 admin endpoints
 * (/api/sentinel/admin/enterprise/org/:id, /api/sentinel/admin/ngo-team/:adminId).
 *
 * Spark KV used to be the source of truth for enterprise org & NGO team
 * rosters, which caused multi-browser drift (every change was visible only
 * in the browser that made it). These tables now live in Neon; the cache
 * here is a per-tab in-memory mirror with a short TTL so we don't refetch on
 * every render but stale state is bounded.
 *
 * Per AI Bridging Policy: when the backend is unreachable, callers fall back
 * to whatever the caller defines (typically Spark KV) instead of failing.
 */

const DEFAULT_TTL_MS = 60_000

type CacheEntry<T> = { data: T; fetchedAt: number }

const cache = new Map<string, CacheEntry<unknown>>()

function getBackendBaseUrl(): string {
  const base = (typeof import.meta !== "undefined" && (import.meta as { env?: { VITE_BACKEND_URL?: string } }).env?.VITE_BACKEND_URL) || ""
  return typeof base === "string" ? base : ""
}

function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" }
  try {
    const token =
      typeof localStorage !== "undefined"
        ? localStorage.getItem("sentinel-auth-token") || localStorage.getItem("sentinel_token")
        : null
    if (token) headers.Authorization = `Bearer ${token}`
  } catch {
    /* localStorage unavailable */
  }
  return headers
}

export function invalidateBackendCache(key?: string): void {
  if (!key) {
    cache.clear()
    return
  }
  cache.delete(key)
}

/**
 * GET wrapper with TTL cache. Returns:
 * - { ok: true, data, fromCache } on success
 * - { ok: false, error } on backend error
 * - { ok: false, offline: true } when network is unreachable (caller decides
 *   whether to fall back to a local mirror)
 */
export async function cachedGet<T = unknown>(
  path: string,
  { ttlMs = DEFAULT_TTL_MS, force = false }: { ttlMs?: number; force?: boolean } = {},
): Promise<
  | { ok: true; data: T; fromCache: boolean }
  | { ok: false; error: string; offline?: boolean }
> {
  const key = `GET ${path}`
  const now = Date.now()
  if (!force) {
    const hit = cache.get(key) as CacheEntry<T> | undefined
    if (hit && now - hit.fetchedAt < ttlMs) {
      return { ok: true, data: hit.data, fromCache: true }
    }
  }
  try {
    const res = await fetch(`${getBackendBaseUrl()}${path}`, {
      method: "GET",
      headers: authHeaders(),
      credentials: "include",
    })
    if (res.status === 401 || res.status === 403) {
      return { ok: false, error: `auth ${res.status}` }
    }
    const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null
    if (!res.ok || !data?.ok) {
      return { ok: false, error: data?.error || `backend ${res.status}` }
    }
    cache.set(key, { data: data as unknown as T, fetchedAt: now })
    return { ok: true, data: data as unknown as T, fromCache: false }
  } catch {
    return { ok: false, error: "offline", offline: true }
  }
}

/**
 * POST wrapper that auto-invalidates cache keys after a successful mutation.
 */
export async function postAndInvalidate<TBody, TResp = unknown>(
  path: string,
  body: TBody,
  invalidateKeys: string[] = [],
): Promise<{ ok: boolean; data?: TResp; error?: string; offline?: boolean }> {
  try {
    const res = await fetch(`${getBackendBaseUrl()}${path}`, {
      method: "POST",
      headers: authHeaders(),
      credentials: "include",
      body: JSON.stringify(body),
    })
    const data = (await res.json().catch(() => null)) as
      | { ok?: boolean; error?: string }
      | null
    if (!res.ok || !data?.ok) {
      return { ok: false, error: data?.error || `backend ${res.status}` }
    }
    for (const k of invalidateKeys) cache.delete(k)
    return { ok: true, data: data as unknown as TResp }
  } catch {
    return { ok: false, error: "offline", offline: true }
  }
}

// ─── Typed helpers for the Phase 1 endpoints ───────────────────────────────

export interface BackendEnterpriseMember {
  id: string
  email: string
  fullName: string | null
  role: string
  moduleAccess: string[]
  individualProLicense: boolean
  ngoAccessLevel: string | null
  addedAt: number
  lastActiveAt: number
}

export interface BackendEnterpriseOrg {
  id: string
  ownerUserId: string
  name: string | null
  tier: string
  createdAt: number
  updatedAt: number
}

export async function fetchEnterpriseOrgFromBackend(orgId: string) {
  return cachedGet<{ ok: true; org: BackendEnterpriseOrg; members: BackendEnterpriseMember[] }>(
    `/api/sentinel/admin/enterprise/org/${encodeURIComponent(orgId)}`,
  )
}

export async function fetchNgoTeamFromBackend(adminUserId: string) {
  return cachedGet<{
    ok: true
    members: Array<{
      id: string
      email: string
      fullName: string | null
      accessLevel: string
      addedBy: string
      addedAt: number
    }>
  }>(`/api/sentinel/admin/ngo-team/${encodeURIComponent(adminUserId)}`)
}

export async function backendUpsertEnterpriseMember(payload: {
  orgId: string
  userId?: string
  email?: string
  role?: string
  moduleAccess?: string[]
  individualProLicense?: boolean
}) {
  const inv = `GET /api/sentinel/admin/enterprise/org/${encodeURIComponent(payload.orgId)}`
  return postAndInvalidate("/api/sentinel/admin/enterprise/members", payload, [inv])
}

export async function backendRemoveEnterpriseMember(orgId: string, userId: string) {
  const inv = `GET /api/sentinel/admin/enterprise/org/${encodeURIComponent(orgId)}`
  return postAndInvalidate("/api/sentinel/admin/enterprise/members/remove", { orgId, userId }, [inv])
}

export async function backendUpsertNgoTeamMember(payload: {
  adminUserId: string
  memberUserId?: string
  email?: string
  accessLevel: "owner" | "contributor" | "user"
}) {
  const inv = `GET /api/sentinel/admin/ngo-team/${encodeURIComponent(payload.adminUserId)}`
  return postAndInvalidate("/api/sentinel/admin/ngo-team/upsert", payload, [inv])
}

export async function backendRemoveNgoTeamMember(adminUserId: string, memberUserId: string) {
  const inv = `GET /api/sentinel/admin/ngo-team/${encodeURIComponent(adminUserId)}`
  return postAndInvalidate("/api/sentinel/admin/ngo-team/remove", { adminUserId, memberUserId }, [inv])
}

/**
 * Fire-and-forget client drift telemetry. Swallows all errors so it can never
 * break the calling render path. Used by getFeatureEntitlements callers when
 * cached subscription disagrees with the freshly verified server profile.
 */
export function reportClientDrift(payload: Record<string, unknown>): void {
  try {
    void fetch(`${getBackendBaseUrl()}/api/telemetry/drift`, {
      method: "POST",
      headers: authHeaders(),
      credentials: "include",
      body: JSON.stringify({ ...payload, ts: Date.now() }),
    }).catch(() => undefined)
  } catch {
    /* never throw from telemetry */
  }
}
