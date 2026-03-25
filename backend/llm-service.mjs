const DEFAULT_MODEL = "gpt-4o"

export function getProviderStatus() {
  const copilotToken = process.env.GITHUB_TOKEN || process.env.GITHUB_MODELS_TOKEN
  const geminiApiKey = process.env.GEMINI_API_KEY

  return {
    defaultModel: DEFAULT_MODEL,
    providers: {
      copilot: {
        configured: Boolean(copilotToken),
        authSource: process.env.GITHUB_TOKEN
          ? "GITHUB_TOKEN"
          : process.env.GITHUB_MODELS_TOKEN
            ? "GITHUB_MODELS_TOKEN"
            : null,
      },
      gemini: {
        configured: Boolean(geminiApiKey),
        authSource: process.env.GEMINI_API_KEY
          ? "GEMINI_API_KEY"
          : null,
      },
    },
    fallbackOrder: ["copilot", "gemini"],
  }
}

function extractTextFromCopilot(data) {
  const text = data?.choices?.[0]?.message?.content
  if (typeof text !== "string" || text.trim().length === 0) {
    throw new Error("Copilot provider returned empty response")
  }
  return text
}

function extractTextFromGemini(data) {
  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p?.text || "").join("")
  if (typeof text !== "string" || text.trim().length === 0) {
    throw new Error("Gemini provider returned empty response")
  }
  return text
}

async function callCopilot(prompt, model, token) {
  const response = await fetch("https://models.inference.ai.azure.com/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: model || DEFAULT_MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
      max_tokens: 4096,
    }),
  })

  if (!response.ok) {
    const body = await response.text().catch(() => "")
    throw new Error(`Copilot API ${response.status}: ${body}`)
  }

  const data = await response.json()
  return {
    text: extractTextFromCopilot(data),
    model: data?.model || model || DEFAULT_MODEL,
    provider: "copilot",
  }
}

async function callGemini(prompt, model, apiKey) {
  const selectedModel = model && model.startsWith("gemini") ? model : "gemini-1.5-flash"
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=${encodeURIComponent(apiKey)}`

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 4096,
      },
    }),
  })

  if (!response.ok) {
    const body = await response.text().catch(() => "")
    throw new Error(`Gemini API ${response.status}: ${body}`)
  }

  const data = await response.json()
  return {
    text: extractTextFromGemini(data),
    model: selectedModel,
    provider: "gemini",
  }
}

export async function generateWithFallback({ prompt, model, providers }) {
  const requestedProviders = Array.isArray(providers) && providers.length > 0
    ? providers
    : ["copilot", "gemini"]

  const failures = []
  const copilotToken = process.env.GITHUB_TOKEN || process.env.GITHUB_MODELS_TOKEN
  const geminiApiKey = process.env.GEMINI_API_KEY

  for (const provider of requestedProviders) {
    try {
      if (provider === "copilot") {
        if (!copilotToken) throw new Error("Missing GITHUB_TOKEN or GITHUB_MODELS_TOKEN")
        return await callCopilot(prompt, model, copilotToken)
      }

      if (provider === "gemini") {
        if (!geminiApiKey) throw new Error("Missing GEMINI_API_KEY")
        return await callGemini(prompt, model, geminiApiKey)
      }

      failures.push(`${provider}: unsupported provider`)
    } catch (error) {
      failures.push(`${provider}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  throw new Error(`All providers failed. ${failures.join(" | ")}`)
}
