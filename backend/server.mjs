import http from "node:http"
import { generateWithFallback, getProviderStatus } from "./llm-service.mjs"

const PORT = Number(process.env.PORT || 8787)
const HOST = process.env.HOST || "127.0.0.1"
const REQUIRE_AUTH =
  String(process.env.BACKEND_REQUIRE_AUTH || "false").toLowerCase() === "true"
const BACKEND_API_KEY = process.env.BACKEND_API_KEY || ""

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  })
  res.end(JSON.stringify(payload))
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = ""
    req.on("data", (chunk) => {
      data += chunk
      if (data.length > 2_000_000) {
        reject(new Error("Request body too large"))
      }
    })
    req.on("end", () => resolve(data))
    req.on("error", reject)
  })
}

function isAuthorized(req) {
  if (!REQUIRE_AUTH) return true
  if (!BACKEND_API_KEY) return false
  const provided = req.headers["x-backend-api-key"]
  return typeof provided === "string" && provided.length > 0 && provided === BACKEND_API_KEY
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`)

  if (req.method === "OPTIONS") {
    return sendJson(res, 200, { ok: true })
  }

  if (req.method === "GET" && url.pathname === "/health") {
    return sendJson(res, 200, { ok: true, service: "llm-backend", version: "phase2" })
  }

  if (req.method === "GET" && url.pathname === "/api/providers/status") {
    if (!isAuthorized(req)) {
      return sendJson(res, 401, { ok: false, error: "Unauthorized" })
    }

    return sendJson(res, 200, {
      ok: true,
      service: "llm-backend",
      version: "phase3.2",
      runtime: {
        host: HOST,
        port: PORT,
        nodeVersion: process.version,
      },
      auth: {
        required: REQUIRE_AUTH,
      },
      ...getProviderStatus(),
    })
  }

  if (req.method === "POST" && url.pathname === "/api/llm/generate") {
    if (!isAuthorized(req)) {
      return sendJson(res, 401, { error: "Unauthorized" })
    }

    try {
      const rawBody = await readBody(req)
      const body = rawBody ? JSON.parse(rawBody) : {}
      const prompt = typeof body.prompt === "string" ? body.prompt.trim() : ""
      const model = typeof body.model === "string" ? body.model : undefined
      const parseJson = Boolean(body.parseJson)
      const providers = Array.isArray(body.providers)
        ? body.providers.filter((p) => p === "copilot" || p === "gemini")
        : undefined

      if (!prompt) {
        return sendJson(res, 400, { error: "Missing required field: prompt" })
      }

      const result = await generateWithFallback({ prompt, model, providers })

      if (parseJson) {
        try {
          const parsed = JSON.parse(result.text)
          return sendJson(res, 200, {
            text: result.text,
            raw: parsed,
            provider: result.provider,
            model: result.model,
          })
        } catch {
          return sendJson(res, 200, {
            text: result.text,
            raw: result.text,
            provider: result.provider,
            model: result.model,
          })
        }
      }

      return sendJson(res, 200, {
        text: result.text,
        provider: result.provider,
        model: result.model,
      })
    } catch (error) {
      return sendJson(res, 500, {
        error: error instanceof Error ? error.message : "Unknown backend failure",
      })
    }
  }

  return sendJson(res, 404, { error: "Not found" })
})

server.listen(PORT, HOST, () => {
  console.log(`[backend] listening on http://${HOST}:${PORT}`)
})
