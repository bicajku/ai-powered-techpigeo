import { GoogleGenerativeAI } from "@google/generative-ai"

let geminiInstance: GoogleGenerativeAI | null = null

const GEMINI_KEY_STORAGE = "sentinel-gemini-api-key"

function getStoredKey(): string | null {
  try {
    return localStorage.getItem(GEMINI_KEY_STORAGE)
  } catch {
    return null
  }
}

export function setGeminiApiKey(key: string): void {
  try {
    localStorage.setItem(GEMINI_KEY_STORAGE, key)
    geminiInstance = new GoogleGenerativeAI(key)
  } catch {
    console.warn("Failed to store Gemini API key")
  }
}

export function isGeminiConfigured(): boolean {
  return !!getStoredKey()
}

function getGemini(): GoogleGenerativeAI {
  if (geminiInstance) return geminiInstance

  const key = getStoredKey()
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
  const ai = getGemini()
  const model = ai.getGenerativeModel({ model: options?.model ?? "gemini-2.5-flash" })

  const result = await model.generateContent(prompt)
  const text = result.response.text()

  return text
}

export async function geminiEmbed(text: string): Promise<number[]> {
  const ai = getGemini()
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
