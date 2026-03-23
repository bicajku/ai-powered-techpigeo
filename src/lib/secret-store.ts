/**
 * Encrypted secret storage to avoid exposing raw keys in localStorage.
 *
 * Uses AES-GCM and a browser-derived key so values are stored as ciphertext.
 */

const SALT = "sentinel-secret-store-v1"
const KEY_LENGTH = 256
const IV_LENGTH = 12

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined"
}

async function deriveKey(): Promise<CryptoKey> {
  const material = `${SALT}:${navigator.userAgent}:${location.origin}`
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
 * Store an encrypted secret in localStorage.
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
}

/**
 * Retrieve and decrypt a secret from localStorage.
 *
 * Legacy plaintext values are auto-migrated to encrypted storage.
 */
export async function retrieveSecret(key: string): Promise<string | null> {
  if (!isBrowser()) return null

  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null

    // Expected encrypted format: iv:ciphertext
    if (raw.includes(":")) {
      const decrypted = await decryptSecret(raw)
      if (decrypted !== null) return decrypted
    }

    // Legacy plaintext value detected: migrate in-place.
    await storeSecret(key, raw)
    return raw
  } catch {
    return null
  }
}

/**
 * Check whether a secret exists in storage.
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
 * Return a masked representation for UI display.
 */
export function maskSecret(value: string | null): string {
  if (typeof value !== "string" || value.length === 0) return ""
  if (value.length <= 4) return "****"
  return "******" + value.slice(-4)
}
