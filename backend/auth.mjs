/**
 * Backend JWT Authentication Module
 *
 * Uses Node.js built-in crypto for HMAC-SHA256 JWT signing/verification.
 * No external dependencies required.
 *
 * Token payload matches SentinelAuthToken shape:
 *   { userId, email, role, organizationId?, subscriptionTier?, iat, exp }
 */

import crypto from "node:crypto"
import bcrypt from "bcrypt"

// ─────────────────────────── Config ──────────────────────────────

const JWT_SECRET = process.env.JWT_SECRET || process.env.BACKEND_JWT_SECRET || ""
const JWT_EXPIRY_SECONDS = Number(process.env.JWT_EXPIRY_SECONDS) || 86400 // 24h
const REFRESH_WINDOW_SECONDS = Number(process.env.JWT_REFRESH_WINDOW_SECONDS) || 3600 // 1h before expiry

// ─────────────────────────── Base64url Helpers ───────────────────

function base64urlEncode(data) {
  return Buffer.from(data).toString("base64url")
}

function base64urlDecode(str) {
  return Buffer.from(str, "base64url").toString("utf-8")
}

// ─────────────────────────── JWT Core ────────────────────────────

/**
 * Sign a JWT token with HMAC-SHA256.
 * @param {object} payload - Token payload (userId, email, role, etc.)
 * @param {object} [options] - { expiresInSeconds?: number }
 * @returns {string} Signed JWT string
 */
export function signToken(payload, options = {}) {
  if (!JWT_SECRET) {
    throw new Error("JWT_SECRET is not configured. Set JWT_SECRET or BACKEND_JWT_SECRET env var.")
  }

  const expiresIn = options.expiresInSeconds || JWT_EXPIRY_SECONDS
  const now = Math.floor(Date.now() / 1000)

  const header = { alg: "HS256", typ: "JWT" }
  const body = {
    ...payload,
    iat: now,
    exp: now + expiresIn,
  }

  const headerB64 = base64urlEncode(JSON.stringify(header))
  const bodyB64 = base64urlEncode(JSON.stringify(body))
  const signature = crypto
    .createHmac("sha256", JWT_SECRET)
    .update(`${headerB64}.${bodyB64}`)
    .digest("base64url")

  return `${headerB64}.${bodyB64}.${signature}`
}

/**
 * Verify and decode a JWT token.
 * @param {string} token - JWT string
 * @returns {{ valid: boolean, payload?: object, error?: string }}
 */
export function verifyToken(token) {
  if (!JWT_SECRET) {
    return { valid: false, error: "JWT_SECRET not configured" }
  }

  if (typeof token !== "string" || !token.includes(".")) {
    return { valid: false, error: "Malformed token" }
  }

  const parts = token.split(".")
  if (parts.length !== 3) {
    return { valid: false, error: "Malformed token: expected 3 parts" }
  }

  const [headerB64, bodyB64, signatureB64] = parts

  // Verify signature
  const expectedSig = crypto
    .createHmac("sha256", JWT_SECRET)
    .update(`${headerB64}.${bodyB64}`)
    .digest("base64url")

  if (!crypto.timingSafeEqual(Buffer.from(signatureB64), Buffer.from(expectedSig))) {
    return { valid: false, error: "Invalid signature" }
  }

  // Decode payload
  let payload
  try {
    payload = JSON.parse(base64urlDecode(bodyB64))
  } catch {
    return { valid: false, error: "Malformed payload" }
  }

  // Check expiry
  const now = Math.floor(Date.now() / 1000)
  if (payload.exp && payload.exp < now) {
    return { valid: false, error: "Token expired" }
  }

  return { valid: true, payload }
}

/**
 * Check if a token is eligible for refresh (within refresh window before expiry).
 * @param {object} payload - Decoded JWT payload
 * @returns {boolean}
 */
export function isRefreshEligible(payload) {
  if (!payload || !payload.exp) return false
  const now = Math.floor(Date.now() / 1000)
  const timeToExpiry = payload.exp - now
  return timeToExpiry > 0 && timeToExpiry < REFRESH_WINDOW_SECONDS
}

// ─────────────────────────── Password Hashing ────────────────────

const BCRYPT_ROUNDS = 12

/**
 * H2 fix: Hash a password using bcrypt.
 * New registrations and password changes use bcrypt.
 *
 * @param {string} password - Plain text password
 * @returns {Promise<string>} Bcrypt hashed password
 */
export async function hashPassword(password) {
  return bcrypt.hash(password, BCRYPT_ROUNDS)
}

/**
 * Legacy SHA-256 hash — used only for verifying old passwords during migration.
 * DO NOT use for new password hashing.
 *
 * @param {string} password - Plain text password
 * @returns {string} SHA-256 hex hash
 */
function hashPasswordLegacy(password) {
  return crypto
    .createHash("sha256")
    .update(`sentinel:${password}:v2`)
    .digest("hex")
}

/**
 * Detect whether a stored hash is bcrypt format.
 * Bcrypt hashes start with "$2a$", "$2b$", or "$2y$" and are 60 chars long.
 *
 * @param {string} hash
 * @returns {boolean}
 */
function isBcryptHash(hash) {
  return typeof hash === "string" && /^\$2[aby]\$\d{2}\$/.test(hash)
}

/**
 * H2 fix: Verify a password against a stored hash.
 * Supports both bcrypt (new) and legacy SHA-256 sentinel salt (old).
 *
 * If the stored hash is legacy SHA-256 and verification succeeds,
 * returns { verified: true, needsRehash: true } so the caller can
 * upgrade the hash in the database.
 *
 * @param {string} password - Plain text password
 * @param {string} storedHash - Stored password hash (bcrypt or SHA-256)
 * @returns {Promise<{ verified: boolean, needsRehash: boolean }>}
 */
export async function verifyPassword(password, storedHash) {
  if (!storedHash) {
    return { verified: false, needsRehash: false }
  }

  if (isBcryptHash(storedHash)) {
    // Modern bcrypt verification
    const match = await bcrypt.compare(password, storedHash)
    return { verified: match, needsRehash: false }
  }

  // Legacy SHA-256 verification (timing-safe)
  const legacyHash = hashPasswordLegacy(password)
  const hashBuf = Buffer.from(legacyHash, "utf-8")
  const storedBuf = Buffer.from(storedHash, "utf-8")
  if (hashBuf.length !== storedBuf.length) {
    return { verified: false, needsRehash: false }
  }
  const match = crypto.timingSafeEqual(hashBuf, storedBuf)
  return { verified: match, needsRehash: match } // If matched, needs rehash to bcrypt
}

// ─────────────────────────── Token Extraction ────────────────────

/**
 * Extract JWT from request headers.
 * Supports:
 *   - Authorization: Bearer <token>
 *   - x-sentinel-token: <token>
 *
 * @param {import("http").IncomingMessage} req
 * @returns {string|null} Token string or null
 */
export function extractToken(req) {
  const authHeader = req.headers["authorization"] || ""
  if (authHeader.startsWith("Bearer ")) {
    return authHeader.slice(7).trim()
  }

  const sentinelToken = req.headers["x-sentinel-token"]
  if (typeof sentinelToken === "string" && sentinelToken.length > 0) {
    return sentinelToken
  }

  return null
}

/**
 * Extract and verify JWT from request, returning user context.
 * @param {import("http").IncomingMessage} req
 * @returns {{ authenticated: boolean, user?: object, error?: string }}
 */
export function authenticateRequest(req) {
  const token = extractToken(req)
  if (!token) {
    return { authenticated: false, error: "No token provided" }
  }

  const result = verifyToken(token)
  if (!result.valid) {
    return { authenticated: false, error: result.error }
  }

  return {
    authenticated: true,
    user: {
      userId: result.payload.userId,
      email: result.payload.email,
      role: result.payload.role,
      organizationId: result.payload.organizationId || null,
      subscriptionTier: result.payload.subscriptionTier || null,
    },
  }
}

export function isJwtConfigured() {
  return JWT_SECRET.length > 0
}

// ─────────────────────────── Digital Signatures ──────────────────

/**
 * Generate a digital signature for a report.
 *
 * The signature is an HMAC-SHA256 hash over the canonical content:
 *   HMAC(reportId + "|" + reportContentHash + "|" + signerId + "|" + timestamp)
 *
 * This provides:
 *   - Integrity: any change to content invalidates the signature
 *   - Attribution: signer ID is bound into the hash
 *   - Timestamp: exact signing time is bound into the hash
 *   - Non-repudiation (within system): only the server can produce valid signatures
 *
 * @param {object} params
 * @param {string} params.reportId - Report UUID
 * @param {string} params.contentHash - SHA-256 hash of report content (sections JSON)
 * @param {string} params.signerId - User ID of the signer
 * @param {number} params.timestamp - Unix epoch ms
 * @returns {string} Hex-encoded signature
 */
export function signReport({ reportId, contentHash, signerId, timestamp }) {
  if (!JWT_SECRET) {
    throw new Error("JWT_SECRET is not configured. Cannot sign reports without a secret key.")
  }
  const payload = `${reportId}|${contentHash}|${signerId}|${timestamp}`
  return crypto.createHmac("sha256", JWT_SECRET).update(payload).digest("hex")
}

/**
 * Verify a report's digital signature.
 *
 * @param {object} params - Same as signReport
 * @param {string} expectedSignature - The stored signature hash
 * @returns {boolean}
 */
export function verifyReportSignature({ reportId, contentHash, signerId, timestamp }, expectedSignature) {
  const computed = signReport({ reportId, contentHash, signerId, timestamp })
  const computedBuf = Buffer.from(computed, "hex")
  const expectedBuf = Buffer.from(expectedSignature, "hex")
  if (computedBuf.length !== expectedBuf.length) return false
  return crypto.timingSafeEqual(computedBuf, expectedBuf)
}

/**
 * Hash report content (sections JSON) for signature binding.
 * @param {string} sectionsJson - JSON.stringify of report sections
 * @returns {string} SHA-256 hex digest
 */
export function hashReportContent(sectionsJson) {
  return crypto.createHash("sha256").update(sectionsJson).digest("hex")
}
