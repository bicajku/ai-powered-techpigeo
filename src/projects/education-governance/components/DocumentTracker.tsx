import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { AlertTriangle } from "@phosphor-icons/react"
import { GovernanceUser } from "@/projects/education-governance/types"

interface ModuleProps {
  user: GovernanceUser
}

export function DocumentTracker({ user }: ModuleProps) {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Document & Project Lifecycle Tracker</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert className="border-amber-200 bg-amber-50">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <AlertDescription className="text-sm text-amber-800">
              Module skeleton • Document registration, movement history, project milestones, audit trails
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    </div>
  )
}

export default DocumentTracker
