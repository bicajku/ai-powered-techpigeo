const DEFAULT_MODEL = "gpt-4.1"

const COST_PER_1K = {
  copilot: Number(process.env.COST_PER_1K_COPILOT || 0.0018),
  groq: Number(process.env.COST_PER_1K_GROQ || 0.0003),
  gemini: Number(process.env.COST_PER_1K_GEMINI || 0.0010),
  spark: Number(process.env.COST_PER_1K_SPARK || 0.0005),
  deepseek: Number(process.env.COST_PER_1K_DEEPSEEK || 0.0004),
}

function estimateTokens(prompt, responseText) {
  const chars = String(prompt || "").length + String(responseText || "").length
  return Math.max(1, Math.ceil(chars / 4))
}

function estimateCost(provider, totalTokens) {
  const per1k = COST_PER_1K[provider] || 0
  return Number(((totalTokens / 1000) * per1k).toFixed(6))
}

export function getProviderStatus() {
  const copilotToken = process.env.GITHUB_COPILOT_TOKEN
    || process.env.GitHub_Models_token
    || process.env.GITHUB_MODELS_TOKEN
    || process.env.GITHUB_TOKEN
  const groqApiKey = process.env.GROQ_API_KEY
  const geminiApiKey = process.env.GEMINI_API_KEY
  const deepseekApiKey = process.env.DEEPSEEK_API_KEY

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
      groq: {
        configured: Boolean(groqApiKey),
        authSource: process.env.GROQ_API_KEY
          ? "GROQ_API_KEY"
          : null,
      },
      gemini: {
        configured: Boolean(geminiApiKey),
        authSource: process.env.GEMINI_API_KEY
          ? "GEMINI_API_KEY"
          : null,
      },
      deepseek: {
        configured: Boolean(deepseekApiKey),
        authSource: deepseekApiKey ? "DEEPSEEK_API_KEY" : null,
      },
    },
    fallbackOrder: ["copilot", "groq", "deepseek", "gemini"],
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
    // L3 fix: Log detail server-side only; throw generic message to caller
    console.error(`[llm-service] Copilot API error ${response.status}:`, body)
    throw new Error("LLM provider request failed")
  }

  const data = await response.json()
  const text = extractTextFromCopilot(data)
  const usage = data?.usage || {}
  const totalTokens = Number(usage.total_tokens || estimateTokens(prompt, text))

  return {
    text,
    model: data?.model || model || DEFAULT_MODEL,
    provider: "copilot",
    usage: {
      inputTokens: Number(usage.prompt_tokens || 0),
      outputTokens: Number(usage.completion_tokens || 0),
      totalTokens,
      estimatedCostUsd: estimateCost("copilot", totalTokens),
    },
  }
}

async function callCopilotStream(prompt, model, token, onToken) {
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
      stream: true,
    }),
  })

  if (!response.ok) {
    const body = await response.text().catch(() => "")
    console.error(`[llm-service] Copilot stream API error ${response.status}:`, body)
    throw new Error("LLM provider request failed")
  }

  if (!response.body) {
    throw new Error("Copilot stream response body is empty")
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder("utf-8")
  let buffer = ""
  let output = ""
  let streamedModel = model || DEFAULT_MODEL
  let usage = null

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split("\n")
    buffer = lines.pop() || ""

    for (const rawLine of lines) {
      const line = rawLine.trim()
      if (!line || !line.startsWith("data:")) continue

      const payload = line.slice(5).trim()
      if (payload === "[DONE]") {
        break
      }

      try {
        const parsed = JSON.parse(payload)
        streamedModel = parsed?.model || streamedModel
        usage = parsed?.usage || usage
        const tokenText = parsed?.choices?.[0]?.delta?.content
        if (typeof tokenText === "string" && tokenText.length > 0) {
          output += tokenText
          onToken?.(tokenText)
        }
      } catch {
        // Ignore malformed stream lines
      }
    }
  }

  if (!output || output.trim().length === 0) {
    throw new Error("Copilot provider returned empty streamed response")
  }

  const totalTokens = Number(usage?.total_tokens || estimateTokens(prompt, output))

  return {
    text: output,
    model: streamedModel,
    provider: "copilot",
    usage: {
      inputTokens: Number(usage?.prompt_tokens || 0),
      outputTokens: Number(usage?.completion_tokens || 0),
      totalTokens,
      estimatedCostUsd: estimateCost("copilot", totalTokens),
    },
  }
}

async function callGemini(prompt, model, apiKey) {
  const selectedModel = model && model.startsWith("gemini") ? model : "gemini-2.5-flash"
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
    // L3 fix: Log detail server-side only; throw generic message to caller
    console.error(`[llm-service] Gemini API error ${response.status}:`, body)
    throw new Error("LLM provider request failed")
  }

  const data = await response.json()
  const text = extractTextFromGemini(data)
  const usageMeta = data?.usageMetadata || {}
  const totalTokens = Number(
    usageMeta.totalTokenCount ||
    (Number(usageMeta.promptTokenCount || 0) + Number(usageMeta.candidatesTokenCount || 0)) ||
    estimateTokens(prompt, text)
  )

  return {
    text,
    model: selectedModel,
    provider: "gemini",
    usage: {
      inputTokens: Number(usageMeta.promptTokenCount || 0),
      outputTokens: Number(usageMeta.candidatesTokenCount || 0),
      totalTokens,
      estimatedCostUsd: estimateCost("gemini", totalTokens),
    },
  }
}

async function callGroq(prompt, model, apiKey) {
  const selectedModel = model || process.env.GROQ_MODEL || "llama-3.3-70b-versatile"
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: selectedModel,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
      max_tokens: 4096,
    }),
  })

  if (!response.ok) {
    const body = await response.text().catch(() => "")
    console.error(`[llm-service] Groq API error ${response.status}:`, body)
    throw new Error("LLM provider request failed")
  }

  const data = await response.json()
  const text = data?.choices?.[0]?.message?.content
  if (typeof text !== "string" || text.trim().length === 0) {
    throw new Error("Groq provider returned empty response")
  }

  const usage = data?.usage || {}
  const totalTokens = Number(usage.total_tokens || estimateTokens(prompt, text))

  return {
    text,
    model: data?.model || selectedModel,
    provider: "groq",
    usage: {
      inputTokens: Number(usage.prompt_tokens || 0),
      outputTokens: Number(usage.completion_tokens || 0),
      totalTokens,
      estimatedCostUsd: estimateCost("groq", totalTokens),
    },
  }
}

// DeepSeek exposes an OpenAI-compatible Chat Completions API.
// Default base: https://api.deepseek.com (override via DEEPSEEK_BASE_URL).
// Default model: deepseek-chat (override via DEEPSEEK_MODEL or per-call `model`).
function getDeepSeekBaseUrl() {
  return (process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com").replace(/\/$/, "")
}

async function callDeepSeek(prompt, model, apiKey) {
  const selectedModel = model || process.env.DEEPSEEK_MODEL || "deepseek-chat"
  const response = await fetch(`${getDeepSeekBaseUrl()}/v1/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: selectedModel,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
      max_tokens: 4096,
    }),
  })

  if (!response.ok) {
    const body = await response.text().catch(() => "")
    console.error(`[llm-service] DeepSeek API error ${response.status}:`, body)
    throw new Error("LLM provider request failed")
  }

  const data = await response.json()
  const text = data?.choices?.[0]?.message?.content
  if (typeof text !== "string" || text.trim().length === 0) {
    throw new Error("DeepSeek provider returned empty response")
  }

  const usage = data?.usage || {}
  const totalTokens = Number(usage.total_tokens || estimateTokens(prompt, text))

  return {
    text,
    model: data?.model || selectedModel,
    provider: "deepseek",
    usage: {
      inputTokens: Number(usage.prompt_tokens || 0),
      outputTokens: Number(usage.completion_tokens || 0),
      totalTokens,
      estimatedCostUsd: estimateCost("deepseek", totalTokens),
    },
  }
}

async function callDeepSeekStream(prompt, model, apiKey, onToken) {
  const selectedModel = model || process.env.DEEPSEEK_MODEL || "deepseek-chat"
  const response = await fetch(`${getDeepSeekBaseUrl()}/v1/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: selectedModel,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
      max_tokens: 4096,
      stream: true,
    }),
  })

  if (!response.ok) {
    const body = await response.text().catch(() => "")
    console.error(`[llm-service] DeepSeek stream API error ${response.status}:`, body)
    throw new Error("LLM provider request failed")
  }
  if (!response.body) throw new Error("DeepSeek stream response body is empty")

  const reader = response.body.getReader()
  const decoder = new TextDecoder("utf-8")
  let buffer = ""
  let output = ""
  let streamedModel = selectedModel
  let usage = null

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split("\n")
    buffer = lines.pop() || ""
    for (const rawLine of lines) {
      const line = rawLine.trim()
      if (!line || !line.startsWith("data:")) continue
      const payload = line.slice(5).trim()
      if (payload === "[DONE]") break
      try {
        const parsed = JSON.parse(payload)
        streamedModel = parsed?.model || streamedModel
        usage = parsed?.usage || usage
        const tokenText = parsed?.choices?.[0]?.delta?.content
        if (typeof tokenText === "string" && tokenText.length > 0) {
          output += tokenText
          onToken?.(tokenText)
        }
      } catch {
        // ignore malformed lines
      }
    }
  }

  if (!output || output.trim().length === 0) {
    throw new Error("DeepSeek provider returned empty streamed response")
  }

  const totalTokens = Number(usage?.total_tokens || estimateTokens(prompt, output))
  return {
    text: output,
    model: streamedModel,
    provider: "deepseek",
    usage: {
      inputTokens: Number(usage?.prompt_tokens || 0),
      outputTokens: Number(usage?.completion_tokens || 0),
      totalTokens,
      estimatedCostUsd: estimateCost("deepseek", totalTokens),
    },
  }
}

export async function generateWithFallback({ prompt, model, providers }) {
  const requestedProviders = Array.isArray(providers) && providers.length > 0
    ? providers
    : ["copilot", "groq", "deepseek", "gemini"]

  const failures = []
  const copilotToken = process.env.GITHUB_COPILOT_TOKEN
    || process.env.GitHub_Models_token
    || process.env.GITHUB_MODELS_TOKEN
    || process.env.GITHUB_TOKEN
  const groqApiKey = process.env.GROQ_API_KEY
  const geminiApiKey = process.env.GEMINI_API_KEY
  const deepseekApiKey = process.env.DEEPSEEK_API_KEY

  for (const provider of requestedProviders) {
    try {
      if (provider === "copilot") {
        if (!copilotToken) throw new Error("Copilot provider not configured")
        return await callCopilot(prompt, model, copilotToken)
      }

      if (provider === "gemini") {
        if (!geminiApiKey) throw new Error("Gemini provider not configured")
        return await callGemini(prompt, model, geminiApiKey)
      }

      if (provider === "groq") {
        if (!groqApiKey) throw new Error("Groq provider not configured")
        return await callGroq(prompt, model, groqApiKey)
      }

      if (provider === "deepseek") {
        if (!deepseekApiKey) throw new Error("DeepSeek provider not configured")
        return await callDeepSeek(prompt, model, deepseekApiKey)
      }

      failures.push(`${provider}: unsupported provider`)
    } catch (error) {
      failures.push(`${provider}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  throw new Error(`All providers failed. ${failures.join(" | ")}`)
}

export async function generateWithFallbackStream({ prompt, model, providers, onToken }) {
  const requestedProviders = Array.isArray(providers) && providers.length > 0
    ? providers
    : ["copilot", "groq", "deepseek", "gemini"]

  const failures = []
  const copilotToken = process.env.GITHUB_COPILOT_TOKEN
    || process.env.GitHub_Models_token
    || process.env.GITHUB_MODELS_TOKEN
    || process.env.GITHUB_TOKEN
  const groqApiKey = process.env.GROQ_API_KEY
  const geminiApiKey = process.env.GEMINI_API_KEY
  const deepseekApiKey = process.env.DEEPSEEK_API_KEY

  for (const provider of requestedProviders) {
    try {
      if (provider === "copilot") {
        if (!copilotToken) throw new Error("Copilot provider not configured")
        return await callCopilotStream(prompt, model, copilotToken, onToken)
      }

      if (provider === "deepseek") {
        if (!deepseekApiKey) throw new Error("DeepSeek provider not configured")
        return await callDeepSeekStream(prompt, model, deepseekApiKey, onToken)
      }

      // Non-streaming fallback providers still emit a single final chunk.
      if (provider === "gemini") {
        if (!geminiApiKey) throw new Error("Gemini provider not configured")
        const result = await callGemini(prompt, model, geminiApiKey)
        onToken?.(result.text)
        return result
      }

      if (provider === "groq") {
        if (!groqApiKey) throw new Error("Groq provider not configured")
        const result = await callGroq(prompt, model, groqApiKey)
        onToken?.(result.text)
        return result
      }

      failures.push(`${provider}: unsupported provider`)
    } catch (error) {
      failures.push(`${provider}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  throw new Error(`All providers failed. ${failures.join(" | ")}`)
}
