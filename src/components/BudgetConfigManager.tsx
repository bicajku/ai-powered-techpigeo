import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { toast } from "sonner"

interface BudgetLimits {
  basicMonthlyBudgetCents: number
  basicMaxSavedStrategies: number
  basicMonthlyExports: number
  proMonthlyBudgetCents: number
  proMaxSavedStrategies: number
  proMonthlyExports: number
}

const DEFAULT_BUDGET_LIMITS: BudgetLimits = {
  basicMonthlyBudgetCents: 500,
  basicMaxSavedStrategies: 20,
  basicMonthlyExports: 5,
  proMonthlyBudgetCents: 5000,
  proMaxSavedStrategies: 500,
  proMonthlyExports: 100,
}

export function BudgetConfigManager() {
  const [budgetLimits, setBudgetLimits] = useKV<BudgetLimits>("admin-budget-limits", DEFAULT_BUDGET_LIMITS)
  const [localBasicBudget, setLocalBasicBudget] = useState("5.00")
  const [localBasicStrategies, setLocalBasicStrategies] = useState("20")
    if (budgetLimits) {
      setLocalBasicStrategies(budgetLimits.basicMaxSavedStrateg
      setLocalProBudget((budgetLimits.proMonthlyBudgetCents / 100).to
      setLocalProExports(budgetLimits.proMonthlyExports.toStrin
  }, [budgetLimits])

    try {
      const strategiesV

        toast.error("Please enter a valid budget amount")
      }
      if (isNaN(strategiesValue) || strategiesValue <= 0) {
        return

     
      }

        basicMonthlyBudgetCents: Math.r
        basicMonthlyE

    } catch (error) {
      toast.error("Failed to save basic limits")
      setIsSaving(false)

  const handleSavePro = async () => {
    try {
      const st


      }
      if (isNaN(strategiesValue) || strategiesValue <= 0) {
        return


      }
      setBudgetLimits((current) => ({
        proMon
       

    } catch (error) {
      toast.error("Failed to save pro limits")
      setIsSaving(false)
  }
  const handleResetToDefaults = async () =
    toast

    <Card>
        <div classNam
            <CardTitle className="flex items-center gap-2"
              Budget & Limits Configuration
            <Ca
            </CardDescri
     
  }

  const handleSavePro = async () => {
    setIsSaving(true)
    try {
      const budgetValue = parseFloat(localProBudget)
      const strategiesValue = parseInt(localProStrategies, 10)
      const exportsValue = parseInt(localProExports, 10)

      if (isNaN(budgetValue) || budgetValue <= 0) {
        toast.error("Please enter a valid budget amount")
        return
      }

      if (isNaN(strategiesValue) || strategiesValue <= 0) {
        toast.error("Please enter a valid number of strategies")
        return
      }

      if (isNaN(exportsValue) || exportsValue <= 0) {
        toast.error("Please enter a valid number of exports")
        return
      }

      setBudgetLimits((current) => ({
        ...(current || DEFAULT_BUDGET_LIMITS),
        proMonthlyBudgetCents: Math.round(budgetValue * 100),
        proMaxSavedStrategies: strategiesValue,
        proMonthlyExports: exportsValue,
      }))

      toast.success("Pro plan limits updated successfully")
    } catch (error) {
      console.error("Failed to save pro limits:", error)
      toast.error("Failed to save pro limits")
    } finally {
      setIsSaving(false)
    }
  }

  const handleResetToDefaults = async () => {
    setBudgetLimits(DEFAULT_BUDGET_LIMITS)
    toast.success("All limits reset to default values")
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <CurrencyDollar size={24} weight="duotone" className="text-primary" />
              Budget & Limits Configuration
            </CardTitle>
            <CardDescription className="mt-2">
              Define monthly budget guardrails, strategy storage limits, and export quotas for each plan tier
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleResetToDefaults}
            className="gap-2"
          >
            <ArrowsClockwise size={16} />
            Reset Defaults
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="basic" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="basic">Free Basic Plan</TabsTrigger>
            <TabsTrigger value="pro">Pro Individual Plan</TabsTrigger>
          </TabsList>

          <TabsContent value="basic" className="space-y-6 mt-6">
            <div className="rounded-lg border border-border/60 bg-muted/30 p-4 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="basic-budget">Monthly Generation Budget (USD)</Label>
                <div className="flex items-center gap-2">
                  <span className="text-2xl text-muted-foreground">$</span>
                  <Input
                    id="basic-budget"
                    type="number"
                    step="0.01"
                    min="0"
                    value={localBasicBudget}
                    onChange={(e) => setLocalBasicBudget(e.target.value)}
                    className="text-lg font-semibold"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Maximum monthly spend on AI strategy generation for free users
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="basic-strategies">Maximum Saved Strategies</Label>
                <Input
                  id="basic-strategies"
                  type="number"
                  min="1"
                  value={localBasicStrategies}
                  onChange={(e) => setLocalBasicStrategies(e.target.value)}
                  className="text-lg font-semibold"
                />
                <p className="text-xs text-muted-foreground">
                  Maximum number of strategies free users can save
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="basic-exports">Monthly Export Quota</Label>
                <Input
                  id="basic-exports"
                  type="number"
                  min="1"
                  value={localBasicExports}
                  onChange={(e) => setLocalBasicExports(e.target.value)}
                  className="text-lg font-semibold"
                />
                <p className="text-xs text-muted-foreground">
                  Maximum PDF exports per month for free users (Word exports disabled)
                </p>
              </div>

              <Button
                onClick={handleSaveBasic}
                disabled={isSaving}
                className="w-full gap-2"
              >
                <FloppyDisk size={18} weight="bold" />
                Save Basic Plan Limits
              </Button>
            </div>

            <div className="rounded-lg bg-secondary/20 p-4">
              <h4 className="text-sm font-semibold mb-2">Current Basic Plan Features</h4>
              <ul className="space-y-1 text-xs text-muted-foreground">
                <li>• Core generation (no QA loops)</li>
                <li>• Single workflow retry</li>
                <li>• PDF exports only</li>
                <li>• Basic dashboard analytics</li>
              </ul>
            </div>
          </TabsContent>

          <TabsContent value="pro" className="space-y-6 mt-6">
            <div className="rounded-lg border border-border/60 bg-muted/30 p-4 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="pro-budget">Monthly Generation Budget (USD)</Label>
                <div className="flex items-center gap-2">
                  <span className="text-2xl text-muted-foreground">$</span>
                  <Input
                    id="pro-budget"
                    type="number"
                    step="0.01"
                    min="0"
                    value={localProBudget}
                    onChange={(e) => setLocalProBudget(e.target.value)}
                    className="text-lg font-semibold"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Maximum monthly spend on AI strategy generation for Pro users
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="pro-strategies">Maximum Saved Strategies</Label>
                <Input
                  id="pro-strategies"
                  type="number"
                  min="1"
                  value={localProStrategies}
                  onChange={(e) => setLocalProStrategies(e.target.value)}
                  className="text-lg font-semibold"
                />
                <p className="text-xs text-muted-foreground">
                  Maximum number of strategies Pro users can save
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="pro-exports">Monthly Export Quota</Label>
                <Input
                  id="pro-exports"
                  type="number"
                  min="1"
                  value={localProExports}
                  onChange={(e) => setLocalProExports(e.target.value)}
                  className="text-lg font-semibold"
                />
                <p className="text-xs text-muted-foreground">
                  Maximum exports per month for Pro users (PDF + Word formats)
                </p>
              </div>

              <Button
                onClick={handleSavePro}
                disabled={isSaving}
                className="w-full gap-2"
              >
                <FloppyDisk size={18} weight="bold" />
                Save Pro Plan Limits
              </Button>
            </div>

            <div className="rounded-lg bg-primary/10 p-4">
              <h4 className="text-sm font-semibold mb-2">Current Pro Plan Features</h4>
              <ul className="space-y-1 text-xs text-muted-foreground">
                <li>• Orchestrated workflow with QA loops</li>
                <li>• Up to 3 workflow retries</li>
                <li>• PDF + Word exports</li>
                <li>• Advanced review filters</li>
                <li>• Extended memory checkpoints (120)</li>
              </ul>
            </div>
          </TabsContent>
        </Tabs>

        <div className="mt-6 rounded-lg border border-accent/30 bg-accent/5 p-4">
          <p className="text-sm font-medium text-foreground mb-2">Budget Guardrail System</p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            These limits prevent users from exceeding their allocated monthly generation budgets. When users approach 
            their limits, they'll receive warnings and be blocked from generating new strategies once the cap is reached. 
            Limits reset monthly. Adjust these values based on your organization's AI usage policies and cost management requirements.
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
            variant="outline"
            size="sm"
            onClick={handleResetToDefaults}
            className="gap-2"
          >
            <ArrowsClockwise size={16} />
            Reset Defaults
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="basic" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="basic">Free Basic Plan</TabsTrigger>
            <TabsTrigger value="pro">Pro Individual Plan</TabsTrigger>
          </TabsList>

          <TabsContent value="basic" className="space-y-6 mt-6">
            <div className="rounded-lg border border-border/60 bg-muted/30 p-4 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="basic-budget">Monthly Generation Budget (USD)</Label>
                <div className="flex items-center gap-2">
                  <span className="text-2xl text-muted-foreground">$</span>
                  <Input
                    id="basic-budget"
                    type="number"
                    step="0.01"
                    min="0"
                    value={localBasicBudget}
                    onChange={(e) => setLocalBasicBudget(e.target.value)}
                    className="text-lg font-semibold"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Maximum monthly spend on AI strategy generation for free users
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="basic-strategies">Maximum Saved Strategies</Label>
                <Input
                  id="basic-strategies"
                  type="number"
                  min="1"
                  value={localBasicStrategies}
                  onChange={(e) => setLocalBasicStrategies(e.target.value)}
                  className="text-lg font-semibold"
                />
                <p className="text-xs text-muted-foreground">
                  Maximum number of strategies free users can save
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="basic-exports">Monthly Export Quota</Label>
                <Input
                  id="basic-exports"
                  type="number"
                  min="1"
                  value={localBasicExports}
                  onChange={(e) => setLocalBasicExports(e.target.value)}
                  className="text-lg font-semibold"
                />
                <p className="text-xs text-muted-foreground">
                  Maximum PDF exports per month for free users (Word exports disabled)
                </p>
              </div>

              <Button
                onClick={handleSaveBasic}
                disabled={isSaving}
                className="w-full gap-2"
              >
                <FloppyDisk size={18} weight="bold" />
                Save Basic Plan Limits
              </Button>
            </div>

            <div className="rounded-lg bg-secondary/20 p-4">
              <h4 className="text-sm font-semibold mb-2">Current Basic Plan Features</h4>
              <ul className="space-y-1 text-xs text-muted-foreground">
                <li>• Core generation (no QA loops)</li>
                <li>• Single workflow retry</li>
                <li>• PDF exports only</li>
                <li>• Basic dashboard analytics</li>
              </ul>
            </div>
          </TabsContent>

          <TabsContent value="pro" className="space-y-6 mt-6">
            <div className="rounded-lg border border-border/60 bg-muted/30 p-4 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="pro-budget">Monthly Generation Budget (USD)</Label>
                <div className="flex items-center gap-2">
                  <span className="text-2xl text-muted-foreground">$</span>
                  <Input
                    id="pro-budget"
                    type="number"
                    step="0.01"
                    min="0"
                    value={localProBudget}
                    onChange={(e) => setLocalProBudget(e.target.value)}
                    className="text-lg font-semibold"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Maximum monthly spend on AI strategy generation for Pro users
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="pro-strategies">Maximum Saved Strategies</Label>
                <Input
                  id="pro-strategies"
                  type="number"
                  min="1"
                  value={localProStrategies}
                  onChange={(e) => setLocalProStrategies(e.target.value)}
                  className="text-lg font-semibold"
                />
                <p className="text-xs text-muted-foreground">
                  Maximum number of strategies Pro users can save
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="pro-exports">Monthly Export Quota</Label>
                <Input
                  id="pro-exports"
                  type="number"
                  min="1"
                  value={localProExports}
                  onChange={(e) => setLocalProExports(e.target.value)}
                  className="text-lg font-semibold"
                />
                <p className="text-xs text-muted-foreground">
                  Maximum exports per month for Pro users (PDF + Word formats)
                </p>
              </div>

              <Button
                onClick={handleSavePro}
                disabled={isSaving}
                className="w-full gap-2"
              >
                <FloppyDisk size={18} weight="bold" />
                Save Pro Plan Limits
              </Button>
            </div>

            <div className="rounded-lg bg-primary/10 p-4">
              <h4 className="text-sm font-semibold mb-2">Current Pro Plan Features</h4>
              <ul className="space-y-1 text-xs text-muted-foreground">
                <li>• Orchestrated workflow with QA loops</li>
                <li>• Up to 3 workflow retries</li>
                <li>• PDF + Word exports</li>
                <li>• Advanced review filters</li>
                <li>• Extended memory checkpoints (120)</li>
              </ul>
            </div>
          </TabsContent>
        </Tabs>

        <div className="mt-6 rounded-lg border border-accent/30 bg-accent/5 p-4">
          <p className="text-sm font-medium text-foreground mb-2">Budget Guardrail System</p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            These limits prevent users from exceeding their allocated monthly generation budgets. When users approach 
            their limits, they'll receive warnings and be blocked from generating new strategies once the cap is reached. 
            Limits reset monthly. Adjust these values based on your organization's AI usage policies and cost management requirements.
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
