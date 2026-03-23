/**
 * Encrypted secret storage with KV persistence.
 *
 * Uses AES-GCM for local encryption. Secrets are dual-written to both
 * localStorage (fast cache) and the Spark KV system (persists across
 * Codespaces URL changes via Neon DB write-through).
 *
 * On retrieval: localStorage → KV fallback → null.
 * On boot: call hydrateSecretsFromKV() to restore secrets after URL rotation.
 */

const SALT = "sentinel-secret-store-v1"
const KEY_LENGTH = 256
const IV_LENGTH = 12

/** Keys that are managed by this module and should be synced to KV. */
const MANAGED_SECRET_KEYS = [
  "sentinel-neon-db-url",
  "sentinel-gemini-api-key",
  "sentinel-copilot-token",
] as const

type KVClient = {
  get<T>(key: string): Promise<T | undefined>
  set<T>(key: string, value: T): Promise<void>
}

/**
 * Lazy KV accessor — reads window.spark.kv directly to avoid
 * circular dependency with spark-shim → kv-sync → neon-client → secret-store.
 */
function getKV(): KVClient | null {
  try {
    const spark = (window as unknown as { spark?: { kv?: KVClient } }).spark
    return spark?.kv ?? null
  } catch {
    return null
  }
}

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined"
}

async function deriveKey(): Promise<CryptoKey> {
  // Fixed project-scoped salt — no location.origin so the same key works
  // across different Codespaces URLs.
  const material = `${SALT}:${navigator.userAgent}:sentinel-ai-techpigeon`
  const raw = new TextEncoder().encode(material)
  const hash = await crypto.subtle.digest("SHA-256", raw)

  return crypto.subtle.importKey(
    "raw",
    hash,
    {
      name: "AES-GCM",
      length: KEY_LENGTH,
    },
    false,
    ["encrypt", "decrypt"]
  )
}

function toBase64(input: Uint8Array): string {
  let binary = ""
  for (let i = 0; i < input.length; i += 1) {
    binary += String.fromCharCode(input[i])
  }
  return btoa(binary)
}

function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

async function encryptSecret(plaintext: string): Promise<string> {
  const key = await deriveKey()
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH))
  const encoded = new TextEncoder().encode(plaintext)

  const ciphertext = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
    },
    key,
    encoded
  )

  return `${toBase64(iv)}:${toBase64(new Uint8Array(ciphertext))}`
}

async function decryptSecret(payload: string): Promise<string | null> {
  try {
    const [ivB64, ctB64] = payload.split(":")
    if (!ivB64 || !ctB64) return null

    const key = await deriveKey()
    const iv = fromBase64(ivB64)
    const ciphertext = fromBase64(ctB64)
    const ivSource = iv as unknown as BufferSource
    const ciphertextSource = ciphertext as unknown as BufferSource

    const plaintext = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: ivSource,
      },
      key,
      ciphertextSource
    )

    return new TextDecoder().decode(plaintext)
  } catch {
    return null
  }
}

/**
 * Store an encrypted secret in localStorage AND persist to KV (Neon-backed).
 */
export async function storeSecret(key: string, value: string): Promise<void> {
  if (!isBrowser()) return

  try {
    const encrypted = await encryptSecret(value)
    localStorage.setItem(key, encrypted)
  } catch {
    // Never store plaintext as fallback.
    console.warn("Failed to store encrypted secret")
  }

  // Write-through to KV so secret survives URL rotation
  try {
    const kv = getKV()
    if (kv) {
      const encrypted = await encryptSecret(value)
      await kv.set(`__secret:${key}`, encrypted)
    }
  } catch {
    // Non-blocking — KV may not be available yet
  }
}

/**
 * Retrieve and decrypt a secret.
 *
 * Checks localStorage first (fast), then falls back to KV (persistent).
 * If found in KV but missing locally, re-caches in localStorage.
 */
export async function retrieveSecret(key: string): Promise<string | null> {
  if (!isBrowser()) return null

  // Tier 1: localStorage (fast, origin-scoped)
  try {
    const raw = localStorage.getItem(key)
    if (raw) {
      if (raw.includes(":")) {
        const decrypted = await decryptSecret(raw)
        if (decrypted !== null) return decrypted
      }
      // Legacy plaintext value detected: migrate in-place.
      await storeSecret(key, raw)
      return raw
    }
  } catch {
    // Fall through to KV
  }

  // Tier 2: KV storage (persists across Codespaces URL changes)
  try {
    const kv = getKV()
    if (kv) {
      const kvRaw = await kv.get<string>(`__secret:${key}`)
      if (kvRaw && typeof kvRaw === "string" && kvRaw.includes(":")) {
        const decrypted = await decryptSecret(kvRaw)
        if (decrypted !== null) {
          // Re-cache in localStorage for fast access
          localStorage.setItem(key, kvRaw)
          return decrypted
        }
      }
    }
  } catch {
    // Non-blocking — KV may not be available
  }

  return null
}

/**
 * Check whether a secret exists in localStorage.
 * For a deeper check that includes KV, use hasSecretAsync().
 */
export function hasSecret(key: string): boolean {
  if (!isBrowser()) return false

  try {
    return !!localStorage.getItem(key)
  } catch {
    return false
  }
}

/**
 * Async check that also probes KV storage (survives URL rotation).
 */
export async function hasSecretAsync(key: string): Promise<boolean> {
  if (hasSecret(key)) return true

  try {
    const kv = getKV()
    if (!kv) return false
    const kvRaw = await kv.get<string>(`__secret:${key}`)
    return !!kvRaw
  } catch {
    return false
  }
}

/**
 * Return a masked representation for UI display.
 */
export function maskSecret(value: string | null): string {
  if (typeof value !== "string" || value.length === 0) return ""
  if (value.length <= 4) return "****"
  return "******" + value.slice(-4)
}

/**
 * Hydrate localStorage from KV on boot.
 *
 * Call this once during app initialisation. When Codespaces rotates URLs
 * the localStorage is wiped, but secrets survive in KV (backed by Neon).
 * This function restores them so hasSecret() and synchronous checks work.
 */
export async function hydrateSecretsFromKV(): Promise<number> {
  if (!isBrowser()) return 0

  let restored = 0

  try {
    const kv = getKV()
    if (!kv) return 0

    for (const key of MANAGED_SECRET_KEYS) {
      // Skip if already present locally
      if (localStorage.getItem(key)) continue

      try {
        const kvRaw = await kv.get<string>(`__secret:${key}`)
        if (kvRaw && typeof kvRaw === "string") {
          localStorage.setItem(key, kvRaw)
          restored++
        }
      } catch {
        // Individual key failure — continue with others
      }
    }
  } catch {
    // KV unavailable — nothing to hydrate
  }

  if (restored > 0) {
    console.info(`[secret-store] Restored ${restored} secret(s) from KV after URL change`)
  }

  return restored
}
