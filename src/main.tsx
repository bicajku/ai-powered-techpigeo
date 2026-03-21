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

const bootstrap = async () => {
  try {
    if (typeof window !== "undefined" && !(window as unknown as { spark?: unknown }).spark) {
      await Promise.race([
        import("@github/spark/spark"),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Spark SDK import timed out")), 4000))
      ])
    }
  } catch (e) {
    console.warn("Spark SDK import failed or timed out, continuing with shim:", e)
  }

  initializeSparkShim()

  createRoot(document.getElementById("root")!).render(
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
})
