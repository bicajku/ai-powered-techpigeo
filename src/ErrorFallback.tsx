import { Alert, AlertTitle, AlertDescription } from "./components/ui/alert";
import { Button } from "./components/ui/button";
import { ArrowClockwise } from "@phosphor-icons/react";

export const ErrorFallback = ({ error, resetErrorBoundary }: { error: Error; resetErrorBoundary: () => void }) => {
  if (import.meta.env.DEV) throw error;

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="max-w-2xl w-full space-y-4">
        <Alert variant="destructive">
          <AlertTitle>Something went wrong</AlertTitle>
          <AlertDescription>
            An unexpected error occurred. Please try refreshing the page.
          </AlertDescription>
        </Alert>
        
        <div className="bg-card border rounded-lg p-4 mb-6">
          <h3 className="font-semibold text-sm text-muted-foreground mb-2">Error Details:</h3>
          <pre className="text-xs text-destructive bg-muted/50 p-3 rounded border overflow-auto max-h-32">
            {error.message}
          </pre>
        </div>

        <Button 
          onClick={resetErrorBoundary} 
          variant="outline"
          className="w-full gap-2"
        >
          <ArrowClockwise className="h-4 w-4" />
          Try Again
        </Button>
      </div>
    </div>
  );
}
