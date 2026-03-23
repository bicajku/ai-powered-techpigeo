import { createRoot } from "react-dom/client"
import { ErrorBoundary } from "react-error-boundary"
import { Toaster } from "sonner"
import { initializeSparkShim } from "@/lib/spark-shim"

import App from './App.tsx'
import { ErrorFallback } from './ErrorFallback.tsx'

import "./main.css"
import "./styles/theme.css"
import "./index.css"

const removeSplash = () => {
  const splash = document.getElementById("app-splash")
  if (splash) {
    splash.classList.add("fade-out")
    setTimeout(() => splash.remove(), 500)
  }
}

/** Show a minimal fallback UI when the full React app fails to mount entirely. */
const renderCriticalFallback = (message: string) => {
  const root = document.getElementById("root")
  if (root) {
    root.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:center;min-height:100vh;font-family:sans-serif;padding:1rem;background:#0f172a;color:#f1f5f9;">
        <div style="max-width:480px;text-align:center;">
          <h2 style="margin:0 0 0.5rem;font-size:1.25rem;">Unable to start the application</h2>
          <p style="color:#94a3b8;font-size:0.85rem;margin:0 0 1rem;">${message}</p>
          <button onclick="window.location.reload()" style="background:#3b82f6;color:#fff;border:none;padding:0.5rem 1.25rem;border-radius:0.375rem;cursor:pointer;font-size:0.875rem;">
            Reload page
          </button>
        </div>
      </div>`
  }
}

const bootstrap = async () => {
  // Attempt to load Spark SDK — non-fatal if it times out or is unavailable
  try {
    if (typeof window !== "undefined" && !(window as unknown as { spark?: unknown }).spark) {
      await Promise.race([
        import("@github/spark/spark"),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Spark SDK import timed out")), 4000))
      ])
    }
  } catch (e) {
    // Intentional fallback: shim provides safe defaults when Spark is unavailable
    console.warn("Spark SDK import failed or timed out, continuing with shim:", e)
  }

  initializeSparkShim()

  const rootEl = document.getElementById("root")
  if (!rootEl) {
    console.error("Root element not found — cannot mount application.")
    return
  }

  createRoot(rootEl).render(
    <ErrorBoundary FallbackComponent={ErrorFallback}>
      <Toaster position="top-right" richColors closeButton />
      <App />
    </ErrorBoundary>
  )

  removeSplash()
}

bootstrap().catch((err) => {
  console.error("Bootstrap failed:", err)
  removeSplash()
  // Render a minimal recovery UI so the user sees something instead of a blank screen
  const safeMessage = import.meta.env.DEV
    ? String(err instanceof Error ? err.message : err)
    : "Please reload the page or try again later."
  renderCriticalFallback(safeMessage)
})
