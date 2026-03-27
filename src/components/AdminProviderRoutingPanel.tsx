import { useCallback, useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ArrowsClockwise, FloppyDisk } from "@phosphor-icons/react"
import { toast } from "sonner"
import {
  fetchProviderRouting,
  fetchProviderUsage,
  saveProviderRouting,
  type ProviderRoutingConfig,
} from "@/lib/provider-routing"

const MODULES = [
  { value: "global", label: "Global" },
  { value: "rag_chat", label: "AI Chat" },
  { value: "ngo_module", label: "NGO SaaS" },
  { value: "idea-generation", label: "Ideas" },
  { value: "humanizer", label: "Humanizer" },
]

const GEN_PROVIDERS = ["copilot", "groq", "spark", "gemini", "sentinel"]
const WEB_PROVIDERS = ["searchcans", "serpapi", "duckduckgo", "sentinel"]

function parseOrder(value: string, allowed: string[]) {
  const cleaned = value
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .filter((s, idx, arr) => arr.indexOf(s) === idx)
    .filter((s) => allowed.includes(s))
  return cleaned
}

export function AdminProviderRoutingPanel() {
  const [moduleName, setModuleName] = useState("global")
  const [config, setConfig] = useState<ProviderRoutingConfig | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [usage, setUsage] = useState<{ cost: number; requests: number; errors: number } | null>(null)

  const [providerOrderInput, setProviderOrderInput] = useState("copilot, groq, spark, gemini, sentinel")
  const [webOrderInput, setWebOrderInput] = useState("searchcans, serpapi, duckduckgo, sentinel")

  const canSave = useMemo(() => {
    if (!config) return false
    return providerOrderInput.trim().length > 0 && webOrderInput.trim().length > 0
  }, [config, providerOrderInput, webOrderInput])

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const configs = await fetchProviderRouting(moduleName)
      const loaded = configs[0] || {
        moduleName,
        providerOrder: ["copilot", "groq", "spark", "gemini", "sentinel"],
        webProviderOrder: ["searchcans", "serpapi", "duckduckgo", "sentinel"],
        enabledProviders: { copilot: true, groq: true, spark: true, gemini: true, sentinel: true },
        enabledWebProviders: { searchcans: true, serpapi: true, duckduckgo: true, sentinel: true },
        dailyBudgetUsd: 25,
        monthlyBudgetUsd: 300,
        providerDailyCaps: {},
        timeoutMs: 30000,
      }
      setConfig(loaded)
      setProviderOrderInput((loaded.providerOrder || []).join(", "))
      setWebOrderInput((loaded.webProviderOrder || []).join(", "))

      const usageResp = await fetchProviderUsage(30, moduleName)
      setUsage({
        cost: usageResp.summary.totals.cost,
        requests: usageResp.summary.totals.requests,
        errors: usageResp.summary.totals.errors,
      })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load provider routing")
    } finally {
      setLoading(false)
    }
  }, [moduleName])

  useEffect(() => {
    void reload()
  }, [reload])

  const toggleProvider = (name: string, web = false) => {
    if (!config) return
    if (web) {
      setConfig({
        ...config,
        enabledWebProviders: {
          ...config.enabledWebProviders,
          [name]: !config.enabledWebProviders?.[name],
        },
      })
      return
    }
    setConfig({
      ...config,
      enabledProviders: {
        ...config.enabledProviders,
        [name]: !config.enabledProviders?.[name],
      },
    })
  }

  const save = async () => {
    if (!config) return
    setSaving(true)
    try {
      const payload: ProviderRoutingConfig = {
        ...config,
        moduleName,
        providerOrder: parseOrder(providerOrderInput, GEN_PROVIDERS),
        webProviderOrder: parseOrder(webOrderInput, WEB_PROVIDERS),
      }
      const saved = await saveProviderRouting(payload)
      setConfig(saved)
      setProviderOrderInput(saved.providerOrder.join(", "))
      setWebOrderInput(saved.webProviderOrder.join(", "))
      toast.success("Provider routing updated")
      await reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save routing")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2">
          <span>Provider Routing & Budgets</span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => void reload()} disabled={loading}>
              <ArrowsClockwise size={14} className={loading ? "animate-spin" : ""} />
              Refresh
            </Button>
            <Button size="sm" onClick={save} disabled={!canSave || saving}>
              <FloppyDisk size={14} />
              Save
            </Button>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="space-y-1">
            <Label>Module</Label>
            <Select value={moduleName} onValueChange={setModuleName}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MODULES.map((mod) => (
                  <SelectItem key={mod.value} value={mod.value}>{mod.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Daily Budget (USD)</Label>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={config?.dailyBudgetUsd ?? 0}
              onChange={(e) => setConfig((prev) => prev ? { ...prev, dailyBudgetUsd: Number(e.target.value || 0) } : prev)}
            />
          </div>
          <div className="space-y-1">
            <Label>Monthly Budget (USD)</Label>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={config?.monthlyBudgetUsd ?? 0}
              onChange={(e) => setConfig((prev) => prev ? { ...prev, monthlyBudgetUsd: Number(e.target.value || 0) } : prev)}
            />
          </div>
        </div>

        <div className="space-y-1">
          <Label>Generation Priority (comma-separated)</Label>
          <Input
            value={providerOrderInput}
            onChange={(e) => setProviderOrderInput(e.target.value)}
            placeholder="copilot, groq, spark, gemini, sentinel"
          />
        </div>

        <div className="space-y-1">
          <Label>Web Search Priority (comma-separated)</Label>
          <Input
            value={webOrderInput}
            onChange={(e) => setWebOrderInput(e.target.value)}
            placeholder="searchcans, serpapi, duckduckgo, sentinel"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-2 rounded-lg border p-3">
            <p className="text-sm font-medium">Generation Providers</p>
            <div className="flex flex-wrap gap-2">
              {GEN_PROVIDERS.map((provider) => (
                <Button
                  key={provider}
                  size="sm"
                  variant={config?.enabledProviders?.[provider] !== false ? "default" : "outline"}
                  onClick={() => toggleProvider(provider, false)}
                >
                  {provider}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-2 rounded-lg border p-3">
            <p className="text-sm font-medium">Web Providers</p>
            <div className="flex flex-wrap gap-2">
              {WEB_PROVIDERS.map((provider) => (
                <Button
                  key={provider}
                  size="sm"
                  variant={config?.enabledWebProviders?.[provider] !== false ? "default" : "outline"}
                  onClick={() => toggleProvider(provider, true)}
                >
                  {provider}
                </Button>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">30d Cost</p>
            <p className="text-lg font-semibold">${usage?.cost?.toFixed(2) || "0.00"}</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">30d Requests</p>
            <p className="text-lg font-semibold">{usage?.requests || 0}</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">30d Errors</p>
            <p className="text-lg font-semibold">{usage?.errors || 0}</p>
          </div>
        </div>

        {config?.updatedAt ? (
          <Badge variant="outline">
            Updated {new Date(config.updatedAt).toLocaleString()} {config.updatedBy ? `by ${config.updatedBy}` : ""}
          </Badge>
        ) : null}
      </CardContent>
    </Card>
  )
}
