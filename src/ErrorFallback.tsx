import { Alert, AlertTitle, AlertDescription } from "./components/ui/alert"
import { Button } from "./components/ui/button"

interface ErrorFallbackProps {
  error: Error
  resetErrorBoundary: () => void
}

export function ErrorFallback({ error, resetErrorBoundary }: ErrorFallbackProps) {
  // Only expose raw error details in development to avoid leaking internals in production
  const isDev = import.meta.env.DEV
  const errorMessage = isDev ? error.message : "An unexpected error occurred."

  const handleReload = () => {
    // Reset the boundary first, then do a hard reload as a final safety net
    resetErrorBoundary()
    window.location.reload()
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-background p-4">
      <Alert variant="destructive" className="max-w-lg">
        <AlertTitle>Something went wrong</AlertTitle>
        <AlertDescription className="space-y-4">
          {/* Show technical details only in dev; masked message in production */}
          <p className="font-mono text-xs break-all">{errorMessage}</p>
          <div className="flex gap-2">
            <Button onClick={resetErrorBoundary} variant="outline" size="sm">
              Try again
            </Button>
            <Button onClick={handleReload} variant="default" size="sm">
              Reload page
            </Button>
          </div>
        </AlertDescription>
      </Alert>
    </div>
  )
}

