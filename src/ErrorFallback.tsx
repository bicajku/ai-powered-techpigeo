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

        <Button 
          onClick={resetErrorBoundary}
          variant="outline"
          className="w-full"
        >
          Try Again
        </Button>
      </div>
    </div>
  )
}
