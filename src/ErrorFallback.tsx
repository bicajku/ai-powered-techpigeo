import { Alert, AlertTitle, AlertDescription } from "./components/ui/alert"
import { Button } from "./components/ui/button"

export const ErrorFallback = ({ 
  error, 
  resetErrorBoundary 
}: { 
  error: Error
  resetErrorBoundary: () => void 
}) => {
  if (import.meta.env.DEV) throw error

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="max-w-2xl w-full space-y-4">
        <Alert variant="destructive">
          <AlertTitle>Something went wrong</AlertTitle>
          <AlertDescription>
            An unexpected error occurred. Please try refreshing the page.
          </AlertDescription>
        </Alert>
        
        <div className="text-sm text-muted-foreground p-4 bg-muted rounded-lg">
          <pre className="whitespace-pre-wrap break-words">{error.message}</pre>
        </div>

        <div className="flex gap-4">
          <Button onClick={resetErrorBoundary} variant="default">
            Try again
          </Button>
          <Button onClick={() => window.location.reload()} variant="outline">
            Refresh page
          </Button>
        </div>
      </div>
    </div>
  )
}
