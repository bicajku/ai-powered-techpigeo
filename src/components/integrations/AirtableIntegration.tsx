import { useState, useEffect } from "react"
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { useSafeKV } from "@/hooks/useSafeKV"
import { toast } from "sonner"
import { Database, Link, ArrowsClockwise, Trash } from "@phosphor-icons/react"
import { motion } from "framer-motion"

export interface AirtableConfig {
  pat: string
  baseId: string
  tableName: string
}

export function AirtableIntegration() {
  const [config, setConfig] = useSafeKV<AirtableConfig | null>("airtable-config", null)
  const [syncedContext, setSyncedContext] = useSafeKV<string | null>("airtable-synced-context", null)
  
  const [pat, setPat] = useState("")
  const [baseId, setBaseId] = useState("")
  const [tableName, setTableName] = useState("")
  
  const [isSyncing, setIsSyncing] = useState(false)

  // Load config on mount
  useEffect(() => {
    if (config) {
      setPat(config.pat || "")
      setBaseId(config.baseId || "")
      setTableName(config.tableName || "")
    }
  }, [config])

  const handleSaveConfig = () => {
    if (!pat || !baseId || !tableName) {
      toast.error("Please fill in all Airtable configuration fields.")
      return
    }
    setConfig({ pat, baseId, tableName })
    toast.success("Airtable configuration saved!")
  }

  const handleSync = async () => {
    if (!pat || !baseId || !tableName) {
      toast.error("Please save your configuration first.")
      return
    }

    setIsSyncing(true)
    try {
      // Direct REST API call to Airtable
      const response = await fetch(`https://api.airtable.com/v0/${baseId}/${tableName}`, {
        headers: {
          Authorization: `Bearer ${pat}`,
          "Content-Type": "application/json"
        }
      })

      if (!response.ok) {
        throw new Error(`Airtable API error: ${response.status} ${response.statusText}`)
      }

      const data = await response.json()
      
      if (data.records && Array.isArray(data.records)) {
        // Format the records into a readable string context
        const formattedContext = data.records.map((r: any) => {
          return `Record ID: ${r.id}\nFields: ${JSON.stringify(r.fields, null, 2)}`
        }).join("\n\n")

        setSyncedContext(formattedContext)
        toast.success(`Successfully synced ${data.records.length} records from Airtable.`)
      } else {
        throw new Error("Invalid response format from Airtable")
      }
    } catch (error) {
      console.error("Airtable sync error:", error)
      toast.error(`Failed to sync Airtable: ${error instanceof Error ? error.message : "Unknown error"}`)
    } finally {
      setIsSyncing(false)
    }
  }

  const handleClear = () => {
    setConfig(null)
    setSyncedContext(null)
    setPat("")
    setBaseId("")
    setTableName("")
    toast.success("Airtable integration cleared.")
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6 max-w-2xl mx-auto"
    >
      <Card className="border-border/50 bg-card/50 backdrop-blur-sm shadow-xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <Database size={24} className="text-primary" weight="duotone" />
            Airtable Integration
          </CardTitle>
          <CardDescription>
            Connect your Airtable base to inject live tabular data as background context for your AI marketing strategies.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Personal Access Token (PAT)</label>
            <Input 
              type="password"
              placeholder="patXXXXXXXXXXXXXXXXX..." 
              value={pat}
              onChange={(e) => setPat(e.target.value)}
              className="bg-background/50"
            />
            <p className="text-xs text-muted-foreground">Needs `data.records:read` scope.</p>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Base ID</label>
              <Input 
                placeholder="appXXXXXXXXXXXXXX" 
                value={baseId}
                onChange={(e) => setBaseId(e.target.value)}
                className="bg-background/50"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Table Name or ID</label>
              <Input 
                placeholder="tblXXXXXXXXXXXXXX or 'Leads'" 
                value={tableName}
                onChange={(e) => setTableName(e.target.value)}
                className="bg-background/50"
              />
            </div>
          </div>

          {syncedContext && (
            <div className="mt-6 p-4 rounded-lg bg-green-500/10 border border-green-500/20">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-green-600 dark:text-green-400">
                  Status: Synced and Ready
                </span>
                <span className="text-xs text-muted-foreground">
                  Approx {Math.round(syncedContext.length / 4)} tokens of context
                </span>
              </div>
            </div>
          )}
        </CardContent>
        <CardFooter className="flex flex-wrap gap-3 border-t border-border/50 pt-6">
          <Button onClick={handleSaveConfig} variant="secondary" className="gap-2">
            <Link size={16} />
            Save Config
          </Button>
          <Button 
            onClick={handleSync} 
            disabled={isSyncing || !pat}
            className="gap-2"
          >
            <ArrowsClockwise size={16} className={isSyncing ? "animate-spin" : ""} />
            {isSyncing ? "Syncing..." : "Sync Context"}
          </Button>
          
          <div className="flex-1" />
          
          {(config || syncedContext) && (
            <Button onClick={handleClear} variant="ghost" className="gap-2 text-destructive hover:text-destructive hover:bg-destructive/10">
              <Trash size={16} />
              Clear
            </Button>
          )}
        </CardFooter>
      </Card>
    </motion.div>
  )
}
