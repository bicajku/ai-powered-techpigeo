import {
  ExternalSourceCheckResult,
  ExternalSourceMatch,
  ExternalSourceProvider,
  ExternalSourceProviderCheck,
} from "@/types"
import { calculateTokenOverlapSimilarity, createDocumentFingerprint } from "@/lib/document-fingerprint"

interface ExternalSourceRequest {
  text: string
  fileName?: string | null
  fingerprintMatches?: ExternalSourceMatch[]
}

interface ExternalProviderConfig {
  provider: ExternalSourceProvider
  apiUrl?: string
  publicWebApiUrl?: string
  timeoutMs: number
  sendFullText: boolean
  enablePublicWeb: boolean
}

interface ProviderApiResponse {
  status?: ExternalSourceCheckResult["status"]
  summary?: string
  warnings?: string[]
  nextSteps?: string[]
  canPerformLiveCheck?: boolean
  canVerifyRetention?: boolean
  matches?: ExternalSourceCheckResult["matches"]
}

function getProviderConfig(): ExternalProviderConfig {
  const env = (import.meta as ImportMeta & { env?: Record<string, string> }).env || {}
  const provider = normalizeProvider(env.VITE_EXTERNAL_SOURCE_PROVIDER)
  const timeoutRaw = Number(env.VITE_EXTERNAL_SOURCE_TIMEOUT_MS)
  const publicWebFlag = env.VITE_ENABLE_PUBLIC_WEB_SIMILARITY

  return {
    provider,
    apiUrl: env.VITE_EXTERNAL_SOURCE_API_URL,
    publicWebApiUrl: env.VITE_PUBLIC_WEB_SEARCH_API_URL,
    timeoutMs: Number.isFinite(timeoutRaw) && timeoutRaw > 0 ? timeoutRaw : 15000,
    sendFullText: env.VITE_EXTERNAL_SOURCE_SEND_FULL_TEXT === "true",
    // Default ON so integrity checks include public evidence unless explicitly disabled.
    enablePublicWeb: publicWebFlag ? publicWebFlag === "true" : true,
  }
}

function normalizeProvider(value?: string): ExternalSourceProvider {
  if (value === "turnitin" || value === "ithenticate" || value === "custom") {
    return value
  }

  return "none"
}

function buildProviderCheck(input: ExternalSourceProviderCheck): ExternalSourceProviderCheck {
  return input.matches.length > 0
    ? { ...input, matches: input.matches.map((match) => ({ ...match, provider: match.provider || input.provider })) }
    : input
}

function buildErrorCheck(provider: ExternalSourceProvider, message: string): ExternalSourceProviderCheck {
  return {
    provider,
    status: "error",
    canPerformLiveCheck: false,
    canVerifyRetention: false,
    summary: "External repository verification could not be completed.",
    warnings: [message],
    nextSteps: [
      "Check the configured API URL and backend availability.",
      "Confirm the backend returns the normalized external check response shape.",
    ],
    matches: [],
  }
}

function normalizeApiResponse(
  provider: ExternalSourceProvider,
  payload: ProviderApiResponse | undefined
): ExternalSourceProviderCheck {
  return {
    provider,
    status: payload?.status || "completed",
    canPerformLiveCheck: payload?.canPerformLiveCheck ?? true,
    canVerifyRetention: payload?.canVerifyRetention ?? false,
    summary: payload?.summary || "External repository check completed.",
    warnings: payload?.warnings || [],
    nextSteps: payload?.nextSteps || [],
    matches: (payload?.matches || []).map((match) => ({ ...match, provider: match.provider || provider })),
  }
}

function buildFingerprintRegistryCheck(matches: ExternalSourceMatch[]): ExternalSourceProviderCheck {
  if (matches.length === 0) {
    return buildProviderCheck({
      provider: "fingerprint-registry",
      status: "completed",
      canPerformLiveCheck: true,
      canVerifyRetention: true,
      summary: "No exact re-upload was found in the internal fingerprint registry.",
      warnings: [],
      nextSteps: ["Reviewed documents will be added to the registry after a successful check."],
      matches: [],
    })
  }

  return buildProviderCheck({
    provider: "fingerprint-registry",
    status: "completed",
    canPerformLiveCheck: true,
    canVerifyRetention: true,
    summary: `Exact re-upload detected against ${matches.length} previously reviewed document${matches.length === 1 ? "" : "s"}.`,
    warnings: [],
    nextSteps: ["Review prior submissions before exporting or resubmitting this document."],
    matches,
  })
}

async function performPrivateProviderCheck(
  request: ExternalSourceRequest,
  config: ExternalProviderConfig
): Promise<ExternalSourceProviderCheck | null> {
  if (config.provider === "none" || !config.apiUrl) {
    return null
  }

  const controller = new AbortController()
  const timeoutId = window.setTimeout(() => controller.abort(), config.timeoutMs)

  try {
    const fingerprint = await createDocumentFingerprint(request.text)
    const preview = request.text.slice(0, 1200)

    const response = await fetch(config.apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        provider: config.provider,
        fileName: request.fileName || null,
        fingerprint,
        preview,
        characterCount: request.text.length,
        requestedCapabilities: ["exact-reupload-detection", "private-repository-lookup", "retention-status"],
        text: config.sendFullText ? request.text : undefined,
      }),
    })

    if (!response.ok) {
      return buildErrorCheck(config.provider, `External API returned HTTP ${response.status}.`)
    }

    const payload = (await response.json()) as ProviderApiResponse
    return normalizeApiResponse(config.provider, payload)
  } catch (error) {
    const message = error instanceof Error
      ? error.name === "AbortError"
        ? "External repository verification timed out."
        : error.message
      : "Unknown external repository verification error."

    return buildErrorCheck(config.provider, message)
  } finally {
    window.clearTimeout(timeoutId)
  }
}

async function performPublicWebCheck(
  request: ExternalSourceRequest,
  config: ExternalProviderConfig
): Promise<ExternalSourceProviderCheck | null> {
  if (!config.enablePublicWeb) {
    return null
  }

  const queries = buildRepresentativeQueries(request.text)
  if (queries.length === 0) {
    return buildProviderCheck({
      provider: "public-web",
      status: "unsupported",
      canPerformLiveCheck: true,
      canVerifyRetention: false,
      summary: "Public-web similarity search was skipped because the document does not contain enough representative prose.",
      warnings: ["Very short or highly structured text is not suitable for public-web snippet matching."],
      nextSteps: ["Try again with a longer excerpt or upload a full prose document."],
      matches: [],
    })
  }

  try {
    const matches = config.publicWebApiUrl
      ? await performCustomPublicWebCheck(config.publicWebApiUrl, queries, config.timeoutMs)
      : await performBuiltinPublicWebCheck(queries, config.timeoutMs)

    return buildProviderCheck({
      provider: "public-web",
      status: "completed",
      canPerformLiveCheck: true,
      canVerifyRetention: false,
      summary: matches.length > 0
        ? `Public-web similarity search found ${matches.length} possible metadata match${matches.length === 1 ? "" : "es"}.`
        : "Public-web similarity search did not find strong metadata matches.",
      warnings: ["Public-web search only covers open web and public metadata sources, not private plagiarism repositories."],
      nextSteps: matches.length > 0
        ? ["Inspect the public-web matches to see whether the document overlaps with public publications."]
        : ["If you need private corpus verification, connect a licensed Turnitin or iThenticate backend."],
      matches,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Public-web similarity search failed."
    return buildErrorCheck("public-web", message)
  }
}

async function performCustomPublicWebCheck(
  apiUrl: string,
  queries: string[],
  timeoutMs: number
): Promise<ExternalSourceMatch[]> {
  const controller = new AbortController()
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({ queries }),
    })

    if (!response.ok) {
      throw new Error(`Public-web API returned HTTP ${response.status}.`)
    }

    const payload = (await response.json()) as ProviderApiResponse
    return (payload.matches || []).map((match) => ({ ...match, provider: match.provider || "public-web" }))
  } finally {
    window.clearTimeout(timeoutId)
  }
}

async function performBuiltinPublicWebCheck(queries: string[], timeoutMs: number): Promise<ExternalSourceMatch[]> {
  const tasks = queries.flatMap((query) => [
    searchWikipedia(query, timeoutMs),
    searchCrossref(query, timeoutMs),
    searchSemanticScholar(query, timeoutMs),
    searchOpenAlex(query, timeoutMs),
  ])

  const results = await Promise.allSettled(tasks)
  const successful = results
    .filter((result): result is PromiseFulfilledResult<ExternalSourceMatch[]> => result.status === "fulfilled")
    .map((result) => result.value)

  return dedupeMatches(successful.flat()).slice(0, 12)
}

async function searchWikipedia(query: string, timeoutMs: number): Promise<ExternalSourceMatch[]> {
  const controller = new AbortController()
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs)

  try {
    const url = new URL("https://en.wikipedia.org/w/api.php")
    url.searchParams.set("action", "opensearch")
    url.searchParams.set("search", query)
    url.searchParams.set("limit", "5")
    url.searchParams.set("namespace", "0")
    url.searchParams.set("format", "json")
    url.searchParams.set("origin", "*")

    const response = await fetch(url.toString(), { signal: controller.signal })
    if (!response.ok) {
      return []
    }

    const payload = (await response.json()) as [string, string[], string[], string[]]
    const titles = payload[1] || []
    const descriptions = payload[2] || []
    const links = payload[3] || []

    return titles
      .map((title, index) => {
        const descriptor = `${title} ${descriptions[index] || ""}`
        const similarity = calculateTokenOverlapSimilarity(query, descriptor)
        return {
          source: links[index] || title,
          similarity,
          matchType: "metadata" as const,
          repository: "Wikipedia",
          provider: "public-web" as const,
          retentionState: "unknown" as const,
        }
      })
      .filter((match) => match.similarity >= 20)
  } finally {
    window.clearTimeout(timeoutId)
  }
}

async function searchCrossref(query: string, timeoutMs: number): Promise<ExternalSourceMatch[]> {
  const controller = new AbortController()
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs)

  try {
    const url = new URL("https://api.crossref.org/works")
    url.searchParams.set("rows", "5")
    url.searchParams.set("query.bibliographic", query)

    const response = await fetch(url.toString(), {
      headers: {
        Accept: "application/json",
      },
      signal: controller.signal,
    })

    if (!response.ok) {
      return []
    }

    const payload = (await response.json()) as {
      message?: {
        items?: Array<{
          title?: string[]
          DOI?: string
          URL?: string
          published?: { "date-parts"?: number[][] }
          "container-title"?: string[]
        }>
      }
    }

    return (payload.message?.items || [])
      .map((item) => {
        const title = item.title?.[0] || item.DOI || item.URL || "Crossref result"
        const container = item["container-title"]?.[0] || "Crossref"
        const similarity = calculateTokenOverlapSimilarity(query, `${title} ${container}`)
        const year = item.published?.["date-parts"]?.[0]?.[0]
        return {
          source: item.URL || item.DOI || title,
          similarity,
          matchType: "metadata" as const,
          repository: year ? `${container} (${year})` : container,
          provider: "public-web" as const,
          retentionState: "unknown" as const,
        }
      })
      .filter((match) => match.similarity >= 20)
  } finally {
    window.clearTimeout(timeoutId)
  }
}

async function searchSemanticScholar(query: string, timeoutMs: number): Promise<ExternalSourceMatch[]> {
  const controller = new AbortController()
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs)

  try {
    const url = new URL("https://api.semanticscholar.org/graph/v1/paper/search")
    url.searchParams.set("query", query)
    url.searchParams.set("limit", "5")
    url.searchParams.set("fields", "title,url,venue,year")

    const response = await fetch(url.toString(), {
      headers: {
        Accept: "application/json",
      },
      signal: controller.signal,
    })

    if (!response.ok) {
      return []
    }

    const payload = (await response.json()) as {
      data?: Array<{
        title?: string
        url?: string
        venue?: string
        year?: number
      }>
    }

    return (payload.data || [])
      .map((item) => {
        const title = item.title || "Semantic Scholar result"
        const repository = item.year ? `Semantic Scholar (${item.year})` : "Semantic Scholar"
        const descriptor = `${title} ${item.venue || ""}`
        return {
          source: item.url || title,
          similarity: calculateTokenOverlapSimilarity(query, descriptor),
          matchType: "metadata" as const,
          repository,
          provider: "public-web" as const,
          retentionState: "unknown" as const,
        }
      })
      .filter((match) => match.similarity >= 18)
  } finally {
    window.clearTimeout(timeoutId)
  }
}

async function searchOpenAlex(query: string, timeoutMs: number): Promise<ExternalSourceMatch[]> {
  const controller = new AbortController()
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs)

  try {
    const url = new URL("https://api.openalex.org/works")
    url.searchParams.set("search", query)
    url.searchParams.set("per-page", "5")

    const response = await fetch(url.toString(), {
      headers: {
        Accept: "application/json",
      },
      signal: controller.signal,
    })

    if (!response.ok) {
      return []
    }

    const payload = (await response.json()) as {
      results?: Array<{
        title?: string
        id?: string
        publication_year?: number
        host_venue?: {
          display_name?: string
        }
      }>
    }

    return (payload.results || [])
      .map((item) => {
        const title = item.title || "OpenAlex result"
        const venue = item.host_venue?.display_name || "OpenAlex"
        const repository = item.publication_year ? `${venue} (${item.publication_year})` : venue
        return {
          source: item.id || title,
          similarity: calculateTokenOverlapSimilarity(query, `${title} ${venue}`),
          matchType: "metadata" as const,
          repository,
          provider: "public-web" as const,
          retentionState: "unknown" as const,
        }
      })
      .filter((match) => match.similarity >= 18)
  } finally {
    window.clearTimeout(timeoutId)
  }
}

function buildRepresentativeQueries(text: string): string[] {
  const sentenceQueries = text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 60 && sentence.length <= 280)
    .sort((left, right) => scoreSentence(right) - scoreSentence(left))
    .slice(0, 3)

  const titleLikeQuery = text
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .slice(0, 16)
    .join(" ")

  return Array.from(new Set([titleLikeQuery, ...sentenceQueries].filter((item) => item.length >= 40))).slice(0, 4)
}

function scoreSentence(sentence: string): number {
  const words = sentence.split(/\s+/)
  const uniqueWords = new Set(words.map((word) => word.toLowerCase()))
  return uniqueWords.size + Math.min(words.length, 30)
}

function dedupeMatches(matches: ExternalSourceMatch[]): ExternalSourceMatch[] {
  const seen = new Set<string>()

  return matches
    .sort((left, right) => right.similarity - left.similarity)
    .filter((match) => {
      const key = `${match.provider}:${match.source}`
      if (seen.has(key)) {
        return false
      }
      seen.add(key)
      return true
    })
}

function combineProviderChecks(checks: ExternalSourceProviderCheck[]): ExternalSourceCheckResult {
  const activeChecks = checks.filter(Boolean)
  const matches = dedupeMatches(activeChecks.flatMap((check) => check.matches))
  const warnings = Array.from(new Set(activeChecks.flatMap((check) => check.warnings)))
  const nextSteps = Array.from(new Set(activeChecks.flatMap((check) => check.nextSteps)))
  const status = activeChecks.some((check) => check.status === "completed")
    ? "completed"
    : activeChecks.some((check) => check.status === "error")
      ? "error"
      : activeChecks.some((check) => check.status === "unsupported")
        ? "unsupported"
        : "not-configured"

  return {
    provider: activeChecks.length > 1 ? "composite" : activeChecks[0]?.provider || "none",
    status,
    canPerformLiveCheck: activeChecks.some((check) => check.canPerformLiveCheck),
    canVerifyRetention: activeChecks.some((check) => check.canVerifyRetention),
    checkedAt: Date.now(),
    summary: buildSummary(activeChecks, matches.length),
    warnings,
    nextSteps,
    matches,
    providerChecks: activeChecks,
  }
}

function buildSummary(checks: ExternalSourceProviderCheck[], matchCount: number): string {
  if (checks.length === 0) {
    return "No external verification path is configured."
  }

  if (matchCount > 0) {
    return `External verification completed across ${checks.length} source ${checks.length === 1 ? "path" : "paths"} and found ${matchCount} match${matchCount === 1 ? "" : "es"}.`
  }

  return `External verification completed across ${checks.length} source ${checks.length === 1 ? "path" : "paths"} with no strong matches.`
}

export async function performExternalSourceCheck(
  request: ExternalSourceRequest
): Promise<ExternalSourceCheckResult> {
  const config = getProviderConfig()
  const checks: ExternalSourceProviderCheck[] = []

  checks.push(buildFingerprintRegistryCheck(request.fingerprintMatches || []))

  const publicWebCheck = await performPublicWebCheck(request, config)
  if (publicWebCheck) {
    checks.push(publicWebCheck)
  }

  const privateProviderCheck = await performPrivateProviderCheck(request, config)
  if (privateProviderCheck) {
    checks.push(privateProviderCheck)
  }

  if (checks.length === 1 && config.provider === "none" && !config.enablePublicWeb) {
    checks.push(buildProviderCheck({
      provider: "none",
      status: "not-configured",
      canPerformLiveCheck: false,
      canVerifyRetention: false,
      summary: "No public-web or private-provider integration is configured. Only the internal fingerprint registry was checked.",
      warnings: ["Private repositories such as Turnitin and iThenticate require a licensed backend integration."],
      nextSteps: [
        "Enable VITE_ENABLE_PUBLIC_WEB_SIMILARITY for public web lookups (Wikipedia, Crossref, Semantic Scholar, OpenAlex).",
        "Configure VITE_EXTERNAL_SOURCE_PROVIDER and VITE_EXTERNAL_SOURCE_API_URL when your private-provider backend is ready.",
      ],
      matches: [],
    }))
  }

  return combineProviderChecks(checks)
}

export function getExternalSourceIntegrationSummary(): {
  configured: boolean
  provider: ExternalSourceProvider
  apiUrl?: string
  publicWebEnabled: boolean
} {
  const config = getProviderConfig()

  return {
    configured: (Boolean(config.apiUrl) && config.provider !== "none") || config.enablePublicWeb,
    provider: config.provider,
    apiUrl: config.apiUrl,
    publicWebEnabled: config.enablePublicWeb,
  }
}