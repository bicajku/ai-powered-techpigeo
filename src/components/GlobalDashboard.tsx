import { useCallback, useEffect, useMemo, useState } from "react"
import { motion } from "framer-motion"
import {
  ArrowsClockwise,
  ChartBar,
  Coins,
  CurrencyDollar,
  DownloadSimple,
  TrendUp,
  Users,
  WarningCircle,
} from "@phosphor-icons/react"
import { toast } from "sonner"
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { SubscriptionPlan, UserProfile } from "@/types"
import { adminService, type GlobalAnalyticsPayload } from "@/lib/admin"
import { fetchAuthCapabilities } from "@/lib/auth-capabilities"

type PlanMetrics = Record<SubscriptionPlan, { users: number; credits: number }>

const PLAN_PRICING: Record<SubscriptionPlan, number> = {
  basic: 0,
  pro: 20,
  team: 50,
  enterprise: 0,
}

const PLAN_LABELS: Record<SubscriptionPlan, string> = {
  basic: "Basic",
  pro: "Pro",
  team: "Team",
  enterprise: "Enterprise",
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(Number(value || 0))
}

function formatCompactNumber(value: number) {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(Number(value || 0))
}

function safePercent(value: number) {
  return `${Number.isFinite(value) ? value.toFixed(1) : "0.0"}%`
}

function formatShortDay(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(date)
}

function triggerDownload(fileName: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  URL.revokeObjectURL(url)
}

function startOfTodayIso() {
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  return now.toISOString().slice(0, 10)
}

function aggregatePlanMetrics(users: UserProfile[]): PlanMetrics {
  return users.reduce<PlanMetrics>((acc, user) => {
    const plan = (user.subscription?.plan || "basic") as SubscriptionPlan
    const credits = Number(user.subscription?.proCredits || 0)
    acc[plan].users += 1
    acc[plan].credits += credits
    return acc
  }, {
    basic: { users: 0, credits: 0 },
    pro: { users: 0, credits: 0 },
    team: { users: 0, credits: 0 },
    enterprise: { users: 0, credits: 0 },
  })
}

export function GlobalDashboard() {
  const [data, setData] = useState<GlobalAnalyticsPayload | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isSentinelCommander, setIsSentinelCommander] = useState(false)

  const loadData = useCallback(async (showToast = false) => {
    if (showToast) {
      setIsRefreshing(true)
    } else {
      setIsLoading(true)
    }

    try {
      const capabilities = await fetchAuthCapabilities()
      const allowed = capabilities.isSentinelCommander === true
      setIsSentinelCommander(allowed)
      if (!allowed) {
        setData(null)
        return
      }

      const next = await adminService.getGlobalAnalytics(30)
      setData(next)
      if (showToast) {
        toast.success("Global dashboard refreshed")
      }
    } catch (error) {
      console.error("Failed to load global analytics:", error)
      toast.error("Failed to load global dashboard")
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [])

  useEffect(() => {
    void loadData(false)
  }, [loadData])

  const analytics = useMemo(() => {
    const users = data?.users || []
    const providerSummary = data?.providerSummary
    const platformStats = data?.platformStats
    const planMetrics = aggregatePlanMetrics(users)
    const totalCredits = Object.values(planMetrics).reduce((sum, item) => sum + item.credits, 0)
    const paidUsers = planMetrics.pro.users + planMetrics.team.users + planMetrics.enterprise.users
    const estimatedKnownMrr = (planMetrics.pro.users * PLAN_PRICING.pro) + (planMetrics.team.users * PLAN_PRICING.team)
    const providerCost30d = Number(providerSummary?.totals.cost || 0)
    const todayKey = startOfTodayIso()
    const todayCost = Number(providerSummary?.dailyCosts.find((entry) => String(entry.day).slice(0, 10) === todayKey)?.cost || 0)
    const last7Cost = Number((providerSummary?.dailyCosts || [])
      .slice(-7)
      .reduce((sum, entry) => sum + Number(entry.cost || 0), 0))
    const lowCreditUsers = users.filter((user) => {
      const plan = user.subscription?.plan || "basic"
      const credits = Number(user.subscription?.proCredits || 0)
      return plan !== "basic" && credits <= 5
    }).length
    const inactiveUsers30d = users.filter((user) => {
      if (!user.lastLoginAt) return true
      return user.lastLoginAt < (Date.now() - (30 * 24 * 60 * 60 * 1000))
    }).length
    const mrrCoverage = estimatedKnownMrr > 0 ? ((providerCost30d / estimatedKnownMrr) * 100) : 0
    const estimatedGrossMargin = estimatedKnownMrr - providerCost30d
    const grossMarginPercent = estimatedKnownMrr > 0 ? (estimatedGrossMargin / estimatedKnownMrr) * 100 : 0
    const billingHealth = estimatedKnownMrr > 0
      ? (providerCost30d <= estimatedKnownMrr * 0.25 ? "healthy" : providerCost30d <= estimatedKnownMrr * 0.5 ? "watch" : "risk")
      : "unknown"
    const dailyCostTrend = (providerSummary?.dailyCosts || []).slice(-14).map((entry) => ({
      day: formatShortDay(String(entry.day)),
      cost: Number(entry.cost || 0),
      requests: Number(entry.requests || 0),
    }))
    const planDistribution = (["basic", "pro", "team", "enterprise"] as SubscriptionPlan[]).map((plan) => ({
      plan: PLAN_LABELS[plan],
      users: planMetrics[plan].users,
      credits: planMetrics[plan].credits,
      revenue: planMetrics[plan].users * PLAN_PRICING[plan],
    }))

    return {
      users,
      providerSummary,
      platformStats,
      planMetrics,
      totalCredits,
      paidUsers,
      estimatedKnownMrr,
      providerCost30d,
      todayCost,
      last7Cost,
      lowCreditUsers,
      inactiveUsers30d,
      mrrCoverage,
      estimatedGrossMargin,
      grossMarginPercent,
      billingHealth,
      dailyCostTrend,
      planDistribution,
      topProviders: (providerSummary?.byProvider || []).slice(0, 5),
      topModules: (providerSummary?.byModule || []).slice(0, 5),
    }
  }, [data])

  const exportCsv = useCallback(() => {
    const rows = [
      ["metric", "value"],
      ["platform_users", String(analytics.users.length)],
      ["allocated_credits", String(analytics.totalCredits)],
      ["estimated_known_mrr_usd", analytics.estimatedKnownMrr.toFixed(2)],
      ["provider_cost_30d_usd", analytics.providerCost30d.toFixed(2)],
      ["estimated_gross_margin_usd", analytics.estimatedGrossMargin.toFixed(2)],
      ["gross_margin_percent", analytics.grossMarginPercent.toFixed(2)],
      ["low_credit_users", String(analytics.lowCreditUsers)],
      ["inactive_users_30d", String(analytics.inactiveUsers30d)],
    ]
    const providerRows = analytics.topProviders.map((item) => [
      `provider:${item.provider}:${item.kind}`,
      JSON.stringify({ requests: item.requests, tokens: item.tokens, cost: item.cost }),
    ])
    const moduleRows = analytics.topModules.map((item) => [
      `module:${item.moduleName}`,
      JSON.stringify({ requests: item.requests, events: item.events, cost: item.cost }),
    ])
    const csv = rows.concat(providerRows, moduleRows)
      .map((row) => row.map((field) => `"${String(field).replace(/"/g, '""')}"`).join(","))
      .join("\n")
    triggerDownload(`global-dashboard-${new Date().toISOString().slice(0, 10)}.csv`, csv, "text/csv")
    toast.success("CSV export downloaded")
  }, [analytics])

  const exportJson = useCallback(() => {
    const payload = {
      exportedAt: new Date().toISOString(),
      summary: {
        platformUsers: analytics.users.length,
        allocatedCredits: analytics.totalCredits,
        estimatedKnownMrrUsd: analytics.estimatedKnownMrr,
        providerCost30dUsd: analytics.providerCost30d,
        estimatedGrossMarginUsd: analytics.estimatedGrossMargin,
        grossMarginPercent: analytics.grossMarginPercent,
        lowCreditUsers: analytics.lowCreditUsers,
        inactiveUsers30d: analytics.inactiveUsers30d,
      },
      planDistribution: analytics.planDistribution,
      topProviders: analytics.topProviders,
      topModules: analytics.topModules,
      dailyCostTrend: analytics.dailyCostTrend,
    }
    triggerDownload(`global-dashboard-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(payload, null, 2), "application/json")
    toast.success("JSON export downloaded")
  }, [analytics])

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-36 rounded-2xl border border-border/60 bg-card/60 animate-pulse" />
          ))}
        </div>
        <div className="h-72 rounded-2xl border border-border/60 bg-card/60 animate-pulse" />
      </div>
    )
  }

  if (!isSentinelCommander) {
    return (
      <Card className="border-amber-500/30 bg-amber-500/5">
        <CardHeader>
          <CardTitle>Restricted Access</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Only Sentinel Commander can access the Global Dashboard analytics view.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"
      >
        <div>
          <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <ChartBar size={28} weight="duotone" className="text-primary" />
            Global Dashboard
          </h2>
          <p className="mt-1 text-sm text-muted-foreground max-w-3xl">
            Cross-platform analytics for all users, credits, AI cost, and estimated billing health.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline">30-day analytics</Badge>
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={exportCsv}
          >
            <DownloadSimple size={16} weight="bold" />
            CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={exportJson}
          >
            <DownloadSimple size={16} weight="bold" />
            JSON
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => void loadData(true)}
            disabled={isRefreshing}
          >
            <ArrowsClockwise size={16} weight="bold" className={isRefreshing ? "animate-spin" : ""} />
            {isRefreshing ? "Refreshing..." : "Refresh"}
          </Button>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <Card className="border-primary/20 bg-gradient-to-br from-primary/5 via-card to-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2"><Users size={16} />Platform Users</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold">{formatCompactNumber(analytics.users.length)}</div>
            <p className="mt-2 text-xs text-muted-foreground">
              {formatCompactNumber(Number(analytics.platformStats?.recentLogins7d || 0))} logins in the last 7 days
            </p>
          </CardContent>
        </Card>

        <Card className="border-amber-500/20 bg-gradient-to-br from-amber-500/5 via-card to-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2"><Coins size={16} />Allocated Credits</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold">{formatCompactNumber(analytics.totalCredits)}</div>
            <p className="mt-2 text-xs text-muted-foreground">
              {analytics.paidUsers} paid users, {analytics.lowCreditUsers} at or below 5 credits
            </p>
          </CardContent>
        </Card>

        <Card className="border-emerald-500/20 bg-gradient-to-br from-emerald-500/5 via-card to-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2"><CurrencyDollar size={16} />Estimated Known MRR</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold">{formatCurrency(analytics.estimatedKnownMrr)}</div>
            <p className="mt-2 text-xs text-muted-foreground">
              Pro + Team only. Enterprise billing remains custom.
            </p>
          </CardContent>
        </Card>

        <Card className="border-rose-500/20 bg-gradient-to-br from-rose-500/5 via-card to-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2"><TrendUp size={16} />AI Cost Pressure</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold">{formatCurrency(analytics.providerCost30d)}</div>
            <p className="mt-2 text-xs text-muted-foreground">
              30-day provider cost, {safePercent(analytics.mrrCoverage)} of known MRR
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.2fr_0.8fr] gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Plan Mix And Credit Exposure</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {(["basic", "pro", "team", "enterprise"] as SubscriptionPlan[]).map((plan) => {
              const users = analytics.planMetrics[plan].users
              const credits = analytics.planMetrics[plan].credits
              const pct = analytics.users.length > 0 ? (users / analytics.users.length) * 100 : 0
              return (
                <div key={plan} className="space-y-2">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <div className="flex items-center gap-2">
                      <Badge variant={plan === "basic" ? "secondary" : "default"}>{PLAN_LABELS[plan]}</Badge>
                      <span className="text-muted-foreground">{users} users</span>
                    </div>
                    <span className="text-muted-foreground">{credits} credits</span>
                  </div>
                  <div className="h-2 rounded-full bg-secondary/60 overflow-hidden">
                    <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.max(pct, 2)}%` }} />
                  </div>
                </div>
              )
            })}

            <div className="rounded-xl border border-border/60 bg-secondary/20 p-4 grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
              <div>
                <p className="text-muted-foreground">Today AI cost</p>
                <p className="text-lg font-semibold">{formatCurrency(analytics.todayCost)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Last 7 days AI cost</p>
                <p className="text-lg font-semibold">{formatCurrency(analytics.last7Cost)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Inactive users 30d</p>
                <p className="text-lg font-semibold">{analytics.inactiveUsers30d}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Estimated Billing Snapshot</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="rounded-xl border border-border/60 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-muted-foreground">Estimated gross margin</p>
                  <p className="mt-1 text-lg font-semibold">{formatCurrency(analytics.estimatedGrossMargin)}</p>
                </div>
                <Badge variant={analytics.billingHealth === "healthy" ? "default" : analytics.billingHealth === "watch" ? "secondary" : "destructive"}>
                  {analytics.billingHealth === "healthy" ? "Healthy" : analytics.billingHealth === "watch" ? "Watch" : analytics.billingHealth === "risk" ? "Risk" : "Unknown"}
                </Badge>
              </div>
              <p className="mt-2 text-muted-foreground">Provider cost is {safePercent(analytics.mrrCoverage)} of known monthly revenue, leaving an estimated margin of {safePercent(analytics.grossMarginPercent)}.</p>
            </div>
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
              <div className="flex items-start gap-3">
                <WarningCircle size={18} className="mt-0.5 text-amber-700" />
                <div>
                  <p className="font-medium">Billing is estimated, not invoiced revenue</p>
                  <p className="mt-1 text-muted-foreground">
                    Pro and Team plans use fixed list prices. Enterprise revenue is excluded because custom pricing is not stored in the current schema.
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-xl border border-border/60 p-4">
              <p className="text-muted-foreground">Subscription totals</p>
              <p className="mt-1 text-lg font-semibold">{analytics.platformStats?.subscriptions?.active || 0} active of {analytics.platformStats?.subscriptions?.total || 0}</p>
            </div>
            <div className="rounded-xl border border-border/60 p-4">
              <p className="text-muted-foreground">Organizations</p>
              <p className="mt-1 text-lg font-semibold">{analytics.platformStats?.organizations?.total || 0}</p>
            </div>
            <div className="rounded-xl border border-border/60 p-4">
              <p className="text-muted-foreground">NGO reports</p>
              <p className="mt-1 text-lg font-semibold">{analytics.platformStats?.reports?.total || 0}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Daily AI Cost Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={analytics.dailyCostTrend} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="costGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--brand-primary)" stopOpacity={0.45} />
                      <stop offset="100%" stopColor="var(--brand-primary)" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="day" tickLine={false} axisLine={false} fontSize={12} />
                  <YAxis tickLine={false} axisLine={false} fontSize={12} tickFormatter={(value) => `$${value}`} />
                  <Tooltip formatter={(value: number) => [formatCurrency(Number(value)), "Cost"]} />
                  <Area type="monotone" dataKey="cost" stroke="var(--brand-primary)" fill="url(#costGradient)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Plan Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={analytics.planDistribution} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="plan" tickLine={false} axisLine={false} fontSize={12} />
                  <YAxis tickLine={false} axisLine={false} fontSize={12} allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="users" fill="var(--brand-primary)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Top Providers By Cost</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Provider</TableHead>
                    <TableHead>Requests</TableHead>
                    <TableHead>Tokens</TableHead>
                    <TableHead className="text-right">Cost</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {analytics.topProviders.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground py-8">No provider usage data yet</TableCell>
                    </TableRow>
                  ) : analytics.topProviders.map((provider) => (
                    <TableRow key={`${provider.provider}-${provider.kind}`}>
                      <TableCell>
                        <div className="font-medium capitalize">{provider.provider}</div>
                        <div className="text-xs text-muted-foreground capitalize">{provider.kind}</div>
                      </TableCell>
                      <TableCell>{formatCompactNumber(provider.requests)}</TableCell>
                      <TableCell>{formatCompactNumber(provider.tokens)}</TableCell>
                      <TableCell className="text-right font-medium">{formatCurrency(provider.cost)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top Modules By Cost</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Module</TableHead>
                    <TableHead>Requests</TableHead>
                    <TableHead>Events</TableHead>
                    <TableHead className="text-right">Cost</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {analytics.topModules.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground py-8">No module usage data yet</TableCell>
                    </TableRow>
                  ) : analytics.topModules.map((moduleEntry) => (
                    <TableRow key={moduleEntry.moduleName}>
                      <TableCell className="font-medium">{moduleEntry.moduleName}</TableCell>
                      <TableCell>{formatCompactNumber(moduleEntry.requests)}</TableCell>
                      <TableCell>{formatCompactNumber(moduleEntry.events)}</TableCell>
                      <TableCell className="text-right font-medium">{formatCurrency(moduleEntry.cost)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}