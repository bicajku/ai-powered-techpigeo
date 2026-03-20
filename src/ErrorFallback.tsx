import { Alert, AlertTitle, AlertDescription } from "./components/ui/alert"
import { Button } from "./components/ui/button"

interface ErrorFallbackProps {
  error: Error
  resetErrorBoundary: () => void
}

export function ErrorFallback({ error, resetErrorBoundary }: ErrorFallbackProps) {
  return (
    <div className="flex items-center justify-center min-h-screen bg-background p-4">
      <Alert variant="destructive">
        <AlertTitle>Something went wrong</AlertTitle>
        <AlertDescription className="space-y-4">
          <p className="font-mono text-xs break-all">{error.message}</p>
          <Button onClick={resetErrorBoundary} variant="outline" size="sm">
            Refresh page
          </Button>
        </AlertDescription>
      </Alert>
    </div>
  )
}

