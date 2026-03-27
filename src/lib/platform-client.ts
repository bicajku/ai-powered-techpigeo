import { getEnvConfig } from "@/lib/env-config"
import { getSafeKVClient } from "@/lib/spark-shim"

type SparkLLMModel = string

interface BackendLlmRequest {
  prompt: string
  model?: string
  parseJson?: boolean
  providers?: string[]
  module?: string
}

interface BackendLlmResponse {
  text?: string
  raw?: unknown
}

export interface BackendProviderStatus {
  ok: boolean
  service: string
  version: string
  runtime?: {
    host: string
    port: number
    nodeVersion: string
  }
  defaultModel?: string
  fallbackOrder?: string[]
  providers?: {
    copilot?: { configured: boolean; authSource: string | null }
    groq?: { configured: boolean; authSource: string | null }
    gemini?: { configured: boolean; authSource: string | null }
  }
}

export interface PlatformLlmOptions {
  providers?: string[]
  module?: string
}

function getSparkGlobal(): {
  llmPrompt?: (strings: TemplateStringsArray, ...values: unknown[]) => unknown
  llm?: (prompt: unknown, model?: string, parseJson?: boolean) => Promise<unknown>
} | null {
  if (typeof window === "undefined") return null
  return (window as unknown as { spark?: { llmPrompt?: (strings: TemplateStringsArray, ...values: unknown[]) => unknown; llm?: (prompt: unknown, model?: string, parseJson?: boolean) => Promise<unknown> } }).spark || null
}

function buildPromptFromTemplate(strings: TemplateStringsArray, values: unknown[]): string {
  let output = ""
  for (let i = 0; i < strings.length; i++) {
    output += strings[i]
    if (i < values.length) {
      output += String(values[i] ?? "")
    }
  }
  return output
}

async function callBackendLlm(request: BackendLlmRequest): Promise<unknown> {
  const config = getEnvConfig()
  
  // Empty base URL means same-origin relative request
  const baseUrl = config.backendApiBaseUrl ? config.backendApiBaseUrl.replace(/\/$/, "") : ""

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  }
  
  // Prefer Sentinel JWT over legacy API key
  const sentinelToken = typeof window !== "undefined"
    ? (localStorage.getItem("sentinel-auth-token") || localStorage.getItem("sentinel_token"))
    : null
  if (sentinelToken) {
    headers["Authorization"] = `Bearer ${sentinelToken}`
  } else if (config.useBackendAuth && config.backendApiKey) {
    headers["x-backend-api-key"] = config.backendApiKey
  }

  // CSRF token from cookie
  if (typeof document !== "undefined") {
    const csrfMatch = document.cookie
      .split(";")
      .map((c) => c.trim())
      .find((c) => c.startsWith("__csrf="))
    if (csrfMatch) {
      headers["X-CSRF-Token"] = csrfMatch.slice("__csrf=".length)
    }
  }

  const response = await fetch(`${baseUrl}/api/llm/generate`, {
    method: "POST",
    headers,
    credentials: "include",
    body: JSON.stringify(request),
  })

  if (!response.ok) {
    const body = await response.text().catch(() => "")
    throw new Error(`Backend LLM error ${response.status}: ${body}`)
  }

  const data = (await response.json()) as BackendLlmResponse
  if (request.parseJson) {
    if (typeof data.raw !== "undefined") return data.raw
    if (typeof data.text === "string") {
      try {
        return JSON.parse(data.text)
      } catch {
        return data.text
      }
    }
    return null
  }

  if (typeof data.text === "string") return data.text
  if (typeof data.raw === "string") return data.raw
  return JSON.stringify(data.raw ?? data)
}

export function platformLlmPrompt(strings: TemplateStringsArray, ...values: unknown[]): unknown {
  const spark = getSparkGlobal()
  if (spark?.llmPrompt) {
    return spark.llmPrompt(strings, ...values)
  }
  return buildPromptFromTemplate(strings, values)
}

export async function platformLlm(
  prompt: unknown,
  model: SparkLLMModel = "gpt-4o",
  parseJson: boolean = false,
  options?: PlatformLlmOptions
): Promise<unknown> {
  const config = getEnvConfig()

  // Use backend when explicitly configured OR when providers/module are specified
  // (the pipeline forces backend mode for specific modules like rag_chat)
  if (config.useBackendLlm || options?.providers || options?.module) {
    const asText = typeof prompt === "string" ? prompt : JSON.stringify(prompt)
    return callBackendLlm({
      prompt: asText,
      model,
      parseJson,
      ...(options?.providers ? { providers: options.providers } : {}),
      ...(options?.module ? { module: options.module } : {}),
    } as BackendLlmRequest & { providers?: string[]; module?: string })
  }

  const spark = getSparkGlobal()
  if (!spark?.llm) {
    throw new Error("No LLM runtime available (Spark unavailable and backend LLM disabled)")
  }

  return spark.llm(prompt, model, parseJson)
}

export function getPlatformKV() {
  return getSafeKVClient()
}

export async function fetchBackendProviderStatus(): Promise<BackendProviderStatus> {
  const config = getEnvConfig()
  
  // Empty base URL means same-origin relative request
  const baseUrl = config.backendApiBaseUrl ? config.backendApiBaseUrl.replace(/\/$/, "") : ""

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  }
  
  // Prefer Sentinel JWT over legacy API key
  const sentinelToken = typeof window !== "undefined"
    ? (localStorage.getItem("sentinel-auth-token") || localStorage.getItem("sentinel_token"))
    : null
  if (sentinelToken) {
    headers["Authorization"] = `Bearer ${sentinelToken}`
  } else if (config.useBackendAuth && config.backendApiKey) {
    headers["x-backend-api-key"] = config.backendApiKey
  }

  const response = await fetch(`${baseUrl}/api/providers/status`, {
    method: "GET",
    headers,
  })

  if (!response.ok) {
    const body = await response.text().catch(() => "")
    throw new Error(`Backend status error ${response.status}: ${body}`)
  }

  return (await response.json()) as BackendProviderStatus
}
