import { createRoot } from "react-dom/client"
import { ErrorBoundary } from "react-error-boundary"
import { initializeSparkShim } f
import { initializeSparkShim } from "@/lib/spark-shim"

import "./index.css"
const removeSplash = () => {

    setTimeout(() =
}
import "./index.css"

const removeSplash = () => {
  const splash = document.getElementById("app-splash")
  if (splash) {
    splash.classList.add("fade-out")
    setTimeout(() => splash.remove(), 500)
  }
}

    if (typeof window !== "undefined" && !(window as unknown as { spark?: unknown 
      // Check both import.meta.env and process.env (
        try {
          if 
        } catch {
        }
      
                          checkEnv('VITE_GITHUB_RUNTIME_PERMANENT_NAME')
      if (hasSparkEnv) {
          import("@github/spark/spark"),
        ])
        console.inf
    }
    // Intent
   
 



  if (!
    if (typeof window !== "undefined" && !(window as unknown as { spark?: unknown }).spark) {
      // Only attempt to load Spark SDK if we're in a proper runtime environment
      const hasSparkEnv = typeof import.meta.env !== "undefined" && 
        (import.meta.env.GITHUB_RUNTIME_PERMANENT_NAME || 
         import.meta.env.VITE_GITHUB_RUNTIME_PERMANENT_NAME)
      
      if (hasSparkEnv) {
        await Promise.race([
          import("@github/spark/spark"),
          new Promise((_, reject) => setTimeout(() => reject(new Error("Spark SDK import timed out")), 4000))
        ])
      } else {
        console.info("Spark runtime environment not detected, using local shim")
      }
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


}

bootstrap().catch((err) => {
  console.error("Bootstrap failed:", err)
  removeSplash()
  // Render a minimal recovery UI so the user sees something instead of a blank screen

    ? String(err instanceof Error ? err.message : err)

  renderCriticalFallback(safeMessage)

