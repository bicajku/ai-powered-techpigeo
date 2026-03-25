import { geminiGenerate, geminiEmbed, isGeminiConfigured } from "./gemini-client"
import { copilotGenerate, isCopilotConfigured } from "./copilot-client"
import {
  searchBrain,
  getCachedGeneration,
  cacheGeneration,
  logQuery,
} from "./sentinel-brain"
import { isNeonConfigured } from "./neon-client"
import { getEnvConfig } from "./env-config"
import { platformLlm } from "./platform-client"

export type QueryProvider = "gemini" | "copilot" | "spark" | "backend" | "brain" | "cache"

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
}

export async function sentinelQuery(
  queryText: string,
  options?: {
    module?: string
    userId?: number
    sector?: string
    skipCache?: boolean
    preferCopilot?: boolean
    useConsensus?: boolean // Enables multi-model generation and synthesis
    sparkFallback?: () => Promise<string>
    userInputForQualityGate?: string
    enableQualityGate?: boolean
    qualityGateProfile?: "strict" | "balanced" | "lenient"
  }
): Promise<PipelineResult> {
  const providers: QueryProvider[] = []
  const providerErrors: string[] = []
  let brainHits = 0
  const brainContext: string[] = []
  const neonReady = isNeonConfigured()
  const geminiReadyRaw = isGeminiConfigured()
  const copilotReadyRaw = isCopilotConfigured()
  const envConfig = getEnvConfig()
  const backendMode = envConfig.useBackendLlm
  const geminiReady = backendMode ? false : geminiReadyRaw
  const copilotReady = backendMode ? false : copilotReadyRaw

  // Step 0: Input quality gate (default enabled for NGO module)
  const shouldRunQualityGate =
    options?.enableQualityGate ?? options?.module === "ngo_module"
  if (shouldRunQualityGate) {
    const candidateInput = options?.userInputForQualityGate?.trim() || queryText.trim()
    const quality = validatePromptQuality(candidateInput, options?.qualityGateProfile ?? "balanced")
    if (!quality.accepted) {
      return {
        response: quality.message,
        providers: [],
        brainHits: 0,
        brainContext: [],
        cached: false,
        model: undefined,
        status: "needs_clarification",
        clarificationQuestions: quality.questions,
        qualityScore: quality.score,
      }
    }
  }

  // Step 1: Check generation cache
  if (neonReady && !options?.skipCache) {
    try {
      const cached = await getCachedGeneration(queryText)
      if (cached) {
        providers.push("cache")
        const responseText =
          typeof cached.response_json === "string"
            ? cached.response_json
            : JSON.stringify(cached.response_json)

        void safeLogQuery(queryText, cached.response_json, ["cache"], 0, options)
        return {
          response: responseText,
          providers,
          brainHits: 0,
          brainContext: [],
          cached: true,
          model: cached.model_used ?? undefined,
          status: "ok",
        }
      }
    } catch (err) {
      console.warn("Cache lookup failed:", err)
    }
  }

  // Step 2: Search Sentinel Brain for relevant knowledge
  let brainContextStr = ""
  if (neonReady && geminiReady) {
    try {
      const queryEmbedding = await geminiEmbed(queryText)
      const brainResults = await searchBrain(queryEmbedding, 5, options?.sector)
      const relevant = brainResults.filter((r) => r.similarity > 0.65)

      if (relevant.length > 0) {
        providers.push("brain")
        brainHits = relevant.length
        for (const entry of relevant) {
          brainContext.push(entry.content)
        }
        brainContextStr = brainContext
          .map((c, i) => `[Knowledge ${i + 1}]: ${c}`)
          .join("\n\n")
      }
    } catch (err) {
      console.warn("Brain search failed:", err)
    }
  }

  // Step 3: Generate
  if (backendMode) {
    try {
      const backendPrompt = brainContextStr
        ? `Use the following knowledge base context to inform your response. If the context is relevant, incorporate it. If not, rely on your own knowledge.\n\n--- KNOWLEDGE BASE ---\n${brainContextStr}\n--- END KNOWLEDGE BASE ---\n\nUser query: ${queryText}`
        : queryText

      const raw = await platformLlm(backendPrompt, "gpt-4o", false)
      const response = typeof raw === "string" ? raw : JSON.stringify(raw)
      if (!response || response.trim().length === 0) {
        throw new Error("Backend LLM returned empty response")
      }
      providers.push("backend")

      if (neonReady) {
        void safeCacheAndLog(queryText, response, providers, brainHits, { ...options, model: "backend-llm" })
      }

      return {
        response,
        providers,
        brainHits,
        brainContext,
        cached: false,
        model: "backend-llm",
        status: "ok",
      }
    } catch (err) {
      console.warn("Backend LLM generation failed:", err)
      providerErrors.push(`backend: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  
  if (options?.useConsensus) {
    if (geminiReady || copilotReady) {
      try {
        const augmentedPrompt = brainContextStr
          ? `Use the following knowledge base context to inform your response. If the context is relevant, incorporate it. If not, rely on your own knowledge.\n\n--- KNOWLEDGE BASE ---\n${brainContextStr}\n--- END KNOWLEDGE BASE ---\n\nUser query: ${queryText}`
          : queryText

        // Run all available primary models in parallel
        const generationPromises: Promise<{ provider: string, text: string }>[] = []
        
        if (geminiReady) {
          generationPromises.push(
            geminiGenerate(augmentedPrompt).then(text => ({ provider: 'gemini', text })).catch(() => ({ provider: 'gemini', text: '' }))
          )
        }
        
        if (copilotReady) {
          generationPromises.push(
            copilotGenerate(augmentedPrompt).then(text => ({ provider: 'copilot', text })).catch(() => ({ provider: 'copilot', text: '' }))
          )
        }
        
        if (options?.sparkFallback) {
          generationPromises.push(
            options.sparkFallback().then(text => ({ provider: 'spark', text })).catch(() => ({ provider: 'spark', text: '' }))
          )
        }

        const results = await Promise.all(generationPromises)
        const validResults = results.filter(r => r.text.length > 0)
        
        if (validResults.length > 0) {
          validResults.forEach(r => providers.push(r.provider as QueryProvider))
          providers.push("brain" as QueryProvider) // "brain" synthesizer acts as the final judge
          
          let synthesizedResponse = validResults[0].text // Fallback if synthesis fails
          
          // Synthesize using the best available model (Gemini usually better at synthesis)
          if (validResults.length > 1) {
            const synthesisPrompt = `You are the Sentinel Brain Synthesizer. You have received answers from multiple AI models regarding a user's query. Your job is to analyze these responses, extract the best ideas from all of them, resolve any conflicts, and create a single, highly-optimized, natural, and humanized final response.

Original user query: ${queryText}

${validResults.map((r, i) => `--- Model ${i + 1} (${r.provider}) Response ---\n${r.text}`).join('\n\n')}

Create a unified, humanized response that intelligently combines the best of all models.`

            if (geminiReady) {
               try { synthesizedResponse = await geminiGenerate(synthesisPrompt); providers.push("gemini" as QueryProvider); } 
               catch { /* fallback to index 0 */ }
            } else if (copilotReady) {
               try { synthesizedResponse = await copilotGenerate(synthesisPrompt); providers.push("copilot" as QueryProvider); }
               catch { /* fallback to index 0 */ }
            }
          }
          
          const modelTag = "consensus-humanized"
          
          if (neonReady) {
            void safeCacheAndLog(queryText, synthesizedResponse, providers, brainHits, { ...options, model: modelTag })
          }

          return {
            response: synthesizedResponse,
            providers,
            brainHits,
            brainContext,
            cached: false,
            model: modelTag,
            status: "ok",
          }
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
  if (useCopilotFirst) {
    try {
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

      return {
        response,
        providers,
        brainHits,
        brainContext,
        cached: false,
        model: "copilot-gpt-4o",
        status: "ok",
      }
    } catch (err) {
      console.warn("Copilot (preferred) generation failed, falling through:", err)
      providerErrors.push(`copilot(preferred): ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  // Step 3a: Generate with Gemini (primary)
  if (geminiReady) {
    try {
      const augmentedPrompt = brainContextStr
        ? `Use the following knowledge base context to inform your response. If the context is relevant, incorporate it. If not, rely on your own knowledge.\n\n--- KNOWLEDGE BASE ---\n${brainContextStr}\n--- END KNOWLEDGE BASE ---\n\nUser query: ${queryText}`
        : queryText

      const response = await geminiGenerate(augmentedPrompt)
      if (!response || response.trim().length === 0) {
        throw new Error("Gemini returned empty response")
      }
      providers.push("gemini")

      // Cache the generation
      if (neonReady) {
        void safeCacheAndLog(queryText, response, providers, brainHits, { ...options, model: "gemini-2.5-flash" })
      }

      return {
        response,
        providers,
        brainHits,
        brainContext,
        cached: false,
        model: "gemini-2.5-flash",
        status: "ok",
      }
    } catch (err) {
      console.warn("Gemini generation failed:", err)
      providerErrors.push(`gemini: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  // Step 3b: Copilot as secondary or code-specific provider
  if (copilotReady) {
    try {
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

      return {
        response,
        providers,
        brainHits,
        brainContext,
        cached: false,
        model: "copilot-gpt-4o",
        status: "ok",
      }
    } catch (err) {
      console.warn("Copilot generation failed:", err)
      providerErrors.push(`copilot: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  // Step 4: Fallback to Spark LLM
  if (options?.sparkFallback) {
    try {
      const response = await options.sparkFallback()
      if (!response || response.trim().length === 0) {
        throw new Error("Spark returned empty response")
      }
      providers.push("spark")

      if (neonReady) {
        void safeCacheAndLog(queryText, response, providers, brainHits, { ...options, model: "spark-llm" })
      }

      return {
        response,
        providers,
        brainHits,
        brainContext,
        cached: false,
        model: "spark-llm",
        status: "ok",
      }
    } catch (err) {
      console.warn("Spark fallback failed:", err)
      providerErrors.push(`spark: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  // Step 4b removed: backend mode executes as primary path above

  // Step 5: Last resort — return brain context directly if available
  if (brainContext.length > 0) {
    return {
      response: `Based on available knowledge:\n\n${brainContext.join("\n\n")}`,
      providers: ["brain"],
      brainHits,
      brainContext,
      cached: false,
      status: "ok",
    }
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
  options?: { module?: string; userId?: number }
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
  options?: { module?: string; userId?: number; model?: string }
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
