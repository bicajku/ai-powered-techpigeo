import { createRoot } from "react-dom/client"
import { ErrorBoundary } from "react-error-boundary"
import { Toaster } from "sonner"
import { initializeSparkShim } from "@/lib/spark-shim"

import App from './App.tsx'
import { ErrorFallback } from './ErrorFallback.tsx'

import "./main.css"
import "./styles/theme.css"
import "./index.css"

const bootstrap = async () => {
  try {
    if (typeof window !== "undefined" && !(window as unknown as { spark?: unknown }).spark) {
      await import("@github/spark/spark")
    }
  } catch (e) {
    console.warn("Spark SDK import failed, continuing with shim:", e)
  }

  initializeSparkShim()

  createRoot(document.getElementById("root")!).render(
    <ErrorBoundary FallbackComponent={ErrorFallback}>
      <Toaster position="top-right" richColors closeButton />
      <App />
    </ErrorBoundary>
  )

  // Fade out and remove splash screen
  const splash = document.getElementById("app-splash")
  if (splash) {
    splash.classList.add("fade-out")
    setTimeout(() => splash.remove(), 500)
  }
}

// Safety net: remove splash after 8 seconds no matter what
setTimeout(() => {
  const splash = document.getElementById("app-splash")
  if (splash) {
    splash.classList.add("fade-out")
    setTimeout(() => splash.remove(), 500)
  }
}, 8000)

bootstrap().catch((err) => {
  console.error("Bootstrap failed:", err)
  const splash = document.getElementById("app-splash")
  if (splash) {
    splash.classList.add("fade-out")
    setTimeout(() => splash.remove(), 500)
  }
})
