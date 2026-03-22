import { geminiGenerate, geminiEmbed, isGeminiConfigured } from "./gemini-client"
import { copilotGenerate, isCopilotConfigured } from "./copilot-client"
import {
  searchBrain,
  getCachedGeneration,
  cacheGeneration,
  logQuery,
} from "./sentinel-brain"
import { isNeonConfigured } from "./neon-client"

export type QueryProvider = "gemini" | "copilot" | "spark" | "brain" | "cache"

export interface PipelineResult {
  response: string
  providers: QueryProvider[]
  brainHits: number
  brainContext: string[]
  cached: boolean
  model?: string
}

export async function sentinelQuery(
  queryText: string,
  options?: {
    module?: string
    userId?: number
    sector?: string
    skipCache?: boolean
    preferCopilot?: boolean
    sparkFallback?: () => Promise<string>
  }
): Promise<PipelineResult> {
  const providers: QueryProvider[] = []
  let brainHits = 0
  const brainContext: string[] = []
  const neonReady = isNeonConfigured()
  const geminiReady = isGeminiConfigured()
  const copilotReady = isCopilotConfigured()

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

  // Step 3: Generate — route to preferred provider first
  const useCopilotFirst = options?.preferCopilot && copilotReady

  // Step 3a-pre: Copilot first if preferred (code/technical queries)
  if (useCopilotFirst) {
    try {
      const augmentedPrompt = brainContextStr
        ? `Use the following knowledge base context to inform your response.\n\n--- KNOWLEDGE BASE ---\n${brainContextStr}\n--- END ---\n\nQuery: ${queryText}`
        : queryText

      const response = await copilotGenerate(augmentedPrompt)
      providers.push("copilot")

      if (neonReady) {
        void safeCacheAndLog(queryText, response, providers, brainHits, options)
      }

      return {
        response,
        providers,
        brainHits,
        brainContext,
        cached: false,
        model: "copilot-gpt-4o",
      }
    } catch (err) {
      console.warn("Copilot (preferred) generation failed, falling through:", err)
    }
  }

  // Step 3a: Generate with Gemini (primary)
  if (geminiReady) {
    try {
      const augmentedPrompt = brainContextStr
        ? `Use the following knowledge base context to inform your response. If the context is relevant, incorporate it. If not, rely on your own knowledge.\n\n--- KNOWLEDGE BASE ---\n${brainContextStr}\n--- END KNOWLEDGE BASE ---\n\nUser query: ${queryText}`
        : queryText

      const response = await geminiGenerate(augmentedPrompt)
      providers.push("gemini")

      // Cache the generation
      if (neonReady) {
        void safeCacheAndLog(queryText, response, providers, brainHits, options)
      }

      return {
        response,
        providers,
        brainHits,
        brainContext,
        cached: false,
        model: "gemini-2.5-flash",
      }
    } catch (err) {
      console.warn("Gemini generation failed:", err)
    }
  }

  // Step 3b: Copilot as secondary or code-specific provider
  if (copilotReady) {
    try {
      const augmentedPrompt = brainContextStr
        ? `Use the following knowledge base context to inform your response.\n\n--- KNOWLEDGE BASE ---\n${brainContextStr}\n--- END ---\n\nQuery: ${queryText}`
        : queryText

      const response = await copilotGenerate(augmentedPrompt)
      providers.push("copilot")

      if (neonReady) {
        void safeCacheAndLog(queryText, response, providers, brainHits, options)
      }

      return {
        response,
        providers,
        brainHits,
        brainContext,
        cached: false,
        model: "copilot-gpt-4o",
      }
    } catch (err) {
      console.warn("Copilot generation failed:", err)
    }
  }

  // Step 4: Fallback to Spark LLM
  if (options?.sparkFallback) {
    try {
      const response = await options.sparkFallback()
      providers.push("spark")

      if (neonReady) {
        void safeCacheAndLog(queryText, response, providers, brainHits, options)
      }

      return {
        response,
        providers,
        brainHits,
        brainContext,
        cached: false,
        model: "spark-llm",
      }
    } catch (err) {
      console.warn("Spark fallback failed:", err)
    }
  }

  // Step 5: Last resort — return brain context directly if available
  if (brainContext.length > 0) {
    return {
      response: `Based on available knowledge:\n\n${brainContext.join("\n\n")}`,
      providers: ["brain"],
      brainHits,
      brainContext,
      cached: false,
    }
  }

  throw new Error("All providers failed. Please check your API configuration.")
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
  options?: { module?: string; userId?: number }
): Promise<void> {
  try {
    await cacheGeneration({
      query_text: queryText,
      provider: providers[providers.length - 1],
      response_json: { text: response },
      model_used: providers.includes("gemini") ? "gemini-2.5-flash" : "spark-llm",
    })
  } catch {
    // Silent
  }
  void safeLogQuery(queryText, { text: response }, providers, brainHits, options)
}
