import { GoogleGenerativeAI } from "@google/generative-ai"
import * as secretStore from "@/lib/secret-store"

let geminiInstance: GoogleGenerativeAI | null = null

const GEMINI_KEY_STORAGE = "sentinel-gemini-api-key"

export async function setGeminiApiKey(key: string): Promise<void> {
  if (typeof secretStore.storeSecret === "function") {
    await secretStore.storeSecret(GEMINI_KEY_STORAGE, key)
  } else {
    localStorage.setItem(GEMINI_KEY_STORAGE, key)
  }
  geminiInstance = new GoogleGenerativeAI(key)
}

export function isGeminiConfigured(): boolean {
  if (typeof secretStore.hasSecret === "function") {
    return secretStore.hasSecret(GEMINI_KEY_STORAGE)
  }
  return !!localStorage.getItem(GEMINI_KEY_STORAGE)
}

async function getGemini(): Promise<GoogleGenerativeAI> {
  if (geminiInstance) return geminiInstance

  const key = typeof secretStore.retrieveSecret === "function"
    ? await secretStore.retrieveSecret(GEMINI_KEY_STORAGE)
    : localStorage.getItem(GEMINI_KEY_STORAGE)
  if (!key) {
    throw new Error("Gemini API key not configured. Go to Admin → Settings to add it.")
  }

  geminiInstance = new GoogleGenerativeAI(key)
  return geminiInstance
}

export async function geminiGenerate(
  prompt: string,
  options?: { model?: string; parseJson?: boolean }
): Promise<string> {
  const ai = await getGemini()
  const model = ai.getGenerativeModel({ model: options?.model ?? "gemini-2.5-flash" })

  const result = await model.generateContent(prompt)
  const text = result.response.text()

  return text
}

export async function geminiEmbed(text: string): Promise<number[]> {
  const ai = await getGemini()
  const model = ai.getGenerativeModel({ model: "text-embedding-004" })

  const result = await model.embedContent(text)
  return result.embedding.values
}

export async function geminiEmbedBatch(texts: string[]): Promise<number[][]> {
  const embeddings: number[][] = []
  for (const text of texts) {
    const emb = await geminiEmbed(text)
    embeddings.push(emb)
  }
  return embeddings
}

export async function testGeminiConnection(): Promise<{ ok: boolean; error?: string }> {
  try {
    const response = await geminiGenerate("Respond with exactly: OK")
    return { ok: response.toLowerCase().includes("ok") }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Gemini connection failed" }
  }
}
