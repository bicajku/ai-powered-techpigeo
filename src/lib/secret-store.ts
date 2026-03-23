/**
 * Encrypted secret storage — prevents raw API keys from appearing
 * in localStorage (DevTools → Application) or DOM inspection.
 *
 * Uses AES-GCM with a device-derived key so secrets are only
 * readable by the same browser session. An attacker with F12
 * access will see ciphertext, not cleartext.
 */

const SALT = "sentinel-vault-v1"

async function deriveKey(): Promise<CryptoKey> {
  // Derive a stable key from the browser fingerprint + salt.
  // This is NOT a password — it simply makes localStorage opaque.
  const raw = new TextEncoder().encode(
    `${SALT}:${navigator.userAgent}:${location.origin}`
  )
  const hash = await crypto.subtle.digest("SHA-256", raw)
  return crypto.subtle.importKey("raw", hash, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ])
}

function toBase64(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
}

function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

export async function encryptSecret(plaintext: string): Promise<string> {
  const key = await deriveKey()
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encoded = new TextEncoder().encode(plaintext)
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoded
  )
  // Store as "iv:ciphertext" both base64
  return `${toBase64(iv.buffer)}:${toBase64(ciphertext)}`
}

export async function decryptSecret(stored: string): Promise<string | null> {
  try {
    const [ivB64, ctB64] = stored.split(":")
    if (!ivB64 || !ctB64) return null
    const key = await deriveKey()
    const iv = fromBase64(ivB64)
    const ciphertext = fromBase64(ctB64)
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv as BufferSource },
      key,
      ciphertext as BufferSource
    )
    return new TextDecoder().decode(plaintext)
  } catch {
    return null
  }
}

/**
 * Store an encrypted secret in localStorage.
 */
export async function storeSecret(key: string, value: string): Promise<void> {
  try {
    const encrypted = await encryptSecret(value)
    localStorage.setItem(key, encrypted)
  } catch {
    // Fallback: do nothing rather than store plaintext
    console.warn("Failed to store encrypted secret")
  }
}

/**
 * Retrieve and decrypt a secret from localStorage.
 */
export async function retrieveSecret(key: string): Promise<string | null> {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    // Check if it looks like our encrypted format (contains ':' and no plaintext patterns)
    if (raw.includes(":") && !raw.startsWith("postgresql://") && !raw.startsWith("AIza") && !raw.startsWith("ghp_") && !raw.startsWith("ghu_")) {
      return await decryptSecret(raw)
    }
    // Legacy plaintext value — migrate it
    await storeSecret(key, raw)
    return raw
  } catch {
    return null
  }
}

/**
 * Check if a secret is configured (exists in storage)
 * without exposing the value.
 */
export function hasSecret(key: string): boolean {
  try {
    return !!localStorage.getItem(key)
  } catch {
    return false
  }
}

/**
 * Return a masked version of a secret for display: "••••••abcd"
 */
export function maskSecret(value: string | null): string {
  if (!value) return ""
  if (value.length <= 4) return "••••"
  return "••••••" + value.slice(-4)
}
