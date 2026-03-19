import { useMemo } from "react"
import { motion } from "framer-motion"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { 
  ChartBar, 
  Sparkle, 
  CalendarBlank, 
  TrendUp,
  Target,
  ClockCounterClockwise
} from "@phosphor-icons/react"
import { SavedStrategy } from "@/types"

interface DashboardProps {
  strategies: SavedStrategy[]
  promptMemory: Array<{
    prompt: string
    conceptMode: string
    count: number
    lastUsedAt: number
  }>
}

interface ConceptModeStats {
  mode: string
  count: number
  percentage: number
}

const CONCEPT_MODE_LABELS: Record<string, string> = {
  auto: "Auto",
  sales: "Sales Agent & Funnel",
  ecommerce: "E-commerce Concierge",
  saas: "SaaS Onboarding",
  education: "Education Coach",
  healthcare: "Healthcare Triage",
  fintech: "Fintech Onboarding",
  ops: "Internal Ops Copilot",
}

const CONCEPT_MODE_COLORS: Record<string, string> = {
  auto: "bg-primary/20 border-primary/40 text-primary",
  sales: "bg-blue-500/20 border-blue-500/40 text-blue-700",
  ecommerce: "bg-purple-500/20 border-purple-500/40 text-purple-700",
  saas: "bg-cyan-500/20 border-cyan-500/40 text-cyan-700",
  education: "bg-green-500/20 border-green-500/40 text-green-700",
  healthcare: "bg-red-500/20 border-red-500/40 text-red-700",
  fintech: "bg-amber-500/20 border-amber-500/40 text-amber-700",
  ops: "bg-slate-500/20 border-slate-500/40 text-slate-700",
}

export function Dashboard({ strategies, promptMemory }: DashboardProps) {
  const stats = useMemo(() => {
    const totalStrategies = strategies.length
    const totalPrompts = promptMemory.reduce((sum, item) => sum + item.count, 0)
    
    const conceptModeCount: Record<string, number> = {}
    promptMemory.forEach(item => {
      const mode = item.conceptMode || "auto"
      conceptModeCount[mode] = (conceptModeCount[mode] || 0) + item.count
    })

    const conceptModeStats: ConceptModeStats[] = Object.entries(conceptModeCount)
      .map(([mode, count]) => ({
        mode,
        count,
        percentage: totalPrompts > 0 ? (count / totalPrompts) * 100 : 0,
      }))
      .sort((a, b) => b.count - a.count)

    const mostUsedMode = conceptModeStats[0]?.mode || "auto"

    const now = Date.now()
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000
    const recentStrategies = strategies.filter(s => s.timestamp >= sevenDaysAgo).length

    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000
    const monthlyStrategies = strategies.filter(s => s.timestamp >= thirtyDaysAgo).length

    const oldestStrategy = strategies.length > 0 
      ? Math.min(...strategies.map(s => s.timestamp))
      : Date.now()
    const daysSinceFirstStrategy = Math.floor((now - oldestStrategy) / (1000 * 60 * 60 * 24))

    return {
      totalStrategies,
      totalPrompts,
      conceptModeStats,
      mostUsedMode,
      recentStrategies,
      monthlyStrategies,
      daysSinceFirstStrategy,
    }
  }, [strategies, promptMemory])

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    })
  }

  const mostRecentStrategy = strategies.length > 0 
    ? strategies.reduce((latest, current) => 
        current.timestamp > latest.timestamp ? current : latest
      )
    : null

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <h2 className="text-2xl font-bold text-foreground mb-6 flex items-center gap-2">
          <ChartBar size={28} weight="duotone" className="text-primary" />
          Your Dashboard
        </h2>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
        >
          <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-primary/10">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Sparkle size={16} weight="duotone" />
                Total Strategies
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-foreground">{stats.totalStrategies}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {stats.totalPrompts} total generations
              </p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          <Card className="border-accent/30 bg-gradient-to-br from-accent/5 to-accent/10">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <TrendUp size={16} weight="duotone" />
                Recent Activity
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-foreground">{stats.recentStrategies}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Last 7 days
              </p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
        >
          <Card className="border-secondary/30 bg-gradient-to-br from-secondary/5 to-secondary/10">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <CalendarBlank size={16} weight="duotone" />
                Monthly Total
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-foreground">{stats.monthlyStrategies}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Last 30 days
              </p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
        >
          <Card className="border-muted bg-gradient-to-br from-muted/30 to-muted/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <ClockCounterClockwise size={16} weight="duotone" />
                Active Since
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-foreground">
                {stats.daysSinceFirstStrategy}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {stats.daysSinceFirstStrategy === 1 ? "day" : "days"} ago
              </p>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.5 }}
        >
          <Card>
            <CardHeader>
              <CardTitle className="text-lg font-semibold flex items-center gap-2">
                <Target size={20} weight="duotone" className="text-primary" />
                Most Used Concept Modes
              </CardTitle>
            </CardHeader>
            <CardContent>
              {stats.conceptModeStats.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No concept modes used yet. Start generating strategies!
                </p>
              ) : (
                <div className="space-y-3">
                  {stats.conceptModeStats.slice(0, 5).map((stat, index) => (
                    <div key={stat.mode} className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium text-foreground">
                          {CONCEPT_MODE_LABELS[stat.mode] || stat.mode}
                        </span>
                        <span className="text-muted-foreground">
                          {stat.count} {stat.count === 1 ? "use" : "uses"}
                        </span>
                      </div>
                      <div className="relative h-2 bg-muted rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${stat.percentage}%` }}
                          transition={{ duration: 0.8, delay: 0.6 + index * 0.1 }}
                          className={`absolute inset-y-0 left-0 rounded-full ${
                            CONCEPT_MODE_COLORS[stat.mode]?.split(" ")[0] || "bg-primary/60"
                          }`}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.6 }}
        >
          <Card>
            <CardHeader>
              <CardTitle className="text-lg font-semibold flex items-center gap-2">
                <Sparkle size={20} weight="duotone" className="text-primary" />
                Latest Strategy
              </CardTitle>
            </CardHeader>
            <CardContent>
              {mostRecentStrategy ? (
                <div className="space-y-3">
                  <div>
                    <h4 className="font-semibold text-foreground mb-1">
                      {mostRecentStrategy.name}
                    </h4>
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {mostRecentStrategy.description}
                    </p>
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-border/50">
                    <span className="text-xs text-muted-foreground">
                      Created on
                    </span>
                    <span className="text-xs font-medium text-foreground">
                      {formatDate(mostRecentStrategy.timestamp)}
                    </span>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No strategies created yet. Generate your first one!
                </p>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {stats.conceptModeStats.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.7 }}
        >
          <Card>
            <CardHeader>
              <CardTitle className="text-lg font-semibold">Concept Mode Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {stats.conceptModeStats.map((stat) => (
                  <div
                    key={stat.mode}
                    className={`px-4 py-3 rounded-lg border ${
                      CONCEPT_MODE_COLORS[stat.mode] || "bg-muted/20 border-muted text-foreground"
                    }`}
                  >
                    <div className="text-sm font-medium mb-1">
                      {CONCEPT_MODE_LABELS[stat.mode] || stat.mode}
                    </div>
                    <div className="text-2xl font-bold">{stat.count}</div>
                    <div className="text-xs opacity-80 mt-1">
                      {stat.percentage.toFixed(1)}%
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}
    </div>
  )
}
