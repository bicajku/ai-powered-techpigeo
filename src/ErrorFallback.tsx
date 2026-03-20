import { Alert, AlertTitle, AlertDescription } from "./components/ui/alert";
import { Button } from "./components/ui/button";
export const ErrorFallback = ({ error, resetErrorBoundary }: { e

export const ErrorFallback = ({ error, resetErrorBoundary }: { error: Error; resetErrorBoundary: () => void }) => {
  if (import.meta.env.DEV) throw error;

  return (
        </Alert>
        <div className="bg-card border r
          <pre className="text-xs text-destructive bg-
          </pre>
        
          onClick={resetErro
          className="w-full gap-2"
          <RefreshCwIcon clas
        </Alert>
        
        <div className="bg-card border rounded-lg p-4 mb-6">
          <h3 className="font-semibold text-sm text-muted-foreground mb-2">Error Details:</h3>
          <pre className="text-xs text-destructive bg-muted/50 p-3 rounded border overflow-auto max-h-32">

          </pre>

        

          onClick={resetErrorBoundary} 
          variant="outline"




        </Button>

    </div>

}