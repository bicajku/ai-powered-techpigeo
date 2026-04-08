import { geminiGenerate, geminiEmbed, isGeminiConfigured } from "./gemini-client"
import { copilotGenerate, isCopilotConfigured } from "./copilot-client"
import {
  searchBrain,
  getCachedGeneration,
  cacheGeneration,
  logQuery,
  appendChatMessage,
  storeRetrievalTrace,
  autoTitleThreadFromFirstMessage,
} from "./sentinel-brain"
import { isNeonConfigured } from "./neon-client"
import { getEnvConfig } from "./env-config"
import { platformLlm } from "./platform-client"
import { searchWeb } from "./web-search-client"
import { fetchProviderRouting, type ProviderRoutingConfig } from "./provider-routing"

export type QueryProvider = "gemini" | "copilot" | "spark" | "backend" | "brain" | "cache"

const DEFAULT_ROUTING: ProviderRoutingConfig = {
  moduleName: "global",
  providerOrder: ["copilot", "spark", "groq", "gemini", "sentinel"],
  webProviderOrder: ["searchcans", "serpapi", "duckduckgo", "sentinel"],
  enabledProviders: { copilot: true, groq: true, spark: true, gemini: true, sentinel: true },
  enabledWebProviders: { searchcans: true, serpapi: true, duckduckgo: true, sentinel: true },
  dailyBudgetUsd: 25,
  monthlyBudgetUsd: 300,
  providerDailyCaps: {},
  timeoutMs: 30000,
}

let routingCache: { key: string; config: ProviderRoutingConfig; ts: number } | null = null

async function getRoutingForModule(moduleName?: string): Promise<ProviderRoutingConfig> {
  const key = moduleName || "global"
  const now = Date.now()
  if (routingCache && routingCache.key === key && now - routingCache.ts < 45000) {
    return routingCache.config
  }

  try {
    const configs = await fetchProviderRouting(key)
    const selected = configs[0] || { ...DEFAULT_ROUTING, moduleName: key }
    routingCache = { key, config: selected, ts: now }
    return selected
  } catch {
    return { ...DEFAULT_ROUTING, moduleName: key }
  }
}

export interface PipelineResult {
  response: string
  providers: QueryProvider[]
  brainHits: number
  brainContext: string[]
  cached: boolean
  model?: string
  status?: "ok" | "needs_clarification"
  clarificationQuestions?: string[]
  qualityScore?: number
  threadId?: number
  userMessageId?: number
  assistantMessageId?: number
  retrievalTraceId?: number
  postProcess?: {
    enabled: boolean
    contentType: "strategy" | "chat" | "email-template" | "ngo-report" | "general"
    profile: "strict" | "balanced" | "creative"
    preserveFactsStrictly: boolean
    matchMyVoice: boolean
    changed: boolean
    aiSignalBefore: number
    aiSignalAfter: number
  }
}

export async function sentinelQuery(
  queryText: string,
  options?: {
    module?: string
    userId?: string | number
    sector?: string
    skipCache?: boolean
    preferCopilot?: boolean
    useConsensus?: boolean // Enables multi-model generation and synthesis
    sparkFallback?: () => Promise<string>
    userInputForQualityGate?: string
    enableQualityGate?: boolean
    qualityGateProfile?: "strict" | "balanced" | "lenient"
    threadId?: number
    persistConversation?: boolean
    webSearch?: boolean
    userMessageMetadata?: Record<string, unknown>
    humanizeOnOutput?: boolean
    preserveFactsStrictly?: boolean
    matchMyVoice?: boolean
    voiceSample?: string
    postProcessProfile?: "strict" | "balanced" | "creative"
    contentType?: "strategy" | "chat" | "email-template" | "ngo-report" | "general"
  }
): Promise<PipelineResult> {
  const providers: QueryProvider[] = []
  const providerErrors: string[] = []
  let brainHits = 0
  const brainContext: string[] = []
  const selectedChunksForTrace: Record<string, unknown>[] = []
  let totalCandidates = 0
  let avgSimilarity: number | undefined
  let retrievalLatencyMs: number | undefined
  let webSearchContextStr = ""
  const neonReady = isNeonConfigured()
  const geminiReadyRaw = isGeminiConfigured()
  const copilotReadyRaw = isCopilotConfigured()
  const envConfig = getEnvConfig()
  const moduleName = options?.module || "global"
  const backendMode =
    envConfig.useBackendLlm ||
    Boolean(envConfig.backendApiBaseUrl) ||
    moduleName === "rag_chat" ||
    moduleName === "ngo_module" ||
    moduleName === "humanizer"
  const geminiReady = geminiReadyRaw
  const copilotReady = copilotReadyRaw
  const threadId = options?.threadId
  const shouldPersistConversation =
    neonReady && Boolean(threadId) && (options?.persistConversation ?? true)
  const routing = await getRoutingForModule(moduleName)
  const enabled = routing.enabledProviders || DEFAULT_ROUTING.enabledProviders
  const providerOrder = Array.isArray(routing.providerOrder) && routing.providerOrder.length > 0
    ? routing.providerOrder
    : DEFAULT_ROUTING.providerOrder
  const useCopilotByPolicy = providerOrder.includes("copilot") && enabled.copilot !== false
  const useSparkByPolicy = providerOrder.includes("spark") && enabled.spark !== false
  const useGeminiByPolicy = providerOrder.includes("gemini") && enabled.gemini !== false
  const orderedProviders = providerOrder.filter((name) => {
    if (name === "copilot") return copilotReady && useCopilotByPolicy
    if (name === "spark") return Boolean(options?.sparkFallback) && useSparkByPolicy
    if (name === "gemini") return geminiReady && useGeminiByPolicy
    return false
  })
  let userMessageId: number | undefined

  const ensureUserMessage = async (): Promise<number | undefined> => {
    if (!shouldPersistConversation || !threadId) return undefined
    if (userMessageId) return userMessageId

    try {
      const userMsg = await appendChatMessage({
        thread_id: threadId,
        role: "user",
        content: queryText,
        metadata: {
          module: options?.module ?? null,
          ...(options?.userMessageMetadata ?? {}),
        },
      })
      userMessageId = userMsg.id
      return userMessageId
    } catch {
      return undefined
    }
  }

  const finalizeResult = async (
    result: Omit<PipelineResult, "threadId" | "userMessageId" | "assistantMessageId" | "retrievalTraceId">,
    generationLatency?: number
  ): Promise<PipelineResult> => {
    const postProcess = applyUniversalPostProcessor(result.response, {
      moduleName,
      contentType: options?.contentType,
      humanizeOnOutput: options?.humanizeOnOutput,
      preserveFactsStrictly: options?.preserveFactsStrictly,
      matchMyVoice: options?.matchMyVoice,
      voiceSample: options?.voiceSample,
      postProcessProfile: options?.postProcessProfile,
      // Do not mutate clarification messages.
      bypass: result.status === "needs_clarification",
    })

    const base: PipelineResult = {
      ...result,
      response: postProcess.output,
      postProcess: postProcess.meta,
      threadId,
    }

    if (!shouldPersistConversation || !threadId) return base

    let assistantMessageId: number | undefined
    let retrievalTraceId: number | undefined

    try {
      const ensuredUserId = await ensureUserMessage()
      if (ensuredUserId) {
        base.userMessageId = ensuredUserId
        await autoTitleThreadFromFirstMessage(threadId, queryText)
      }

      const assistantMsg = await appendChatMessage({
        thread_id: threadId,
        role: "assistant",
        content: base.response,
        provider: result.providers[result.providers.length - 1],
        model_used: result.model,
        providers_used: result.providers,
        brain_hits: result.brainHits,
        metadata: {
          cached: result.cached,
          status: result.status ?? "ok",
          qualityScore: result.qualityScore ?? null,
          clarificationQuestions: result.clarificationQuestions ?? [],
          module: options?.module ?? null,
          postProcess: postProcess.meta,
        },
      })
      assistantMessageId = assistantMsg.id

      const trace = await storeRetrievalTrace({
        thread_id: threadId,
        message_id: assistantMessageId,
        query_text: queryText,
        module: options?.module,
        provider: result.providers[result.providers.length - 1],
        model_used: result.model,
        selected_chunks: selectedChunksForTrace,
        total_candidates: totalCandidates,
        avg_similarity: avgSimilarity,
        retrieval_latency_ms: retrievalLatencyMs,
        generation_latency_ms: generationLatency,
      })
      retrievalTraceId = trace.id
    } catch {
      // Conversation persistence and trace storage are best-effort.
    }

    return {
      ...base,
      userMessageId: base.userMessageId,
      assistantMessageId,
      retrievalTraceId,
    }
  }

  // Step 0: Input quality gate (default enabled for NGO module)
  const shouldRunQualityGate =
    options?.enableQualityGate ?? options?.module === "ngo_module"
  if (shouldRunQualityGate) {
    const candidateInput = options?.userInputForQualityGate?.trim() || queryText.trim()
    const quality = validatePromptQuality(candidateInput, options?.qualityGateProfile ?? "balanced")
    if (!quality.accepted) {
      return finalizeResult({
        response: quality.message,
        providers: [],
        brainHits: 0,
        brainContext: [],
        cached: false,
        model: undefined,
        status: "needs_clarification",
        clarificationQuestions: quality.questions,
        qualityScore: quality.score,
      })
    }
  }

  // Step 1: Check generation cache
  if (neonReady && !options?.skipCache) {
    try {
      const cached = await getCachedGeneration(queryText)
      if (cached) {
        const cacheStart = Date.now()
        providers.push("cache")
        const responseText =
          typeof cached.response_json === "string"
            ? cached.response_json
            : JSON.stringify(cached.response_json)

        void safeLogQuery(queryText, cached.response_json, ["cache"], 0, options)
        return finalizeResult({
          response: responseText,
          providers,
          brainHits: 0,
          brainContext: [],
          cached: true,
          model: cached.model_used ?? undefined,
          status: "ok",
        }, Date.now() - cacheStart)
      }
    } catch (err) {
      console.warn("Cache lookup failed:", err)
    }
  }

  // Step 2: Search Sentinel Brain for relevant knowledge
  let brainContextStr = ""
  const shouldUseGeminiRetrieval =
    geminiReady &&
    useGeminiByPolicy &&
    orderedProviders.includes("gemini") &&
    orderedProviders.indexOf("gemini") <= 1

  if (neonReady && shouldUseGeminiRetrieval) {
    const retrievalStart = Date.now()
    try {
      const queryEmbedding = await geminiEmbed(queryText)
      const brainResults = await searchBrain(queryEmbedding, 5, options?.sector)
      totalCandidates = brainResults.length
      const relevant = brainResults.filter((r) => r.similarity > 0.65)

      if (relevant.length > 0) {
        providers.push("brain")
        brainHits = relevant.length
        avgSimilarity = Number(
          (relevant.reduce((sum, r) => sum + r.similarity, 0) / relevant.length).toFixed(4)
        )
        for (const entry of relevant) {
          brainContext.push(entry.content)
          selectedChunksForTrace.push({
            id: entry.id,
            similarity: entry.similarity,
            sector: entry.sector,
            document_id: entry.document_id,
            chunk_index: entry.chunk_index,
            preview: entry.content.slice(0, 300),
          })
        }
        brainContextStr = brainContext
          .map((c, i) => `[Knowledge ${i + 1}]: ${c}`)
          .join("\n\n")
      }
    } catch (err) {
      console.warn("Brain search failed:", err)
    } finally {
      retrievalLatencyMs = Date.now() - retrievalStart
    }
  }

  // Step 2b: Optional web search context (for RAG / NGO workflows)
  const shouldUseWebSearch =
    options?.webSearch ?? (options?.module === "rag_chat" || options?.module === "ngo_module")
  if (shouldUseWebSearch) {
    try {
      const web = await searchWeb(queryText, 4)
      if (Array.isArray(web.results) && web.results.length > 0) {
        const webLines = web.results
          .slice(0, 4)
          .map((item, idx) =>
            `[Web ${idx + 1}] ${item.title}\nURL: ${item.url}\nSnippet: ${item.snippet}`
          )
          .join("\n\n")
        webSearchContextStr = `--- WEB SEARCH (${web.provider}) ---\n${webLines}\n--- END WEB SEARCH ---`
      }
    } catch (err) {
      console.warn("Web search context failed:", err)
    }
  }

  // Step 3: Generate
  if (backendMode) {
    try {
      const generationStart = Date.now()
      const contextBlocks = [brainContextStr, webSearchContextStr].filter(Boolean).join("\n\n")
      const backendPrompt = contextBlocks
        ? `Use the following context to inform your response. If any context is not relevant, ignore it and continue with best effort reasoning.\n\n${contextBlocks}\n\nUser query: ${queryText}`
        : queryText

      const backendProviders = providerOrder.filter((name) => name !== "spark" && name !== "sentinel")
      const raw = await platformLlm(backendPrompt, "gpt-4o", false, {
        providers: backendProviders,
        module: moduleName,
      })
      const response = typeof raw === "string" ? raw : JSON.stringify(raw)
      if (!response || response.trim().length === 0) {
        throw new Error("Backend LLM returned empty response")
      }
      providers.push("backend")

      if (neonReady) {
        void safeCacheAndLog(queryText, response, providers, brainHits, { ...options, model: "backend-llm" })
      }

      return finalizeResult({
        response,
        providers,
        brainHits,
        brainContext,
        cached: false,
        model: "backend-llm",
        status: "ok",
      }, Date.now() - generationStart)
    } catch (err) {
      console.warn("Backend LLM generation failed:", err)
      providerErrors.push(`backend: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  
  if (options?.useConsensus) {
    const consensusProviders = orderedProviders
      .filter((name): name is "copilot" | "spark" | "gemini" =>
        name === "copilot" || name === "spark" || name === "gemini"
      )
      .slice(0, 2)

    if (consensusProviders.length > 0) {
      try {
        const generationStart = Date.now()
        const contextBlocks = [brainContextStr, webSearchContextStr].filter(Boolean).join("\n\n")
        const augmentedPrompt = contextBlocks
          ? `Use the following context to inform your response. If any context is not relevant, ignore it and continue with best effort reasoning.\n\n${contextBlocks}\n\nUser query: ${queryText}`
          : queryText

        // Run top-priority models in parallel (favoring Copilot/Spark before Gemini).
        const generationPromises: Promise<{ provider: string, text: string }>[] = []

        for (const providerName of consensusProviders) {
          if (providerName === "copilot") {
            generationPromises.push(
              copilotGenerate(augmentedPrompt).then(text => ({ provider: "copilot", text })).catch(() => ({ provider: "copilot", text: "" }))
            )
          }

          if (providerName === "spark" && options?.sparkFallback) {
            generationPromises.push(
              options.sparkFallback().then(text => ({ provider: "spark", text })).catch(() => ({ provider: "spark", text: "" }))
            )
          }

          if (providerName === "gemini") {
            generationPromises.push(
              geminiGenerate(augmentedPrompt).then(text => ({ provider: "gemini", text })).catch(() => ({ provider: "gemini", text: "" }))
            )
          }
        }

        const results = await Promise.all(generationPromises)
        const validResults = results.filter(r => r.text.length > 0)
        
        if (validResults.length > 0) {
          validResults.forEach(r => providers.push(r.provider as QueryProvider))
          providers.push("brain" as QueryProvider) // "brain" synthesizer acts as the final judge
          
          let synthesizedResponse = validResults[0].text // Fallback if synthesis fails
          
          // Synthesize using provider policy order; prefer Copilot/Spark before Gemini.
          if (validResults.length > 1) {
            const synthesisPrompt = `You are the Sentinel Brain Synthesizer. You have received answers from multiple AI models regarding a user's query. Your job is to analyze these responses, extract the best ideas from all of them, resolve any conflicts, and create a single, highly-optimized, natural, and humanized final response.

Original user query: ${queryText}

${validResults.map((r, i) => `--- Model ${i + 1} (${r.provider}) Response ---\n${r.text}`).join("\n\n")}

Create a unified, humanized response that intelligently combines the best of all models.`

            const synthesisOrder = orderedProviders.filter(
              (name) => name === "copilot" || name === "spark" || name === "gemini"
            )
            for (const providerName of synthesisOrder) {
              try {
                if (providerName === "copilot") {
                  synthesizedResponse = await copilotGenerate(synthesisPrompt)
                  providers.push("copilot" as QueryProvider)
                  break
                }
                if (providerName === "spark" && options?.sparkFallback) {
                  synthesizedResponse = await options.sparkFallback()
                  providers.push("spark" as QueryProvider)
                  break
                }
                if (providerName === "gemini") {
                  synthesizedResponse = await geminiGenerate(synthesisPrompt)
                  providers.push("gemini" as QueryProvider)
                  break
                }
              } catch {
                // try next synthesis provider
              }
            }
          }
          
          const modelTag = "consensus-humanized"
          
          if (neonReady) {
            void safeCacheAndLog(queryText, synthesizedResponse, providers, brainHits, { ...options, model: modelTag })
          }

          return finalizeResult({
            response: synthesizedResponse,
            providers,
            brainHits,
            brainContext,
            cached: false,
            model: modelTag,
            status: "ok",
          }, Date.now() - generationStart)
        }
      } catch (err) {
        console.warn("Consensus generation failed, falling through:", err)
        providerErrors.push(`consensus: ${err instanceof Error ? err.message : String(err)}`)
      }
    }
  }

  // route to preferred provider first
  const useCopilotFirst = options?.preferCopilot && copilotReady

  // Step 3a-pre: Copilot first if preferred (code/technical queries)
  if (useCopilotFirst && orderedProviders[0] === "copilot") {
    try {
      const generationStart = Date.now()
      const augmentedPrompt = brainContextStr
        ? `Use the following knowledge base context to inform your response.\n\n--- KNOWLEDGE BASE ---\n${brainContextStr}\n--- END ---\n\nQuery: ${queryText}`
        : queryText

      const response = await copilotGenerate(augmentedPrompt)
      if (!response || response.trim().length === 0) {
        throw new Error("Copilot returned empty response")
      }
      providers.push("copilot")

      if (neonReady) {
        void safeCacheAndLog(queryText, response, providers, brainHits, { ...options, model: "copilot-gpt-4o" })
      }

      return finalizeResult({
        response,
        providers,
        brainHits,
        brainContext,
        cached: false,
        model: "copilot-gpt-4o",
        status: "ok",
      }, Date.now() - generationStart)
    } catch (err) {
      console.warn("Copilot (preferred) generation failed, falling through:", err)
      providerErrors.push(`copilot(preferred): ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  // Step 3a: Generate with Gemini (primary)
  if (orderedProviders.includes("copilot")) {
    try {
      const generationStart = Date.now()
      const contextBlocks = [brainContextStr, webSearchContextStr].filter(Boolean).join("\n\n")
      const augmentedPrompt = contextBlocks
        ? `Use the following context to inform your response. If any context is not relevant, ignore it and continue with best effort reasoning.\n\n${contextBlocks}\n\nUser query: ${queryText}`
        : queryText

      const response = await copilotGenerate(augmentedPrompt)
      if (!response || response.trim().length === 0) {
        throw new Error("Copilot returned empty response")
      }
      providers.push("copilot")

      // Cache the generation
      if (neonReady) {
        void safeCacheAndLog(queryText, response, providers, brainHits, { ...options, model: "copilot-gpt-4o" })
      }

      return finalizeResult({
        response,
        providers,
        brainHits,
        brainContext,
        cached: false,
        model: "copilot-gpt-4o",
        status: "ok",
      }, Date.now() - generationStart)
    } catch (err) {
      console.warn("Copilot generation failed:", err)
      providerErrors.push(`copilot: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  // Step 4: Fallback to Spark LLM
  if (orderedProviders.includes("spark") && options?.sparkFallback) {
    try {
      const generationStart = Date.now()
      const response = await options.sparkFallback()
      if (!response || response.trim().length === 0) {
        throw new Error("Spark returned empty response")
      }
      providers.push("spark")

      if (neonReady) {
        void safeCacheAndLog(queryText, response, providers, brainHits, { ...options, model: "spark-llm" })
      }

      return finalizeResult({
        response,
        providers,
        brainHits,
        brainContext,
        cached: false,
        model: "spark-llm",
        status: "ok",
      }, Date.now() - generationStart)
    } catch (err) {
      console.warn("Spark fallback failed:", err)
      providerErrors.push(`spark: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  // Step 5: Gemini as final hosted fallback
  if (orderedProviders.includes("gemini")) {
    try {
      const generationStart = Date.now()
      const contextBlocks = [brainContextStr, webSearchContextStr].filter(Boolean).join("\n\n")
      const augmentedPrompt = contextBlocks
        ? `Use the following context to inform your response. If any context is not relevant, ignore it and continue with best effort reasoning.\n\n${contextBlocks}\n\nUser query: ${queryText}`
        : queryText

      const response = await geminiGenerate(augmentedPrompt)
      if (!response || response.trim().length === 0) {
        throw new Error("Gemini returned empty response")
      }
      providers.push("gemini")

      if (neonReady) {
        void safeCacheAndLog(queryText, response, providers, brainHits, { ...options, model: "gemini-2.5-flash" })
      }

      return finalizeResult({
        response,
        providers,
        brainHits,
        brainContext,
        cached: false,
        model: "gemini-2.5-flash",
        status: "ok",
      }, Date.now() - generationStart)
    } catch (err) {
      console.warn("Gemini generation failed:", err)
      providerErrors.push(`gemini: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  // Step 5b removed: backend mode executes as primary path above

  // Step 6: Last resort — return brain context directly if available
  if (brainContext.length > 0) {
    return finalizeResult({
      response: `Based on available knowledge:\n\n${brainContext.join("\n\n")}`,
      providers: ["brain"],
      brainHits,
      brainContext,
      cached: false,
      status: "ok",
    })
  }

  const configHint = [
    `geminiConfigured=${geminiReady}`,
    `copilotConfigured=${copilotReady}`,
    `sparkFallbackProvided=${Boolean(options?.sparkFallback)}`,
  ].join(", ")

  const detail = providerErrors.length > 0
    ? ` Failures: ${providerErrors.join(" | ")}`
    : ""

  throw new Error(`All providers failed. Please check your API configuration. (${configHint}).${detail}`)
}

function inferContentType(moduleName: string): "strategy" | "chat" | "email-template" | "ngo-report" | "general" {
  const normalized = String(moduleName || "").toLowerCase()
  if (normalized.includes("chat") || normalized === "rag_chat") return "chat"
  if (normalized.includes("email") || normalized.includes("mailer") || normalized.includes("invite")) {
    return "email-template"
  }
  if (normalized.includes("ngo") || normalized.includes("report")) return "ngo-report"
  if (
    normalized.includes("strategy") ||
    normalized.includes("idea") ||
    normalized.includes("marketing")
  ) {
    return "strategy"
  }
  return "general"
}

function defaultProfileForContentType(
  contentType: "strategy" | "chat" | "email-template" | "ngo-report" | "general"
): "strict" | "balanced" | "creative" {
  if (contentType === "ngo-report") return "strict"
  if (contentType === "email-template") return "strict"
  if (contentType === "chat") return "creative"
  if (contentType === "strategy") return "balanced"
  return "balanced"
}

function scoreAiSignals(input: string): number {
  const text = String(input || "")
  const rules: Array<{ regex: RegExp; weight: number }> = [
    { regex: /\b(let'?s dive in|here'?s what you need to know|in conclusion)\b/gi, weight: 14 },
    { regex: /\b(pivotal|testament|landscape|underscores?|showcasing|vibrant|crucial)\b/gi, weight: 10 },
    { regex: /\b(in order to|due to the fact that|it could potentially)\b/gi, weight: 10 },
    { regex: /,\s*(no guessing|no wasted motion|no fluff)\b/gi, weight: 9 },
    { regex: /^\s*[-*]\s*\*\*[^*]+\*\*\s*:/gim, weight: 8 },
  ]

  let score = 0
  for (const rule of rules) {
    const hits = (text.match(rule.regex) || []).length
    if (hits > 0) score += Math.min(100, hits * rule.weight)
  }
  return Math.min(100, Math.round(score))
}

function preserveQuotedAndNumericTokens(
  original: string,
  rewritten: string,
  enabled: boolean
): string {
  if (!enabled) return rewritten

  let output = rewritten
  const quotedOriginal = original.match(/"([^"]+)"|'([^']+)'/g) || []
  const quotedRewritten = output.match(/"([^"]+)"|'([^']+)'/g) || []
  if (quotedOriginal.length > quotedRewritten.length && quotedOriginal.length > 0) {
    output += `\n\nQuoted references preserved: ${quotedOriginal.join(" ")}`
  }

  const originalNums = original.match(/\b\d+(?:[.,]\d+)?%?\b/g) || []
  const rewrittenNums = output.match(/\b\d+(?:[.,]\d+)?%?\b/g) || []
  const missing = originalNums.filter((n) => !rewrittenNums.includes(n))
  if (missing.length > 0) {
    output += `\n\nKey figures: ${Array.from(new Set(missing)).join(", ")}`
  }

  return output
}

function applyVoiceHints(text: string, voiceSample?: string, enabled?: boolean): string {
  if (!enabled || !voiceSample || voiceSample.trim().length < 80) return text

  const sample = voiceSample.trim()
  const prefersShortSentences = (sample.match(/[.!?]/g) || []).length > 0
    ? sample.length / (sample.match(/[.!?]/g) || []).length < 85
    : false
  const usesContractions = /\b\w+'(t|re|ve|ll|d|s)\b/i.test(sample)

  let out = text
  if (prefersShortSentences) {
    out = out.replace(/;\s+/g, ". ")
  }
  if (usesContractions) {
    out = out
      .replace(/\bdo not\b/gi, "don't")
      .replace(/\bcannot\b/gi, "can't")
      .replace(/\bit is\b/gi, "it's")
  }
  return out
}

function humanizeByProfile(
  input: string,
  profile: "strict" | "balanced" | "creative",
  preserveFactsStrictly: boolean
): string {
  let out = String(input || "")

  // Shared cleanup
  out = out
    .replace(/\bIn order to\b/g, "To")
    .replace(/\bDue to the fact that\b/g, "Because")
    .replace(/\bAdditionally\b/g, "Also")
    .replace(/\bLet'?s dive in\b:?\s*/gi, "")
    .replace(/\bHere'?s what you need to know\b:?\s*/gi, "")
    .replace(/\*\*([^*]+)\*\*\s*:/g, "$1:")

  if (profile === "strict") {
    out = out
      .replace(/\b(pivotal|groundbreaking|vibrant|breathtaking)\b/gi, (m) => {
        if (preserveFactsStrictly) return m
        if (/pivotal/i.test(m)) return "important"
        if (/groundbreaking/i.test(m)) return "notable"
        return "well-known"
      })
      .replace(/\s+—\s+/g, ", ")
  } else if (profile === "creative") {
    out = out
      .replace(/\btherefore\b/gi, "so")
      .replace(/\bfurthermore\b/gi, "also")
      .replace(/\bhowever\b/gi, "but")
  } else {
    // balanced
    out = out
      .replace(/\btestament to\b/gi, "example of")
      .replace(/\bshowcasing\b/gi, "showing")
  }

  return preserveQuotedAndNumericTokens(input, out, preserveFactsStrictly)
}

function applyUniversalPostProcessor(
  input: string,
  opts: {
    moduleName: string
    contentType?: "strategy" | "chat" | "email-template" | "ngo-report" | "general"
    humanizeOnOutput?: boolean
    preserveFactsStrictly?: boolean
    matchMyVoice?: boolean
    voiceSample?: string
    postProcessProfile?: "strict" | "balanced" | "creative"
    bypass?: boolean
  }
): {
  output: string
  meta: PipelineResult["postProcess"]
} {
  const contentType = opts.contentType || inferContentType(opts.moduleName)
  const profile = opts.postProcessProfile || defaultProfileForContentType(contentType)
  const enabled = opts.humanizeOnOutput ?? true
  const preserveFactsStrictly =
    opts.preserveFactsStrictly ?? (contentType === "ngo-report" || contentType === "email-template")
  const matchMyVoice = Boolean(opts.matchMyVoice)

  const aiSignalBefore = scoreAiSignals(input)

  if (opts.bypass || !enabled || !input?.trim()) {
    return {
      output: input,
      meta: {
        enabled,
        contentType,
        profile,
        preserveFactsStrictly,
        matchMyVoice,
        changed: false,
        aiSignalBefore,
        aiSignalAfter: aiSignalBefore,
      },
    }
  }

  let output = humanizeByProfile(input, profile, preserveFactsStrictly)
  output = applyVoiceHints(output, opts.voiceSample, matchMyVoice)
  const aiSignalAfter = scoreAiSignals(output)

  return {
    output,
    meta: {
      enabled,
      contentType,
      profile,
      preserveFactsStrictly,
      matchMyVoice,
      changed: output !== input,
      aiSignalBefore,
      aiSignalAfter,
    },
  }
}

function validatePromptQuality(
  input: string,
  profile: "strict" | "balanced" | "lenient" = "balanced"
): {
  accepted: boolean
  score: number
  message: string
  questions: string[]
} {
  const text = input.trim()
  const words = text.split(/\s+/).filter(Boolean)
  const alphaTokens = words.filter((w) => /[a-zA-Z]/.test(w))
  const cleanWords = alphaTokens.map((w) => w.replace(/[^a-zA-Z]/g, "").toLowerCase()).filter(Boolean)
  const unique = new Set(cleanWords)
  const vowelRichWords = cleanWords.filter((w) => /[aeiou]/.test(w))
  const longRuns = (text.match(/([a-zA-Z])\1{3,}/g) || []).length

  let score = 1
  if (text.length < 35) score -= 0.35
  if (cleanWords.length < 6) score -= 0.25
  if (cleanWords.length > 0 && unique.size / cleanWords.length < 0.45) score -= 0.2
  if (cleanWords.length > 0 && vowelRichWords.length / cleanWords.length < 0.35) score -= 0.25
  if (longRuns > 0) score -= 0.2
  if (!/[.?!]/.test(text)) score -= 0.08

  const thresholdByProfile = {
    strict: 0.7,
    balanced: 0.55,
    lenient: 0.42,
  } as const

  const accepted = score >= thresholdByProfile[profile]
  const message = accepted
    ? ""
    : "Input is unclear for a reliable donor-quality output. Please provide a clearer project description first."

  return {
    accepted,
    score: Math.max(0, Math.min(1, Number(score.toFixed(2)))),
    message,
    questions: [
      "What is the project goal in one clear sentence?",
      "Who are the target beneficiaries and where is the intervention located?",
      "What donor or funding stream are you targeting?",
      "What timeline and budget range do you expect?",
      "What measurable outcomes should this proposal deliver?",
    ],
  }
}

// --- Document Ingestion ---

export async function ingestTextTooBrain(
  text: string,
  options: {
    documentId?: number
    sector?: string
    metadata?: Record<string, unknown>
    chunkSize?: number
  }
): Promise<number> {
  const { addBrainChunk } = await import("./sentinel-brain")

  const chunkSize = options.chunkSize ?? 800
  const chunks = splitIntoChunks(text, chunkSize)
  let indexed = 0

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]
    try {
      const embedding = await geminiEmbed(chunk)
      await addBrainChunk({
        content: chunk,
        embedding,
        sector: options.sector,
        metadata: options.metadata,
        document_id: options.documentId,
        chunk_index: i,
      })
      indexed++
    } catch (err) {
      console.warn(`Failed to ingest chunk ${i}:`, err)
    }
  }

  return indexed
}

function splitIntoChunks(text: string, maxLen: number): string[] {
  const paragraphs = text.split(/\n\n+/)
  const chunks: string[] = []
  let current = ""

  for (const para of paragraphs) {
    if (current.length + para.length + 2 > maxLen && current.length > 0) {
      chunks.push(current.trim())
      current = ""
    }
    current += (current ? "\n\n" : "") + para
  }

  if (current.trim()) {
    chunks.push(current.trim())
  }

  return chunks
}

// --- Helpers (fire-and-forget with error swallowing) ---

async function safeLogQuery(
  queryText: string,
  responseJson: Record<string, unknown> | string,
  providers: QueryProvider[],
  brainHits: number,
  options?: { module?: string; userId?: string | number }
): Promise<void> {
  try {
    const parsed = typeof responseJson === "string" ? { text: responseJson } : responseJson
    await logQuery({
      user_id: options?.userId,
      query_text: queryText,
      module: options?.module,
      response_json: parsed,
      providers_used: providers,
      brain_hits: brainHits,
    })
  } catch {
    // Silent — logging should never break the pipeline
  }
}

async function safeCacheAndLog(
  queryText: string,
  response: string,
  providers: QueryProvider[],
  brainHits: number,
  options?: { module?: string; userId?: string | number; model?: string }
): Promise<void> {
  try {
    await cacheGeneration({
      query_text: queryText,
      provider: providers[providers.length - 1],
      response_json: { text: response },
      model_used: options?.model || (providers.includes("gemini") ? "gemini-2.5-flash" : "spark-llm"),
    })
  } catch {
    // Silent
  }
  
  // Tag the response JSON with the model so it gets logged in the query logs too
  const logResponse = { 
    text: response, 
    _meta: { model: options?.model || (providers.includes("gemini") ? "gemini-2.5-flash" : "spark-llm") } 
  }
  
  void safeLogQuery(queryText, logResponse, providers, brainHits, options)
}
