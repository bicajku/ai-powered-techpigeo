import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useEnvConfig } from "@/hooks/use-env-config"
import { CheckCircle, XCircle, Info, Copy } from "@phosphor-icons/react"
import { toast } from "sonner"

export function EnvConfigPanel() {
  const config = useEnvConfig()

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text)
    toast.success(`${label} copied to clipboard`)
  }

  const configItems = [
    {
      section: "Database",
      items: [
        {
          label: "Neon Database",
          value: config.neonDatabaseUrl,
          configured: !!config.neonDatabaseUrl,
          critical: true,
        },
      ],
    },
    {
      section: "AI Providers",
      items: [
        {
          label: "Gemini API",
          value: config.geminiApiKey,
          configured: !!config.geminiApiKey,
          critical: true,
        },
        {
          label: "Copilot Token",
          value: config.githubCopilotToken,
          configured: !!config.githubCopilotToken,
          critical: false,
        },
      ],
    },
    {
      section: "Feature Flags",
      items: [
        {
          label: "Sentinel Brain",
          value: config.enableSentinelBrain.toString(),
          configured: true,
          critical: false,
        },
        {
          label: "NGO Module",
          value: config.enableNGOModule.toString(),
          configured: true,
          critical: false,
        },
        {
          label: "Plagiarism Checker",
          value: config.enablePlagiarismChecker.toString(),
          configured: true,
          critical: false,
        },
        {
          label: "Humanizer",
          value: config.enableHumanizer.toString(),
          configured: true,
          critical: false,
        },
      ],
    },
    {
      section: "Rate Limits",
      items: [
        {
          label: "Basic Plan Budget",
          value: `$${(config.basicPlanBudgetCents / 100).toFixed(2)}`,
          configured: true,
          critical: false,
        },
        {
          label: "Pro Plan Budget",
          value: `$${(config.proPlanBudgetCents / 100).toFixed(2)}`,
          configured: true,
          critical: false,
        },
        {
          label: "Team Plan Budget",
          value: `$${(config.teamPlanBudgetCents / 100).toFixed(2)}`,
          configured: true,
          critical: false,
        },
      ],
    },
    {
      section: "Security",
      items: [
        {
          label: "Session Timeout",
          value: `${config.sessionTimeout / 1000 / 60 / 60}h`,
          configured: true,
          critical: false,
        },
        {
          label: "Secret Salt",
          value: config.secretSalt,
          configured: true,
          critical: false,
        },
      ],
    },
    {
      section: "Development",
      items: [
        {
          label: "Debug Mode",
          value: config.sparkDebug.toString(),
          configured: true,
          critical: false,
        },
        {
          label: "Verbose Errors",
          value: config.verboseErrors.toString(),
          configured: true,
          critical: false,
        },
        {
          label: "Mock AI Responses",
          value: config.mockAIResponses.toString(),
          configured: true,
          critical: false,
        },
      ],
    },
  ]

  const criticalIssues = configItems.flatMap((section) =>
    section.items.filter((item) => item.critical && !item.configured)
  )

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Info size={24} weight="duotone" />
            Environment Configuration
          </CardTitle>
          <CardDescription>
            Runtime environment variables and feature flags. Update values in .env.local and restart the
            server.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {criticalIssues.length > 0 && (
            <div className="mb-6 rounded-lg border border-destructive/50 bg-destructive/10 p-4">
              <h4 className="font-semibold text-destructive mb-2 flex items-center gap-2">
                <XCircle size={20} weight="fill" />
                Critical Configuration Missing
              </h4>
              <ul className="text-sm text-destructive/90 space-y-1">
                {criticalIssues.map((issue, idx) => (
                  <li key={idx}>• {issue.label} is not configured</li>
                ))}
              </ul>
            </div>
          )}

          <div className="space-y-6">
            {configItems.map((section) => (
              <div key={section.section}>
                <h3 className="text-sm font-semibold text-foreground mb-3">{section.section}</h3>
                <div className="space-y-2">
                  {section.items.map((item) => (
                    <div
                      key={item.label}
                      className="flex items-center justify-between gap-4 rounded-lg border border-border/50 p-3"
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        {item.configured ? (
                          <CheckCircle size={20} weight="fill" className="text-primary shrink-0" />
                        ) : (
                          <XCircle
                            size={20}
                            weight="fill"
                            className={`shrink-0 ${item.critical ? "text-destructive" : "text-muted-foreground"}`}
                          />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-foreground">{item.label}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {item.configured
                              ? typeof item.value === "string" &&
                                (item.value.includes("postgresql://") ||
                                  item.value.length > 20)
                                ? "***CONFIGURED***"
                                : item.value
                              : "Not configured"}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {item.critical && (
                          <Badge variant={item.configured ? "default" : "destructive"}>
                            {item.configured ? "OK" : "Required"}
                          </Badge>
                        )}
                        {item.configured &&
                          typeof item.value === "string" &&
                          item.value.length > 0 &&
                          !item.value.includes("***") && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => copyToClipboard(item.value || "", item.label)}
                            >
                              <Copy size={14} />
                            </Button>
                          )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 rounded-lg border border-border/50 bg-muted/30 p-4">
            <h4 className="text-sm font-semibold text-foreground mb-2">Configuration Source</h4>
            <p className="text-xs text-muted-foreground mb-3">
              Environment variables are loaded from <code className="text-primary">.env.local</code> file at
              application startup.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const configText = JSON.stringify(config, null, 2)
                  copyToClipboard(configText, "Configuration")
                }}
              >
                <Copy size={14} className="mr-2" />
                Copy Full Config
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  window.open("/ENV_CONFIG.md", "_blank")
                }}
              >
                View Documentation
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
