import { useState } from "react"
import { motion } from "framer-motion"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { useSafeKV } from "@/hooks/useSafeKV"
import { toast } from "sonner"
import { Lightning, Plus, Trash, ArrowRight, EnvelopeSimple, Globe } from "@phosphor-icons/react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export type AutomationTrigger = "on_strategy_generated" | "on_plagiarism_checked"
export type AutomationActionType = "send_email" | "webhook"

export interface AutomationAction {
  type: AutomationActionType
  target: string // email address or webhook URL
}

export interface AutomationRule {
  id: string
  name: string
  isActive: boolean
  trigger: AutomationTrigger
  action: AutomationAction
}

export function AutomationsPanel() {
  const [rules, setRules] = useSafeKV<AutomationRule[]>("user-automation-rules", [])
  const [isCreating, setIsCreating] = useState(false)
  
  const [newRuleName, setNewRuleName] = useState("")
  const [newTrigger, setNewTrigger] = useState<AutomationTrigger>("on_strategy_generated")
  const [newActionType, setNewActionType] = useState<AutomationActionType>("send_email")
  const [newActionTarget, setNewActionTarget] = useState("")

  const handleCreateRule = () => {
    if (!newRuleName || !newActionTarget) {
      toast.error("Please fill in all fields.")
      return
    }

    if (newActionType === "send_email" && !newActionTarget.includes("@")) {
      toast.error("Please enter a valid email address.")
      return
    }

    if (newActionType === "webhook" && !newActionTarget.startsWith("http")) {
      toast.error("Please enter a valid webhook URL (http/https).")
      return
    }

    const newRule: AutomationRule = {
      id: Date.now().toString(),
      name: newRuleName,
      isActive: true,
      trigger: newTrigger,
      action: {
        type: newActionType,
        target: newActionTarget
      }
    }

    setRules([...(rules || []), newRule])
    setIsCreating(false)
    setNewRuleName("")
    setNewActionTarget("")
    toast.success("Automation rule created!")
  }

  const handleDeleteRule = (id: string) => {
    setRules((rules || []).filter(r => r.id !== id))
    toast.success("Rule deleted.")
  }

  const handleToggleRule = (id: string, active: boolean) => {
    setRules((rules || []).map(r => r.id === id ? { ...r, isActive: active } : r))
  }

  const getActionIcon = (type: AutomationActionType) => {
    if (type === "send_email") return <EnvelopeSimple size={16} />
    return <Globe size={16} />
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6 max-w-4xl mx-auto"
    >
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Lightning size={28} className="text-primary" weight="duotone" />
            Workflow Automations
          </h2>
          <p className="text-muted-foreground mt-1">
            Build simple IF/THEN rules to automate your marketing tasks.
          </p>
        </div>
        {!isCreating && (
          <Button onClick={() => setIsCreating(true)} className="gap-2">
            <Plus size={16} weight="bold" />
            New Rule
          </Button>
        )}
      </div>

      {isCreating && (
        <Card className="border-primary/50 bg-primary/5">
          <CardHeader>
            <CardTitle className="text-lg">Create New Rule</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Rule Name</Label>
              <Input 
                placeholder="e.g. Notify team on new strategy" 
                value={newRuleName}
                onChange={(e) => setNewRuleName(e.target.value)}
              />
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
              <div className="md:col-span-3 space-y-2">
                <Label>IF (Trigger)</Label>
                <Select value={newTrigger} onValueChange={(v) => setNewTrigger(v as AutomationTrigger)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="on_strategy_generated">Strategy is Generated</SelectItem>
                    <SelectItem value="on_plagiarism_checked">Review is Completed</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="hidden md:flex justify-center mt-6">
                <ArrowRight size={24} className="text-muted-foreground" />
              </div>

              <div className="md:col-span-3 space-y-2">
                <Label>THEN (Action)</Label>
                <Select value={newActionType} onValueChange={(v) => setNewActionType(v as AutomationActionType)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="send_email">Send Email To</SelectItem>
                    <SelectItem value="webhook">Post to Webhook</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="md:col-span-5 space-y-2">
                <Label>Target</Label>
                <Input 
                  placeholder={newActionType === "send_email" ? "marketing@company.com" : "https://hooks.zapier.com/..."}
                  value={newActionTarget}
                  onChange={(e) => setNewActionTarget(e.target.value)}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-4 pt-4 border-t">
              <Button variant="ghost" onClick={() => setIsCreating(false)}>Cancel</Button>
              <Button onClick={handleCreateRule}>Save Rule</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-4">
        {(!rules || rules.length === 0) && !isCreating ? (
          <div className="text-center py-12 px-6 bg-card/50 rounded-xl border border-border/30">
            <Lightning size={48} weight="duotone" className="text-muted-foreground mx-auto mb-4 opacity-50" />
            <p className="text-muted-foreground">No automations configured yet.</p>
          </div>
        ) : (
          rules?.map((rule) => (
            <Card key={rule.id} className={`transition-all ${!rule.isActive ? 'opacity-60' : ''}`}>
              <CardContent className="p-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-4 flex-1">
                  <Switch 
                    checked={rule.isActive} 
                    onCheckedChange={(c) => handleToggleRule(rule.id, c)}
                  />
                  <div>
                    <h4 className="font-medium text-foreground">{rule.name}</h4>
                    <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground mt-1">
                      <span className="bg-muted px-2 py-0.5 rounded text-xs">
                        {rule.trigger === "on_strategy_generated" ? "Strategy Generated" : "Review Completed"}
                      </span>
                      <ArrowRight size={12} />
                      <span className="flex items-center gap-1 bg-muted px-2 py-0.5 rounded text-xs">
                        {getActionIcon(rule.action.type)}
                        {rule.action.type === "send_email" ? "Email" : "Webhook"}: {rule.action.target}
                      </span>
                    </div>
                  </div>
                </div>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  onClick={() => handleDeleteRule(rule.id)}
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive shrink-0"
                >
                  <Trash size={18} />
                </Button>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </motion.div>
  )
}