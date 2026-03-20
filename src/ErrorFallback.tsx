import { Alert, AlertTitle, AlertDescription } from "./components/ui/alert";
import { ArrowClockwise } from "@phosphor-icons/
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
        
            {error.message}
        </div>
        <Button 
          variant="outline"
        >
          Try 

  );







      </div>
    </div>
  );
}
