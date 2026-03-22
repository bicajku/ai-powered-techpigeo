const COPILOT_TOKEN_KEY = "sentinel-copilot-token"

function getStoredToken(): string | null {
  try {
    return localStorage.getItem(COPILOT_TOKEN_KEY)
  } catch {
    return null
  }
}

export function setCopilotToken(token: string): void {
  try {
    localStorage.setItem(COPILOT_TOKEN_KEY, token)
  } catch {
    console.warn("Failed to store Copilot token")
  }
}

export function isCopilotConfigured(): boolean {
  return !!getStoredToken()
}

interface CopilotMessage {
  role: "system" | "user" | "assistant"
  content: string
}

interface CopilotChoice {
  message: { role: string; content: string }
  finish_reason: string
}

interface CopilotResponse {
  choices: CopilotChoice[]
  model: string
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number }
}

export async function copilotChat(
  messages: CopilotMessage[],
  options?: { model?: string; temperature?: number; maxTokens?: number }
): Promise<{ text: string; model: string }> {
  const token = getStoredToken()
  if (!token) {
    throw new Error("Copilot token not configured. Go to Admin → Settings to add it.")
  }

  const response = await fetch("https://models.inference.ai.azure.com/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: options?.model ?? "gpt-4o",
      messages,
      temperature: options?.temperature ?? 0.4,
      max_tokens: options?.maxTokens ?? 4096,
    }),
  })

  if (!response.ok) {
    const errText = await response.text().catch(() => "Unknown error")
    throw new Error(`Copilot API error ${response.status}: ${errText}`)
  }

  const data = (await response.json()) as CopilotResponse

  if (!data.choices?.[0]?.message?.content) {
    throw new Error("Empty response from Copilot API")
  }

  return {
    text: data.choices[0].message.content,
    model: data.model,
  }
}

export async function copilotGenerate(
  prompt: string,
  options?: { systemPrompt?: string; model?: string }
): Promise<string> {
  const messages: CopilotMessage[] = []

  if (options?.systemPrompt) {
    messages.push({ role: "system", content: options.systemPrompt })
  } else {
    messages.push({
      role: "system",
      content:
        "You are Sentinel AI, an expert assistant for code analysis, technical documentation, repository understanding, and software architecture. Provide clear, actionable responses.",
    })
  }

  messages.push({ role: "user", content: prompt })

  const result = await copilotChat(messages, { model: options?.model })
  return result.text
}

export async function copilotCodeAnalysis(
  code: string,
  question: string
): Promise<string> {
  return copilotGenerate(`Analyze this code and answer the question.\n\nCode:\n\`\`\`\n${code}\n\`\`\`\n\nQuestion: ${question}`, {
    systemPrompt:
      "You are an expert code reviewer. Analyze code for quality, security, performance, and architecture. Be specific and actionable.",
  })
}

export async function copilotRepoSummary(repoUrl: string): Promise<string> {
  return copilotGenerate(
    `Analyze this GitHub repository and provide a structured summary covering: purpose, tech stack, architecture, key features, and notable patterns.\n\nRepository: ${repoUrl}`,
    {
      systemPrompt:
        "You are an expert at analyzing software repositories. Provide concise, structured summaries focused on architecture, patterns, and key decisions.",
    }
  )
}

export async function testCopilotConnection(): Promise<{ ok: boolean; error?: string }> {
  try {
    const result = await copilotChat(
      [
        { role: "system", content: "Respond with exactly: OK" },
        { role: "user", content: "ping" },
      ],
      { maxTokens: 10 }
    )
    return { ok: result.text.toLowerCase().includes("ok") }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Copilot connection failed" }
  }
}
