import http from "node:http"
import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

import { handleMcpRequest } from "./mcp-server.mjs";
import { generateWithFallback, generateWithFallbackStream, getProviderStatus } from "./llm-service.mjs"
import {
  signToken,
  verifyToken,
  hashPassword,
  verifyPassword,
  authenticateRequest,
  extractToken,
  isJwtConfigured,
  signReport,
  hashReportContent,
  verifyReportSignature,
} from "./auth.mjs"
import {
  isDbConfigured,
  ensureSentinelTables,
  createUser,
  getUserByEmailForLogin,
  getUserById,
  listUsersByRole,
  countUsersByRole,
  updateLastLogin,
  updatePasswordHash,
  updateUserRoleById,
  deactivateUserById,
  deleteUserById,
  assignUserToOrganization,
  createOrganization,
  getUserSubscription,
  getUserByEmail,
  getUserModulePermissions,
  getOrganization,
  listOrgUsers,
  writeAuditLog,
  grantModulePermission as dbGrantModulePerm,
  revokeModulePermission as dbRevokeModulePerm,
  getReportById,
  listReportsByProject,
  listReportsByOrg,
  createReport as dbCreateReport,
  updateReportContent as dbUpdateReportContent,
  submitReport as dbSubmitReport,
  approveAndSignReport as dbApproveAndSign,
  publishReport as dbPublishReport,
  revertReport as dbRevertReport,
  deleteReport as dbDeleteReport,
  getReportTransitions,
  // Phase 3: Org module subscriptions
  getOrgModuleSubscription,
  listOrgModuleSubscriptions,
  createOrgModuleSubscription as dbCreateOrgModSub,
  updateOrgModuleSubscription as dbUpdateOrgModSub,
  cancelOrgModuleSubscription as dbCancelOrgModSub,
  checkModuleSeatsAvailable,
  countModuleSeats,
  getExpiringSubscriptions,
  processExpiredSubscriptions,
  // Phase 4: Enhanced audit + admin stats
  getAuditLogsAdvanced,
  getAuditStats,
  getSystemStats,
  executeProxyQuery,
  listProviderRoutingConfigs,
  upsertProviderRoutingConfig,
  getProviderUsageSummary,
  getProviderBudgetSnapshot,
  createSkillRegistryEntry,
  listSkillRegistryEntries,
  getSkillRegistryEntryById,
  upsertSkillBinding,
  listSkillBindings,
  getSkillBinding,
  createSkillExecutionLog,
  listSkillExecutionLogs,
  listAllUsersWithSubscriptions,
  seedWelcomeCredits,
  addCreditsToUserSubscription,
  setUserSubscriptionPlan,
} from "./db.mjs"
import {
  canPerformAction,
  hasMinimumRole,
  checkModuleAccess,
  checkModuleGrantWithSeats,
  checkReportAction,
  resolveEffectiveTier,
  MODULES,
  TIER_MODULES,
  ACTIONS,
} from "./policy.mjs"
import { searchWeb } from "./web-search.mjs"
import {
  getResolvedRouting,
  filterActiveGenerationProviders,
  filterActiveWebProviders,
  logProviderUsage,
} from "./routing-service.mjs"
import {
  isGraphMailConfigured,
  sendWelcomeEmail,
  sendPasswordResetEmail,
  sendInviteEmail,
  sendNewUserAdminNotification,
} from "./graph-mailer.mjs"

// ─────────────────────────── Config ──────────────────────────────

const PORT = Number(process.env.PORT || 8787)
const HOST = process.env.HOST || "0.0.0.0"
const REQUIRE_AUTH =
  String(process.env.BACKEND_REQUIRE_AUTH || "false").toLowerCase() === "true"
const BACKEND_API_KEY = process.env.BACKEND_API_KEY || ""
const ADMIN_NOTIFICATION_EMAIL = process.env.ADMIN_NOTIFICATION_EMAIL || process.env.M365_SENDER_EMAIL || "admin@novussparks.com"
const FORCED_SENTINEL_COMMANDER_EMAILS = new Set(
  (process.env.FORCED_SENTINEL_COMMANDER_EMAILS || process.env.FORCED_SENTINEL_COMMANDER_EMAIL || "admin@novussparks.com,commander@sentinel.dev")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean)
)
const TESTER_MAX_USERS = Number(process.env.TESTER_MAX_USERS || 25)

/**
 * Feature flag: when true, sentinel auth routes are enabled.
 * Existing API-key-guarded routes continue to work regardless.
 */
const SENTINEL_AUTH_ENABLED =
  String(process.env.BACKEND_SENTINEL_AUTH || "false").toLowerCase() === "true"

/**
 * Allowed CORS origins. Defaults to localhost dev origins.
 * Set CORS_ALLOWED_ORIGINS env var to a comma-separated list for production.
 */
const CORS_ALLOWED_ORIGINS = new Set(
  (process.env.CORS_ALLOWED_ORIGINS || "http://localhost:5173,http://localhost:4173,http://localhost:3000")
    .split(",")
    .map(o => o.trim())
    .filter(Boolean)
)

/**
 * Trusted proxy IPs. Only trust x-forwarded-for from these.
 * Set TRUSTED_PROXIES env var to comma-separated CIDR/IPs for production.
 */
const TRUSTED_PROXIES = new Set(
  (process.env.TRUSTED_PROXIES || "127.0.0.1,::1,::ffff:127.0.0.1")
    .split(",")
    .map(p => p.trim())
    .filter(Boolean)
)

// ─────────────────────── Token Revocation Store ──────────────────

/** In-memory token blocklist. In production, use Redis or a DB table. */
const _revokedTokens = new Map() // jti/tokenHash -> expiryTimestamp
const TOKEN_BLOCKLIST_MAX = 10000
const DB_PROXY_MAX_QUERY_CHARS = Math.max(5000, Number(process.env.DB_PROXY_MAX_QUERY_CHARS || 200000))
const DB_PROXY_MAX_PARAMS = Math.max(1, Number(process.env.DB_PROXY_MAX_PARAMS || 200))

// ─────────────────────── Skills Registry (Shadow Mode) ──────────────────────

const SKILL_UPLOAD_DIR = process.env.SKILL_UPLOAD_DIR || path.join(__dirname, ".skill_uploads")
const MAX_SKILL_ZIP_BYTES = Number(process.env.MAX_SKILL_ZIP_BYTES || 5 * 1024 * 1024)

function ensureSkillUploadDir() {
  if (!fs.existsSync(SKILL_UPLOAD_DIR)) {
    fs.mkdirSync(SKILL_UPLOAD_DIR, { recursive: true })
  }
}

function isSkillAdmin(user) {
  return isRoutingAdmin(user)
}

function parseSimpleFrontmatter(text = "") {
  const match = text.match(/^---\n([\s\S]*?)\n---\n?/) 
  if (!match) return {}
  const out = {}
  for (const rawLine of match[1].split("\n")) {
    const line = rawLine.trim()
    if (!line || line.startsWith("#")) continue
    const idx = line.indexOf(":")
    if (idx <= 0) continue
    const key = line.slice(0, idx).trim()
    const value = line.slice(idx + 1).trim()
    if (key) out[key] = value
  }
  return out
}

function readZipEntries(zipPath) {
  const ls = spawnSync("unzip", ["-Z1", zipPath], { encoding: "utf8" })
  if (ls.status !== 0) {
    throw new Error("ZIP validation failed (unzip -Z1)")
  }
  const entries = ls.stdout.split("\n").map((x) => x.trim()).filter(Boolean)
  for (const entry of entries) {
    if (entry.includes("..") || entry.startsWith("/") || entry.startsWith("\\")) {
      throw new Error("Unsafe ZIP path entry detected")
    }
  }
  return entries
}

function readSkillManifestFromZip(zipPath, entries) {
  const manifestPath = entries.find((e) => /(^|\/)SKILL\.md$/i.test(e))
  if (!manifestPath) {
    throw new Error("SKILL.md not found in ZIP")
  }
  const cat = spawnSync("unzip", ["-p", zipPath, manifestPath], { encoding: "utf8" })
  if (cat.status !== 0 || !cat.stdout) {
    throw new Error("Unable to read SKILL.md")
  }
  const frontmatter = parseSimpleFrontmatter(cat.stdout)
  const skillName = String(frontmatter.name || "skill").trim()
  const version = String(frontmatter.version || "0.0.0").trim()
  const description = String(frontmatter.description || "").trim()
  return { manifestPath, frontmatter, skillName, version, description }
}

function scoreAiSignals(text = "") {
  const source = String(text || "")
  const rules = [
    { regex: /\b(let'?s dive in|here'?s what you need to know|in conclusion)\b/gi, weight: 14 },
    { regex: /\b(pivotal|testament|landscape|showcasing|vibrant|crucial)\b/gi, weight: 10 },
    { regex: /\b(in order to|due to the fact that|it could potentially)\b/gi, weight: 10 },
    { regex: /^\s*[-*]\s*\*\*[^*]+\*\*\s*:/gim, weight: 8 },
  ]
  let score = 0
  for (const rule of rules) {
    const hits = (source.match(rule.regex) || []).length
    if (hits > 0) score += Math.min(100, hits * rule.weight)
  }
  return Math.min(100, Math.round(score))
}

function createHumanizedPreview(text = "") {
  return String(text || "")
    .replace(/\bIn order to\b/g, "To")
    .replace(/\bDue to the fact that\b/g, "Because")
    .replace(/\bAdditionally\b/g, "Also")
    .replace(/\bLet'?s dive in\b:?\s*/gi, "")
    .replace(/\bHere'?s what you need to know\b:?\s*/gi, "")
    .replace(/\*\*([^*]+)\*\*\s*:/g, "$1:")
}

function revokeToken(tokenHash, expiresAt) {
  pruneRevokedTokenStore(Math.floor(Date.now() / 1000))
  _revokedTokens.set(tokenHash, expiresAt)
  pruneRevokedTokenStore(Math.floor(Date.now() / 1000))
}

function isTokenRevoked(tokenHash) {
  const exp = _revokedTokens.get(tokenHash)
  if (exp === undefined) return false
  if (exp < Math.floor(Date.now() / 1000)) {
    _revokedTokens.delete(tokenHash) // Expired, clean up
    return false
  }
  return true
}

function pruneRevokedTokenStore(nowEpochSeconds) {
  for (const [key, exp] of _revokedTokens) {
    if (exp < nowEpochSeconds) _revokedTokens.delete(key)
  }

  if (_revokedTokens.size <= TOKEN_BLOCKLIST_MAX) return

  const overflow = _revokedTokens.size - TOKEN_BLOCKLIST_MAX
  let removed = 0
  for (const [key] of _revokedTokens) {
    _revokedTokens.delete(key)
    removed += 1
    if (removed >= overflow) break
  }
}

/** Hash a JWT string to use as blocklist key (avoids storing full tokens) */
function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex").slice(0, 32)
}

// Keep the revocation store bounded and purge expired entries over time.
setInterval(() => {
  pruneRevokedTokenStore(Math.floor(Date.now() / 1000))
}, 300000).unref()

// ─────────────────────── Rate Limiter ────────────────────────────

/**
 * Simple in-memory sliding-window rate limiter.
 * Keyed by (category + identifier), e.g. "login:192.168.1.1"
 */
const _rateLimitBuckets = new Map() // key -> { count, windowStart }

// ───────────────────── Password Reset Store ───────────────────────

const PASSWORD_RESET_TTL_MS = Math.max(60000, Number(process.env.PASSWORD_RESET_TTL_MS || 15 * 60 * 1000))
const PASSWORD_RESET_MAX_ATTEMPTS = Math.max(1, Number(process.env.PASSWORD_RESET_MAX_ATTEMPTS || 5))
const _passwordResetCodes = new Map() // email -> { code, expiresAt, attempts }

function generateResetCode() {
  return String(Math.floor(100000 + Math.random() * 900000))
}

function setResetCode(email, code) {
  _passwordResetCodes.set(email, {
    code,
    expiresAt: Date.now() + PASSWORD_RESET_TTL_MS,
    attempts: 0,
  })
}

function getResetCodeRecord(email) {
  const rec = _passwordResetCodes.get(email)
  if (!rec) return null
  if (Date.now() > rec.expiresAt) {
    _passwordResetCodes.delete(email)
    return null
  }
  return rec
}

function verifyResetCode(email, code) {
  const rec = getResetCodeRecord(email)
  if (!rec) return { valid: false, reason: "Code has expired or does not exist" }
  if (rec.attempts >= PASSWORD_RESET_MAX_ATTEMPTS) {
    _passwordResetCodes.delete(email)
    return { valid: false, reason: "Too many failed attempts. Request a new code." }
  }

  rec.attempts += 1
  if (rec.code !== code) {
    return { valid: false, reason: "Invalid reset code" }
  }

  return { valid: true }
}

setInterval(() => {
  const now = Date.now()
  for (const [email, rec] of _passwordResetCodes) {
    if (now > rec.expiresAt) _passwordResetCodes.delete(email)
  }
}, 60000).unref()

const RATE_LIMITS = {
  login: { windowMs: 60000, max: 5 },       // 5 login attempts per minute per IP
  api:   { windowMs: 60000, max: 120 },      // 120 API calls per minute per user
  create:{ windowMs: 60000, max: 15 },       // 15 create operations per minute per user
}

function checkRateLimit(category, identifier) {
  const config = RATE_LIMITS[category]
  if (!config) return { allowed: true }

  const key = `${category}:${identifier}`
  const now = Date.now()
  const bucket = _rateLimitBuckets.get(key)

  if (!bucket || now - bucket.windowStart > config.windowMs) {
    _rateLimitBuckets.set(key, { count: 1, windowStart: now })
    return { allowed: true, remaining: config.max - 1 }
  }

  bucket.count++
  if (bucket.count > config.max) {
    const retryAfter = Math.ceil((bucket.windowStart + config.windowMs - now) / 1000)
    return { allowed: false, retryAfter, remaining: 0 }
  }

  return { allowed: true, remaining: config.max - bucket.count }
}

// Periodically clean up stale rate limit buckets (every 5 min)
setInterval(() => {
  const now = Date.now()
  for (const [key, bucket] of _rateLimitBuckets) {
    if (now - bucket.windowStart > 300000) _rateLimitBuckets.delete(key)
  }
}, 300000).unref()

// ─────────────────────── CSRF Double-Submit Cookie (M1) ─────────

/**
 * M1 fix: CSRF protection using the double-submit cookie pattern.
 *
 * On login/register, we set a `__csrf` cookie with a random token
 * (HttpOnly=false so the JS SPA can read it; SameSite=Strict).
 * State-changing requests (POST/PUT/DELETE) on authenticated routes must
 * send the same value in the `X-CSRF-Token` header. Because an attacker
 * on a different origin cannot read same-site cookies, they can never
 * produce a matching header.
 *
 * Exempt: OPTIONS preflight, GET/HEAD (safe methods), login/register
 * (no session yet), /health (unauthenticated).
 */

const CSRF_COOKIE_NAME = "__csrf"
const CSRF_HEADER_NAME = "x-csrf-token"

/** Paths that are exempt from CSRF validation (login/register create the token). */
const CSRF_EXEMPT_PATHS = new Set([
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/password-reset/request",
  "/api/auth/password-reset/verify",
  "/api/auth/password-reset/confirm",
  "/api/auth/admin/set-password",
  "/health",
  "/api/proxy/db/query", // Database proxy - relies on JWT authentication instead
  "/api/proxy/db/test",
  "/api/proxy/gemini/generate", // LLM proxy - relies on JWT authentication instead
  "/api/llm/generate", // LLM generation - relies on JWT authentication instead
  "/api/llm/generate/stream", // LLM stream generation - relies on JWT authentication instead
])

function generateCsrfToken() {
  return crypto.randomUUID()
}

/**
 * Build the Set-Cookie header value for the CSRF token.
 * HttpOnly=false so the SPA can read the cookie via document.cookie.
 * SameSite=Strict prevents the browser from sending the cookie on
 * cross-origin requests, adding an extra layer of protection.
 */
function csrfSetCookieValue(token) {
  const isProduction =
    String(process.env.NODE_ENV || "").toLowerCase() === "production"
  const parts = [
    `${CSRF_COOKIE_NAME}=${token}`,
    "Path=/",
    isProduction ? "SameSite=Strict" : "SameSite=Lax",
  ]
  if (isProduction) parts.push("Secure")
  // Note: NOT HttpOnly — the SPA needs to read it via document.cookie
  return parts.join("; ")
}

/**
 * Parse the __csrf cookie value from the Cookie header.
 */
function parseCsrfCookie(req) {
  const cookieHeader = req.headers["cookie"]
  if (!cookieHeader) return null
  const match = cookieHeader
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${CSRF_COOKIE_NAME}=`))
  if (!match) return null
  return match.slice(CSRF_COOKIE_NAME.length + 1)
}

/**
 * Validate CSRF token: the X-CSRF-Token header must match the __csrf cookie.
 * Returns true if valid or if the request is exempt.
 */
function validateCsrf(req, method, reqPathname) {
  // Safe methods don't need CSRF
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return true

  // Exempt paths (login/register/health)
  if (CSRF_EXEMPT_PATHS.has(reqPathname)) return true

  // Exempt chat API endpoints - they use JWT authentication instead
  if (reqPathname.startsWith("/api/chat/")) return true

  const cookieToken = parseCsrfCookie(req)
  const headerToken = req.headers[CSRF_HEADER_NAME]

  if (!cookieToken || !headerToken) return false
  if (typeof headerToken !== "string") return false

  // Constant-time comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(
      Buffer.from(cookieToken, "utf8"),
      Buffer.from(headerToken, "utf8")
    )
  } catch {
    return false // length mismatch
  }
}

/** Get the validated CORS origin for the request, or null if not allowed */
function getCorsOrigin(req) {
  const origin = req.headers["origin"]
  if (!origin) return null
  
  // Allow localhost/127.0.0.1 only in non-production environments
  if (process.env.NODE_ENV !== "production" &&
      (origin.startsWith("http://localhost:") || origin.startsWith("http://127.0.0.1:"))) {
    return origin
  }
  
  return CORS_ALLOWED_ORIGINS.has(origin) ? origin : null
}

/** Standard security headers applied to every response */
const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-XSS-Protection": "0", // Modern browsers: CSP is preferred; disable legacy XSS filter
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  // Restrictive CSP for API/JSON responses (no rendering needed)
  "Content-Security-Policy":
    `default-src 'none'; frame-ancestors 'none'${
      process.env.CSP_REPORT_URI ? `; report-uri ${process.env.CSP_REPORT_URI}` : ""
    }`,
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
}

/** Security headers for HTML pages — permits scripts, styles, images, fonts */
const HTML_SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-XSS-Protection": "0",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Content-Security-Policy":
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: blob:",
      "connect-src 'self' https://api.groq.com https://generativelanguage.googleapis.com https://api.github.com https://www.searchcans.com https://serpapi.com",
      "worker-src 'self' blob:",
      "frame-ancestors 'none'",
    ].join("; ") +
    (process.env.CSP_REPORT_URI ? `; report-uri ${process.env.CSP_REPORT_URI}` : ""),
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
}

function sendJson(res, statusCode, payload, req, extraHeaders) {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    ...SECURITY_HEADERS,
  }

  // CORS: only reflect allowed origins (never wildcard)
  if (req) {
    const corsOrigin = getCorsOrigin(req)
    if (corsOrigin) {
      headers["Access-Control-Allow-Origin"] = corsOrigin
      headers["Vary"] = "Origin"
      headers["Access-Control-Allow-Headers"] =
        "Content-Type, Authorization, x-backend-api-key, x-api-key, x-sentinel-token, x-csrf-token"
      headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS"
      headers["Access-Control-Allow-Credentials"] = "true"
      headers["Access-Control-Max-Age"] = "86400"
    }
  }

  // Merge extra headers (e.g. Set-Cookie for CSRF token)
  if (extraHeaders) {
    Object.assign(headers, extraHeaders)
  }

  res.writeHead(statusCode, headers)
  res.end(JSON.stringify(payload))
}

function readBody(req, maxBytes = 1000000) {
  return new Promise((resolve, reject) => {
    let data = ""
    let bytes = 0
    req.on("data", (chunk) => {
      bytes += chunk.length
      if (bytes > maxBytes) {
        req.destroy()
        reject(Object.assign(new Error("Request body too large"), { statusCode: 413 }))
        return
      }
      data += chunk
    })
    req.on("end", () => resolve(data))
    req.on("error", reject)
  })
}

/**
 * Parse JSON body. Returns { ok, data, error }.
 * Callers should check ok before using data.
 */
async function parseJsonBody(req, maxBytes = 1000000) {
  try {
    const raw = await readBody(req, maxBytes)
    if (!raw || !raw.trim()) return { ok: true, data: {} }
    return { ok: true, data: JSON.parse(raw) }
  } catch (err) {
    if (err.statusCode === 413) {
      return { ok: false, error: "Request body too large", statusCode: 413 }
    }
    return { ok: false, error: "Invalid JSON in request body", statusCode: 400 }
  }
}

function validateProxySqlQuery(queryText) {
  const query = String(queryText || "").trim()
  if (!query) return { ok: false, error: "query is required" }
  if (query.length > DB_PROXY_MAX_QUERY_CHARS) {
    return { ok: false, error: `query too large (max ${DB_PROXY_MAX_QUERY_CHARS} chars)` }
  }
  if (query.includes("\0")) {
    return { ok: false, error: "query contains invalid characters" }
  }

  const isDoBlock = /^DO\s+\$\$/i.test(query)
  if (!isDoBlock) {
    const withoutTrailingSemicolon = query.replace(/;\s*$/, "")
    if (withoutTrailingSemicolon.includes(";")) {
      return { ok: false, error: "multiple SQL statements are not allowed" }
    }
  }

  const blockedPatterns = [
    /\b(?:pg_read_file|pg_read_binary_file|pg_ls_dir|pg_stat_file)\b/i,
    /\bCOPY\b[\s\S]*\bPROGRAM\b/i,
    /\bALTER\s+SYSTEM\b/i,
    /\b(?:CREATE|ALTER|DROP)\s+(?:ROLE|USER|DATABASE)\b/i,
  ]

  for (const pattern of blockedPatterns) {
    if (pattern.test(query)) {
      return { ok: false, error: "query contains blocked SQL operation" }
    }
  }

  return { ok: true, normalized: query }
}

/** Legacy API-key check (backward compatible with existing routes) */
function isApiKeyAuthorized(req) {
  if (!REQUIRE_AUTH) return true
  if (!BACKEND_API_KEY) return false
  const provided = req.headers["x-backend-api-key"] || req.headers["x-api-key"]
  return typeof provided === "string" && provided.length > 0 && provided === BACKEND_API_KEY
}

/**
 * Combined auth: accepts either legacy API key OR valid JWT.
 * Returns { authorized: boolean, user?: object }
 */
function authorize(req) {
  // Try JWT first
  if (SENTINEL_AUTH_ENABLED) {
    const token = extractToken(req)
    if (token) {
      // Check token revocation before verifying
      if (isTokenRevoked(hashToken(token))) {
        return { authorized: false }
      }
      const jwtResult = authenticateRequest(req)
      if (jwtResult.authenticated) {
        const normalized = normalizeAuthUser(jwtResult.user)
        const testerEnv = enforceTesterEnvironment(req, normalized)
        if (!testerEnv.allowed) {
          return { authorized: false }
        }
        return { authorized: true, user: normalized }
      }
    }
  }

  // Fall back to legacy API key
  if (isApiKeyAuthorized(req)) {
    return { authorized: true, user: null } // No user context with API key
  }

  return { authorized: false }
}

function normalizeAuthUser(user) {
  if (!user || typeof user !== "object") return user
  if (typeof user.email === "string" && FORCED_SENTINEL_COMMANDER_EMAILS.has(user.email.toLowerCase())) {
    return {
      ...user,
      role: "SENTINEL_COMMANDER",
    }
  }
  return user
}

function enforceTesterEnvironment(req, authUser) {
  if (!authUser || authUser.role !== "TESTER") return { allowed: true }
  // Tester accounts are allowed on both staging and production.
  return { allowed: true }
}

function deriveConnectorCryptoKey(rawSecret) {
  return crypto.createHash("sha256").update(rawSecret).digest()
}

function getConnectorKeyring() {
  const keyring = new Map()

  if (typeof process.env.CONNECTOR_ENCRYPTION_KEYS === "string" && process.env.CONNECTOR_ENCRYPTION_KEYS.trim()) {
    const raw = process.env.CONNECTOR_ENCRYPTION_KEYS.trim()
    // Supported formats:
    // 1) JSON object: {"1":"keyA","2":"keyB"}
    // 2) CSV pairs: 1:keyA,2:keyB
    try {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === "object") {
        for (const [k, v] of Object.entries(parsed)) {
          const ver = Number(k)
          if (Number.isFinite(ver) && typeof v === "string" && v.trim()) {
            keyring.set(ver, deriveConnectorCryptoKey(v.trim()))
          }
        }
      }
    } catch {
      const parts = raw.split(",").map((p) => p.trim()).filter(Boolean)
      for (const part of parts) {
        const idx = part.indexOf(":")
        if (idx <= 0) continue
        const ver = Number(part.slice(0, idx).trim())
        const secret = part.slice(idx + 1).trim()
        if (Number.isFinite(ver) && secret) {
          keyring.set(ver, deriveConnectorCryptoKey(secret))
        }
      }
    }
  }

  if (keyring.size === 0) {
    const fallbackSecret = process.env.CONNECTOR_ENCRYPTION_KEY || process.env.JWT_SECRET || "connector-dev-key"
    keyring.set(1, deriveConnectorCryptoKey(fallbackSecret))
  }

  return keyring
}

function getActiveConnectorKeyVersion(keyring) {
  const configured = Number(process.env.CONNECTOR_ENCRYPTION_KEY_VERSION || "")
  if (Number.isFinite(configured) && keyring.has(configured)) return configured
  return Math.max(...Array.from(keyring.keys()))
}

function encryptConnectorAuthConfig(authConfig) {
  const keyring = getConnectorKeyring()
  const keyVersion = getActiveConnectorKeyVersion(keyring)
  const key = keyring.get(keyVersion)
  const payload = JSON.stringify(authConfig || {})
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv)
  const encrypted = Buffer.concat([cipher.update(payload, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  return {
    enc_v: 1,
    key_version: keyVersion,
    alg: "aes-256-gcm",
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    data: encrypted.toString("base64"),
  }
}

function decryptConnectorAuthConfig(stored) {
  if (!stored || typeof stored !== "object") return {}
  if (!stored.enc_v || !stored.iv || !stored.tag || !stored.data) {
    // Backward compatibility: previously plaintext JSON may exist.
    return stored
  }

  const keyring = getConnectorKeyring()
  const preferredVersion = Number(stored.key_version || 1)
  const candidateVersions = keyring.has(preferredVersion)
    ? [preferredVersion, ...Array.from(keyring.keys()).filter((k) => k !== preferredVersion)]
    : Array.from(keyring.keys())

  const iv = Buffer.from(String(stored.iv), "base64")
  const tag = Buffer.from(String(stored.tag), "base64")
  const encrypted = Buffer.from(String(stored.data), "base64")

  for (const version of candidateVersions) {
    try {
      const key = keyring.get(version)
      const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv)
      decipher.setAuthTag(tag)
      const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8")
      const parsed = JSON.parse(decrypted)
      return parsed && typeof parsed === "object" ? parsed : {}
    } catch {
      // Try next key version (migration-safe rotation)
    }
  }

  throw new Error("Unable to decrypt connector auth configuration with current keyring")
}

function sanitizeConnectorForClient(row) {
  const authConfig = row?.auth_config && typeof row.auth_config === "object" ? row.auth_config : {}
  const hasSecret = Boolean(authConfig.enc_v || Object.keys(authConfig).length > 0)
  return {
    ...row,
    auth_config: hasSecret ? { has_secret: true } : {},
    headers: {},
  }
}

function isPrivateOrLocalHostname(hostname) {
  if (!hostname) return true
  const h = hostname.toLowerCase()
  if (h === "localhost" || h === "127.0.0.1" || h === "::1" || h.endsWith(".local")) return true
  if (/^10\./.test(h)) return true
  if (/^192\.168\./.test(h)) return true
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(h)) return true
  if (/^127\./.test(h)) return true
  return false
}

function parseHostAllowlist(value) {
  if (typeof value !== "string" || !value.trim()) return []
  return value
    .split(",")
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean)
}

function hostMatchesPattern(host, pattern) {
  if (!host || !pattern) return false
  if (pattern.startsWith("*.")) {
    const suffix = pattern.slice(1)
    return host.endsWith(suffix)
  }
  return host === pattern
}

function isHostAllowedForConnectorType(host, platformType, connectorName = "") {
  const byType = {
    rest_api: parseHostAllowlist(process.env.CONNECTOR_ALLOWED_HOSTS_REST_API || ""),
    graphql: parseHostAllowlist(process.env.CONNECTOR_ALLOWED_HOSTS_GRAPHQL || ""),
    webhook: parseHostAllowlist(process.env.CONNECTOR_ALLOWED_HOSTS_WEBHOOK || ""),
    oauth2: parseHostAllowlist(process.env.CONNECTOR_ALLOWED_HOSTS_OAUTH2 || ""),
    custom: parseHostAllowlist(process.env.CONNECTOR_ALLOWED_HOSTS_CUSTOM || ""),
  }

  const typeList = byType[platformType] || []
  if (typeList.length > 0) {
    return typeList.some((p) => hostMatchesPattern(host, p))
  }

  // Airtable-specific strict allowlist (fallback default)
  const isAirtable = host.includes("airtable.com") || connectorName.toLowerCase().includes("airtable")
  if (isAirtable) {
    const airtableAllowed = parseHostAllowlist(process.env.CONNECTOR_ALLOWED_HOSTS_AIRTABLE || "api.airtable.com")
    return airtableAllowed.some((p) => hostMatchesPattern(host, p))
  }

  return true
}

function validateConnectorBaseUrl(rawUrl, platformType = "rest_api", connectorName = "") {
  try {
    const parsed = new URL(rawUrl)
    if (parsed.protocol !== "https:") {
      return { ok: false, error: "Base URL must use https" }
    }
    if (isPrivateOrLocalHostname(parsed.hostname)) {
      return { ok: false, error: "Private/local hostnames are not allowed" }
    }
    if (!isHostAllowedForConnectorType(parsed.hostname.toLowerCase(), platformType, connectorName)) {
      return { ok: false, error: "Host is not allowed for this connector type" }
    }
    return { ok: true, normalized: parsed.toString().replace(/\/$/, "") }
  } catch {
    return { ok: false, error: "Invalid base URL" }
  }
}

function buildConnectorCallUrl(baseUrl, endpoint = "", params = undefined) {
  const url = new URL(baseUrl.replace(/\/$/, "") + "/")
  const cleanEndpoint = String(endpoint || "").replace(/^\//, "")
  url.pathname = url.pathname.replace(/\/$/, "") + (cleanEndpoint ? `/${cleanEndpoint}` : "")
  if (params && typeof params === "object") {
    for (const [k, v] of Object.entries(params)) {
      if (v == null) continue
      url.searchParams.set(k, String(v))
    }
  }
  return url.toString()
}

function buildConnectorHeaders(authType, authConfig, headers = {}) {
  const out = { ...headers }
  if (authType === "bearer" && authConfig?.token) {
    out.Authorization = `Bearer ${authConfig.token}`
  } else if (authType === "api_key" && authConfig?.key) {
    const headerName = authConfig.header_name || "X-API-Key"
    out[headerName] = authConfig.key
  } else if (authType === "basic" && authConfig?.username) {
    const encoded = Buffer.from(`${authConfig.username}:${authConfig.password || ""}`).toString("base64")
    out.Authorization = `Basic ${encoded}`
  }
  return out
}

async function ensureTesterSubscription(userId, assignedBy) {
  try {
    const { getSql } = await import("./db.mjs")
    const sql = getSql()
    const existing = await sql`
      SELECT id FROM sentinel_user_subscriptions
      WHERE user_id = ${userId} AND status = 'ACTIVE'
      ORDER BY assigned_at DESC
      LIMIT 1
    `
    if (existing.length > 0) return

    const rows = await sql`
      SELECT organization_id AS "organizationId"
      FROM sentinel_users
      WHERE id = ${userId}
      LIMIT 1
    `
    const orgId = rows[0]?.organizationId || null
    if (!orgId) return

    await sql`
      INSERT INTO sentinel_user_subscriptions
        (id, user_id, organization_id, tier, status, assigned_by, expires_at, auto_renew)
      VALUES
        (${crypto.randomUUID()}, ${userId}, ${orgId}, 'PRO', 'ACTIVE', ${assignedBy || userId}, NULL, false)
    `
  } catch (err) {
    console.warn("[tester] ensure subscription failed (non-blocking):", err?.message || err)
  }
}

async function handleCreateTester(req, res, actor) {
  if (!hasMinimumRole(actor.role, "SENTINEL_COMMANDER")) {
    return sendJson(res, 403, { ok: false, error: "Insufficient permissions" }, req)
  }

  if (!isDbConfigured()) {
    return sendJson(res, 503, { ok: false, error: "Tester management requires NEON_DATABASE_URL on backend" }, req)
  }

  const parsed = await parseJsonBody(req)
  if (!parsed.ok) return sendJson(res, parsed.statusCode || 400, { ok: false, error: parsed.error }, req)
  const body = parsed.data

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : ""
  const fullName = typeof body.fullName === "string" ? body.fullName.trim() : ""
  const password = typeof body.password === "string" ? body.password : ""

  if (!email || !fullName || !password) {
    return sendJson(res, 400, { ok: false, error: "email, fullName, and password are required" }, req)
  }
  if (password.length < 8) {
    return sendJson(res, 400, { ok: false, error: "Password must be at least 8 characters" }, req)
  }

  const currentTesters = await countUsersByRole("TESTER")
  if (currentTesters >= TESTER_MAX_USERS) {
    return sendJson(res, 400, { ok: false, error: `Tester limit reached (${TESTER_MAX_USERS})` }, req)
  }

  const existing = await getUserByEmailForLogin(email)
  if (existing) {
    return sendJson(res, 409, { ok: false, error: "An account with this email already exists" }, req)
  }

  const newUser = await createUser({
    id: crypto.randomUUID(),
    email,
    fullName,
    passwordHash: await hashPassword(password),
    role: "TESTER",
    organizationId: actor.organizationId || null,
  })

  if (!newUser) {
    return sendJson(res, 500, { ok: false, error: "Failed to create tester account" }, req)
  }

  await ensureTesterSubscription(newUser.id, actor.userId)

  return sendJson(res, 200, {
    ok: true,
    tester: {
      ...newUser,
      role: "TESTER",
      testingPolicy: {
        stagingOnly: false,
        maxCredits: 50,
        tier: "PRO",
      },
    },
  }, req)
}

async function handleListTesters(req, res, actor) {
  if (!hasMinimumRole(actor.role, "SENTINEL_COMMANDER")) {
    return sendJson(res, 403, { ok: false, error: "Insufficient permissions" }, req)
  }

  if (!isDbConfigured()) {
    return sendJson(res, 503, { ok: false, error: "Tester management requires NEON_DATABASE_URL on backend" }, req)
  }

  const testers = await listUsersByRole("TESTER", TESTER_MAX_USERS)
  return sendJson(res, 200, {
    ok: true,
    maxTesters: TESTER_MAX_USERS,
    total: testers.length,
    testers,
  }, req)
}

async function handleTesterAccountAction(req, res, actor) {
  if (!hasMinimumRole(actor.role, "SENTINEL_COMMANDER")) {
    return sendJson(res, 403, { ok: false, error: "Insufficient permissions" }, req)
  }

  if (!isDbConfigured()) {
    return sendJson(res, 503, { ok: false, error: "Tester management requires NEON_DATABASE_URL on backend" }, req)
  }

  const parsed = await parseJsonBody(req)
  if (!parsed.ok) return sendJson(res, parsed.statusCode || 400, { ok: false, error: parsed.error }, req)

  const body = parsed.data
  const userId = typeof body.userId === "string" ? body.userId.trim() : ""
  const action = typeof body.action === "string" ? body.action.trim().toLowerCase() : ""

  if (!userId || !action) {
    return sendJson(res, 400, { ok: false, error: "userId and action are required" }, req)
  }

  try {
    const targetUser = await getUserById(userId)
    if (!targetUser || !targetUser.isActive) {
      return sendJson(res, 404, { ok: false, error: "Tester account not found" }, req)
    }

    if (targetUser.role !== "TESTER") {
      return sendJson(res, 400, { ok: false, error: "Only active tester accounts can be managed here" }, req)
    }

    if (action === "promote") {
      const updatedUser = await updateUserRoleById(userId, "USER")
      await writeAuditLog({
        userId: actor.userId,
        action: "UPDATE",
        resource: "tester-promote",
        resourceId: userId,
        ipAddress: getClientIp(req),
        success: Boolean(updatedUser),
        metadata: { targetEmail: targetUser.email, fromRole: "TESTER", toRole: "USER" },
      }).catch(() => {})

      if (!updatedUser) {
        return sendJson(res, 500, { ok: false, error: "Failed to migrate tester account" }, req)
      }

      return sendJson(res, 200, {
        ok: true,
        action: "promote",
        user: updatedUser,
      }, req)
    }

    if (action === "revoke") {
      const updatedUser = await deactivateUserById(userId)
      await writeAuditLog({
        userId: actor.userId,
        action: "DELETE",
        resource: "tester-revoke",
        resourceId: userId,
        ipAddress: getClientIp(req),
        success: Boolean(updatedUser),
        metadata: { targetEmail: targetUser.email, previousRole: "TESTER" },
      }).catch(() => {})

      if (!updatedUser) {
        return sendJson(res, 500, { ok: false, error: "Failed to revoke tester access" }, req)
      }

      return sendJson(res, 200, {
        ok: true,
        action: "revoke",
        user: updatedUser,
      }, req)
    }

    return sendJson(res, 400, { ok: false, error: "Unsupported tester action" }, req)
  } catch (err) {
    console.error("[tester/manage] error:", err)
    return sendJson(res, 500, { ok: false, error: "Failed to manage tester account" }, req)
  }
}

function getAuthCapabilities(user) {
  const normalized = normalizeAuthUser(user)
  if (!normalized) {
    return {
      canSetPasswords: false,
      canManageProviderRouting: false,
      canSendInviteEmails: false,
      isSentinelCommander: false,
    }
  }

  return {
    canSetPasswords: normalized.role === "SENTINEL_COMMANDER",
    canManageProviderRouting: isRoutingAdmin(normalized),
    canSendInviteEmails: canPerformAction(normalized.role, ACTIONS.TEAM_ADD_MEMBER) && isGraphMailConfigured(),
    isSentinelCommander: normalized.role === "SENTINEL_COMMANDER",
  }
}

/** Get client IP for audit logging. Only trusts x-forwarded-for from trusted proxies. */
function getClientIp(req) {
  const socketIp = req.socket?.remoteAddress || "unknown"

  // Only trust forwarded headers if the direct connection is from a trusted proxy
  if (TRUSTED_PROXIES.has(socketIp)) {
    const forwarded = req.headers["x-forwarded-for"]
    if (forwarded) {
      // Take the leftmost (client) IP from the chain
      return forwarded.split(",")[0]?.trim() || socketIp
    }
    const realIp = req.headers["x-real-ip"]
    if (typeof realIp === "string" && realIp) return realIp.trim()
  }

  return socketIp
}

// ─────────────────────────── Humanizer Scoring ───────────────────

function clampScore(value) {
  return Math.max(1, Math.min(99, Math.round(value)))
}

function estimateHumanizerMeters(text) {
  const normalized = String(text || "").trim()
  if (!normalized) {
    return { aiLikelihood: 0, similarityRisk: 0 }
  }

  const words = normalized.split(/\s+/).filter(Boolean)
  const sentences = normalized
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter(Boolean)
  const avgSentenceLength =
    sentences.length > 0 ? words.length / sentences.length : words.length
  const lexicalDiversity =
    words.length > 0
      ? new Set(words.map((w) => w.toLowerCase())).size / words.length
      : 0

  const repetitivePhraseHits = (
    normalized.match(
      /\b(in conclusion|furthermore|moreover|in addition|therefore)\b/gi
    ) || []
  ).length
  const contractionHits = (
    normalized.match(/\b\w+'(t|re|ve|ll|d|s)\b/gi) || []
  ).length

  let aiLikelihood = 45
  if (avgSentenceLength > 24) aiLikelihood += 14
  if (avgSentenceLength < 10) aiLikelihood += 8
  if (lexicalDiversity < 0.42) aiLikelihood += 18
  if (lexicalDiversity > 0.62) aiLikelihood -= 8
  aiLikelihood += Math.min(14, repetitivePhraseHits * 3)
  aiLikelihood -= Math.min(8, contractionHits * 1.5)

  const longWordRatio =
    words.length > 0
      ? words.filter((w) => w.replace(/[^a-zA-Z]/g, "").length >= 9).length /
        words.length
      : 0

  let similarityRisk = 30
  if (longWordRatio > 0.28) similarityRisk += 14
  if (lexicalDiversity < 0.45) similarityRisk += 18
  if (sentences.length > 0 && avgSentenceLength > 22) similarityRisk += 12

  return {
    aiLikelihood: clampScore(aiLikelihood),
    similarityRisk: clampScore(similarityRisk),
  }
}

function tokenizeHumanizerText(input) {
  return String(input || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 3)
}

function calculateTokenOverlap(left, right) {
  const leftTokens = new Set(tokenizeHumanizerText(left))
  const rightTokens = new Set(tokenizeHumanizerText(right))
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0

  let overlap = 0
  leftTokens.forEach((token) => {
    if (rightTokens.has(token)) overlap += 1
  })

  return (overlap / Math.max(leftTokens.size, rightTokens.size)) * 100
}

function calculateReadabilityBalance(text) {
  const normalized = String(text || "").trim()
  if (!normalized) return 0
  const words = normalized.split(/\s+/).filter(Boolean)
  const sentences = normalized.split(/[.!?]+/).map((part) => part.trim()).filter(Boolean)
  const avgSentenceLength = sentences.length > 0 ? words.length / sentences.length : words.length
  if (avgSentenceLength < 8) return 55
  if (avgSentenceLength < 14) return 82
  if (avgSentenceLength < 20) return 92
  if (avgSentenceLength < 26) return 78
  return 60
}

function calculateAiPatternScore(text) {
  const normalized = String(text || "").trim()
  if (!normalized) return 0

  const checks = [
    /\b(in conclusion|furthermore|moreover|in addition|therefore)\b/gi,
    /\b(let'?s dive in|here'?s what you need to know|without further ado)\b/gi,
    /\b(testament|pivotal|landscape|intricate|showcasing|underscores?)\b/gi,
    /\bit'?s not just\b/gi,
    /\b(not only .* but also)\b/gi,
    /\b(could potentially|possibly be argued|based on available information)\b/gi,
    /\b(cross-functional|data-driven|client-facing|end-to-end|high-quality)\b/gi,
    /—/g,
    /\*\*[^*]+\*\*/g,
    /[\u{1F300}-\u{1FAFF}]/gu,
  ]

  const totalHits = checks.reduce((sum, regex) => sum + (normalized.match(regex)?.length || 0), 0)
  const words = normalized.split(/\s+/).filter(Boolean).length
  const density = words > 0 ? (totalHits / words) * 100 : 0
  const risk = Math.min(100, Math.round(totalHits * 7 + density * 6))
  return Math.max(1, 100 - risk)
}

function scoreHumanizerCandidate(originalText, candidateText) {
  const candidateMeters = estimateHumanizerMeters(candidateText)
  const overlap = calculateTokenOverlap(originalText, candidateText)
  const originalWords = String(originalText || "").trim().split(/\s+/).filter(Boolean)
  const candidateWords = String(candidateText || "").trim().split(/\s+/).filter(Boolean)
  const lengthDelta = originalWords.length > 0
    ? Math.abs(candidateWords.length - originalWords.length) / originalWords.length
    : 0

  let preservationScore = 55
  preservationScore += Math.min(35, overlap * 0.35)
  preservationScore -= Math.min(20, lengthDelta * 100)

  const variationScore = Math.max(
    0,
    Math.min(100, Math.round((100 - candidateMeters.aiLikelihood) * 0.6 + (100 - candidateMeters.similarityRisk) * 0.4))
  )
  const readabilityScore = calculateReadabilityBalance(candidateText)
  const aiPatternScore = calculateAiPatternScore(candidateText)
  const overallScore = Math.max(
    1,
    Math.min(99, Math.round(preservationScore * 0.36 + variationScore * 0.3 + readabilityScore * 0.14 + aiPatternScore * 0.2))
  )

  const notes = []
  if (candidateMeters.aiLikelihood <= 35) notes.push("Lower detector-pattern estimate")
  if (candidateMeters.similarityRisk <= 35) notes.push("Lower surface-similarity estimate")
  if (preservationScore >= 75) notes.push("Meaning preservation stayed strong")
  if (aiPatternScore >= 75) notes.push("Lower AI-writing signal density")
  if (readabilityScore >= 85) notes.push("Sentence flow stayed balanced")

  return {
    ...candidateMeters,
    preservationScore: clampScore(preservationScore),
    variationScore: clampScore(variationScore),
    readabilityScore: clampScore(readabilityScore),
    aiPatternScore: clampScore(aiPatternScore),
    overallScore,
    notes: notes.slice(0, 3),
  }
}

function buildReviewScorePayload(text, rawResult, filters = {}) {
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value))
  const detectScoringProfile = () => {
    if (filters.excludeQuotes && filters.excludeReferences && Number(filters.minMatchWords || 0) >= 8) return "institutional"
    if (filters.excludeQuotes && !filters.excludeReferences && Number(filters.minMatchWords || 0) >= 6) return "balanced"
    if (!filters.excludeQuotes && !filters.excludeReferences && Number(filters.minMatchWords || 0) <= 4) return "strict"
    return "custom"
  }
  const applyCalibratedIntegrity = (rawIntegrityScore, profile) => {
    const score = clamp(rawIntegrityScore, 0, 100)
    let adjusted = score
    let bandHalfWidth = 6
    if (profile === "strict") {
      adjusted = score * 0.9 + 2
      bandHalfWidth = 7
    } else if (profile === "balanced") {
      adjusted = score * 0.95 + 1.5
      bandHalfWidth = 6
    } else if (profile === "institutional") {
      adjusted = score * 0.98 + 1
      bandHalfWidth = 5
    } else {
      adjusted = score * 0.96 + 1
      bandHalfWidth = 6
    }
    const adjustedScore = clamp(Math.round(adjusted), 0, 100)
    return {
      adjustedScore,
      confidenceBand: {
        min: clamp(adjustedScore - bandHalfWidth, 0, 100),
        max: clamp(adjustedScore + bandHalfWidth, 0, 100),
      },
    }
  }

  const normalizedText = String(text || "")
  const highlights = Array.isArray(rawResult?.highlights) ? rawResult.highlights : []
  const aiHighlights = Array.isArray(rawResult?.aiHighlights) ? rawResult.aiHighlights : []
  const validReferences = Array.isArray(rawResult?.validReferences) ? rawResult.validReferences : []
  const detectedSources = Array.isArray(rawResult?.detectedSources) ? rawResult.detectedSources : []
  const plagiarismPercentage = Math.max(0, Math.min(100, Number(rawResult?.plagiarismPercentage || 0)))
  const aiContentPercentage = Math.max(0, Math.min(100, Number(rawResult?.aiContentPercentage || 0)))
  const invalidReferences = validReferences.filter((ref) => ref && ref.isValid === false).length
  const citationRisk = validReferences.length > 0 ? (invalidReferences / validReferences.length) * 100 : 25
  const rawIntegrityScore = Math.max(0, Math.min(100, Math.round(100 - (0.55 * plagiarismPercentage + 0.3 * aiContentPercentage + 0.15 * citationRisk))))
  const scoringProfile = detectScoringProfile()
  const calibration = applyCalibratedIntegrity(rawIntegrityScore, scoringProfile)
  const integrityScore = calibration.adjustedScore
  const spread = Math.max(4, Math.min(12, Math.round(4 + highlights.length * 0.8)))
  const estimatedSimilarityRange = {
    min: Math.max(0, Math.min(100, Math.round(plagiarismPercentage - spread))),
    max: Math.max(0, Math.min(100, Math.round(plagiarismPercentage + spread))),
  }
  const confidenceReasons = []
  const wordCount = normalizedText.trim().split(/\s+/).filter(Boolean).length

  if (normalizedText.length >= 3000) confidenceReasons.push("Document length is sufficient for stable scoring")
  else confidenceReasons.push("Shorter text reduces reliability of automated scoring")

  if (validReferences.length >= 3) confidenceReasons.push("Multiple references detected for citation validation")
  else confidenceReasons.push("Limited references reduce citation confidence")

  if (detectedSources.length >= 2) confidenceReasons.push("Detected sources provide cross-check evidence")
  else confidenceReasons.push("Few detected sources may underrepresent overlap")

  const signalScore = (normalizedText.length >= 3000 ? 1 : 0) + (validReferences.length >= 3 ? 1 : 0) + (detectedSources.length >= 2 ? 1 : 0)
  const confidenceLabel = signalScore <= 1 ? "low" : signalScore === 3 ? "high" : "medium"

  const evidenceItems = [
    {
      label: "Document length",
      impact: normalizedText.length >= 1800 ? "positive" : normalizedText.length >= 800 ? "neutral" : "risk",
      detail: `${wordCount} words analysed for scoring stability.`,
    },
    {
      label: "Similarity evidence",
      impact: highlights.length === 0 ? "positive" : highlights.length <= 2 ? "neutral" : "risk",
      detail: `${highlights.length} overlap highlight${highlights.length === 1 ? "" : "s"} remained after active filters.`,
    },
    {
      label: "AI-pattern evidence",
      impact: aiHighlights.length === 0 ? "positive" : aiHighlights.length <= 2 ? "neutral" : "risk",
      detail: `${aiHighlights.length} AI-pattern segment${aiHighlights.length === 1 ? "" : "s"} contributed to the estimate.`,
    },
    {
      label: "Citation evidence",
      impact: validReferences.some((ref) => ref && ref.isValid === false) ? "risk" : validReferences.length > 0 ? "positive" : "neutral",
      detail: `${validReferences.filter((ref) => ref && ref.isValid).length}/${validReferences.length} references validated successfully.`,
    },
  ]

  if (filters.excludeQuotes || filters.excludeReferences || filters.minMatchWords > 0) {
    evidenceItems.push({
      label: "Filter impact",
      impact: "neutral",
      detail: `Filters active: quotes ${filters.excludeQuotes ? "excluded" : "included"}, references ${filters.excludeReferences ? "excluded" : "included"}, minimum match words ${Number(filters.minMatchWords || 0)}.`,
    })
  }

  return {
    integrityScore,
    confidenceLabel,
    confidenceReasons,
    estimatedSimilarityRange,
    likelyTurnitinRange: estimatedSimilarityRange,
    scoringProfile,
    profileVersion: "review-v3",
    calibration: {
      method: "piecewise-linear-v1",
      enabled: true,
      rawIntegrityScore,
      adjustedIntegrityScore: integrityScore,
      confidenceBand: calibration.confidenceBand,
    },
    benchmarkEvidence: {
      datasetVersion: "seed-2026-q2",
      sampleCount: 100,
      notes: [
        "Calibration is bounded and profile-aware.",
        "Legacy field likelyTurnitinRange is kept for compatibility only.",
      ],
    },
    evidenceItems,
    provenance: [
      {
        label: "Local structural analysis",
        status: "verified",
        detail: "Sentence, repetition, and stylometric heuristics were computed in the scoring pipeline.",
      },
      {
        label: "Reference validation",
        status: validReferences.length > 0 ? "partial" : "missing",
        detail: validReferences.length > 0
          ? `${validReferences.length} references were checked for formatting and completeness.`
          : "No usable references were available for validation.",
      },
      {
        label: "Source attribution",
        status: detectedSources.length > 0 ? "partial" : "missing",
        detail: detectedSources.length > 0
          ? `${detectedSources.length} likely source contribution${detectedSources.length === 1 ? " was" : "s were"} estimated.`
          : "No explicit source attribution evidence was available.",
      },
    ],
  }
}

// ─────────────────────────── Route Handlers ──────────────────────

/**
 * POST /api/auth/login
 * Body: { email, password }
 * Returns: { ok, token, user, subscription }
 */
async function handleLogin(req, res) {
  // H6: Rate limit login attempts by IP
  const clientIp = getClientIp(req)
  const rl = checkRateLimit("login", clientIp)
  if (!rl.allowed) {
    return sendJson(res, 429, {
      ok: false,
      error: `Too many login attempts. Try again in ${rl.retryAfter} seconds.`,
    }, req)
  }

  const parsed = await parseJsonBody(req)
  if (!parsed.ok) return sendJson(res, parsed.statusCode || 400, { ok: false, error: parsed.error }, req)
  const body = parsed.data
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : ""
  const password = typeof body.password === "string" ? body.password : ""

  if (!email || !password) {
    return sendJson(res, 400, { ok: false, error: "Email and password are required" }, req)
  }

  if (!isDbConfigured()) {
    return sendJson(res, 503, {
      ok: false,
      error: "Database not configured. Set NEON_DATABASE_URL.",
    }, req)
  }

  if (!isJwtConfigured()) {
    return sendJson(res, 503, {
      ok: false,
      error: "JWT not configured. Set JWT_SECRET env var.",
    }, req)
  }

  try {
    console.log(`[auth/login] Attempting login for ${email}`)
    const user = await getUserByEmailForLogin(email)
    if (!user) {
      console.log(`[auth/login] User not found: ${email}`)
      return sendJson(res, 401, { ok: false, error: "Invalid email or password" }, req)
    }

    if (!user.isActive) {
      console.log(`[auth/login] User inactive: ${email}`)
      return sendJson(res, 403, { ok: false, error: "Account is deactivated" }, req)
    }

    console.log(`[auth/login] Verifying password for ${email}`)
    // H2 fix: verifyPassword now returns { verified, needsRehash }
    const pwResult = await verifyPassword(password, user.passwordHash)
    if (!pwResult.verified) {
      console.log(`[auth/login] Password verification failed for ${email}`)
      return sendJson(res, 401, { ok: false, error: "Invalid email or password" }, req)
    }

    console.log(`[auth/login] Password verified for ${email}`)
    // H2 fix: Re-hash legacy SHA-256 passwords to bcrypt on successful login
    if (pwResult.needsRehash) {
      const newHash = await hashPassword(password)
      await updatePasswordHash(user.id, newHash).catch((err) => {
        console.warn("[auth/login] bcrypt rehash failed (non-blocking):", err.message)
      })
    }

    // Get subscription info for token
    const subscription = await getUserSubscription(user.id)
    const tier = subscription?.tier || null

    // Sign JWT
    const token = signToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      organizationId: user.organizationId || null,
      subscriptionTier: tier,
    })

    // Update last login
    await updateLastLogin(user.id).catch(() => {})

    // Audit log
    await writeAuditLog({
      userId: user.id,
      action: "LOGIN",
      resource: "auth",
      ipAddress: getClientIp(req),
      success: true,
    }).catch(() => {})

    // Return user info (without passwordHash)
    const safeUser = { ...user }
    delete safeUser.passwordHash

    if (safeUser.role === "TESTER") {
      const testerEnv = enforceTesterEnvironment(req, safeUser)
      if (!testerEnv.allowed) {
        return sendJson(res, testerEnv.status || 403, { ok: false, error: testerEnv.error }, req)
      }
      await ensureTesterSubscription(safeUser.id, safeUser.id)
    }
    // M1 fix: Set CSRF cookie on login
    const csrfToken = generateCsrfToken()
    console.log(`[auth/login] Login successful for ${email}`)
    return sendJson(res, 200, {
      ok: true,
      token,
      user: safeUser,
      subscription: subscription || null,
    }, req, { "Set-Cookie": csrfSetCookieValue(csrfToken) })
  } catch (err) {
    console.error("[auth/login] error:", err)
    return sendJson(res, 500, { ok: false, error: "Internal server error" }, req)
  }
}

/**
 * POST /api/auth/register
 * Body: { email, password, fullName }
 * Returns: { ok, token, user }
 *
 * C2/C3 fix: Server-side user registration replaces the client-side
 * unsigned base64 token flow. Password is hashed server-side and a
 * proper JWT is returned.
 */
async function handleRegister(req, res) {
  // H6: Rate limit registration attempts
  const clientIp = getClientIp(req)
  const rl = checkRateLimit("create", clientIp)
  if (!rl.allowed) {
    return sendJson(res, 429, {
      ok: false,
      error: `Too many requests. Try again in ${rl.retryAfter} seconds.`,
    }, req)
  }

  const parsed = await parseJsonBody(req)
  if (!parsed.ok) return sendJson(res, parsed.statusCode || 400, { ok: false, error: parsed.error }, req)
  const body = parsed.data
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : ""
  const password = typeof body.password === "string" ? body.password : ""
  const fullName = typeof body.fullName === "string" ? body.fullName.trim() : ""

  if (!email || !password || !fullName) {
    return sendJson(res, 400, { ok: false, error: "Email, password, and full name are required" }, req)
  }

  if (password.length < 8) {
    return sendJson(res, 400, { ok: false, error: "Password must be at least 8 characters" }, req)
  }

  // Basic email format validation
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return sendJson(res, 400, { ok: false, error: "Invalid email format" }, req)
  }

  if (fullName.length < 2 || fullName.length > 200) {
    return sendJson(res, 400, { ok: false, error: "Full name must be 2-200 characters" }, req)
  }

  if (!isDbConfigured()) {
    return sendJson(res, 503, { ok: false, error: "Database not configured" }, req)
  }

  if (!isJwtConfigured()) {
    return sendJson(res, 503, { ok: false, error: "JWT not configured" }, req)
  }

  try {
    const passwordHash = await hashPassword(password)
    const userId = crypto.randomUUID()

    const newUser = await createUser({
      id: userId,
      email,
      fullName,
      passwordHash,
      role: "USER",
      organizationId: null,
    })

    if (!newUser) {
      // ON CONFLICT (email) DO NOTHING → returned null
      return sendJson(res, 409, { ok: false, error: "An account with this email already exists" }, req)
    }

    // Seed welcome credits (10 credits, 7-day BASIC trial) — non-blocking
    seedWelcomeCredits(newUser.id, newUser.id).catch((err) => {
      console.warn("[register] welcome credits seed failed (non-blocking):", err?.message)
    })

    // Sign JWT
    const token = signToken({
      userId: newUser.id,
      email: newUser.email,
      role: newUser.role,
      organizationId: newUser.organizationId || null,
      subscriptionTier: null,
    })

    // Audit log
    await writeAuditLog({
      userId: newUser.id,
      action: "CREATE",
      resource: "user",
      resourceId: newUser.id,
      ipAddress: getClientIp(req),
      success: true,
    }).catch(() => {})

    if (isGraphMailConfigured()) {
      sendWelcomeEmail({
        to: newUser.email,
        fullName,
      }).then(() => {
        console.log(`[mail/welcome] sent to ${newUser.email}`)
      }).catch((err) => {
        console.error("[mail/welcome] send FAILED:", err.message, err.stack)
      })

      sendNewUserAdminNotification({
        adminEmail: ADMIN_NOTIFICATION_EMAIL,
        newUserEmail: newUser.email,
        newUserName: fullName,
        source: "signup",
      }).then(() => {
        console.log(`[mail/admin-notify] sent to ${ADMIN_NOTIFICATION_EMAIL} for ${newUser.email}`)
      }).catch((err) => {
        console.error("[mail/admin-notify] send FAILED:", err.message, err.stack)
      })
    } else {
      console.warn("[mail] Graph Mail not configured — skipping welcome email for", newUser.email)
    }

    return sendJson(res, 201, {
      ok: true,
      token,
      user: newUser,
    }, req, { "Set-Cookie": csrfSetCookieValue(generateCsrfToken()) })
  } catch (err) {
    console.error("[auth/register] error:", err)
    return sendJson(res, 500, { ok: false, error: "Internal server error" }, req)
  }
}

/**
 * POST /api/auth/password-reset/request
 * Body: { email }
 * Returns: { ok } (always generic for security)
 */
async function handlePasswordResetRequest(req, res) {
  const clientIp = getClientIp(req)
  const rl = checkRateLimit("create", clientIp)
  if (!rl.allowed) {
    return sendJson(res, 429, {
      ok: false,
      error: `Too many requests. Try again in ${rl.retryAfter} seconds.`,
    }, req)
  }

  const parsed = await parseJsonBody(req)
  if (!parsed.ok) return sendJson(res, parsed.statusCode || 400, { ok: false, error: parsed.error }, req)

  const body = parsed.data
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : ""
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return sendJson(res, 200, { ok: true }, req)
  }

  if (!isDbConfigured()) return sendJson(res, 200, { ok: true }, req)

  try {
    const user = await getUserByEmailForLogin(email)
    if (!user || !user.isActive) {
      return sendJson(res, 200, { ok: true }, req)
    }

    const resetCode = generateResetCode()
    setResetCode(email, resetCode)

    if (isGraphMailConfigured()) {
      await sendPasswordResetEmail({
        to: email,
        fullName: user.fullName,
        resetCode,
        expiresMinutes: Math.round(PASSWORD_RESET_TTL_MS / 60000),
      })
    } else {
      console.warn("[mail/reset] Graph mail not configured; reset email skipped")
    }

    await writeAuditLog({
      userId: user.id,
      action: "UPDATE",
      resource: "auth-password-reset-request",
      ipAddress: clientIp,
      success: true,
    }).catch(() => {})

    const payload = { ok: true }
    if (String(process.env.NODE_ENV || "").toLowerCase() !== "production") {
      payload.debugCode = resetCode
    }
    return sendJson(res, 200, payload, req)
  } catch (err) {
    console.error("[auth/password-reset/request] error:", err)
    return sendJson(res, 200, { ok: true }, req)
  }
}

/**
 * POST /api/auth/password-reset/verify
 * Body: { email, code }
 * Returns: { ok }
 */
async function handlePasswordResetVerify(req, res) {
  const parsed = await parseJsonBody(req)
  if (!parsed.ok) return sendJson(res, parsed.statusCode || 400, { ok: false, error: parsed.error }, req)

  const body = parsed.data
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : ""
  const code = typeof body.code === "string" ? body.code.trim() : ""
  if (!email || !code) {
    return sendJson(res, 400, { ok: false, error: "Email and code are required" }, req)
  }

  const result = verifyResetCode(email, code)
  if (!result.valid) {
    return sendJson(res, 400, { ok: false, error: result.reason || "Invalid reset code" }, req)
  }

  return sendJson(res, 200, { ok: true }, req)
}

/**
 * POST /api/auth/password-reset/confirm
 * Body: { email, code, newPassword }
 * Returns: { ok }
 */
async function handlePasswordResetConfirm(req, res) {
  const parsed = await parseJsonBody(req)
  if (!parsed.ok) return sendJson(res, parsed.statusCode || 400, { ok: false, error: parsed.error }, req)

  const body = parsed.data
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : ""
  const code = typeof body.code === "string" ? body.code.trim() : ""
  const newPassword = typeof body.newPassword === "string" ? body.newPassword : ""

  if (!email || !code || !newPassword) {
    return sendJson(res, 400, { ok: false, error: "Email, code, and new password are required" }, req)
  }
  if (newPassword.length < 8) {
    return sendJson(res, 400, { ok: false, error: "Password must be at least 8 characters" }, req)
  }
  if (!isDbConfigured()) {
    return sendJson(res, 503, { ok: false, error: "Database not configured" }, req)
  }

  const verifyResult = verifyResetCode(email, code)
  if (!verifyResult.valid) {
    return sendJson(res, 400, { ok: false, error: verifyResult.reason || "Invalid reset code" }, req)
  }

  try {
    const user = await getUserByEmailForLogin(email)
    if (!user || !user.isActive) {
      return sendJson(res, 400, { ok: false, error: "Invalid reset request" }, req)
    }

    const newHash = await hashPassword(newPassword)
    await updatePasswordHash(user.id, newHash)
    _passwordResetCodes.delete(email)

    await writeAuditLog({
      userId: user.id,
      action: "UPDATE",
      resource: "auth-password-reset-confirm",
      ipAddress: getClientIp(req),
      success: true,
    }).catch(() => {})

    return sendJson(res, 200, { ok: true }, req)
  } catch (err) {
    console.error("[auth/password-reset/confirm] error:", err)
    return sendJson(res, 500, { ok: false, error: "Internal server error" }, req)
  }
}

async function handleAdminSetPassword(req, res, authUser) {
  if (!authUser || authUser.role !== "SENTINEL_COMMANDER") {
    return sendJson(res, 403, { ok: false, error: "Forbidden" }, req)
  }

  const parsed = await parseJsonBody(req)
  if (!parsed.ok) return sendJson(res, parsed.statusCode || 400, { ok: false, error: parsed.error }, req)

  const body = parsed.data
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : ""
  const newPassword = typeof body.newPassword === "string" ? body.newPassword : ""

  if (!email || !newPassword) {
    return sendJson(res, 400, { ok: false, error: "Email and new password are required" }, req)
  }

  if (newPassword.length < 8) {
    return sendJson(res, 400, { ok: false, error: "Password must be at least 8 characters" }, req)
  }

  try {
    const user = await getUserByEmailForLogin(email)
    if (!user || !user.isActive) {
      return sendJson(res, 404, { ok: false, error: "User not found" }, req)
    }

    const newHash = await hashPassword(newPassword)
    await updatePasswordHash(user.id, newHash)

    await writeAuditLog({
      userId: authUser.userId,
      action: "UPDATE",
      resource: "admin-password-set",
      resourceId: user.id,
      ipAddress: getClientIp(req),
      success: true,
      metadata: { targetEmail: email },
    }).catch(() => {})

    return sendJson(res, 200, { ok: true }, req)
  } catch (err) {
    console.error("[auth/admin-set-password] error:", err)
    return sendJson(res, 500, { ok: false, error: "Internal server error" }, req)
  }
}

/**
 * POST /api/sentinel/org/invite-email
 * Body: { email, inviteLink, inviterName?, organizationName? }
 */
async function handleSendInviteEmail(req, res, user) {
  if (!canPerformAction(user.role, ACTIONS.TEAM_ADD_MEMBER)) {
    return sendJson(res, 403, { ok: false, error: "Insufficient permissions" }, req)
  }

  if (!isGraphMailConfigured()) {
    return sendJson(res, 503, { ok: false, error: "Microsoft Graph email is not configured" }, req)
  }

  const parsed = await parseJsonBody(req)
  if (!parsed.ok) return sendJson(res, parsed.statusCode || 400, { ok: false, error: parsed.error }, req)

  const body = parsed.data
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : ""
  const inviteLink = typeof body.inviteLink === "string" ? body.inviteLink.trim() : ""
  const inviterName = typeof body.inviterName === "string" && body.inviterName.trim() ? body.inviterName.trim() : user.email
  const organizationName = typeof body.organizationName === "string" && body.organizationName.trim()
    ? body.organizationName.trim()
    : "NovusSparks"

  if (!email || !inviteLink) {
    return sendJson(res, 400, { ok: false, error: "email and inviteLink are required" }, req)
  }

  try {
    await sendInviteEmail({
      to: email,
      inviterName,
      inviteLink,
      organizationName,
    })

    await writeAuditLog({
      userId: user.userId,
      action: "CREATE",
      resource: "invite-email",
      metadata: { email, organizationName },
      ipAddress: getClientIp(req),
      success: true,
    }).catch(() => {})

    return sendJson(res, 200, { ok: true }, req)
  } catch (err) {
    console.error("[sentinel/org/invite-email] error:", err)
    return sendJson(res, 500, { ok: false, error: "Failed to send invite email" }, req)
  }
}

/**
 * GET /api/auth/verify
 * Header: Authorization: Bearer <token>
 * Returns: { ok, user }
 */
async function handleVerify(req, res) {
  const authResult = authenticateRequest(req)
  if (!authResult.authenticated) {
    return sendJson(res, 401, { ok: false, error: authResult.error }, req)
  }

  try {
    // Fetch fresh user data from DB
    const user = await getUserById(authResult.user.userId)
    if (!user || !user.isActive) {
      return sendJson(res, 401, { ok: false, error: "User not found or inactive" }, req)
    }

    const subscription = await getUserSubscription(user.id)
    const normalizedUser = normalizeAuthUser(user)

    if (normalizedUser.role === "TESTER") {
      const testerEnv = enforceTesterEnvironment(req, normalizedUser)
      if (!testerEnv.allowed) {
        return sendJson(res, testerEnv.status || 403, { ok: false, error: testerEnv.error }, req)
      }
      await ensureTesterSubscription(normalizedUser.id, normalizedUser.id)
    }

    return sendJson(res, 200, {
      ok: true,
      user: normalizedUser,
      subscription: subscription || null,
    }, req)
  } catch (err) {
    console.error("[auth/verify] error:", err)
    return sendJson(res, 500, { ok: false, error: "Internal server error" }, req)
  }
}

/**
 * POST /api/auth/refresh
 * Header: Authorization: Bearer <token>
 * Returns new token if within refresh window.
 */
async function handleRefresh(req, res) {
  const authResult = authenticateRequest(req)
  if (!authResult.authenticated) {
    return sendJson(res, 401, { ok: false, error: authResult.error }, req)
  }

  // Re-fetch user and subscription for fresh data
  try {
    const user = await getUserById(authResult.user.userId)
    if (!user || !user.isActive) {
      return sendJson(res, 401, { ok: false, error: "User not found or inactive" }, req)
    }

    const subscription = await getUserSubscription(user.id)
    const tier = subscription?.tier || null
    const normalizedUser = normalizeAuthUser(user)

    const token = signToken({
      userId: user.id,
      email: user.email,
      role: normalizedUser.role,
      organizationId: user.organizationId || null,
      subscriptionTier: tier,
    })

    return sendJson(res, 200, { ok: true, token }, req)
  } catch (err) {
    console.error("[auth/refresh] error:", err)
    return sendJson(res, 500, { ok: false, error: "Internal server error" }, req)
  }
}

/**
 * POST /api/auth/logout
 * Revokes the current JWT so it cannot be used again.
 * Header: Authorization: Bearer <token>
 */
async function handleLogout(req, res) {
  const token = extractToken(req)
  if (!token) {
    return sendJson(res, 200, { ok: true }, req) // Already logged out
  }

  const result = verifyToken(token)
  if (result.valid && result.payload) {
    // Add token hash to revocation list until it expires
    revokeToken(hashToken(token), result.payload.exp || Math.floor(Date.now() / 1000) + 86400)

    await writeAuditLog({
      userId: result.payload.userId,
      action: "LOGOUT",
      resource: "auth",
      ipAddress: getClientIp(req),
      success: true,
    }).catch(() => {})
  }

  return sendJson(res, 200, { ok: true }, req)
}

async function handleAuthCapabilities(req, res) {
  const auth = authorize(req)
  if (!auth.authorized) {
    return sendJson(res, 401, { ok: false, error: "Unauthorized" }, req)
  }

  return sendJson(res, 200, {
    ok: true,
    capabilities: getAuthCapabilities(auth.user),
  }, req)
}

/**
 * GET /api/sentinel/me
 * Returns current user profile, subscription, org, and module permissions.
 */
async function handleGetMe(req, res, user) {
  try {
    const fullUser = await getUserById(user.userId)
    if (!fullUser) {
      return sendJson(res, 404, { ok: false, error: "User not found" }, req)
    }

    const [subscription, modulePermissions] = await Promise.all([
      getUserSubscription(user.userId),
      getUserModulePermissions(user.userId),
    ])

    let organization = null
    if (fullUser.organizationId) {
      organization = await getOrganization(fullUser.organizationId).catch(() => null)
    }

    return sendJson(res, 200, {
      ok: true,
      user: fullUser,
      subscription: subscription || null,
      organization,
      modulePermissions,
    }, req)
  } catch (err) {
    console.error("[sentinel/me] error:", err)
    return sendJson(res, 500, { ok: false, error: "Internal server error" }, req)
  }
}

/**
 * GET /api/sentinel/modules
 * Returns modules accessible to the current user.
 */
async function handleGetModules(req, res, user) {
  try {
    const subscription = await getUserSubscription(user.userId)
    const tier = subscription?.tier || "BASIC"
    const modulePermissions = await getUserModulePermissions(user.userId)

    // Commander gets all modules
    if (user.role === "SENTINEL_COMMANDER") {
      return sendJson(res, 200, {
        ok: true,
        modules: Object.values(MODULES),
        tier,
      }, req)
    }

    // Get tier modules and filter by explicit grants where needed
    const tierModules = TIER_MODULES[tier] || TIER_MODULES.BASIC
    const accessible = tierModules.filter((mod) => {
      const check = checkModuleAccess({
        role: user.role,
        tier,
        moduleName: mod,
        modulePermissions,
      })
      return check.allowed
    })

    return sendJson(res, 200, { ok: true, modules: accessible, tier }, req)
  } catch (err) {
    console.error("[sentinel/modules] error:", err)
    return sendJson(res, 500, { ok: false, error: "Internal server error" }, req)
  }
}

/**
 * POST /api/sentinel/check-access
 * Body: { moduleName, action? }
 * Returns: { allowed, reason?, requiredTier? }
 */
async function handleCheckAccess(req, res, user) {
  const parsed = await parseJsonBody(req)
  if (!parsed.ok) return sendJson(res, parsed.statusCode || 400, { ok: false, error: parsed.error }, req)
  const body = parsed.data
  const moduleName = body.moduleName
  const action = body.action

  if (!moduleName && !action) {
    return sendJson(res, 400, {
      ok: false,
      error: "Provide moduleName and/or action",
    }, req)
  }

  try {
    // Check module access
    if (moduleName) {
      const subscription = await getUserSubscription(user.userId)
      const tier = subscription?.tier || "BASIC"
      const modulePermissions = await getUserModulePermissions(user.userId)

      // Phase 3: include org-level module subscription in the check
      let orgModSub = null
      if (user.organizationId) {
        try {
          orgModSub = await getOrgModuleSubscription(user.organizationId, moduleName)
        } catch (err) {
          // Non-fatal: fall back to tier-only check
          console.warn("[sentinel/check-access] org sub lookup failed:", err.message)
        }
      }

      const result = checkModuleAccess({
        role: user.role,
        tier,
        moduleName,
        modulePermissions,
        orgModuleSubscription: orgModSub,
      })

      if (!result.allowed) {
        return sendJson(res, 200, { ok: true, ...result }, req)
      }
    }

    // Check action permission
    if (action) {
      const allowed = canPerformAction(user.role, action)
      if (!allowed) {
        return sendJson(res, 200, {
          ok: true,
          allowed: false,
          reason: `Role "${user.role}" cannot perform "${action}"`,
        }, req)
      }
    }

    return sendJson(res, 200, { ok: true, allowed: true }, req)
  } catch (err) {
    console.error("[sentinel/check-access] error:", err)
    return sendJson(res, 500, { ok: false, error: "Internal server error" }, req)
  }
}

/**
 * GET /api/sentinel/org/members
 * Returns members of the user's organization.
 */
async function handleGetOrgMembers(req, res, user) {
  if (!user.organizationId) {
    return sendJson(res, 400, { ok: false, error: "User not in an organization" }, req)
  }

  if (!canPerformAction(user.role, ACTIONS.TEAM_VIEW_MEMBERS)) {
    return sendJson(res, 403, { ok: false, error: "Insufficient permissions" }, req)
  }

  try {
    const members = await listOrgUsers(user.organizationId)
    return sendJson(res, 200, { ok: true, members }, req)
  } catch (err) {
    console.error("[sentinel/org/members] error:", err)
    return sendJson(res, 500, { ok: false, error: "Internal server error" }, req)
  }
}

async function handleCreateOrgMember(req, res, actor) {
  const fullActor = await getUserById(actor.userId).catch(() => null)
  const actorOrganizationId = fullActor?.organizationId || actor.organizationId || null

  if (!actorOrganizationId) {
    return sendJson(res, 400, { ok: false, error: "User not in an organization" }, req)
  }

  const actorRole = fullActor?.role || actor.role

  if (!canPerformAction(actorRole, ACTIONS.TEAM_ADD_MEMBER)) {
    return sendJson(res, 403, { ok: false, error: "Insufficient permissions" }, req)
  }

  const parsed = await parseJsonBody(req)
  if (!parsed.ok) return sendJson(res, parsed.statusCode || 400, { ok: false, error: parsed.error }, req)

  const body = parsed.data
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : ""
  const password = typeof body.password === "string" ? body.password : ""
  const fullName = typeof body.fullName === "string" ? body.fullName.trim() : ""
  const role = typeof body.role === "string" ? body.role.trim().toUpperCase() : "TEAM_MEMBER"

  if (!email || !fullName || !password) {
    return sendJson(res, 400, { ok: false, error: "Email, fullName, and password are required" }, req)
  }

  if (password.length < 8) {
    return sendJson(res, 400, { ok: false, error: "Password must be at least 8 characters" }, req)
  }

  const allowedRoles = new Set(["USER", "TEAM_MEMBER", "TEAM_ADMIN", "ORG_ADMIN"])
  const nextRole = allowedRoles.has(role) ? role : "TEAM_MEMBER"

  try {
    let user = await getUserByEmailForLogin(email)
    let isNewUser = false

    if (!user) {
      const passwordHash = await hashPassword(password)
      const newUserId = crypto.randomUUID()
      user = await createUser({
        id: newUserId,
        email,
        fullName,
        passwordHash,
        role: nextRole,
        organizationId: actorOrganizationId,
      })

      if (!user) {
        user = await getUserByEmailForLogin(email)
      } else {
        isNewUser = true
        // Seed welcome credits for new org-member (non-blocking)
        seedWelcomeCredits(user.id, actor.userId).catch((err) => {
          console.warn("[invite] welcome credits seed failed (non-blocking):", err?.message)
        })
      }
    }

    if (!user) {
      return sendJson(res, 500, { ok: false, error: "Failed to create organization member" }, req)
    }

    const assignedUser = await assignUserToOrganization(user.id, actorOrganizationId, nextRole)
    if (!assignedUser) {
      return sendJson(res, 500, { ok: false, error: "Failed to assign member to organization" }, req)
    }

    await writeAuditLog({
      userId: actor.userId,
      action: "CREATE",
      resource: "organization-member",
      resourceId: assignedUser.id,
      metadata: { email, organizationId: actorOrganizationId, role: nextRole },
      ipAddress: getClientIp(req),
      success: true,
    }).catch(() => {})

    // Send welcome email to newly created members and notify admin
    if (isGraphMailConfigured()) {
      if (isNewUser) {
        sendWelcomeEmail({
          to: email,
          fullName,
        }).then(() => {
          console.log(`[mail/welcome:org-member] sent to ${email}`)
        }).catch((err) => {
          console.error("[mail/welcome:org-member] send FAILED:", err.message, err.stack)
        })
      }

      sendNewUserAdminNotification({
        adminEmail: ADMIN_NOTIFICATION_EMAIL,
        newUserEmail: email,
        newUserName: fullName,
        source: isNewUser ? "enterprise-member-created" : "enterprise-member-added",
      }).then(() => {
        console.log(`[mail/admin-notify:org-member] sent to ${ADMIN_NOTIFICATION_EMAIL} for ${email}`)
      }).catch((err) => {
        console.error("[mail/admin-notify:org-member] send FAILED:", err.message, err.stack)
      })
    } else {
      console.warn("[mail] Graph Mail not configured — skipping emails for org member", email)
    }

    return sendJson(res, 201, { ok: true, member: assignedUser }, req)
  } catch (err) {
    console.error("[sentinel/org/members:create] error:", err)
    return sendJson(res, 500, { ok: false, error: "Internal server error" }, req)
  }
}

async function handleBootstrapOrganization(req, res, actor) {
  const fullActor = await getUserById(actor.userId).catch(() => null)
  const actorRole = fullActor?.role || actor.role
  const actorOrganizationId = fullActor?.organizationId || actor.organizationId || null

  if (actorOrganizationId) {
    if (!hasMinimumRole(actorRole, "ORG_ADMIN")) {
      return sendJson(res, 403, { ok: false, error: "Insufficient permissions to manage organization" }, req)
    }
    const existingOrg = await getOrganization(actorOrganizationId).catch(() => null)
    return sendJson(res, 200, { ok: true, organization: existingOrg || { id: actorOrganizationId } }, req)
  }

  const parsed = await parseJsonBody(req)
  if (!parsed.ok) return sendJson(res, parsed.statusCode || 400, { ok: false, error: parsed.error }, req)

  const body = parsed.data
  const name = typeof body.name === "string" && body.name.trim() ? body.name.trim() : `${actor.email}'s Organization`
  const tier = typeof body.tier === "string" && body.tier.trim() ? body.tier.trim().toUpperCase() : "ENTERPRISE"

  try {
    const organization = await createOrganization({
      name,
      adminUserId: actor.userId,
      tier,
    })

    if (!organization) {
      return sendJson(res, 500, { ok: false, error: "Failed to bootstrap organization" }, req)
    }

    await writeAuditLog({
      userId: actor.userId,
      action: "CREATE",
      resource: "organization",
      resourceId: organization.id,
      metadata: { name, tier },
      ipAddress: getClientIp(req),
      success: true,
    }).catch(() => {})

    return sendJson(res, 201, { ok: true, organization }, req)
  } catch (err) {
    console.error("[sentinel/org/bootstrap] error:", err)
    return sendJson(res, 500, { ok: false, error: "Internal server error" }, req)
  }
}

/**
 * POST /api/sentinel/modules/grant
 * Body: { userId, moduleName, accessLevel, organizationId?, expiresAt? }
 */
async function handleGrantModuleAccess(req, res, actor) {
  const parsed = await parseJsonBody(req)
  if (!parsed.ok) return sendJson(res, parsed.statusCode || 400, { ok: false, error: parsed.error }, req)
  const body = parsed.data
  const { userId, moduleName, accessLevel, organizationId, expiresAt } = body

  if (!userId || !moduleName) {
    return sendJson(res, 400, {
      ok: false,
      error: "userId and moduleName are required",
    }, req)
  }

  const orgId = organizationId || actor.organizationId
  if (!orgId) {
    return sendJson(res, 400, { ok: false, error: "organizationId required" }, req)
  }

  // Phase 3: seat-aware grant check (fetches org module sub + seat count)
  let orgModSub = null
  let usedSeats = undefined
  try {
    orgModSub = await getOrgModuleSubscription(orgId, moduleName)
    if (orgModSub) {
      usedSeats = await countModuleSeats(orgId, moduleName)
    }
  } catch (err) {
    // If DB lookup fails, fall back to role-only check (backward compat)
    console.warn("[sentinel/modules/grant] seat check failed, falling back:", err.message)
  }

  const grantCheck = checkModuleGrantWithSeats({
    actorRole: actor.role,
    moduleName,
    orgModuleSubscription: orgModSub,
    usedSeats,
  })
  if (!grantCheck.allowed) {
    return sendJson(res, 403, { ok: false, error: grantCheck.reason }, req)
  }

  try {
    const permId = `perm_${crypto.randomUUID()}`
    await dbGrantModulePerm({
      id: permId,
      userId,
      organizationId: orgId,
      moduleName,
      accessLevel: accessLevel || "READ_WRITE",
      grantedBy: actor.userId,
      expiresAt: expiresAt || null,
    })

    await writeAuditLog({
      userId: actor.userId,
      action: "ASSIGN_ROLE",
      resource: "module-permission",
      resourceId: permId,
      metadata: { targetUserId: userId, moduleName, accessLevel, usedSeats, maxSeats: orgModSub?.maxSeats },
      ipAddress: getClientIp(req),
      success: true,
    }).catch(() => {})

    return sendJson(res, 200, { ok: true, permissionId: permId }, req)
  } catch (err) {
    console.error("[sentinel/modules/grant] error:", err)
    return sendJson(res, 500, { ok: false, error: "Internal server error" }, req)
  }
}

/**
 * POST /api/sentinel/modules/revoke
 * Body: { userId, moduleName, organizationId? }
 */
async function handleRevokeModuleAccess(req, res, actor) {
  const parsed = await parseJsonBody(req)
  if (!parsed.ok) return sendJson(res, parsed.statusCode || 400, { ok: false, error: parsed.error }, req)
  const body = parsed.data
  const { userId, moduleName, organizationId } = body

  if (!userId || !moduleName) {
    return sendJson(res, 400, {
      ok: false,
      error: "userId and moduleName are required",
    }, req)
  }

  if (!hasMinimumRole(actor.role, "ORG_ADMIN")) {
    return sendJson(res, 403, {
      ok: false,
      error: "Only ORG_ADMIN or higher can revoke module access",
    }, req)
  }

  const orgId = organizationId || actor.organizationId
  if (!orgId) {
    return sendJson(res, 400, { ok: false, error: "organizationId required" }, req)
  }

  try {
    await dbRevokeModulePerm(userId, orgId, moduleName)

    await writeAuditLog({
      userId: actor.userId,
      action: "DELETE",
      resource: "module-permission",
      metadata: { targetUserId: userId, moduleName },
      ipAddress: getClientIp(req),
      success: true,
    }).catch(() => {})

    return sendJson(res, 200, { ok: true }, req)
  } catch (err) {
    console.error("[sentinel/modules/revoke] error:", err)
    return sendJson(res, 500, { ok: false, error: "Internal server error" }, req)
  }
}

/**
 * GET /api/sentinel/audit
 * Query: ?limit=100&userId=...
 * Returns recent audit log entries.
 */
async function handleGetAuditLogs(req, res, user, url) {
  if (!canPerformAction(user.role, ACTIONS.AUDIT_VIEW)) {
    return sendJson(res, 403, { ok: false, error: "Insufficient permissions" }, req)
  }

  try {
    const limit = Number(url.searchParams.get("limit")) || 100
    const offset = Number(url.searchParams.get("offset")) || 0
    const filterUserId = url.searchParams.get("userId") || undefined
    const filterAction = url.searchParams.get("action") || undefined
    const filterResource = url.searchParams.get("resource") || undefined
    const filterResourceId = url.searchParams.get("resourceId") || undefined
    const filterSuccess = url.searchParams.has("success")
      ? url.searchParams.get("success") === "true"
      : undefined
    const fromTs = url.searchParams.get("from") ? Number(url.searchParams.get("from")) : undefined
    const toTs = url.searchParams.get("to") ? Number(url.searchParams.get("to")) : undefined

    const { logs, total } = await getAuditLogsAdvanced({
      userId: filterUserId,
      action: filterAction,
      resource: filterResource,
      resourceId: filterResourceId,
      success: filterSuccess,
      fromTs,
      toTs,
      limit: Math.min(limit, 500),
      offset,
    })

    return sendJson(res, 200, { ok: true, logs, total, limit, offset }, req)
  } catch (err) {
    console.error("[sentinel/audit] error:", err)
    return sendJson(res, 500, { ok: false, error: "Internal server error" }, req)
  }
}

/**
 * GET /api/sentinel/audit/stats
 * Query: ?from=...&to=...&userId=...
 * Returns audit log aggregation stats (by action, resource, day).
 * Requires TEAM_ADMIN+.
 */
async function handleGetAuditStats(req, res, user, url) {
  if (!canPerformAction(user.role, ACTIONS.AUDIT_VIEW)) {
    return sendJson(res, 403, { ok: false, error: "Insufficient permissions" }, req)
  }

  try {
    const fromTs = url.searchParams.get("from") ? Number(url.searchParams.get("from")) : undefined
    const toTs = url.searchParams.get("to") ? Number(url.searchParams.get("to")) : undefined
    const userId = url.searchParams.get("userId") || undefined

    const stats = await getAuditStats({ fromTs, toTs, userId })
    return sendJson(res, 200, { ok: true, ...stats }, req)
  } catch (err) {
    console.error("[sentinel/audit/stats] error:", err)
    return sendJson(res, 500, { ok: false, error: "Internal server error" }, req)
  }
}

/**
 * GET /api/sentinel/admin/users?limit=500
 * Full user list with effective plan resolved from Neon DB.
 * Requires SENTINEL_COMMANDER.
 */
async function handleAdminListUsers(req, res, user) {
  if (!hasMinimumRole(user.role, "SENTINEL_COMMANDER")) {
    return sendJson(res, 403, { ok: false, error: "Only Sentinel Commander can list all users" }, req)
  }

  if (!isDbConfigured()) {
    return sendJson(res, 503, { ok: false, error: "Database not configured" }, req)
  }

  try {
    const rows = await listAllUsersWithSubscriptions(500)

    const users = rows.map((u) => {
      const resolved = resolveEffectiveTier({
        role: u.role,
        subTier: u.subTier || null,
        subStatus: u.subStatus || null,
        subAssignedAt: u.subAssignedAt || null,
        subExpiresAt: u.subExpiresAt || null,
        proCredits: u.proCredits || 0,
        orgTier: u.orgTier || null,
      })

      return {
        id: u.id,
        email: u.email,
        fullName: u.fullName,
        role: u.role,
        organizationId: u.organizationId,
        avatarUrl: u.avatarUrl,
        isActive: u.isActive,
        createdAt: u.createdAt,
        lastLoginAt: u.lastLoginAt,
        // Effective resolved plan — this is what the app should use
        effectivePlan: resolved.effectivePlan,
        planStatus: resolved.status,
        planSource: resolved.source,
        planReason: resolved.reason,
        credits: resolved.credits,
        trialDaysRemaining: resolved.trialDaysRemaining,
        // Raw subscription data for admin display
        subscription: u.subTier ? {
          tier: u.subTier,
          status: u.subStatus,
          assignedAt: u.subAssignedAt,
          expiresAt: u.subExpiresAt,
          proCredits: u.proCredits || 0,
        } : null,
      }
    })

    return sendJson(res, 200, { ok: true, total: users.length, users }, req)
  } catch (err) {
    console.error("[sentinel/admin/users] error:", err)
    return sendJson(res, 500, { ok: false, error: "Internal server error" }, req)
  }
}

/**
 * POST /api/sentinel/admin/users/delete
 * Body: { userId or email }
 * Hard delete a user from Neon database.
 * Removes user, subscriptions, and permissions.
 * Requires SENTINEL_COMMANDER.
 */
async function handleAdminDeleteUser(req, res, user) {
  if (!hasMinimumRole(user.role, "SENTINEL_COMMANDER")) {
    return sendJson(res, 403, { ok: false, error: "Only Sentinel Commander can delete users" }, req)
  }

  if (!isDbConfigured()) {
    return sendJson(res, 503, { ok: false, error: "Database not configured" }, req)
  }

  const parsed = await parseJsonBody(req)
  if (!parsed.ok) return sendJson(res, parsed.statusCode || 400, { ok: false, error: parsed.error }, req)

  const body = parsed.data || {}
  // Accept either userId or email
  const targetUserId = typeof body.userId === "string" ? body.userId.trim() : ""
  const targetEmail = typeof body.email === "string" ? body.email.trim() : ""

  if (!targetUserId && !targetEmail) {
    return sendJson(res, 400, { ok: false, error: "Provide either userId or email" }, req)
  }

  // Prevent deleting master admin
  if (targetEmail && targetEmail.toLowerCase() === "admin@novussparks.com") {
    return sendJson(res, 409, { ok: false, error: "Cannot delete master admin" }, req)
  }

  try {
    let userIdToDelete = targetUserId

    // If only email provided, look up the user ID first
    if (!userIdToDelete && targetEmail) {
      const userRow = await getUserByEmail(targetEmail)
      if (!userRow) {
        return sendJson(res, 404, { ok: false, error: "User not found" }, req)
      }
      userIdToDelete = userRow.id
    }

    // Delete the user from Neon
    const deletedUser = await deleteUserById(userIdToDelete)
    if (!deletedUser) {
      return sendJson(res, 404, { ok: false, error: "User not found" }, req)
    }

    console.log(`[ADMIN DELETE USER] Admin ${user.email} deleted user ${deletedUser.email} (ID: ${userIdToDelete})`)

    return sendJson(res, 200, { ok: true, message: "User deleted successfully", deletedUser }, req)
  } catch (err) {
    console.error("[handleAdminDeleteUser] error:", err)
    return sendJson(res, 500, { ok: false, error: "Internal server error" }, req)
  }
}

/**
 * POST /api/sentinel/admin/subscriptions/add-credits
 * Body: { userId, credits }
 * Requires SENTINEL_COMMANDER.
 */
async function handleAdminAddCredits(req, res, user) {
  if (!hasMinimumRole(user.role, "SENTINEL_COMMANDER")) {
    return sendJson(res, 403, { ok: false, error: "Only Sentinel Commander can manage credits" }, req)
  }

  if (!isDbConfigured()) {
    return sendJson(res, 503, { ok: false, error: "Database not configured" }, req)
  }

  const parsed = await parseJsonBody(req)
  if (!parsed.ok) return sendJson(res, parsed.statusCode || 400, { ok: false, error: parsed.error }, req)

  const body = parsed.data || {}
  const targetUserId = typeof body.userId === "string" ? body.userId.trim() : ""
  const credits = Number(body.credits)

  if (!targetUserId || !Number.isFinite(credits) || credits <= 0) {
    return sendJson(res, 400, { ok: false, error: "userId and positive credits are required" }, req)
  }

  try {
    const target = await getUserById(targetUserId)
    if (!target) {
      return sendJson(res, 404, { ok: false, error: "User not found" }, req)
    }

    const updated = await addCreditsToUserSubscription(targetUserId, credits, user.userId)
    if (!updated) {
      return sendJson(res, 500, { ok: false, error: "Failed to add credits" }, req)
    }

    const tierLower = String(updated.tier || "BASIC").toLowerCase()
    return sendJson(res, 200, {
      ok: true,
      userId: targetUserId,
      credits: Number(updated.proCredits || 0),
      tier: tierLower === "teams" ? "team" : tierLower,
    }, req)
  } catch (err) {
    console.error("[sentinel/admin/subscriptions/add-credits] error:", err)
    return sendJson(res, 500, { ok: false, error: "Internal server error" }, req)
  }
}

/**
 * POST /api/sentinel/admin/subscriptions/set-plan
 * Body: { userId, plan }
 * Requires SENTINEL_COMMANDER.
 */
async function handleAdminSetPlan(req, res, user) {
  if (!hasMinimumRole(user.role, "SENTINEL_COMMANDER")) {
    return sendJson(res, 403, { ok: false, error: "Only Sentinel Commander can set plans" }, req)
  }

  if (!isDbConfigured()) {
    return sendJson(res, 503, { ok: false, error: "Database not configured" }, req)
  }

  const parsed = await parseJsonBody(req)
  if (!parsed.ok) return sendJson(res, parsed.statusCode || 400, { ok: false, error: parsed.error }, req)

  const body = parsed.data || {}
  const targetUserId = typeof body.userId === "string" ? body.userId.trim() : ""
  const rawPlan = typeof body.plan === "string" ? body.plan.trim().toLowerCase() : ""
  const tierMap = {
    basic: "BASIC",
    pro: "PRO",
    team: "TEAMS",
    enterprise: "ENTERPRISE",
  }
  const dbTier = tierMap[rawPlan]

  if (!targetUserId || !dbTier) {
    return sendJson(res, 400, { ok: false, error: "Valid userId and plan are required" }, req)
  }

  try {
    const target = await getUserById(targetUserId)
    if (!target) {
      return sendJson(res, 404, { ok: false, error: "User not found" }, req)
    }

    const updated = await setUserSubscriptionPlan(targetUserId, dbTier, user.userId)
    if (!updated) {
      return sendJson(res, 500, { ok: false, error: "Failed to set plan" }, req)
    }

    return sendJson(res, 200, {
      ok: true,
      userId: targetUserId,
      plan: rawPlan,
      credits: Number(updated.proCredits || 0),
    }, req)
  } catch (err) {
    console.error("[sentinel/admin/subscriptions/set-plan] error:", err)
    return sendJson(res, 500, { ok: false, error: "Internal server error" }, req)
  }
}

/**
 * GET /api/sentinel/admin/stats
 * System overview stats for the admin console.
 * Requires SENTINEL_COMMANDER.
 */
async function handleGetSystemStats(req, res, user) {
  if (!hasMinimumRole(user.role, "SENTINEL_COMMANDER")) {
    return sendJson(res, 403, { ok: false, error: "Only Sentinel Commander can view system stats" }, req)
  }

  try {
    const stats = await getSystemStats()
    return sendJson(res, 200, { ok: true, ...stats }, req)
  } catch (err) {
    console.error("[sentinel/admin/stats] error:", err)
    return sendJson(res, 500, { ok: false, error: "Internal server error" }, req)
  }
}

function isRoutingAdmin(user) {
  return hasMinimumRole(user.role, "SENTINEL_COMMANDER") || canPerformAction(user.role, ACTIONS.ADMIN_SYSTEM)
}

function parseRoutingPayload(body = {}) {
  const toBoolRecord = (value) => {
    if (!value || typeof value !== "object") return {}
    const out = {}
    for (const [k, v] of Object.entries(value)) out[k] = Boolean(v)
    return out
  }

  const toNumRecord = (value) => {
    if (!value || typeof value !== "object") return {}
    const out = {}
    for (const [k, v] of Object.entries(value)) {
      const n = Number(v)
      if (!Number.isNaN(n) && Number.isFinite(n) && n >= 0) out[k] = n
    }
    return out
  }

  return {
    moduleName: typeof body.moduleName === "string" && body.moduleName.trim() ? body.moduleName.trim() : "global",
    providerOrder: Array.isArray(body.providerOrder) ? body.providerOrder : undefined,
    webProviderOrder: Array.isArray(body.webProviderOrder) ? body.webProviderOrder : undefined,
    enabledProviders: toBoolRecord(body.enabledProviders),
    enabledWebProviders: toBoolRecord(body.enabledWebProviders),
    dailyBudgetUsd: body.dailyBudgetUsd,
    monthlyBudgetUsd: body.monthlyBudgetUsd,
    providerDailyCaps: toNumRecord(body.providerDailyCaps),
    timeoutMs: body.timeoutMs,
  }
}

async function handleGetProviderRouting(req, res, user, url) {
  if (!isRoutingAdmin(user)) {
    return sendJson(res, 403, { ok: false, error: "Insufficient permissions" }, req)
  }

  try {
    const moduleName = url.searchParams.get("module") || null
    if (moduleName) {
      const config = await getResolvedRouting(moduleName)
      return sendJson(res, 200, { ok: true, config }, req)
    }

    const configs = await listProviderRoutingConfigs()
    return sendJson(res, 200, { ok: true, configs }, req)
  } catch (err) {
    console.error("[sentinel/admin/provider-routing:get] error:", err)
    return sendJson(res, 500, { ok: false, error: "Failed to load provider routing" }, req)
  }
}

async function handleUpsertProviderRouting(req, res, user) {
  if (!isRoutingAdmin(user)) {
    return sendJson(res, 403, { ok: false, error: "Insufficient permissions" }, req)
  }

  const parsed = await parseJsonBody(req)
  if (!parsed.ok) return sendJson(res, parsed.statusCode || 400, { ok: false, error: parsed.error }, req)

  try {
    const input = parseRoutingPayload(parsed.data)
    const saved = await upsertProviderRoutingConfig({
      ...input,
      updatedBy: user.userId,
    })

    await writeAuditLog({
      userId: user.userId,
      action: "UPDATE",
      resource: "provider-routing",
      resourceId: saved.moduleName,
      metadata: {
        providerOrder: saved.providerOrder,
        webProviderOrder: saved.webProviderOrder,
        dailyBudgetUsd: saved.dailyBudgetUsd,
        monthlyBudgetUsd: saved.monthlyBudgetUsd,
      },
      ipAddress: getClientIp(req),
      success: true,
    }).catch(() => {})

    return sendJson(res, 200, { ok: true, config: saved }, req)
  } catch (err) {
    console.error("[sentinel/admin/provider-routing:upsert] error:", err)
    return sendJson(res, 500, { ok: false, error: "Failed to save provider routing" }, req)
  }
}

async function handleGetProviderUsage(req, res, user, url) {
  if (!isRoutingAdmin(user)) {
    return sendJson(res, 403, { ok: false, error: "Insufficient permissions" }, req)
  }

  try {
    const days = Number(url.searchParams.get("days") || 30)
    const moduleName = url.searchParams.get("module") || "global"

    const [summary, budget] = await Promise.all([
      getProviderUsageSummary({ days }),
      getProviderBudgetSnapshot({ moduleName }),
    ])

    return sendJson(res, 200, {
      ok: true,
      summary,
      budget,
      moduleName,
    }, req)
  } catch (err) {
    console.error("[sentinel/admin/provider-usage] error:", err)
    return sendJson(res, 500, { ok: false, error: "Failed to load provider usage" }, req)
  }
}

// ──────────────── Skills Admin (Shadow Mode) ───────────────────

async function handleSkillsUpload(req, res, user) {
  if (!isSkillAdmin(user)) {
    return sendJson(res, 403, { ok: false, error: "Insufficient permissions" }, req)
  }

  const parsed = await parseJsonBody(req, MAX_SKILL_ZIP_BYTES * 2)
  if (!parsed.ok) return sendJson(res, parsed.statusCode || 400, { ok: false, error: parsed.error }, req)

  const fileName = typeof parsed.data?.fileName === "string" ? parsed.data.fileName.trim() : "skill.zip"
  const zipBase64 = typeof parsed.data?.zipBase64 === "string" ? parsed.data.zipBase64.trim() : ""
  if (!zipBase64) {
    return sendJson(res, 400, { ok: false, error: "zipBase64 is required" }, req)
  }

  try {
    const bin = Buffer.from(zipBase64, "base64")
    if (bin.length === 0) {
      return sendJson(res, 400, { ok: false, error: "Invalid base64 ZIP payload" }, req)
    }
    if (bin.length > MAX_SKILL_ZIP_BYTES) {
      return sendJson(res, 413, { ok: false, error: `ZIP exceeds ${MAX_SKILL_ZIP_BYTES} bytes` }, req)
    }

    ensureSkillUploadDir()
    const skillId = crypto.randomUUID()
    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_")
    const storedZipPath = path.join(SKILL_UPLOAD_DIR, `${Date.now()}-${safeName}`)
    fs.writeFileSync(storedZipPath, bin)

    const entries = readZipEntries(storedZipPath)
    const manifest = readSkillManifestFromZip(storedZipPath, entries)

    const record = await createSkillRegistryEntry({
      id: skillId,
      name: manifest.skillName,
      version: manifest.version,
      description: manifest.description,
      uploadedBy: user.userId,
      fileName,
      storedZipPath,
      entriesCount: entries.length,
      manifestPath: manifest.manifestPath,
      frontmatter: manifest.frontmatter,
      status: "validated",
    })

    await writeAuditLog({
      userId: user.userId,
      action: "CREATE",
      resource: "skill-registry",
      resourceId: skillId,
      metadata: { name: record.name, version: record.version, entries: entries.length },
      ipAddress: getClientIp(req),
      success: true,
    }).catch(() => {})

    return sendJson(res, 200, {
      ok: true,
      skill: {
        id: record.id,
        name: record.name,
        version: record.version,
        description: record.description,
        uploadedBy: record.uploadedBy,
        uploadedAt: record.createdAt,
        status: record.status,
      },
    }, req)
  } catch (err) {
    console.error("[skills/upload] error:", err)
    return sendJson(res, 400, { ok: false, error: err instanceof Error ? err.message : "Skill upload failed" }, req)
  }
}

async function handleSkillsList(req, res, user, url) {
  if (!isSkillAdmin(user)) {
    return sendJson(res, 403, { ok: false, error: "Insufficient permissions" }, req)
  }

  const moduleFilter = url.searchParams.get("module") || ""
  const skillRows = await listSkillRegistryEntries({ limit: 200 })
  const skills = skillRows.map((s) => ({
    id: s.id,
    name: s.name,
    version: s.version,
    description: s.description,
    uploadedBy: s.uploadedBy,
    uploadedAt: s.createdAt,
    status: s.status,
  }))

  const filteredBindings = await listSkillBindings({ moduleName: moduleFilter || undefined })

  return sendJson(res, 200, { ok: true, skills, bindings: filteredBindings }, req)
}

async function handleSkillsBind(req, res, user) {
  if (!isSkillAdmin(user)) {
    return sendJson(res, 403, { ok: false, error: "Insufficient permissions" }, req)
  }

  const parsed = await parseJsonBody(req)
  if (!parsed.ok) return sendJson(res, parsed.statusCode || 400, { ok: false, error: parsed.error }, req)

  const moduleName = typeof parsed.data?.moduleName === "string" ? parsed.data.moduleName.trim() : ""
  const skillId = typeof parsed.data?.skillId === "string" ? parsed.data.skillId.trim() : ""
  const enabled = parsed.data?.enabled !== false
  const requestedMode = typeof parsed.data?.mode === "string" ? parsed.data.mode.trim().toLowerCase() : "shadow"
  const mode = requestedMode === "active" ? "shadow" : "shadow" // force shadow-first
  const rolloutPercent = Math.max(0, Math.min(100, Number(parsed.data?.rolloutPercent ?? 0)))

  if (!moduleName) return sendJson(res, 400, { ok: false, error: "moduleName required" }, req)
  if (!skillId) {
    return sendJson(res, 404, { ok: false, error: "skillId not found" }, req)
  }

  const skill = await getSkillRegistryEntryById(skillId)
  if (!skill) {
    return sendJson(res, 404, { ok: false, error: "skillId not found" }, req)
  }

  const binding = await upsertSkillBinding({
    moduleName,
    skillId: skill.id,
    enabled,
    mode,
    rolloutPercent,
    updatedBy: user.userId,
  })

  await writeAuditLog({
    userId: user.userId,
    action: "UPDATE",
    resource: "skill-binding",
    resourceId: moduleName,
    metadata: binding,
    ipAddress: getClientIp(req),
    success: true,
  }).catch(() => {})

  return sendJson(res, 200, { ok: true, binding }, req)
}

async function handleSkillsShadowEvaluate(req, res, user) {
  if (!isSkillAdmin(user)) {
    return sendJson(res, 403, { ok: false, error: "Insufficient permissions" }, req)
  }

  const parsed = await parseJsonBody(req)
  if (!parsed.ok) return sendJson(res, parsed.statusCode || 400, { ok: false, error: parsed.error }, req)

  const moduleName = typeof parsed.data?.moduleName === "string" ? parsed.data.moduleName.trim() : "global"
  const originalOutput = typeof parsed.data?.output === "string" ? parsed.data.output : ""
  const sourceInput = typeof parsed.data?.input === "string" ? parsed.data.input : ""

  if (!originalOutput.trim()) {
    return sendJson(res, 400, { ok: false, error: "output is required" }, req)
  }

  const binding = await getSkillBinding(moduleName)
  const skill = binding?.skillId ? await getSkillRegistryEntryById(binding.skillId) : null
  const before = scoreAiSignals(originalOutput)
  const preview = createHumanizedPreview(originalOutput)
  const after = scoreAiSignals(preview)
  const changed = preview !== originalOutput

  const log = await createSkillExecutionLog({
    id: crypto.randomUUID(),
    moduleName,
    skillId: skill?.id || null,
    skillName: skill?.name || null,
    mode: binding?.mode || "shadow",
    changed,
    aiSignalBefore: before,
    aiSignalAfter: after,
    actor: user.userId,
    inputPreview: sourceInput.slice(0, 220),
    metadata: {
      shadowMode: true,
      rolloutPercent: binding?.rolloutPercent ?? 0,
    },
  })

  return sendJson(res, 200, {
    ok: true,
    shadowMode: true,
    binding: binding || null,
    skill: skill ? { id: skill.id, name: skill.name, version: skill.version } : null,
    diff: {
      changed,
      aiSignalBefore: before,
      aiSignalAfter: after,
      delta: after - before,
    },
    preview,
    executionLogId: log.id,
  }, req)
}

async function handleSkillsLogs(req, res, user, url) {
  if (!isSkillAdmin(user)) {
    return sendJson(res, 403, { ok: false, error: "Insufficient permissions" }, req)
  }
  const moduleFilter = url.searchParams.get("module") || ""
  const limit = Math.max(1, Math.min(200, Number(url.searchParams.get("limit") || 50)))
  const logs = await listSkillExecutionLogs({ moduleName: moduleFilter || undefined, limit })
  return sendJson(res, 200, { ok: true, logs }, req)
}

function renderSkillsAdminHtml() {
  return `<!doctype html>
<html><head><meta charset="utf-8" /><title>Skills Admin</title>
<style>body{font-family:system-ui,sans-serif;max-width:900px;margin:30px auto;padding:0 16px} textarea,input,button{font:inherit} textarea{width:100%;min-height:120px} .card{border:1px solid #ddd;border-radius:10px;padding:14px;margin:12px 0} .muted{color:#666;font-size:12px}</style>
</head><body>
<h1>Skills Admin (Shadow Mode)</h1>
<p class="muted">Uploads skill ZIPs, binds skills per module, and runs shadow evaluations without mutating outputs.</p>

<div class="card">
  <h3>1) Upload Skill ZIP (base64)</h3>
  <input id="fileName" placeholder="skill.zip" value="skill.zip" />
  <textarea id="zipBase64" placeholder="Paste base64 ZIP payload"></textarea>
  <button onclick="uploadSkill()">Upload</button>
</div>

<div class="card">
  <h3>2) Bind Skill to Module</h3>
  <input id="moduleName" placeholder="module name (e.g. strategy)" value="strategy" />
  <input id="skillId" placeholder="skill id" />
  <button onclick="bindSkill()">Bind (Shadow)</button>
</div>

<div class="card">
  <h3>3) Shadow Evaluate Output</h3>
  <input id="evalModule" placeholder="module" value="strategy" />
  <textarea id="evalOutput" placeholder="Paste generated output"></textarea>
  <button onclick="evalShadow()">Evaluate</button>
</div>

<div class="card"><h3>Result</h3><pre id="out"></pre></div>

<script>
async function callApi(path, body){
  const r = await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},credentials:'include',body:JSON.stringify(body)});
  const j = await r.json(); document.getElementById('out').textContent = JSON.stringify(j,null,2);
}
function uploadSkill(){
  callApi('/api/sentinel/admin/skills/upload',{fileName:document.getElementById('fileName').value,zipBase64:document.getElementById('zipBase64').value});
}
function bindSkill(){
  callApi('/api/sentinel/admin/skills/bind',{moduleName:document.getElementById('moduleName').value,skillId:document.getElementById('skillId').value,enabled:true,mode:'shadow',rolloutPercent:0});
}
function evalShadow(){
  callApi('/api/sentinel/admin/skills/evaluate',{moduleName:document.getElementById('evalModule').value,output:document.getElementById('evalOutput').value,input:''});
}
</script>
</body></html>`
}

// ──────────────── Org Module Subscription Handlers (Phase 3) ─────

/**
 * GET /api/sentinel/org/subscriptions
 * Query: ?orgId=...&status=ACTIVE
 * Lists all module subscriptions for an org.
 * ORG_ADMIN+ or own org.
 */
async function handleListOrgModSubs(req, res, user, url) {
  const orgId = url.searchParams.get("orgId") || user.organizationId
  if (!orgId) {
    return sendJson(res, 400, { ok: false, error: "orgId required" }, req)
  }

  // H8 fix: Only SENTINEL_COMMANDER can view other org subscriptions
  if (orgId !== user.organizationId && !hasMinimumRole(user.role, "SENTINEL_COMMANDER")) {
    return sendJson(res, 403, { ok: false, error: "Cannot view other org subscriptions" }, req)
  }

  try {
    const status = url.searchParams.get("status") || undefined
    const subs = await listOrgModuleSubscriptions(orgId, { status })
    return sendJson(res, 200, { ok: true, subscriptions: subs }, req)
  } catch (err) {
    console.error("[sentinel/org/subscriptions] list error:", err)
    return sendJson(res, 500, { ok: false, error: "Internal server error" }, req)
  }
}

/**
 * GET /api/sentinel/org/subscriptions/:module
 * Get a single org module subscription.
 */
async function handleGetOrgModSub(req, res, user, moduleName) {
  const orgId = user.organizationId
  if (!orgId) {
    return sendJson(res, 400, { ok: false, error: "User has no organization" }, req)
  }

  try {
    const sub = await getOrgModuleSubscription(orgId, moduleName)
    if (!sub) {
      return sendJson(res, 404, { ok: false, error: `No subscription for module "${moduleName}"` }, req)
    }

    // Enrich with seat info
    const usedSeats = await countModuleSeats(orgId, moduleName)
    return sendJson(res, 200, { ok: true, subscription: { ...sub, usedSeats } }, req)
  } catch (err) {
    console.error("[sentinel/org/subscriptions] get error:", err)
    return sendJson(res, 500, { ok: false, error: "Internal server error" }, req)
  }
}

/**
 * POST /api/sentinel/org/subscriptions
 * Create/provision a module subscription for an org.
 * Requires ORG_ADMIN+ (or SENTINEL_COMMANDER for cross-org).
 * Body: { organizationId?, moduleName, tier, maxSeats, expiresAt?, autoRenew?, gracePeriodDays?, metadata? }
 */
async function handleCreateOrgModSub(req, res, actor) {
  if (!canPerformAction(actor.role, ACTIONS.SUB_MANAGE)) {
    return sendJson(res, 403, { ok: false, error: "Insufficient permissions to manage subscriptions" }, req)
  }

  const parsed = await parseJsonBody(req)
  if (!parsed.ok) return sendJson(res, parsed.statusCode || 400, { ok: false, error: parsed.error }, req)
  const body = parsed.data
  const { moduleName, tier, maxSeats, expiresAt, autoRenew, gracePeriodDays, metadata } = body
  const orgId = body.organizationId || actor.organizationId

  if (!orgId) {
    return sendJson(res, 400, { ok: false, error: "organizationId required" }, req)
  }
  if (!moduleName) {
    return sendJson(res, 400, { ok: false, error: "moduleName required" }, req)
  }

  // Cross-org provisioning requires SENTINEL_COMMANDER
  if (orgId !== actor.organizationId && !hasMinimumRole(actor.role, "SENTINEL_COMMANDER")) {
    return sendJson(res, 403, { ok: false, error: "Only Sentinel Commander can provision cross-org subscriptions" }, req)
  }

  try {
    const id = await dbCreateOrgModSub({
      organizationId: orgId,
      moduleName,
      tier: tier || "BASIC",
      maxSeats: maxSeats || 1,
      expiresAt: expiresAt || null,
      autoRenew: autoRenew ?? false,
      gracePeriodDays: gracePeriodDays ?? 7,
      provisionedBy: actor.userId,
      metadata: metadata || {},
    })

    await writeAuditLog({
      userId: actor.userId,
      action: "CREATE",
      resource: "org-module-subscription",
      resourceId: id,
      metadata: { orgId, moduleName, tier: tier || "BASIC", maxSeats: maxSeats || 1 },
      ipAddress: getClientIp(req),
      success: true,
    }).catch(() => {})

    return sendJson(res, 201, { ok: true, id }, req)
  } catch (err) {
    console.error("[sentinel/org/subscriptions] create error:", err)
    return sendJson(res, 500, { ok: false, error: "Internal server error" }, req)
  }
}

/**
 * PUT /api/sentinel/org/subscriptions/:module
 * Update an existing org module subscription.
 * Requires ORG_ADMIN+.
 * Body: { tier?, maxSeats?, expiresAt?, autoRenew?, gracePeriodDays?, metadata? }
 */
async function handleUpdateOrgModSub(req, res, actor, moduleName) {
  if (!canPerformAction(actor.role, ACTIONS.SUB_MANAGE)) {
    return sendJson(res, 403, { ok: false, error: "Insufficient permissions to manage subscriptions" }, req)
  }

  const orgId = actor.organizationId
  if (!orgId) {
    return sendJson(res, 400, { ok: false, error: "User has no organization" }, req)
  }

  const parsed = await parseJsonBody(req)
  if (!parsed.ok) return sendJson(res, parsed.statusCode || 400, { ok: false, error: parsed.error }, req)
  const body = parsed.data
  const updates = {}
  if (body.tier !== undefined) updates.tier = body.tier
  if (body.maxSeats !== undefined) updates.maxSeats = body.maxSeats
  if (body.status !== undefined) updates.status = body.status
  if (body.expiresAt !== undefined) updates.expiresAt = body.expiresAt
  if (body.autoRenew !== undefined) updates.autoRenew = body.autoRenew
  if (body.gracePeriodDays !== undefined) updates.gracePeriodDays = body.gracePeriodDays
  if (body.metadata !== undefined) updates.metadata = body.metadata

  if (Object.keys(updates).length === 0) {
    return sendJson(res, 400, { ok: false, error: "No valid update fields provided" }, req)
  }

  try {
    const ok = await dbUpdateOrgModSub(orgId, moduleName, updates)
    if (!ok) {
      return sendJson(res, 404, { ok: false, error: `No subscription found for module "${moduleName}"` }, req)
    }

    await writeAuditLog({
      userId: actor.userId,
      action: "UPDATE",
      resource: "org-module-subscription",
      metadata: { orgId, moduleName, updates },
      ipAddress: getClientIp(req),
      success: true,
    }).catch(() => {})

    return sendJson(res, 200, { ok: true }, req)
  } catch (err) {
    console.error("[sentinel/org/subscriptions] update error:", err)
    return sendJson(res, 500, { ok: false, error: "Internal server error" }, req)
  }
}

/**
 * DELETE /api/sentinel/org/subscriptions/:module
 * Cancel an org module subscription.
 * Requires ORG_ADMIN+.
 */
async function handleCancelOrgModSub(req, res, actor, moduleName) {
  if (!canPerformAction(actor.role, ACTIONS.SUB_MANAGE)) {
    return sendJson(res, 403, { ok: false, error: "Insufficient permissions to manage subscriptions" }, req)
  }

  const orgId = actor.organizationId
  if (!orgId) {
    return sendJson(res, 400, { ok: false, error: "User has no organization" }, req)
  }

  try {
    const ok = await dbCancelOrgModSub(orgId, moduleName, actor.userId)
    if (!ok) {
      return sendJson(res, 404, { ok: false, error: `No active subscription for module "${moduleName}" to cancel` }, req)
    }

    await writeAuditLog({
      userId: actor.userId,
      action: "DELETE",
      resource: "org-module-subscription",
      metadata: { orgId, moduleName },
      ipAddress: getClientIp(req),
      success: true,
    }).catch(() => {})

    return sendJson(res, 200, { ok: true }, req)
  } catch (err) {
    console.error("[sentinel/org/subscriptions] cancel error:", err)
    return sendJson(res, 500, { ok: false, error: "Internal server error" }, req)
  }
}

/**
 * GET /api/sentinel/org/subscriptions/:module/seats
 * Get seat usage for an org module.
 */
async function handleGetModuleSeats(req, res, user, moduleName) {
  const orgId = user.organizationId
  if (!orgId) {
    return sendJson(res, 400, { ok: false, error: "User has no organization" }, req)
  }

  try {
    const result = await checkModuleSeatsAvailable(orgId, moduleName)
    return sendJson(res, 200, { ok: true, ...result }, req)
  } catch (err) {
    console.error("[sentinel/org/subscriptions] seats error:", err)
    return sendJson(res, 500, { ok: false, error: "Internal server error" }, req)
  }
}

/**
 * GET /api/sentinel/admin/expiring-subscriptions?days=30
 * Lists subscriptions expiring within N days.
 * Requires SENTINEL_COMMANDER.
 */
async function handleGetExpiringSubs(req, res, user, url) {
  if (!hasMinimumRole(user.role, "SENTINEL_COMMANDER")) {
    return sendJson(res, 403, { ok: false, error: "Only Sentinel Commander can view expiring subscriptions" }, req)
  }

  try {
    const days = Number(url.searchParams.get("days")) || 30
    const subs = await getExpiringSubscriptions(days)
    return sendJson(res, 200, { ok: true, subscriptions: subs }, req)
  } catch (err) {
    console.error("[sentinel/admin/expiring] error:", err)
    return sendJson(res, 500, { ok: false, error: "Internal server error" }, req)
  }
}

/**
 * POST /api/sentinel/admin/process-expirations
 * Manually trigger expiration processing.
 * Requires SENTINEL_COMMANDER.
 */
async function handleProcessExpirations(req, res, user) {
  if (!hasMinimumRole(user.role, "SENTINEL_COMMANDER")) {
    return sendJson(res, 403, { ok: false, error: "Only Sentinel Commander can process expirations" }, req)
  }

  try {
    const result = await processExpiredSubscriptions()
    return sendJson(res, 200, { ok: true, ...result }, req)
  } catch (err) {
    console.error("[sentinel/admin/process-expirations] error:", err)
    return sendJson(res, 500, { ok: false, error: "Internal server error" }, req)
  }
}

// ─────────────────────────── Report Handlers ─────────────────────

/**
 * GET /api/sentinel/reports?projectId=...&orgId=...&status=...
 */
async function handleListReports(req, res, user, url) {
  try {
    const projectId = url.searchParams.get("projectId")
    const orgId = url.searchParams.get("orgId") || user.organizationId
    const status = url.searchParams.get("status") || undefined
    const limit = Number(url.searchParams.get("limit")) || 50

    if (!projectId && !orgId) {
      return sendJson(res, 400, { ok: false, error: "projectId or orgId required" }, req)
    }

    const reports = projectId
      ? await listReportsByProject(projectId, { status, limit })
      : await listReportsByOrg(orgId, { status, limit })

    // Filter by read permission: readers can only see PUBLISHED reports
    const filtered = user.role === "SENTINEL_COMMANDER" || hasMinimumRole(user.role, "TEAM_MEMBER")
      ? reports
      : reports.filter((r) => r.status === "PUBLISHED")

    return sendJson(res, 200, { ok: true, reports: filtered }, req)
  } catch (err) {
    console.error("[sentinel/reports] list error:", err)
    return sendJson(res, 500, { ok: false, error: "Internal server error" }, req)
  }
}

/**
 * H7 fix: Org-scoping check for reports.
 * Returns true if the user is allowed to access the report (same org or SENTINEL_COMMANDER).
 * Returns false and sends 403 if not.
 */
function checkReportOrgAccess(req, res, user, report) {
  if (user.role === "SENTINEL_COMMANDER") return true
  if (report.organizationId && report.organizationId !== user.organizationId) {
    sendJson(res, 403, { ok: false, error: "Access denied: report belongs to a different organization" }, req)
    return false
  }
  return true
}

/**
 * GET /api/sentinel/reports/:id
 */
async function handleGetReport(req, res, user, reportId) {
  try {
    const report = await getReportById(reportId)
    if (!report) {
      return sendJson(res, 404, { ok: false, error: "Report not found" }, req)
    }

    // H7: Org-scoping — prevent cross-org access
    if (!checkReportOrgAccess(req, res, user, report)) return

    // Basic readers can only see published reports
    if (report.status !== "PUBLISHED" && !hasMinimumRole(user.role, "TEAM_MEMBER")) {
      return sendJson(res, 403, { ok: false, error: "Access denied" }, req)
    }

    return sendJson(res, 200, { ok: true, report }, req)
  } catch (err) {
    console.error("[sentinel/reports] get error:", err)
    return sendJson(res, 500, { ok: false, error: "Internal server error" }, req)
  }
}

/**
 * POST /api/sentinel/reports
 * Body: { projectId, organizationId?, title, reportType?, sections?, brandingId? }
 */
async function handleCreateReport(req, res, user) {
  if (!canPerformAction(user.role, ACTIONS.REPORT_CREATE)) {
    return sendJson(res, 403, { ok: false, error: "Insufficient permissions" }, req)
  }

  const parsed = await parseJsonBody(req)
  if (!parsed.ok) return sendJson(res, parsed.statusCode || 400, { ok: false, error: parsed.error }, req)
  const body = parsed.data
  if (!body.projectId || !body.title) {
    return sendJson(res, 400, { ok: false, error: "projectId and title are required" }, req)
  }

  // L4: Input length validation
  if (typeof body.title === "string" && body.title.length > 500) {
    return sendJson(res, 400, { ok: false, error: "Title must be 500 characters or fewer" }, req)
  }
  if (Array.isArray(body.sections) && body.sections.length > 100) {
    return sendJson(res, 400, { ok: false, error: "Sections array must have 100 elements or fewer" }, req)
  }

  try {
    const reportId = `rpt_${crypto.randomUUID()}`
    await dbCreateReport({
      id: reportId,
      projectId: body.projectId,
      organizationId: body.organizationId || user.organizationId,
      title: body.title,
      reportType: body.reportType || "CUSTOM",
      sections: body.sections || [],
      brandingId: body.brandingId || null,
      generatedBy: user.userId,
      exportedFormats: [],
    })

    await writeAuditLog({
      userId: user.userId,
      action: "CREATE",
      resource: "ngo-report",
      resourceId: reportId,
      metadata: { title: body.title, projectId: body.projectId },
      ipAddress: getClientIp(req),
      success: true,
    }).catch(() => {})

    const report = await getReportById(reportId)
    return sendJson(res, 201, { ok: true, report }, req)
  } catch (err) {
    console.error("[sentinel/reports] create error:", err)
    return sendJson(res, 500, { ok: false, error: "Internal server error" }, req)
  }
}

/**
 * PUT /api/sentinel/reports/:id
 * Body: { title?, sections? }
 */
async function handleUpdateReport(req, res, user, reportId) {
  try {
    const report = await getReportById(reportId)
    if (!report) {
      return sendJson(res, 404, { ok: false, error: "Report not found" }, req)
    }

    // H7: Org-scoping — prevent cross-org access
    if (!checkReportOrgAccess(req, res, user, report)) return

    const policyCheck = checkReportAction({
      role: user.role,
      action: ACTIONS.REPORT_UPDATE,
      reportState: report.status.toLowerCase(),
      userId: user.userId,
      reportOwnerId: report.generatedBy,
    })
    if (!policyCheck.allowed) {
      return sendJson(res, 403, { ok: false, error: policyCheck.reason }, req)
    }

    const parsed = await parseJsonBody(req)
  if (!parsed.ok) return sendJson(res, parsed.statusCode || 400, { ok: false, error: parsed.error }, req)
  const body = parsed.data

    // L4: Input length validation
    if (typeof body.title === "string" && body.title.length > 500) {
      return sendJson(res, 400, { ok: false, error: "Title must be 500 characters or fewer" }, req)
    }
    if (Array.isArray(body.sections) && body.sections.length > 100) {
      return sendJson(res, 400, { ok: false, error: "Sections array must have 100 elements or fewer" }, req)
    }

    const updated = await dbUpdateReportContent(reportId, {
      title: body.title || null,
      sections: body.sections || null,
      updatedBy: user.userId,
    })

    if (!updated) {
      return sendJson(res, 409, { ok: false, error: "Report cannot be updated in current state" }, req)
    }

    const fresh = await getReportById(reportId)
    return sendJson(res, 200, { ok: true, report: fresh }, req)
  } catch (err) {
    console.error("[sentinel/reports] update error:", err)
    return sendJson(res, 500, { ok: false, error: "Internal server error" }, req)
  }
}

/**
 * POST /api/sentinel/reports/:id/submit
 */
async function handleSubmitReport(req, res, user, reportId) {
  try {
    const report = await getReportById(reportId)
    if (!report) {
      return sendJson(res, 404, { ok: false, error: "Report not found" }, req)
    }

    // H7: Org-scoping — prevent cross-org access
    if (!checkReportOrgAccess(req, res, user, report)) return

    const policyCheck = checkReportAction({
      role: user.role,
      action: ACTIONS.REPORT_SUBMIT,
      reportState: report.status.toLowerCase(),
      userId: user.userId,
      reportOwnerId: report.generatedBy,
    })
    if (!policyCheck.allowed) {
      return sendJson(res, 403, { ok: false, error: policyCheck.reason }, req)
    }

    const ok = await dbSubmitReport(reportId, user.userId)
    if (!ok) {
      return sendJson(res, 409, { ok: false, error: "Report cannot be submitted in current state" }, req)
    }

    await writeAuditLog({
      userId: user.userId,
      action: "SUBMIT",
      resource: "ngo-report",
      resourceId: reportId,
      ipAddress: getClientIp(req),
      success: true,
    }).catch(() => {})

    const fresh = await getReportById(reportId)
    return sendJson(res, 200, { ok: true, report: fresh }, req)
  } catch (err) {
    console.error("[sentinel/reports] submit error:", err)
    return sendJson(res, 500, { ok: false, error: "Internal server error" }, req)
  }
}

/**
 * POST /api/sentinel/reports/:id/approve-sign
 * Approves the report and generates a server-side digital signature.
 */
async function handleApproveSignReport(req, res, user, reportId) {
  try {
    const report = await getReportById(reportId)
    if (!report) {
      return sendJson(res, 404, { ok: false, error: "Report not found" }, req)
    }

    // H7: Org-scoping — prevent cross-org access
    if (!checkReportOrgAccess(req, res, user, report)) return

    const policyCheck = checkReportAction({
      role: user.role,
      action: ACTIONS.REPORT_APPROVE,
      reportState: report.status.toLowerCase(),
      userId: user.userId,
      reportOwnerId: report.generatedBy,
    })
    if (!policyCheck.allowed) {
      return sendJson(res, 403, { ok: false, error: policyCheck.reason }, req)
    }

    // Generate digital signature
    const contentHash = hashReportContent(JSON.stringify(report.sections))
    const timestamp = Date.now()
    const signatureHash = signReport({
      reportId,
      contentHash,
      signerId: user.userId,
      timestamp,
    })

    const ok = await dbApproveAndSign(reportId, {
      approvedBy: user.userId,
      signatureHash,
    })
    if (!ok) {
      return sendJson(res, 409, { ok: false, error: "Report cannot be approved in current state" }, req)
    }

    await writeAuditLog({
      userId: user.userId,
      action: "APPROVE",
      resource: "ngo-report",
      resourceId: reportId,
      metadata: { signatureHash, contentHash },
      ipAddress: getClientIp(req),
      success: true,
    }).catch(() => {})

    const fresh = await getReportById(reportId)
    return sendJson(res, 200, {
      ok: true,
      report: fresh,
      signature: {
        hash: signatureHash,
        contentHash,
        signedBy: user.userId,
        signedAt: timestamp,
      },
    }, req)
  } catch (err) {
    console.error("[sentinel/reports] approve-sign error:", err)
    return sendJson(res, 500, { ok: false, error: "Internal server error" }, req)
  }
}

/**
 * POST /api/sentinel/reports/:id/publish
 */
async function handlePublishReport(req, res, user, reportId) {
  try {
    const report = await getReportById(reportId)
    if (!report) {
      return sendJson(res, 404, { ok: false, error: "Report not found" }, req)
    }

    // H7: Org-scoping — prevent cross-org access
    if (!checkReportOrgAccess(req, res, user, report)) return

    const policyCheck = checkReportAction({
      role: user.role,
      action: ACTIONS.REPORT_PUBLISH,
      reportState: report.status.toLowerCase(),
      userId: user.userId,
      reportOwnerId: report.generatedBy,
    })
    if (!policyCheck.allowed) {
      return sendJson(res, 403, { ok: false, error: policyCheck.reason }, req)
    }

    const ok = await dbPublishReport(reportId, user.userId)
    if (!ok) {
      return sendJson(res, 409, { ok: false, error: "Report cannot be published in current state" }, req)
    }

    await writeAuditLog({
      userId: user.userId,
      action: "PUBLISH",
      resource: "ngo-report",
      resourceId: reportId,
      ipAddress: getClientIp(req),
      success: true,
    }).catch(() => {})

    const fresh = await getReportById(reportId)
    return sendJson(res, 200, { ok: true, report: fresh }, req)
  } catch (err) {
    console.error("[sentinel/reports] publish error:", err)
    return sendJson(res, 500, { ok: false, error: "Internal server error" }, req)
  }
}

/**
 * POST /api/sentinel/reports/:id/revert
 * Body: { comment? }
 */
async function handleRevertReport(req, res, user, reportId) {
  try {
    const report = await getReportById(reportId)
    if (!report) {
      return sendJson(res, 404, { ok: false, error: "Report not found" }, req)
    }

    // H7: Org-scoping — prevent cross-org access
    if (!checkReportOrgAccess(req, res, user, report)) return

    const policyCheck = checkReportAction({
      role: user.role,
      action: ACTIONS.REPORT_REVERT,
      reportState: report.status.toLowerCase(),
      userId: user.userId,
      reportOwnerId: report.generatedBy,
    })
    if (!policyCheck.allowed) {
      return sendJson(res, 403, { ok: false, error: policyCheck.reason }, req)
    }

    const parsed = await parseJsonBody(req)
  if (!parsed.ok) return sendJson(res, parsed.statusCode || 400, { ok: false, error: parsed.error }, req)
  const body = parsed.data
    const ok = await dbRevertReport(reportId, user.userId, body.comment)
    if (!ok) {
      return sendJson(res, 409, { ok: false, error: "Report cannot be reverted in current state" }, req)
    }

    await writeAuditLog({
      userId: user.userId,
      action: "REVERT",
      resource: "ngo-report",
      resourceId: reportId,
      metadata: { comment: body.comment, previousStatus: report.status },
      ipAddress: getClientIp(req),
      success: true,
    }).catch(() => {})

    const fresh = await getReportById(reportId)
    return sendJson(res, 200, { ok: true, report: fresh }, req)
  } catch (err) {
    console.error("[sentinel/reports] revert error:", err)
    return sendJson(res, 500, { ok: false, error: "Internal server error" }, req)
  }
}

/**
 * DELETE /api/sentinel/reports/:id
 */
async function handleDeleteReport(req, res, user, reportId) {
  try {
    const report = await getReportById(reportId)
    if (!report) {
      return sendJson(res, 404, { ok: false, error: "Report not found" }, req)
    }

    // H7: Org-scoping — prevent cross-org access
    if (!checkReportOrgAccess(req, res, user, report)) return

    const policyCheck = checkReportAction({
      role: user.role,
      action: ACTIONS.REPORT_DELETE,
      reportState: report.status.toLowerCase(),
      userId: user.userId,
      reportOwnerId: report.generatedBy,
    })
    if (!policyCheck.allowed) {
      return sendJson(res, 403, { ok: false, error: policyCheck.reason }, req)
    }

    const ok = await dbDeleteReport(reportId)
    if (!ok) {
      return sendJson(res, 409, { ok: false, error: "Report cannot be deleted in current state" }, req)
    }

    await writeAuditLog({
      userId: user.userId,
      action: "DELETE",
      resource: "ngo-report",
      resourceId: reportId,
      ipAddress: getClientIp(req),
      success: true,
    }).catch(() => {})

    return sendJson(res, 200, { ok: true }, req)
  } catch (err) {
    console.error("[sentinel/reports] delete error:", err)
    return sendJson(res, 500, { ok: false, error: "Internal server error" }, req)
  }
}

/**
 * GET /api/sentinel/reports/:id/transitions
 */
async function handleGetReportTransitions(req, res, user, reportId) {
  try {
    const report = await getReportById(reportId)
    if (!report) {
      return sendJson(res, 404, { ok: false, error: "Report not found" }, req)
    }

    // H7: Org-scoping — prevent cross-org access
    if (!checkReportOrgAccess(req, res, user, report)) return

    const transitions = await getReportTransitions(reportId)
    return sendJson(res, 200, { ok: true, transitions }, req)
  } catch (err) {
    console.error("[sentinel/reports] transitions error:", err)
    return sendJson(res, 500, { ok: false, error: "Internal server error" }, req)
  }
}

/**
 * POST /api/sentinel/reports/:id/verify-signature
 * Verifies that the report's digital signature is still valid
 * (i.e., the content has not been tampered with).
 */
async function handleVerifySignature(req, res, user, reportId) {
  try {
    const report = await getReportById(reportId)
    if (!report) {
      return sendJson(res, 404, { ok: false, error: "Report not found" }, req)
    }

    // H7: Org-scoping — prevent cross-org access
    if (!checkReportOrgAccess(req, res, user, report)) return

    if (!report.signatureHash || !report.signedBy || !report.signedAt) {
      return sendJson(res, 200, {
        ok: true,
        verified: false,
        reason: "Report has not been signed",
      }, req)
    }

    const contentHash = hashReportContent(JSON.stringify(report.sections))
    const verified = verifyReportSignature(
      {
        reportId,
        contentHash,
        signerId: report.signedBy,
        timestamp: report.signedAt,
      },
      report.signatureHash
    )

    return sendJson(res, 200, {
      ok: true,
      verified,
      contentHash,
      signatureHash: report.signatureHash,
      signedBy: report.signedBy,
      signedAt: report.signedAt,
      reason: verified ? "Signature is valid — content has not been tampered with" : "SIGNATURE INVALID — content may have been modified after signing",
    }, req)
  } catch (err) {
    console.error("[sentinel/reports] verify-signature error:", err)
    return sendJson(res, 500, { ok: false, error: "Internal server error" }, req)
  }
}

// ─────────────────────────── User Style Profile Handlers ────────────

/**
 * POST /api/sentinel/user-style/track-generation
 * Log generation metadata for building user style profile
 */
async function handleTrackGeneration(req, res, user) {
  try {
    const { ok: bodyOk, data } = await parseJsonBody(req)
    if (!bodyOk) {
      return sendJson(res, 400, { ok: false, error: "Invalid request body" }, req)
    }

    const {
      conceptMode,
      tonePreference,
      audienceLevel,
      sectionsEdited,
      qualityScore,
      costCents,
      wasSaved,
    } = data

    if (!conceptMode || !tonePreference || !audienceLevel) {
      return sendJson(res, 400, { ok: false, error: "Missing required fields" }, req)
    }

    const { logGenerationInsight } = await import("./user-style-service.mjs")

    await logGenerationInsight({
      userId: user.userId,
      conceptMode,
      tonePreference,
      audienceLevel,
      estimatedSatisfaction: 0.5,
      sectionsEdited: Array.isArray(sectionsEdited) ? sectionsEdited : [],
      qualityScore: typeof qualityScore === "number" ? qualityScore : undefined,
      costCents: typeof costCents === "number" ? costCents : undefined,
      wasSaved: Boolean(wasSaved),
    })

    return sendJson(res, 200, { ok: true }, req)
  } catch (err) {
    console.error("[user-style] track-generation error:", err)
    return sendJson(res, 500, { ok: false, error: "Internal server error" }, req)
  }
}

/**
 * GET /api/sentinel/user-style/profile
 * Fetch or build user's style profile
 */
async function handleGetUserStyleProfile(req, res, user) {
  try {
    const { getOrBuildUserProfile } = await import("./user-style-service.mjs")

    const profile = await getOrBuildUserProfile(user.userId)

    return sendJson(res, 200, { ok: true, profile }, req)
  } catch (err) {
    console.error("[user-style] get-profile error:", err)
    return sendJson(res, 500, { ok: false, error: "Internal server error" }, req)
  }
}

/**
 * POST /api/sentinel/user-style/feedback
 * Record user feedback on a generated strategy
 */
async function handleRecordStyleFeedback(req, res, user) {
  try {
    const { ok: bodyOk, data } = await parseJsonBody(req)
    if (!bodyOk) {
      return sendJson(res, 400, { ok: false, error: "Invalid request body" }, req)
    }

    const {
      qualityRating,
      toneFit,
      audienceMatch,
      originality,
      comment,
    } = data

    if (typeof qualityRating !== "number" || qualityRating < 1 || qualityRating > 5) {
      return sendJson(res, 400, { ok: false, error: "qualityRating must be 1-5" }, req)
    }

    const { recordStyleFeedback } = await import("./user-style-service.mjs")

    await recordStyleFeedback({
      userId: user.userId,
      qualityRating,
      toneFit: typeof toneFit === "number" ? toneFit : undefined,
      audienceMatch: typeof audienceMatch === "number" ? audienceMatch : undefined,
      originality: typeof originality === "number" ? originality : undefined,
      comment: typeof comment === "string" ? comment : undefined,
    })

    return sendJson(res, 200, { ok: true }, req)
  } catch (err) {
    console.error("[user-style] feedback error:", err)
    return sendJson(res, 500, { ok: false, error: "Internal server error" }, req)
  }
}

// ─────────────────────────── Request Router ──────────────────────

const extToMime = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`)
  const method = req.method
  const reqPathname = url.pathname

  console.log(`[HTTP] ${method} ${reqPathname}`)

  // ── CORS preflight ──
  // ── MCP Server Routes ──
  const isMcp = await handleMcpRequest(req, res, method, reqPathname);
  if (isMcp) return;

  if (method === "OPTIONS") {
    return sendJson(res, 200, { ok: true }, req)
  }

  // ── Health (M9 fix: minimal info for unauthenticated endpoint) ──
  if (method === "GET" && reqPathname === "/health") {
    return sendJson(res, 200, {
      ok: true,
      service: "llm-backend",
    }, req)
  }

  // ── M1 fix: CSRF double-submit cookie validation ──
  // State-changing methods on authenticated routes must have matching
  // X-CSRF-Token header and __csrf cookie. Exempt: login, register, health.
  if (SENTINEL_AUTH_ENABLED && !validateCsrf(req, method, reqPathname)) {
    return sendJson(res, 403, { ok: false, error: "CSRF validation failed" }, req)
  }

  // ════════════════════════════════════════════════════════════════
  //  SENTINEL AUTH ROUTES (feature-flagged)
  // ════════════════════════════════════════════════════════════════

  if (SENTINEL_AUTH_ENABLED) {
    // ── GET /api/health ──
    if (method === "GET" && reqPathname === "/api/health") {
      return sendJson(res, 200, { ok: true, status: "healthy", timestamp: Date.now() }, req)
    }

    // ── POST /api/auth/login ──
    if (method === "POST" && reqPathname === "/api/auth/login") {
      return handleLogin(req, res)
    }

    // ── POST /api/auth/register (C2/C3 fix) ──
    if (method === "POST" && reqPathname === "/api/auth/register") {
      return handleRegister(req, res)
    }

    // ── POST /api/auth/password-reset/request ──
    if (method === "POST" && reqPathname === "/api/auth/password-reset/request") {
      return handlePasswordResetRequest(req, res)
    }

    // ── POST /api/auth/password-reset/verify ──
    if (method === "POST" && reqPathname === "/api/auth/password-reset/verify") {
      return handlePasswordResetVerify(req, res)
    }

    // ── POST /api/auth/password-reset/confirm ──
    if (method === "POST" && reqPathname === "/api/auth/password-reset/confirm") {
      return handlePasswordResetConfirm(req, res)
    }

    // ── POST /api/auth/admin/set-password ──
    if (method === "POST" && reqPathname === "/api/auth/admin/set-password") {
      const auth = authorize(req)
      if (!auth.authorized || !auth.user) {
        return sendJson(res, 401, { ok: false, error: "Unauthorized" }, req)
      }
      return handleAdminSetPassword(req, res, auth.user)
    }

    // ── GET /api/auth/verify ──
    if (method === "GET" && reqPathname === "/api/auth/verify") {
      return handleVerify(req, res)
    }

    // ── GET /api/auth/capabilities ──
    if (method === "GET" && reqPathname === "/api/auth/capabilities") {
      return handleAuthCapabilities(req, res)
    }

    // ── OAuth Routes ──
    if (method === "GET" && reqPathname === "/api/auth/google") {
      try {
        const { getGoogleAuthUrl } = await import('./oauth.mjs');
        const url = await getGoogleAuthUrl();
        res.writeHead(302, { Location: url });
        return res.end();
      } catch (err) {
        console.error("Google Auth URL error:", err);
        return sendJson(res, 500, { ok: false, error: err?.message || "Google OAuth is unavailable" }, req);
      }
    }
    if (method === "GET" && reqPathname === "/api/auth/google/callback") {
      try {
        const { handleGoogleCallback, generateOAuthCallbackHtml } = await import('./oauth.mjs');
        const code = url.searchParams.get("code");
        const { user, token } = await handleGoogleCallback(code);
        res.writeHead(200, { "Content-Type": "text/html" });
        return res.end(generateOAuthCallbackHtml(token, user));
      } catch (err) {
        console.error("Google OAuth error:", err);
        const msg = encodeURIComponent(err?.message || "Google sign-in failed")
        res.writeHead(302, { Location: `/?error=oauth_failed&reason=${msg}` });
        return res.end();
      }
    }
    if (method === "GET" && reqPathname === "/api/auth/github") {
      try {
        const { getGithubAuthUrl } = await import('./oauth.mjs');
        const url = await getGithubAuthUrl();
        res.writeHead(302, { Location: url });
        return res.end();
      } catch (err) {
        console.error("GitHub Auth URL error:", err);
        return sendJson(res, 500, { ok: false, error: err?.message || "GitHub OAuth is unavailable" }, req);
      }
    }
    if (method === "GET" && reqPathname === "/api/auth/github/callback") {
      try {
        const { handleGithubCallback, generateOAuthCallbackHtml } = await import('./oauth.mjs');
        const code = url.searchParams.get("code");
        const { user, token } = await handleGithubCallback(code);
        res.writeHead(200, { "Content-Type": "text/html" });
        return res.end(generateOAuthCallbackHtml(token, user));
      } catch (err) {
        console.error("GitHub OAuth error:", err);
        const msg = encodeURIComponent(err?.message || "GitHub sign-in failed")
        res.writeHead(302, { Location: `/?error=oauth_failed&reason=${msg}` });
        return res.end();
      }
    }

    // ── POST /api/auth/refresh ──
    if (method === "POST" && reqPathname === "/api/auth/refresh") {
      return handleRefresh(req, res)
    }

    // ── POST /api/auth/logout (H9 fix) ──
    if (method === "POST" && reqPathname === "/api/auth/logout") {
      return handleLogout(req, res)
    }

    // ── Sentinel API routes (all require JWT) ──
    if (reqPathname.startsWith("/api/sentinel/")) {
      const authResult = authenticateRequest(req)
      if (!authResult.authenticated) {
        return sendJson(res, 401, { ok: false, error: authResult.error }, req)
      }

      // H9 fix: Check token revocation in sentinel auth block
      const token = extractToken(req)
      if (token && isTokenRevoked(hashToken(token))) {
        return sendJson(res, 401, { ok: false, error: "Token has been revoked" }, req)
      }

      let user = normalizeAuthUser(authResult.user)
      if (user?.role === "TESTER" && user?.userId) {
        const freshUser = await getUserById(user.userId).catch(() => null)
        if (!freshUser || !freshUser.isActive) {
          return sendJson(res, 401, { ok: false, error: "User not found or inactive" }, req)
        }
        user = normalizeAuthUser({
          ...freshUser,
          userId: freshUser.id,
          subscriptionTier: authResult.user.subscriptionTier || null,
        })
      }
      const testerEnv = enforceTesterEnvironment(req, user)
      if (!testerEnv.allowed) {
        return sendJson(res, testerEnv.status || 403, { ok: false, error: testerEnv.error }, req)
      }

      // H6 fix: API rate limiting for sentinel routes
      const rlKey = user.userId || getClientIp(req)
      const apiRl = checkRateLimit("api", rlKey)
      if (!apiRl.allowed) {
        res.setHeader("Retry-After", String(apiRl.retryAfter))
        return sendJson(res, 429, { ok: false, error: "Rate limit exceeded", retryAfter: apiRl.retryAfter }, req)
      }
      // Stricter limit on mutation operations
      if (method === "POST" || method === "PUT" || method === "DELETE") {
        const createRl = checkRateLimit("create", rlKey)
        if (!createRl.allowed) {
          res.setHeader("Retry-After", String(createRl.retryAfter))
          return sendJson(res, 429, { ok: false, error: "Rate limit exceeded for mutations", retryAfter: createRl.retryAfter }, req)
        }
      }

      // GET /api/sentinel/me
      if (method === "GET" && reqPathname === "/api/sentinel/me") {
        return handleGetMe(req, res, user)
      }

      // GET /api/sentinel/diagnostics (M9 fix: moved from /health, requires SENTINEL_COMMANDER)
      if (method === "GET" && reqPathname === "/api/sentinel/diagnostics") {
        if (!hasMinimumRole(user.role, "SENTINEL_COMMANDER")) {
          return sendJson(res, 403, { ok: false, error: "Insufficient permissions" }, req)
        }
        return sendJson(res, 200, {
          ok: true,
          service: "llm-backend",
          version: "phase5.1",
          sentinelAuth: SENTINEL_AUTH_ENABLED,
          dbConfigured: isDbConfigured(),
          jwtConfigured: isJwtConfigured(),
          graphMailConfigured: isGraphMailConfigured(),
          adminNotificationEmail: ADMIN_NOTIFICATION_EMAIL,
        }, req)
      }

      // POST /api/sentinel/test-email (admin-only: sends a test email to verify Graph Mail)
      if (method === "POST" && reqPathname === "/api/sentinel/test-email") {
        if (!hasMinimumRole(user.role, "SENTINEL_COMMANDER")) {
          return sendJson(res, 403, { ok: false, error: "Insufficient permissions" }, req)
        }

        if (!isGraphMailConfigured()) {
          return sendJson(res, 503, {
            ok: false,
            error: "Graph Mail is not configured. Set M365_TENANT_ID, M365_CLIENT_ID, M365_CLIENT_SECRET, and M365_SENDER_EMAIL.",
          }, req)
        }

        const parsed = await parseJsonBody(req)
        const recipientEmail = parsed.ok && typeof parsed.data?.email === "string"
          ? parsed.data.email.trim()
          : user.email

        try {
          await sendWelcomeEmail({
            to: recipientEmail,
            fullName: "Test User",
          })
          console.log(`[mail/test] Test email sent successfully to ${recipientEmail}`)
          return sendJson(res, 200, { ok: true, sentTo: recipientEmail }, req)
        } catch (err) {
          console.error("[mail/test] Test email failed:", err)
          return sendJson(res, 500, { ok: false, error: err?.message || "Failed to send test email" }, req)
        }
      }

      // GET /api/sentinel/modules
      if (method === "GET" && reqPathname === "/api/sentinel/modules") {
        return handleGetModules(req, res, user)
      }

      // POST /api/sentinel/check-access
      if (method === "POST" && reqPathname === "/api/sentinel/check-access") {
        return handleCheckAccess(req, res, user)
      }

      // GET /api/sentinel/org/members
      if (method === "GET" && reqPathname === "/api/sentinel/org/members") {
        return handleGetOrgMembers(req, res, user)
      }

      // POST /api/sentinel/org/bootstrap
      if (method === "POST" && reqPathname === "/api/sentinel/org/bootstrap") {
        return handleBootstrapOrganization(req, res, user)
      }

      // POST /api/sentinel/org/members
      if (method === "POST" && reqPathname === "/api/sentinel/org/members") {
        return handleCreateOrgMember(req, res, user)
      }

      // POST /api/sentinel/org/invite-email
      if (method === "POST" && reqPathname === "/api/sentinel/org/invite-email") {
        return handleSendInviteEmail(req, res, user)
      }

      // POST /api/sentinel/modules/grant
      if (method === "POST" && reqPathname === "/api/sentinel/modules/grant") {
        return handleGrantModuleAccess(req, res, user)
      }

      // POST /api/sentinel/modules/revoke
      if (method === "POST" && reqPathname === "/api/sentinel/modules/revoke") {
        return handleRevokeModuleAccess(req, res, user)
      }

      // GET /api/sentinel/audit/stats (must come before /api/sentinel/audit)
      if (method === "GET" && reqPathname === "/api/sentinel/audit/stats") {
        return handleGetAuditStats(req, res, user, url)
      }

      // GET /api/sentinel/audit
      if (method === "GET" && reqPathname === "/api/sentinel/audit") {
        return handleGetAuditLogs(req, res, user, url)
      }

      // GET /api/sentinel/admin/users
      if (method === "GET" && reqPathname === "/api/sentinel/admin/users") {
        return handleAdminListUsers(req, res, user)
      }

      // POST /api/sentinel/admin/users/delete
      if (method === "POST" && reqPathname === "/api/sentinel/admin/users/delete") {
        return handleAdminDeleteUser(req, res, user)
      }

      // POST /api/sentinel/admin/subscriptions/add-credits
      if (method === "POST" && reqPathname === "/api/sentinel/admin/subscriptions/add-credits") {
        return handleAdminAddCredits(req, res, user)
      }

      // POST /api/sentinel/admin/subscriptions/set-plan
      if (method === "POST" && reqPathname === "/api/sentinel/admin/subscriptions/set-plan") {
        return handleAdminSetPlan(req, res, user)
      }

      // GET /api/sentinel/admin/stats
      if (method === "GET" && reqPathname === "/api/sentinel/admin/stats") {
        return handleGetSystemStats(req, res, user)
      }

      // GET /api/sentinel/admin/provider-routing
      if (method === "GET" && reqPathname === "/api/sentinel/admin/provider-routing") {
        return handleGetProviderRouting(req, res, user, url)
      }

      // PUT /api/sentinel/admin/provider-routing
      if ((method === "PUT" || method === "POST") && reqPathname === "/api/sentinel/admin/provider-routing") {
        return handleUpsertProviderRouting(req, res, user)
      }

      // GET /api/sentinel/admin/provider-usage
      if (method === "GET" && reqPathname === "/api/sentinel/admin/provider-usage") {
        return handleGetProviderUsage(req, res, user, url)
      }

      // ── Skills Admin Routes (Shadow Mode First) ──

      // GET /api/sentinel/admin/skills
      if (method === "GET" && reqPathname === "/api/sentinel/admin/skills") {
        return handleSkillsList(req, res, user, url)
      }

      // POST /api/sentinel/admin/skills/upload
      if (method === "POST" && reqPathname === "/api/sentinel/admin/skills/upload") {
        return handleSkillsUpload(req, res, user)
      }

      // POST /api/sentinel/admin/skills/bind
      if (method === "POST" && reqPathname === "/api/sentinel/admin/skills/bind") {
        return handleSkillsBind(req, res, user)
      }

      // POST /api/sentinel/admin/skills/evaluate
      if (method === "POST" && reqPathname === "/api/sentinel/admin/skills/evaluate") {
        return handleSkillsShadowEvaluate(req, res, user)
      }

      // GET /api/sentinel/admin/skills/logs
      if (method === "GET" && reqPathname === "/api/sentinel/admin/skills/logs") {
        return handleSkillsLogs(req, res, user, url)
      }

      // GET /api/sentinel/admin/skills/ui
      if (method === "GET" && reqPathname === "/api/sentinel/admin/skills/ui") {
        if (!isSkillAdmin(user)) {
          return sendJson(res, 403, { ok: false, error: "Insufficient permissions" }, req)
        }
        res.writeHead(200, {
          "Content-Type": "text/html; charset=utf-8",
          ...SECURITY_HEADERS,
        })
        res.end(renderSkillsAdminHtml())
        return
      }

      // ── Org Module Subscription Routes (Phase 3) ──

      // GET /api/sentinel/org/subscriptions
      if (method === "GET" && reqPathname === "/api/sentinel/org/subscriptions") {
        return handleListOrgModSubs(req, res, user, url)
      }

      // GET /api/sentinel/org/subscriptions/:module/seats
      if (method === "GET" && reqPathname.match(/^\/api\/sentinel\/org\/subscriptions\/[^/]+\/seats$/)) {
        const mod = reqPathname.split("/")[5]
        return handleGetModuleSeats(req, res, user, mod)
      }

      // GET /api/sentinel/org/subscriptions/:module
      if (method === "GET" && reqPathname.match(/^\/api\/sentinel\/org\/subscriptions\/[^/]+$/) && !reqPathname.endsWith("/seats")) {
        const mod = reqPathname.split("/")[5]
        return handleGetOrgModSub(req, res, user, mod)
      }

      // POST /api/sentinel/org/subscriptions
      if (method === "POST" && reqPathname === "/api/sentinel/org/subscriptions") {
        return handleCreateOrgModSub(req, res, user)
      }

      // PUT /api/sentinel/org/subscriptions/:module
      if (method === "PUT" && reqPathname.match(/^\/api\/sentinel\/org\/subscriptions\/[^/]+$/)) {
        const mod = reqPathname.split("/")[5]
        return handleUpdateOrgModSub(req, res, user, mod)
      }

      // DELETE /api/sentinel/org/subscriptions/:module
      if (method === "DELETE" && reqPathname.match(/^\/api\/sentinel\/org\/subscriptions\/[^/]+$/)) {
        const mod = reqPathname.split("/")[5]
        return handleCancelOrgModSub(req, res, user, mod)
      }

      // GET /api/sentinel/admin/expiring-subscriptions
      if (method === "GET" && reqPathname === "/api/sentinel/admin/expiring-subscriptions") {
        return handleGetExpiringSubs(req, res, user, url)
      }

      // POST /api/sentinel/admin/process-expirations
      if (method === "POST" && reqPathname === "/api/sentinel/admin/process-expirations") {
        return handleProcessExpirations(req, res, user)
      }

      // ── Report Routes ──

      // GET /api/sentinel/reports?projectId=...&orgId=...&status=...
      if (method === "GET" && reqPathname === "/api/sentinel/reports") {
        return handleListReports(req, res, user, url)
      }

      // GET /api/sentinel/reports/:id
      if (method === "GET" && reqPathname.startsWith("/api/sentinel/reports/") && !reqPathname.includes("/transitions")) {
        const reportId = reqPathname.split("/api/sentinel/reports/")[1]
        return handleGetReport(req, res, user, reportId)
      }

      // POST /api/sentinel/reports (create draft)
      if (method === "POST" && reqPathname === "/api/sentinel/reports") {
        return handleCreateReport(req, res, user)
      }

      // PUT /api/sentinel/reports/:id (update draft content)
      if (method === "PUT" && reqPathname.startsWith("/api/sentinel/reports/")) {
        const reportId = reqPathname.split("/api/sentinel/reports/")[1]
        return handleUpdateReport(req, res, user, reportId)
      }

      // POST /api/sentinel/reports/:id/submit
      if (method === "POST" && reqPathname.match(/^\/api\/sentinel\/reports\/[^/]+\/submit$/)) {
        const reportId = reqPathname.split("/")[4]
        return handleSubmitReport(req, res, user, reportId)
      }

      // POST /api/sentinel/reports/:id/approve-sign
      if (method === "POST" && reqPathname.match(/^\/api\/sentinel\/reports\/[^/]+\/approve-sign$/)) {
        const reportId = reqPathname.split("/")[4]
        return handleApproveSignReport(req, res, user, reportId)
      }

      // POST /api/sentinel/reports/:id/publish
      if (method === "POST" && reqPathname.match(/^\/api\/sentinel\/reports\/[^/]+\/publish$/)) {
        const reportId = reqPathname.split("/")[4]
        return handlePublishReport(req, res, user, reportId)
      }

      // POST /api/sentinel/reports/:id/revert
      if (method === "POST" && reqPathname.match(/^\/api\/sentinel\/reports\/[^/]+\/revert$/)) {
        const reportId = reqPathname.split("/")[4]
        return handleRevertReport(req, res, user, reportId)
      }

      // DELETE /api/sentinel/reports/:id
      if (method === "DELETE" && reqPathname.startsWith("/api/sentinel/reports/")) {
        const reportId = reqPathname.split("/api/sentinel/reports/")[1]
        return handleDeleteReport(req, res, user, reportId)
      }

      // GET /api/sentinel/reports/:id/transitions
      if (method === "GET" && reqPathname.match(/^\/api\/sentinel\/reports\/[^/]+\/transitions$/)) {
        const reportId = reqPathname.split("/")[4]
        return handleGetReportTransitions(req, res, user, reportId)
      }

      // POST /api/sentinel/reports/:id/verify-signature
      if (method === "POST" && reqPathname.match(/^\/api\/sentinel\/reports\/[^/]+\/verify-signature$/)) {
        const reportId = reqPathname.split("/")[4]
        return handleVerifySignature(req, res, user, reportId)
      }

      // ── User Style Profile Routes ──

      if (method === "GET" && reqPathname === "/api/sentinel/admin/testers") {
        return handleListTesters(req, res, user)
      }

      if (method === "POST" && reqPathname === "/api/sentinel/admin/testers") {
        return handleCreateTester(req, res, user)
      }

      if (method === "POST" && reqPathname === "/api/sentinel/admin/testers/action") {
        return handleTesterAccountAction(req, res, user)
      }

      // POST /api/sentinel/user-style/track-generation
      if (method === "POST" && reqPathname === "/api/sentinel/user-style/track-generation") {
        return handleTrackGeneration(req, res, user)
      }

      // GET /api/sentinel/user-style/profile
      if (method === "GET" && reqPathname === "/api/sentinel/user-style/profile") {
        return handleGetUserStyleProfile(req, res, user)
      }

      // POST /api/sentinel/user-style/feedback
      if (method === "POST" && reqPathname === "/api/sentinel/user-style/feedback") {
        return handleRecordStyleFeedback(req, res, user)
      }

      return sendJson(res, 404, { error: "Sentinel route not found" }, req)
    }
  }

  // ════════════════════════════════════════════════════════════════
  //  LEGACY ROUTES (backward compatible — API key or JWT)
  // ════════════════════════════════════════════════════════════════

  // ── GET /api/providers/status ──
  if (method === "GET" && reqPathname === "/api/providers/status") {
    const auth = authorize(req)
    if (!auth.authorized) {
      return sendJson(res, 401, { ok: false, error: "Unauthorized" }, req)
    }

    return sendJson(res, 200, {
      ok: true,
      service: "llm-backend",
      version: "phase5.1",
      runtime: {
        host: HOST,
        port: PORT,
        nodeVersion: process.version,
      },
      auth: {
        required: REQUIRE_AUTH,
        sentinelEnabled: SENTINEL_AUTH_ENABLED,
        authenticatedUser: auth.user?.email || null,
      },
      ...getProviderStatus(),
    }, req)
  }

  // ── GET /api/providers/routing ──
  if (method === "GET" && reqPathname === "/api/providers/routing") {
    const auth = authorize(req)
    if (!auth.authorized) {
      return sendJson(res, 401, { ok: false, error: "Unauthorized" }, req)
    }

    try {
      const moduleName = url.searchParams.get("module") || "global"
      const config = await getResolvedRouting(moduleName)
      return sendJson(res, 200, { ok: true, config }, req)
    } catch (error) {
      console.error("[providers/routing] error:", error instanceof Error ? error.message : error)
      return sendJson(res, 500, { ok: false, error: "Failed to load provider routing" }, req)
    }
  }

  // ── GET /api/qr?data=...&size=... ──
  if (method === "GET" && reqPathname === "/api/qr") {
    const data = String(url.searchParams.get("data") || "").trim()
    const sizeRaw = Number(url.searchParams.get("size") || 400)
    const size = Number.isFinite(sizeRaw) ? Math.max(64, Math.min(1024, Math.round(sizeRaw))) : 400
    const marginRaw = Number(url.searchParams.get("margin") || 0)
    const margin = Number.isFinite(marginRaw) ? Math.max(0, Math.min(20, Math.round(marginRaw))) : 0
    const eccRaw = String(url.searchParams.get("ecc") || "M").toUpperCase()
    const ecc = ["L", "M", "Q", "H"].includes(eccRaw) ? eccRaw : "M"

    if (!data) {
      return sendJson(res, 400, { ok: false, error: "Missing data query parameter" }, req)
    }

    try {
      const upstream = await fetch(`https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(data)}&format=png&ecc=${ecc}&margin=${margin}`)
      if (!upstream.ok) {
        return sendJson(res, 502, { ok: false, error: "QR upstream request failed" }, req)
      }

      const buffer = Buffer.from(await upstream.arrayBuffer())
      res.writeHead(200, {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=300",
        ...SECURITY_HEADERS,
      })
      return res.end(buffer)
    } catch (error) {
      console.error("[api/qr] error:", error instanceof Error ? error.message : error)
      return sendJson(res, 500, { ok: false, error: "Failed to generate QR image" }, req)
    }
  }

  // ── Connector Management (backend-only secret handling) ──
  if (method === "GET" && reqPathname === "/api/connectors") {
    const auth = authorize(req)
    if (!auth.authorized) return sendJson(res, 401, { ok: false, error: "Unauthorized" }, req)
    if (!isDbConfigured()) return sendJson(res, 503, { ok: false, error: "Database not configured" }, req)

    try {
      const rows = await executeProxyQuery(
        `SELECT id, name, platform_type, base_url, auth_type, auth_config, headers, enabled,
                description, sector, health_status, last_health_check, created_by, created_at
         FROM platform_connectors
         ORDER BY created_at DESC`,
        []
      )
      return sendJson(res, 200, { ok: true, connectors: rows.map(sanitizeConnectorForClient) }, req)
    } catch (err) {
      console.error("[connectors/list] error:", err)
      return sendJson(res, 500, { ok: false, error: "Failed to list connectors" }, req)
    }
  }

  if (method === "POST" && reqPathname === "/api/connectors") {
    const auth = authorize(req)
    if (!auth.authorized) return sendJson(res, 401, { ok: false, error: "Unauthorized" }, req)
    if (!isDbConfigured()) return sendJson(res, 503, { ok: false, error: "Database not configured" }, req)

    try {
      const parsed = await parseJsonBody(req)
      if (!parsed.ok) return sendJson(res, parsed.statusCode || 400, { ok: false, error: parsed.error }, req)

      const name = typeof parsed.data.name === "string" ? parsed.data.name.trim() : ""
      const platformType = typeof parsed.data.platform_type === "string" ? parsed.data.platform_type : "rest_api"
      const baseUrlRaw = typeof parsed.data.base_url === "string" ? parsed.data.base_url.trim() : ""
      const authType = typeof parsed.data.auth_type === "string" ? parsed.data.auth_type : "none"
      const authConfigRaw = parsed.data.auth_config && typeof parsed.data.auth_config === "object" ? parsed.data.auth_config : {}
      const headersRaw = parsed.data.headers && typeof parsed.data.headers === "object" ? parsed.data.headers : {}
      const description = typeof parsed.data.description === "string" ? parsed.data.description.trim() : ""
      const sector = typeof parsed.data.sector === "string" && parsed.data.sector.trim().length > 0 ? parsed.data.sector.trim() : null

      if (!name || !baseUrlRaw) {
        return sendJson(res, 400, { ok: false, error: "name and base_url are required" }, req)
      }

      const validUrl = validateConnectorBaseUrl(baseUrlRaw, platformType, name)
      if (!validUrl.ok) {
        return sendJson(res, 400, { ok: false, error: validUrl.error }, req)
      }

      const encryptedAuth = encryptConnectorAuthConfig(authConfigRaw)

      const rows = await executeProxyQuery(
        `INSERT INTO platform_connectors
          (name, platform_type, base_url, auth_type, auth_config, headers, description, sector, created_by)
         VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7,$8,$9)
         RETURNING id, name, platform_type, base_url, auth_type, auth_config, headers, enabled,
                   description, sector, health_status, last_health_check, created_by, created_at`,
        [
          name,
          platformType,
          validUrl.normalized,
          authType,
          JSON.stringify(encryptedAuth),
          JSON.stringify(headersRaw),
          description,
          sector,
          null,
        ]
      )

      return sendJson(res, 201, { ok: true, connector: sanitizeConnectorForClient(rows[0]) }, req)
    } catch (err) {
      console.error("[connectors/create] error:", err)
      return sendJson(res, 500, { ok: false, error: "Failed to create connector" }, req)
    }
  }

  if (method === "PATCH" && reqPathname.match(/^\/api\/connectors\/\d+$/)) {
    const auth = authorize(req)
    if (!auth.authorized) return sendJson(res, 401, { ok: false, error: "Unauthorized" }, req)
    if (!isDbConfigured()) return sendJson(res, 503, { ok: false, error: "Database not configured" }, req)

    try {
      const connectorId = parseInt(reqPathname.split("/")[3], 10)
      const parsed = await parseJsonBody(req)
      if (!parsed.ok) return sendJson(res, parsed.statusCode || 400, { ok: false, error: parsed.error }, req)

      const currentRows = await executeProxyQuery(
        `SELECT id, name, platform_type, base_url, auth_type, auth_config, headers, enabled,
                description, sector, health_status, last_health_check, created_by, created_at
         FROM platform_connectors
         WHERE id = $1
         LIMIT 1`,
        [connectorId]
      )
      if (!currentRows || currentRows.length === 0) {
        return sendJson(res, 404, { ok: false, error: "Connector not found" }, req)
      }
      const current = currentRows[0]

      const nextName = typeof parsed.data.name === "string" ? parsed.data.name.trim() : current.name
      const nextPlatformType = typeof parsed.data.platform_type === "string" ? parsed.data.platform_type : current.platform_type
      const nextAuthType = typeof parsed.data.auth_type === "string" ? parsed.data.auth_type : current.auth_type
      const nextDescription = typeof parsed.data.description === "string" ? parsed.data.description.trim() : current.description
      const nextEnabled = typeof parsed.data.enabled === "boolean" ? parsed.data.enabled : current.enabled
      const nextSector = typeof parsed.data.sector === "string" ? parsed.data.sector.trim() : current.sector
      const rotateSecret = Boolean(parsed.data.rotate_secret)

      let nextBaseUrl = current.base_url
      if (typeof parsed.data.base_url === "string" && parsed.data.base_url.trim()) {
        const validUrl = validateConnectorBaseUrl(parsed.data.base_url.trim(), nextPlatformType, nextName)
        if (!validUrl.ok) {
          return sendJson(res, 400, { ok: false, error: validUrl.error }, req)
        }
        nextBaseUrl = validUrl.normalized
      }

      let authConfigPlain = decryptConnectorAuthConfig(current.auth_config)
      if (parsed.data.auth_config && typeof parsed.data.auth_config === "object") {
        authConfigPlain = {
          ...authConfigPlain,
          ...parsed.data.auth_config,
        }
      }
      const nextAuthConfig = (rotateSecret || parsed.data.auth_config)
        ? encryptConnectorAuthConfig(authConfigPlain)
        : current.auth_config

      const nextHeaders = parsed.data.headers && typeof parsed.data.headers === "object"
        ? parsed.data.headers
        : (current.headers || {})

      const updatedRows = await executeProxyQuery(
        `UPDATE platform_connectors
         SET name = $1,
             platform_type = $2,
             base_url = $3,
             auth_type = $4,
             auth_config = $5::jsonb,
             headers = $6::jsonb,
             enabled = $7,
             description = $8,
             sector = $9
         WHERE id = $10
         RETURNING id, name, platform_type, base_url, auth_type, auth_config, headers, enabled,
                   description, sector, health_status, last_health_check, created_by, created_at`,
        [
          nextName,
          nextPlatformType,
          nextBaseUrl,
          nextAuthType,
          JSON.stringify(nextAuthConfig),
          JSON.stringify(nextHeaders || {}),
          nextEnabled,
          nextDescription,
          nextSector || null,
          connectorId,
        ]
      )

      return sendJson(res, 200, { ok: true, connector: sanitizeConnectorForClient(updatedRows[0]) }, req)
    } catch (err) {
      console.error("[connectors/update] error:", err)
      return sendJson(res, 500, { ok: false, error: "Failed to update connector" }, req)
    }
  }

  if (method === "DELETE" && reqPathname.match(/^\/api\/connectors\/\d+$/)) {
    const auth = authorize(req)
    if (!auth.authorized) return sendJson(res, 401, { ok: false, error: "Unauthorized" }, req)
    if (!isDbConfigured()) return sendJson(res, 503, { ok: false, error: "Database not configured" }, req)

    try {
      const connectorId = parseInt(reqPathname.split("/")[3], 10)
      const rows = await executeProxyQuery("DELETE FROM platform_connectors WHERE id = $1 RETURNING id", [connectorId])
      if (!rows || rows.length === 0) {
        return sendJson(res, 404, { ok: false, error: "Connector not found" }, req)
      }
      return sendJson(res, 200, { ok: true }, req)
    } catch (err) {
      console.error("[connectors/delete] error:", err)
      return sendJson(res, 500, { ok: false, error: "Failed to delete connector" }, req)
    }
  }

  if (method === "POST" && reqPathname.match(/^\/api\/connectors\/\d+\/health$/)) {
    const auth = authorize(req)
    if (!auth.authorized) return sendJson(res, 401, { ok: false, error: "Unauthorized" }, req)
    if (!isDbConfigured()) return sendJson(res, 503, { ok: false, error: "Database not configured" }, req)

    try {
      const connectorId = parseInt(reqPathname.split("/")[3], 10)
      const rows = await executeProxyQuery(
        `SELECT id, name, platform_type, base_url, auth_type, auth_config, headers
         FROM platform_connectors
         WHERE id = $1
         LIMIT 1`,
        [connectorId]
      )
      if (!rows || rows.length === 0) {
        return sendJson(res, 404, { ok: false, error: "Connector not found" }, req)
      }

      const connector = rows[0]
      const baseUrlCheck = validateConnectorBaseUrl(connector.base_url, connector.platform_type, connector.name)
      if (!baseUrlCheck.ok) {
        await executeProxyQuery(
          "UPDATE platform_connectors SET health_status = 'down', last_health_check = NOW() WHERE id = $1",
          [connectorId]
        )
        return sendJson(res, 400, { ok: false, error: baseUrlCheck.error }, req)
      }

      const authConfig = decryptConnectorAuthConfig(connector.auth_config)
      const headers = buildConnectorHeaders(connector.auth_type, authConfig, connector.headers || {})

      const startedAt = Date.now()
      const response = await fetch(baseUrlCheck.normalized, {
        method: "HEAD",
        headers,
        signal: AbortSignal.timeout(10000),
      })
      const latencyMs = Date.now() - startedAt
      const nextStatus = response.ok ? "healthy" : "degraded"

      await executeProxyQuery(
        "UPDATE platform_connectors SET health_status = $1, last_health_check = NOW() WHERE id = $2",
        [nextStatus, connectorId]
      )

      return sendJson(res, 200, { ok: response.ok, latencyMs }, req)
    } catch (err) {
      try {
        const connectorId = parseInt(reqPathname.split("/")[3], 10)
        if (connectorId) {
          await executeProxyQuery(
            "UPDATE platform_connectors SET health_status = 'down', last_health_check = NOW() WHERE id = $1",
            [connectorId]
          )
        }
      } catch {
        // ignore secondary update errors
      }
      return sendJson(res, 200, { ok: false, latencyMs: 0, error: err instanceof Error ? err.message : "Health check failed" }, req)
    }
  }

  if (method === "POST" && reqPathname.match(/^\/api\/connectors\/\d+\/call$/)) {
    const auth = authorize(req)
    if (!auth.authorized) return sendJson(res, 401, { ok: false, error: "Unauthorized" }, req)
    if (!isDbConfigured()) return sendJson(res, 503, { ok: false, error: "Database not configured" }, req)

    try {
      const connectorId = parseInt(reqPathname.split("/")[3], 10)
      const parsed = await parseJsonBody(req)
      if (!parsed.ok) return sendJson(res, parsed.statusCode || 400, { ok: false, error: parsed.error }, req)

      const rows = await executeProxyQuery(
        `SELECT id, name, platform_type, base_url, auth_type, auth_config, headers, enabled
         FROM platform_connectors
         WHERE id = $1
         LIMIT 1`,
        [connectorId]
      )
      if (!rows || rows.length === 0) {
        return sendJson(res, 404, { ok: false, error: "Connector not found" }, req)
      }

      const connector = rows[0]
      if (!connector.enabled) {
        return sendJson(res, 400, { ok: false, error: "Connector is disabled" }, req)
      }

      const validBase = validateConnectorBaseUrl(connector.base_url, connector.platform_type, connector.name)
      if (!validBase.ok) {
        return sendJson(res, 400, { ok: false, error: validBase.error }, req)
      }

      const methodRaw = typeof parsed.data.method === "string" ? parsed.data.method.toUpperCase() : "GET"
      const allowedMethods = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"])
      const callMethod = allowedMethods.has(methodRaw) ? methodRaw : "GET"
      const endpoint = typeof parsed.data.endpoint === "string" ? parsed.data.endpoint : ""
      const params = parsed.data.params && typeof parsed.data.params === "object" ? parsed.data.params : undefined
      const body = parsed.data.body

      const authConfig = decryptConnectorAuthConfig(connector.auth_config)
      const baseHeaders = connector.headers && typeof connector.headers === "object" ? connector.headers : {}
      const requestHeaders = parsed.data.headers && typeof parsed.data.headers === "object" ? parsed.data.headers : {}
      const headers = buildConnectorHeaders(connector.auth_type, authConfig, {
        ...baseHeaders,
        ...requestHeaders,
      })

      const callUrl = buildConnectorCallUrl(validBase.normalized, endpoint, params)
      const startedAt = Date.now()
      const upstream = await fetch(callUrl, {
        method: callMethod,
        headers,
        body: callMethod === "GET" || callMethod === "DELETE" ? undefined : (body != null ? JSON.stringify(body) : undefined),
        signal: AbortSignal.timeout(30000),
      })
      const latencyMs = Date.now() - startedAt

      const contentType = upstream.headers.get("content-type") || ""
      let responseBody
      if (contentType.includes("application/json")) {
        responseBody = await upstream.json().catch(() => null)
      } else {
        responseBody = await upstream.text().catch(() => "")
      }

      const nextStatus = upstream.ok ? "healthy" : "degraded"
      await executeProxyQuery(
        "UPDATE platform_connectors SET health_status = $1, last_health_check = NOW() WHERE id = $2",
        [nextStatus, connectorId]
      )

      if (!upstream.ok) {
        return sendJson(res, 502, {
          ok: false,
          error: "Connector upstream request failed",
          status: upstream.status,
          latencyMs,
          data: responseBody,
        }, req)
      }

      return sendJson(res, 200, {
        ok: true,
        status: upstream.status,
        latencyMs,
        data: responseBody,
      }, req)
    } catch (err) {
      return sendJson(res, 500, {
        ok: false,
        error: err instanceof Error ? err.message : "Connector call failed",
      }, req)
    }
  }

  // ── GET /api/llm/models ──
  if (method === "GET" && reqPathname === "/api/llm/models") {
    const auth = authorize(req)
    if (!auth.authorized) {
      return sendJson(res, 401, { ok: false, error: "Unauthorized" }, req)
    }

    const copilotToken = process.env.GITHUB_COPILOT_TOKEN
      || process.env.GitHub_Models_token
      || process.env.GITHUB_MODELS_TOKEN
      || process.env.GITHUB_TOKEN
    const geminiApiKey = process.env.GEMINI_API_KEY
    const groqApiKey = process.env.GROQ_API_KEY

    const ALL_MODELS = [
      { id: "gpt-4.1",                    name: "GPT-4.1",              provider: "copilot", tier: "high" },
      { id: "gpt-4.1-mini",               name: "GPT-4.1 Mini",         provider: "copilot", tier: "low"  },
      { id: "gpt-4o",                     name: "GPT-4o",               provider: "copilot", tier: "high" },
      { id: "gpt-4o-mini",                name: "GPT-4o Mini",          provider: "copilot", tier: "low"  },
      { id: "gpt-5",                      name: "GPT-5",                provider: "copilot", tier: "high" },
      { id: "gpt-5-mini",                 name: "GPT-5 Mini",           provider: "copilot", tier: "low"  },
      { id: "o4-mini",                    name: "o4-mini",              provider: "copilot", tier: "high" },
      { id: "claude-3-5-sonnet",          name: "Claude 3.5 Sonnet",    provider: "copilot", tier: "high" },
      { id: "claude-3-5-haiku",           name: "Claude 3.5 Haiku",     provider: "copilot", tier: "low"  },
      { id: "claude-3-haiku",             name: "Claude 3 Haiku",       provider: "copilot", tier: "low"  },
      { id: "Meta-Llama-3.1-70B-Instruct","name": "Llama 3.1 70B",      provider: "copilot", tier: "high" },
      { id: "Llama-3.3-70B-Instruct",     name: "Llama 3.3 70B",        provider: "copilot", tier: "high" },
      { id: "Mistral-large",              name: "Mistral Large",        provider: "copilot", tier: "high" },
      { id: "DeepSeek-R1",                name: "DeepSeek R1",          provider: "copilot", tier: "high" },
      { id: "grok-3",                     name: "Grok-3",               provider: "copilot", tier: "high" },
      { id: "gemini-2.5-pro",             name: "Gemini 2.5 Pro",       provider: "gemini",  tier: "high" },
      { id: "gemini-2.5-flash",           name: "Gemini 2.5 Flash",     provider: "gemini",  tier: "low"  },
      { id: "gemini-1.5-pro",             name: "Gemini 1.5 Pro",       provider: "gemini",  tier: "high" },
      { id: "llama-3.3-70b-versatile",    name: "Llama 3.3 70B (Groq)", provider: "groq",    tier: "high" },
      { id: "llama-3.1-8b-instant",       name: "Llama 3.1 8B (Groq)",  provider: "groq",    tier: "low"  },
    ]

    const models = ALL_MODELS.filter((m) => {
      if (m.provider === "copilot") return Boolean(copilotToken)
      if (m.provider === "gemini") return Boolean(geminiApiKey)
      if (m.provider === "groq") return Boolean(groqApiKey)
      return false
    })

    return sendJson(res, 200, { ok: true, models }, req)
  }

  // ── POST /api/llm/generate ──
  if (method === "POST" && reqPathname === "/api/llm/generate") {
    const auth = authorize(req)
    if (!auth.authorized) {
      return sendJson(res, 401, { error: "Unauthorized" }, req)
    }

    try {
      const parsed = await parseJsonBody(req)
  if (!parsed.ok) return sendJson(res, parsed.statusCode || 400, { ok: false, error: parsed.error }, req)
  const body = parsed.data
      const prompt = typeof body.prompt === "string" ? body.prompt.trim() : ""
      const model = typeof body.model === "string" ? body.model : undefined
      const moduleName = typeof body.module === "string" ? body.module : "global"
      const parseJson = Boolean(body.parseJson)
      const providers = Array.isArray(body.providers)
        ? body.providers.filter((p) => p === "copilot" || p === "groq" || p === "gemini")
        : undefined

      if (!prompt) {
        return sendJson(res, 400, { error: "Missing required field: prompt" }, req)
      }

      const routing = await getResolvedRouting(moduleName)
      const activeRoute = providers && providers.length > 0
        ? providers
        : filterActiveGenerationProviders(routing.generationOrder, routing.enabledProviders)

      if ((routing.budgetExceeded.daily || routing.budgetExceeded.monthly) && !providers) {
        return sendJson(res, 429, {
          error: "Provider budget exceeded",
          details: routing.budgetExceeded,
        }, req)
      }

      const allowedProviders = activeRoute.filter((p) => p !== "spark")
      if (allowedProviders.length === 0) {
        return sendJson(res, 503, {
          error: "No active hosted providers configured",
          module: moduleName,
        }, req)
      }
      const result = await generateWithFallback({ prompt, model, providers: allowedProviders })

      void logProviderUsage({
        provider: result.provider,
        moduleName,
        kind: "generation",
        model: result.model,
        inputTokens: result.usage?.inputTokens,
        outputTokens: result.usage?.outputTokens,
        totalTokens: result.usage?.totalTokens,
        estimatedCostUsd: result.usage?.estimatedCostUsd || 0,
        status: "ok",
      }).catch(() => null)

      if (parseJson) {
        try {
          const parsed = JSON.parse(result.text)
          return sendJson(res, 200, {
            text: result.text,
            raw: parsed,
            provider: result.provider,
            model: result.model,
          }, req)
        } catch {
          return sendJson(res, 200, {
            text: result.text,
            raw: result.text,
            provider: result.provider,
            model: result.model,
          }, req)
        }
      }

      return sendJson(res, 200, {
        text: result.text,
        provider: result.provider,
        model: result.model,
      }, req)
    } catch (error) {
      console.error("[llm/generate] error:", error instanceof Error ? error.message : error)
      const moduleName = "global"
      void logProviderUsage({
        provider: "sentinel",
        moduleName,
        kind: "generation",
        status: "error",
        error: error instanceof Error ? error.message : String(error),
      }).catch(() => null)
      return sendJson(res, 500, {
        error: "LLM generation failed",
      }, req)
    }
  }

  // ── POST /api/llm/generate/stream ── (SSE token streaming)
  if (method === "POST" && reqPathname === "/api/llm/generate/stream") {
    const auth = authorize(req)
    if (!auth.authorized) {
      return sendJson(res, 401, { error: "Unauthorized" }, req)
    }

    try {
      const parsed = await parseJsonBody(req)
      if (!parsed.ok) return sendJson(res, parsed.statusCode || 400, { ok: false, error: parsed.error }, req)
      const body = parsed.data
      const prompt = typeof body.prompt === "string" ? body.prompt.trim() : ""
      const model = typeof body.model === "string" ? body.model : undefined
      const moduleName = typeof body.module === "string" ? body.module : "global"
      const providers = Array.isArray(body.providers)
        ? body.providers.filter((p) => p === "copilot" || p === "groq" || p === "gemini")
        : undefined

      if (!prompt) {
        return sendJson(res, 400, { error: "Missing required field: prompt" }, req)
      }

      const routing = await getResolvedRouting(moduleName)
      const activeRoute = providers && providers.length > 0
        ? providers
        : filterActiveGenerationProviders(routing.generationOrder, routing.enabledProviders)

      if ((routing.budgetExceeded.daily || routing.budgetExceeded.monthly) && !providers) {
        return sendJson(res, 429, {
          error: "Provider budget exceeded",
          details: routing.budgetExceeded,
        }, req)
      }

      const allowedProviders = activeRoute.filter((p) => p !== "spark")
      if (allowedProviders.length === 0) {
        return sendJson(res, 503, {
          error: "No active hosted providers configured",
          module: moduleName,
        }, req)
      }

      res.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
        ...SECURITY_HEADERS,
      })

      const sendEvent = (event, payload) => {
        res.write(`event: ${event}\n`)
        res.write(`data: ${JSON.stringify(payload)}\n\n`)
      }

      sendEvent("start", { ok: true })

      const result = await generateWithFallbackStream({
        prompt,
        model,
        providers: allowedProviders,
        onToken: (token) => {
          sendEvent("token", { token })
        },
      })

      void logProviderUsage({
        provider: result.provider,
        moduleName,
        kind: "generation",
        model: result.model,
        inputTokens: result.usage?.inputTokens,
        outputTokens: result.usage?.outputTokens,
        totalTokens: result.usage?.totalTokens,
        estimatedCostUsd: result.usage?.estimatedCostUsd || 0,
        status: "ok",
      }).catch(() => null)

      sendEvent("done", {
        text: result.text,
        provider: result.provider,
        model: result.model,
      })
      return res.end()
    } catch (error) {
      console.error("[llm/generate/stream] error:", error instanceof Error ? error.message : error)
      try {
        res.write(`event: error\ndata: ${JSON.stringify({ error: "LLM generation failed" })}\n\n`)
      } catch {
        // ignore secondary stream write failures
      }
      return res.end()
    }
  }

  // ── POST /api/web/search ──
  if (method === "POST" && reqPathname === "/api/web/search") {
    const auth = authorize(req)
    if (!auth.authorized) {
      return sendJson(res, 401, { ok: false, error: "Unauthorized" }, req)
    }

    try {
      const parsed = await parseJsonBody(req)
      if (!parsed.ok) return sendJson(res, parsed.statusCode || 400, { ok: false, error: parsed.error }, req)

      const query = typeof parsed.data.query === "string" ? parsed.data.query.trim() : ""
      const limit = typeof parsed.data.limit === "number" ? parsed.data.limit : 5
      const moduleName = typeof parsed.data.module === "string" ? parsed.data.module : "global"

      if (!query) {
        return sendJson(res, 400, { ok: false, error: "Missing required field: query" }, req)
      }

      const routing = await getResolvedRouting(moduleName)
      const webProviders = filterActiveWebProviders(routing.webOrder, routing.enabledWebProviders)
      const web = await searchWeb(query, limit, { providers: webProviders })

      void logProviderUsage({
        provider: web.provider || "sentinel",
        moduleName,
        kind: "web-search",
        requestCount: 1,
        estimatedCostUsd: 0,
        status: web.provider === "none" ? "error" : "ok",
        error: web.provider === "none" ? "no_results" : null,
      }).catch(() => null)

      return sendJson(res, 200, {
        ok: true,
        provider: web.provider,
        results: web.results,
      }, req)
    } catch (error) {
      console.error("[web/search] error:", error instanceof Error ? error.message : error)
      return sendJson(res, 500, { ok: false, error: "Web search failed" }, req)
    }
  }

  // ── POST /api/humanizer/score ──
  if (method === "POST" && reqPathname === "/api/humanizer/score") {
    const auth = authorize(req)
    if (!auth.authorized) {
      return sendJson(res, 401, { error: "Unauthorized" }, req)
    }

    try {
      const parsed = await parseJsonBody(req)
  if (!parsed.ok) return sendJson(res, parsed.statusCode || 400, { ok: false, error: parsed.error }, req)
  const body = parsed.data
      const text = typeof body.text === "string" ? body.text : ""
      const originalText = typeof body.originalText === "string" ? body.originalText : ""
      const candidates = Array.isArray(body.candidates) ? body.candidates : null

      if (!text.trim() && !(originalText.trim() && candidates && candidates.length > 0)) {
        return sendJson(res, 400, { error: "Missing required field: text" }, req)
      }

      if (originalText.trim() && candidates && candidates.length > 0) {
        const ranked = candidates
          .map((candidate, index) => {
            const humanizedText = typeof candidate?.humanizedText === "string" ? candidate.humanizedText : ""
            return {
              id: typeof candidate?.id === "string" ? candidate.id : `candidate-${index + 1}`,
              humanizedText,
              strategy: typeof candidate?.strategy === "string" ? candidate.strategy : undefined,
              changes: Array.isArray(candidate?.changes) ? candidate.changes : [],
              scores: scoreHumanizerCandidate(originalText, humanizedText),
            }
          })
          .filter((candidate) => candidate.humanizedText.trim().length > 0)
          .sort((left, right) => right.scores.overallScore - left.scores.overallScore)

        return sendJson(res, 200, {
          ok: true,
          source: "server-ranked",
          profileVersion: "humanizer-v2",
          ranked,
          bestId: ranked[0]?.id || null,
        }, req)
      }

      const scores = estimateHumanizerMeters(text)
      return sendJson(res, 200, {
        ok: true,
        source: "heuristic",
        scores,
        ...scores,
      }, req)
    } catch (error) {
      console.error("[humanizer/score] error:", error instanceof Error ? error.message : error)
      return sendJson(res, 500, {
        error: "Humanizer scoring failed",
      }, req)
    }
  }

  // ── POST /api/review/score ──
  if (method === "POST" && reqPathname === "/api/review/score") {
    const auth = authorize(req)
    if (!auth.authorized) {
      return sendJson(res, 401, { error: "Unauthorized" }, req)
    }

    try {
      const parsed = await parseJsonBody(req)
      if (!parsed.ok) return sendJson(res, parsed.statusCode || 400, { ok: false, error: parsed.error }, req)
      const body = parsed.data
      const text = typeof body.text === "string" ? body.text : ""
      const rawResult = body.rawResult && typeof body.rawResult === "object" ? body.rawResult : null
      const filters = body.filters && typeof body.filters === "object" ? body.filters : {}

      if (!text.trim() || !rawResult) {
        return sendJson(res, 400, { error: "Missing required fields: text and rawResult" }, req)
      }

      const meta = buildReviewScorePayload(text, rawResult, filters)
      return sendJson(res, 200, {
        ok: true,
        source: "server-review-profile",
        meta,
      }, req)
    } catch (error) {
      console.error("[review/score] error:", error instanceof Error ? error.message : error)
      return sendJson(res, 500, {
        error: "Review scoring failed",
      }, req)
    }
  }

  // ════════════════════════════════════════════════════════════════
  //  C4/C5 FIX: Backend proxy routes
  //  These allow the frontend to route DB queries and Gemini API
  //  calls through the backend instead of using browser-side secrets.
  // ════════════════════════════════════════════════════════════════

  // ── POST /api/proxy/db/query ── (requires auth)
  if (method === "POST" && reqPathname === "/api/proxy/db/query") {
    const auth = authorize(req)
    if (!auth.authorized) {
      return sendJson(res, 401, { ok: false, error: "Unauthorized" }, req)
    }
    if (!auth.user?.userId) {
      return sendJson(res, 403, { ok: false, error: "JWT user context required for database proxy" }, req)
    }

    if (!isDbConfigured()) {
      return sendJson(res, 503, { ok: false, error: "Database not configured" }, req)
    }

    try {
      const parsed = await parseJsonBody(req)
      if (!parsed.ok) return sendJson(res, parsed.statusCode || 400, { ok: false, error: parsed.error }, req)
      const { query, params } = parsed.data

      if (typeof query !== "string" || !query.trim()) {
        return sendJson(res, 400, { ok: false, error: "query is required" }, req)
      }
      if (params !== undefined && !Array.isArray(params)) {
        return sendJson(res, 400, { ok: false, error: "params must be an array" }, req)
      }
      if ((params || []).length > DB_PROXY_MAX_PARAMS) {
        return sendJson(res, 400, { ok: false, error: `params exceeds max length (${DB_PROXY_MAX_PARAMS})` }, req)
      }

      const sqlValidation = validateProxySqlQuery(query)
      if (!sqlValidation.ok) {
        return sendJson(res, 400, { ok: false, error: sqlValidation.error }, req)
      }

      const rows = await executeProxyQuery(sqlValidation.normalized, params || [])
      return sendJson(res, 200, { ok: true, rows }, req)
    } catch (err) {
      console.error("[proxy/db/query] error:", err)
      return sendJson(res, 500, { ok: false, error: "Database query failed" }, req)
    }
  }

  // ── GET /api/proxy/db/test ── (requires auth)
  if (method === "GET" && reqPathname === "/api/proxy/db/test") {
    const auth = authorize(req)
    if (!auth.authorized) {
      return sendJson(res, 401, { ok: false, error: "Unauthorized" }, req)
    }
    if (!auth.user?.userId) {
      return sendJson(res, 403, { ok: false, error: "JWT user context required for database proxy" }, req)
    }

    if (!isDbConfigured()) {
      return sendJson(res, 200, { ok: false, error: "Database not configured" }, req)
    }

    try {
      const rows = await executeProxyQuery("SELECT 1 as ping", [])
      return sendJson(res, 200, { ok: true, connected: rows.length > 0 }, req)
    } catch {
      return sendJson(res, 200, { ok: false, error: "Connection failed" }, req)
    }
  }

  // ── POST /api/proxy/gemini/generate ── (requires auth)
  if (method === "POST" && reqPathname === "/api/proxy/gemini/generate") {
    const auth = authorize(req)
    if (!auth.authorized) {
      return sendJson(res, 401, { ok: false, error: "Unauthorized" }, req)
    }

    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      return sendJson(res, 503, { ok: false, error: "Gemini not configured" }, req)
    }

    try {
      const parsed = await parseJsonBody(req)
      if (!parsed.ok) return sendJson(res, parsed.statusCode || 400, { ok: false, error: parsed.error }, req)
      const { prompt, model } = parsed.data

      if (typeof prompt !== "string" || !prompt.trim()) {
        return sendJson(res, 400, { ok: false, error: "prompt is required" }, req)
      }

      const selectedModel = model || "gemini-2.5-flash"
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=${encodeURIComponent(apiKey)}`

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 4096 },
        }),
      })

      if (!response.ok) {
        console.error("[proxy/gemini/generate] upstream error:", response.status)
        return sendJson(res, 502, { ok: false, error: "Gemini API call failed" }, req)
      }

      const data = await response.json()
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || ""
      return sendJson(res, 200, { ok: true, text, model: selectedModel }, req)
    } catch (err) {
      console.error("[proxy/gemini/generate] error:", err)
      return sendJson(res, 500, { ok: false, error: "Gemini generation failed" }, req)
    }
  }

  // ── POST /api/proxy/embed ── (requires auth)
  // Uses GitHub Copilot / Azure AI Inference text-embedding-3-small (1536-dim) by default.
  // Production sentinel_brain currently expects 1536-dim vectors.
  if (method === "POST" && reqPathname === "/api/proxy/embed") {
    const auth = authorize(req)
    if (!auth.authorized) {
      return sendJson(res, 401, { ok: false, error: "Unauthorized" }, req)
    }

    try {
      const parsed = await parseJsonBody(req)
      if (!parsed.ok) return sendJson(res, parsed.statusCode || 400, { ok: false, error: parsed.error }, req)
      const { text, texts } = parsed.data
      const textsToEmbed = texts ? (Array.isArray(texts) ? texts : [texts]) : text ? [text] : []
      if (textsToEmbed.length === 0) {
        return sendJson(res, 400, { ok: false, error: "text or texts is required" }, req)
      }

      const githubToken = process.env.GITHUB_COPILOT_TOKEN
        || process.env.GitHub_Models_token
        || process.env.GITHUB_MODELS_TOKEN
        || process.env.GITHUB_TOKEN
      if (githubToken) {
        // GitHub Models / Azure AI Inference — text-embedding-3-small at 1536 dims
        const endpoint = "https://models.inference.ai.azure.com/embeddings"
        const embeddings = []
        for (const t of textsToEmbed) {
          const response = await fetch(endpoint, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${githubToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "text-embedding-3-small",
              input: t,
              dimensions: 1536,
            }),
          })
          if (!response.ok) {
            const errText = await response.text().catch(() => "")
            console.error("[proxy/embed] GitHub Models error:", response.status, errText)
            return sendJson(res, 502, { ok: false, error: "GitHub Models embed API error" }, req)
          }
          const data = await response.json()
          embeddings.push(data?.data?.[0]?.embedding || [])
        }
        return sendJson(res, 200, {
          ok: true,
          embeddings: textsToEmbed.length === 1 ? embeddings[0] : embeddings,
          batch: textsToEmbed.length > 1,
          provider: "github",
        }, req)
      }

      return sendJson(
        res,
        503,
        { ok: false, error: "Embedding provider not configured. Set GITHUB_COPILOT_TOKEN / GitHub_Models_token." },
        req
      )
    } catch (err) {
      console.error("[proxy/embed] error:", err)
      return sendJson(res, 500, { ok: false, error: "Embedding failed" }, req)
    }
  }

  // ── POST /api/proxy/gemini/embed ── (requires auth)
  if (method === "POST" && reqPathname === "/api/proxy/gemini/embed") {
    const auth = authorize(req)
    if (!auth.authorized) {
      return sendJson(res, 401, { ok: false, error: "Unauthorized" }, req)
    }

    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      return sendJson(res, 503, { ok: false, error: "Gemini not configured" }, req)
    }

    try {
      const parsed = await parseJsonBody(req)
      if (!parsed.ok) return sendJson(res, parsed.statusCode || 400, { ok: false, error: parsed.error }, req)
      const { text, texts } = parsed.data

      // Single text or batch
      const textsToEmbed = texts ? (Array.isArray(texts) ? texts : [texts]) : text ? [text] : []
      if (textsToEmbed.length === 0) {
        return sendJson(res, 400, { ok: false, error: "text or texts is required" }, req)
      }

      const embeddings = []
      for (const t of textsToEmbed) {
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${encodeURIComponent(apiKey)}`
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: { parts: [{ text: t }] } }),
        })
        if (!response.ok) {
          console.error("[proxy/gemini/embed] upstream error:", response.status)
          return sendJson(res, 502, { ok: false, error: "Gemini embed API call failed" }, req)
        }
        const data = await response.json()
        embeddings.push(data?.embedding?.values || [])
      }

      return sendJson(res, 200, {
        ok: true,
        embeddings: textsToEmbed.length === 1 ? embeddings[0] : embeddings,
        batch: textsToEmbed.length > 1,
      }, req)
    } catch (err) {
      console.error("[proxy/gemini/embed] error:", err)
      return sendJson(res, 500, { ok: false, error: "Gemini embedding failed" }, req)
    }
  }

  // ── GET /api/proxy/gemini/test ── (requires auth)
  if (method === "GET" && reqPathname === "/api/proxy/gemini/test") {
    const auth = authorize(req)
    if (!auth.authorized) {
      return sendJson(res, 401, { ok: false, error: "Unauthorized" }, req)
    }

    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      return sendJson(res, 200, { ok: false, error: "Gemini API key not configured on backend" }, req)
    }

    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: "Respond with exactly: OK" }] }],
          generationConfig: { temperature: 0, maxOutputTokens: 10 },
        }),
      })
      if (!response.ok) {
        return sendJson(res, 200, { ok: false, error: "Gemini API returned error" }, req)
      }
      const data = await response.json()
      const text = (data?.candidates?.[0]?.content?.parts?.[0]?.text || "").toLowerCase()
      return sendJson(res, 200, { ok: text.includes("ok") }, req)
    } catch {
      return sendJson(res, 200, { ok: false, error: "Gemini connection test failed" }, req)
    }
  }

  // ════════════════════════════════════════════════════════════════
  //  Dedicated Chat API Routes
  //  All routes enforce JWT auth + user ownership server-side.
  // ════════════════════════════════════════════════════════════════

  // ── GET /api/chat/threads ── list threads for the authenticated user
  if (method === "GET" && reqPathname === "/api/chat/threads") {
    const auth = authorize(req)
    if (!auth.authorized) return sendJson(res, 401, { ok: false, error: "Unauthorized" }, req)
    if (!isDbConfigured()) return sendJson(res, 503, { ok: false, error: "Database not configured" }, req)
    try {
      const userId = auth.user?.userId
      if (!userId) return sendJson(res, 403, { ok: false, error: "No user context" }, req)
      const rawSearch = req.url?.split("?")[1] || ""
      const params = new URLSearchParams(rawSearch)
      const module_ = params.get("module") || null
      const status = params.get("status") || null
      const limit = Math.min(parseInt(params.get("limit") || "50", 10) || 50, 200)
      const rows = await executeProxyQuery(
        `SELECT * FROM chat_threads WHERE user_id = $1 ${module_ ? "AND module = $2" : ""} ${status ? `AND status = $${module_ ? 3 : 2}` : ""} ORDER BY updated_at DESC LIMIT $${module_ && status ? 4 : module_ || status ? 3 : 2}`,
        [userId, ...(module_ ? [module_] : []), ...(status ? [status] : []), limit]
      )
      return sendJson(res, 200, { ok: true, threads: rows }, req)
    } catch (err) {
      console.error("[chat/threads GET] error:", err)
      return sendJson(res, 500, { ok: false, error: "Failed to list threads" }, req)
    }
  }

  // ── POST /api/chat/threads ── create a new thread
  if (method === "POST" && reqPathname === "/api/chat/threads") {
    const auth = authorize(req)
    if (!auth.authorized) return sendJson(res, 401, { ok: false, error: "Unauthorized" }, req)
    if (!isDbConfigured()) return sendJson(res, 503, { ok: false, error: "Database not configured" }, req)
    try {
      const userId = auth.user?.userId
      if (!userId) return sendJson(res, 403, { ok: false, error: "No user context" }, req)
      const parsed = await parseJsonBody(req)
      if (!parsed.ok) return sendJson(res, parsed.statusCode || 400, { ok: false, error: parsed.error }, req)
      const { module: mod = "general", title = "New Chat", status = "active" } = parsed.data
      const rows = await executeProxyQuery(
        "INSERT INTO chat_threads (user_id, module, title, status) VALUES ($1, $2, $3, $4) RETURNING *",
        [userId, mod, title, status]
      )
      return sendJson(res, 201, { ok: true, thread: rows[0] }, req)
    } catch (err) {
      console.error("[chat/threads POST] error:", err)
      return sendJson(res, 500, { ok: false, error: "Failed to create thread" }, req)
    }
  }

  // ── PATCH /api/chat/threads/:id ── update title / status / module
  if (method === "PATCH" && reqPathname.match(/^\/api\/chat\/threads\/\d+$/)) {
    const auth = authorize(req)
    if (!auth.authorized) return sendJson(res, 401, { ok: false, error: "Unauthorized" }, req)
    if (!isDbConfigured()) return sendJson(res, 503, { ok: false, error: "Database not configured" }, req)
    try {
      const userId = auth.user?.userId
      if (!userId) return sendJson(res, 403, { ok: false, error: "No user context" }, req)
      const threadId = parseInt(reqPathname.split("/")[4], 10)
      const parsed = await parseJsonBody(req)
      if (!parsed.ok) return sendJson(res, parsed.statusCode || 400, { ok: false, error: parsed.error }, req)
      const { title, status, module: mod } = parsed.data
      const rows = await executeProxyQuery(
        `UPDATE chat_threads SET title = COALESCE($1, title), status = COALESCE($2, status), module = COALESCE($3, module), updated_at = NOW() WHERE id = $4 AND user_id = $5 RETURNING *`,
        [title ?? null, status ?? null, mod ?? null, threadId, userId]
      )
      if (!rows || rows.length === 0) return sendJson(res, 404, { ok: false, error: "Thread not found" }, req)
      return sendJson(res, 200, { ok: true, thread: rows[0] }, req)
    } catch (err) {
      console.error("[chat/threads PATCH] error:", err)
      return sendJson(res, 500, { ok: false, error: "Failed to update thread" }, req)
    }
  }

  // ── DELETE /api/chat/threads/:id ── delete a thread (must be owner)
  if (method === "DELETE" && reqPathname.match(/^\/api\/chat\/threads\/\d+$/)) {
    const auth = authorize(req)
    if (!auth.authorized) return sendJson(res, 401, { ok: false, error: "Unauthorized" }, req)
    if (!isDbConfigured()) return sendJson(res, 503, { ok: false, error: "Database not configured" }, req)
    try {
      const userId = auth.user?.userId
      if (!userId) return sendJson(res, 403, { ok: false, error: "No user context" }, req)
      const threadId = parseInt(reqPathname.split("/")[4], 10)
      const rows = await executeProxyQuery(
        "DELETE FROM chat_threads WHERE id = $1 AND user_id = $2 RETURNING id",
        [threadId, userId]
      )
      if (!rows || rows.length === 0) return sendJson(res, 404, { ok: false, error: "Thread not found" }, req)
      return sendJson(res, 200, { ok: true, deleted: true }, req)
    } catch (err) {
      console.error("[chat/threads DELETE] error:", err)
      return sendJson(res, 500, { ok: false, error: "Failed to delete thread" }, req)
    }
  }

  // ── PATCH /api/chat/threads/:id/auto-title ── auto-title from first message
  if (method === "PATCH" && reqPathname.match(/^\/api\/chat\/threads\/\d+\/auto-title$/)) {
    const auth = authorize(req)
    if (!auth.authorized) return sendJson(res, 401, { ok: false, error: "Unauthorized" }, req)
    if (!isDbConfigured()) return sendJson(res, 503, { ok: false, error: "Database not configured" }, req)
    try {
      const userId = auth.user?.userId
      if (!userId) return sendJson(res, 403, { ok: false, error: "No user context" }, req)
      const threadId = parseInt(reqPathname.split("/")[4], 10)
      const parsed = await parseJsonBody(req)
      if (!parsed.ok) return sendJson(res, parsed.statusCode || 400, { ok: false, error: parsed.error }, req)
      const { firstMessage } = parsed.data
      if (typeof firstMessage !== "string" || !firstMessage.trim()) {
        return sendJson(res, 400, { ok: false, error: "firstMessage is required" }, req)
      }
      const normalized = firstMessage.trim().replace(/\s+/g, " ")
      const maxLen = 72
      const title = normalized.length > maxLen ? `${normalized.slice(0, maxLen - 3)}...` : normalized
      await executeProxyQuery(
        "UPDATE chat_threads SET title = $1, updated_at = NOW() WHERE id = $2 AND user_id = $3 AND title = 'New Chat'",
        [title, threadId, userId]
      )
      return sendJson(res, 200, { ok: true }, req)
    } catch (err) {
      console.error("[chat/threads auto-title] error:", err)
      return sendJson(res, 500, { ok: false, error: "Failed to auto-title thread" }, req)
    }
  }

  // ── GET /api/chat/threads/:id/messages ── list messages in a thread
  if (method === "GET" && reqPathname.match(/^\/api\/chat\/threads\/\d+\/messages$/)) {
    const auth = authorize(req)
    if (!auth.authorized) return sendJson(res, 401, { ok: false, error: "Unauthorized" }, req)
    if (!isDbConfigured()) return sendJson(res, 503, { ok: false, error: "Database not configured" }, req)
    try {
      const userId = auth.user?.userId
      if (!userId) return sendJson(res, 403, { ok: false, error: "No user context" }, req)
      const threadId = parseInt(reqPathname.split("/")[4], 10)
      const rawSearch = req.url?.split("?")[1] || ""
      const params = new URLSearchParams(rawSearch)
      const limit = Math.min(parseInt(params.get("limit") || "200", 10) || 200, 500)
      // Verify thread ownership before returning messages
      const ownerCheck = await executeProxyQuery(
        "SELECT id FROM chat_threads WHERE id = $1 AND user_id = $2",
        [threadId, userId]
      )
      if (!ownerCheck || ownerCheck.length === 0) {
        return sendJson(res, 404, { ok: false, error: "Thread not found" }, req)
      }
      const rows = await executeProxyQuery(
        "SELECT * FROM chat_messages WHERE thread_id = $1 ORDER BY created_at ASC LIMIT $2",
        [threadId, limit]
      )
      return sendJson(res, 200, { ok: true, messages: rows }, req)
    } catch (err) {
      console.error("[chat/threads messages GET] error:", err)
      return sendJson(res, 500, { ok: false, error: "Failed to list messages" }, req)
    }
  }

  // ── POST /api/chat/threads/:id/messages ── append a message
  if (method === "POST" && reqPathname.match(/^\/api\/chat\/threads\/\d+\/messages$/)) {
    const auth = authorize(req)
    if (!auth.authorized) return sendJson(res, 401, { ok: false, error: "Unauthorized" }, req)
    if (!isDbConfigured()) return sendJson(res, 503, { ok: false, error: "Database not configured" }, req)
    try {
      const userId = auth.user?.userId
      if (!userId) return sendJson(res, 403, { ok: false, error: "No user context" }, req)
      const threadId = parseInt(reqPathname.split("/")[4], 10)
      const parsed = await parseJsonBody(req)
      if (!parsed.ok) return sendJson(res, parsed.statusCode || 400, { ok: false, error: parsed.error }, req)
      const { role, content, provider, model_used, providers_used, brain_hits, metadata } = parsed.data
      if (!role || !content) return sendJson(res, 400, { ok: false, error: "role and content are required" }, req)
      // Verify thread ownership
      const ownerCheck = await executeProxyQuery(
        "SELECT id FROM chat_threads WHERE id = $1 AND user_id = $2",
        [threadId, userId]
      )
      if (!ownerCheck || ownerCheck.length === 0) {
        return sendJson(res, 404, { ok: false, error: "Thread not found" }, req)
      }
      const rows = await executeProxyQuery(
        `INSERT INTO chat_messages (thread_id, role, content, provider, model_used, providers_used, brain_hits, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb) RETURNING *`,
        [
          threadId,
          role,
          content,
          provider ?? null,
          model_used ?? null,
          providers_used ?? null,
          brain_hits ?? 0,
          metadata ? JSON.stringify(metadata) : null,
        ]
      )
      await executeProxyQuery(
        "UPDATE chat_threads SET updated_at = NOW() WHERE id = $1",
        [threadId]
      )
      return sendJson(res, 201, { ok: true, message: rows[0] }, req)
    } catch (err) {
      console.error("[chat/threads messages POST] error:", err)
      return sendJson(res, 500, { ok: false, error: "Failed to append message" }, req)
    }
  }

  // ── GET /api/chat/threads/:id/traces ── list retrieval traces for a thread
  if (method === "GET" && reqPathname.match(/^\/api\/chat\/threads\/\d+\/traces$/)) {
    const auth = authorize(req)
    if (!auth.authorized) return sendJson(res, 401, { ok: false, error: "Unauthorized" }, req)
    if (!isDbConfigured()) return sendJson(res, 503, { ok: false, error: "Database not configured" }, req)
    try {
      const userId = auth.user?.userId
      if (!userId) return sendJson(res, 403, { ok: false, error: "No user context" }, req)
      const threadId = parseInt(reqPathname.split("/")[4], 10)
      const rawSearch = req.url?.split("?")[1] || ""
      const params = new URLSearchParams(rawSearch)
      const limit = Math.min(parseInt(params.get("limit") || "100", 10) || 100, 500)
      // Verify thread ownership
      const ownerCheck = await executeProxyQuery(
        "SELECT id FROM chat_threads WHERE id = $1 AND user_id = $2",
        [threadId, userId]
      )
      if (!ownerCheck || ownerCheck.length === 0) {
        return sendJson(res, 404, { ok: false, error: "Thread not found" }, req)
      }
      const rows = await executeProxyQuery(
        "SELECT * FROM retrieval_traces WHERE thread_id = $1 ORDER BY created_at DESC LIMIT $2",
        [threadId, limit]
      )
      return sendJson(res, 200, { ok: true, traces: rows }, req)
    } catch (err) {
      console.error("[chat/threads traces GET] error:", err)
      return sendJson(res, 500, { ok: false, error: "Failed to list traces" }, req)
    }
  }

  // ── GET /api/chat/traces/by-message/:messageId ── trace for a specific message
  if (method === "GET" && reqPathname.match(/^\/api\/chat\/traces\/by-message\/\d+$/)) {
    const auth = authorize(req)
    if (!auth.authorized) return sendJson(res, 401, { ok: false, error: "Unauthorized" }, req)
    if (!isDbConfigured()) return sendJson(res, 503, { ok: false, error: "Database not configured" }, req)
    try {
      const messageId = parseInt(reqPathname.split("/")[5], 10)
      const rows = await executeProxyQuery(
        "SELECT * FROM retrieval_traces WHERE message_id = $1 ORDER BY created_at DESC LIMIT 1",
        [messageId]
      )
      return sendJson(res, 200, { ok: true, trace: rows[0] ?? null }, req)
    } catch (err) {
      console.error("[chat/traces by-message GET] error:", err)
      return sendJson(res, 500, { ok: false, error: "Failed to get trace" }, req)
    }
  }

  // ── Static Files (SPA Fallback) ──
  if (method === "GET" && !reqPathname.startsWith("/api") && reqPathname !== "/health") {
    const distPath = path.resolve(__dirname, "../dist")
    let reqPath = reqPathname === "/" ? "/index.html" : reqPathname
    let filePath = path.join(distPath, reqPath)

    // Prevent directory traversal
    if (!filePath.startsWith(distPath)) {
      return sendJson(res, 403, { error: "Forbidden" }, req)
    }

    try {
      let stat = await fs.promises.stat(filePath).catch(() => null)
      
      if (!stat || !stat.isFile()) {
        // SPA fallback to index.html
        filePath = path.join(distPath, "index.html")
        stat = await fs.promises.stat(filePath).catch(() => null)
        
        if (!stat || !stat.isFile()) {
          return sendJson(res, 404, { error: "Frontend not built. Run 'npm run build'." }, req)
        }
      }

      const ext = path.extname(filePath).toLowerCase()
      const mimeType = extToMime[ext] || "application/octet-stream"

      // Cache headers: hashed assets get long-lived immutable cache; index.html gets no-cache
      const isIndexHtml = filePath.endsWith("index.html")
      const isHtml = ext === ".html"
      const cacheControl = isIndexHtml
        ? "no-cache, no-store, must-revalidate"
        : "public, max-age=31536000, immutable"

      const headers = {
        "Content-Type": mimeType,
        "Cache-Control": cacheControl,
        ...(isHtml ? HTML_SECURITY_HEADERS : SECURITY_HEADERS),
      }

      // CORS for static assets (fonts, etc.)
      const corsOrigin = getCorsOrigin(req)
      if (corsOrigin) {
        headers["Access-Control-Allow-Origin"] = corsOrigin
        headers["Vary"] = "Origin"
      }

      res.writeHead(200, headers)
      fs.createReadStream(filePath).pipe(res)
      return
    } catch (err) {
      console.error("[static] error serving file:", err)
      return sendJson(res, 500, { error: "Internal server error" }, req)
    }
  }

  // ── 404 ──
  return sendJson(res, 404, { error: "Not found" }, req)
})

// ─────────────────────────── Process Error Handlers ──────────────

process.on("unhandledRejection", (reason) => {
  console.error("[FATAL] Unhandled promise rejection:", reason)
})

process.on("uncaughtException", (err) => {
  console.error("[FATAL] Uncaught exception:", err)
  // Give time to flush logs before exiting
  setTimeout(() => process.exit(1), 1000)
})

// ─────────────────────────── Startup ─────────────────────────────

async function start() {
  // Verify sentinel tables if DB is configured
  if (isDbConfigured() && SENTINEL_AUTH_ENABLED) {
    await ensureSentinelTables().catch((err) => {
      console.warn("[startup] Sentinel table check failed:", err.message)
    })
  }

  server.listen(PORT, HOST, () => {
    console.log(`[backend] listening on http://${HOST}:${PORT}`)
    console.log(`[backend] sentinel auth: ${SENTINEL_AUTH_ENABLED ? "ENABLED" : "disabled"}`)
    console.log(`[backend] neon DB: ${isDbConfigured() ? "configured" : "not configured"}`)
    console.log(`[backend] JWT: ${isJwtConfigured() ? "configured" : "not configured"}`)
  })
}

start()
