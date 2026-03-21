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
  if (typeof window !== "undefined" && !(window as unknown as { spark?: unknown }).spark) {
    await import("@github/spark/spark")
  }

  initializeSparkShim()

  createRoot(document.getElementById("root")!).render(
    <ErrorBoundary FallbackComponent={ErrorFallback}>
      <Toaster position="top-right" richColors closeButton />
      <App />
    </ErrorBoundary>
  )
}

bootstrap()
