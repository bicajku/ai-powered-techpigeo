/**
 * Environment variable configuration and validation for Spark runtime.
 * 
 * This module provides type-safe access to environment variables with
 * validation, defaults, and fallback logic. All variables are prefixed
 * with VITE_ to ensure they're bundled by Vite.
 */

export interface EnvConfig {
  // Database
  neonDatabaseUrl: string | null
  
  // AI Providers
  geminiApiKey: string | null
  githubCopilotToken: string | null
  
  // Spark Runtime
  sparkAppId: string
  sparkDebug: boolean
  
  // Feature Flags
  enableSentinelBrain: boolean
  enableNGOModule: boolean
  enablePlagiarismChecker: boolean
  enableHumanizer: boolean
  
  // Security
  secretSalt: string
  sessionTimeout: number
  
  // Rate Limiting
  basicPlanBudgetCents: number
  proPlanBudgetCents: number
  teamPlanBudgetCents: number
  
  // Development
  verboseErrors: boolean
  enablePerformanceMonitoring: boolean
  mockAIResponses: boolean
  
  // Branding
  defaultBrandTheme: string
  allowThemeSwitching: boolean
  
  // External Integrations
  sentryDsn: string | null
  analyticsId: string | null

  // Platform Migration
  backendApiBaseUrl: string | null
  useBackendLlm: boolean
  useBackendStorage: boolean
  useBackendAuth: boolean
  backendApiKey: string | null
}

/**
 * Get a string environment variable with optional default.
 */
function getEnvString(key: string, defaultValue: string | null = null): string | null {
  if (typeof import.meta.env === "undefined") {
    return defaultValue
  }
  
  const value = import.meta.env[key]
  
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim()
  }
  
  return defaultValue
}

/**
 * Get a boolean environment variable with default.
 */
function getEnvBoolean(key: string, defaultValue: boolean): boolean {
  const value = getEnvString(key)
  
  if (value === null) {
    return defaultValue
  }
  
  const normalized = value.toLowerCase()
  return normalized === "true" || normalized === "1" || normalized === "yes"
}

/**
 * Get a number environment variable with default.
 */
function getEnvNumber(key: string, defaultValue: number): number {
  const value = getEnvString(key)
  
  if (value === null) {
    return defaultValue
  }
  
  const parsed = parseInt(value, 10)
  return isNaN(parsed) ? defaultValue : parsed
}

/**
 * Load and validate environment configuration.
 */
export function loadEnvConfig(): EnvConfig {
  const config: EnvConfig = {
    // Database
    neonDatabaseUrl: getEnvString("VITE_NEON_DATABASE_URL"),
    
    // AI Providers
    geminiApiKey: getEnvString("VITE_GEMINI_API_KEY"),
    githubCopilotToken: getEnvString("VITE_GITHUB_COPILOT_TOKEN"),
    
    // Spark Runtime
    sparkAppId: getEnvString("VITE_SPARK_APP_ID", "6ae71f4d37a1f80fc3a3") || "6ae71f4d37a1f80fc3a3",
    sparkDebug: getEnvBoolean("VITE_SPARK_DEBUG", false),
    
    // Feature Flags
    enableSentinelBrain: getEnvBoolean("VITE_ENABLE_SENTINEL_BRAIN", true),
    enableNGOModule: getEnvBoolean("VITE_ENABLE_NGO_MODULE", true),
    enablePlagiarismChecker: getEnvBoolean("VITE_ENABLE_PLAGIARISM_CHECKER", true),
    enableHumanizer: getEnvBoolean("VITE_ENABLE_HUMANIZER", true),
    
    // Security
    secretSalt: getEnvString("VITE_SECRET_SALT", "sentinel-secret-store-v1") || "sentinel-secret-store-v1",
    sessionTimeout: getEnvNumber("VITE_SESSION_TIMEOUT", 86400000),
    
    // Rate Limiting
    basicPlanBudgetCents: getEnvNumber("VITE_BASIC_PLAN_BUDGET_CENTS", 500),
    proPlanBudgetCents: getEnvNumber("VITE_PRO_PLAN_BUDGET_CENTS", 2000),
    teamPlanBudgetCents: getEnvNumber("VITE_TEAM_PLAN_BUDGET_CENTS", 5000),
    
    // Development
    verboseErrors: getEnvBoolean("VITE_VERBOSE_ERRORS", false),
    enablePerformanceMonitoring: getEnvBoolean("VITE_ENABLE_PERFORMANCE_MONITORING", false),
    mockAIResponses: getEnvBoolean("VITE_MOCK_AI_RESPONSES", false),
    
    // Branding
    defaultBrandTheme: getEnvString("VITE_DEFAULT_BRAND_THEME", "sentinel_modern") || "sentinel_modern",
    allowThemeSwitching: getEnvBoolean("VITE_ALLOW_THEME_SWITCHING", true),
    
    // External Integrations
    sentryDsn: getEnvString("VITE_SENTRY_DSN"),
    analyticsId: getEnvString("VITE_ANALYTICS_ID"),

    // Platform Migration
    backendApiBaseUrl: getEnvString("VITE_BACKEND_API_BASE_URL"),
    useBackendLlm: getEnvBoolean("VITE_USE_BACKEND_LLM", false),
    useBackendStorage: getEnvBoolean("VITE_USE_BACKEND_STORAGE", false),
    useBackendAuth: getEnvBoolean("VITE_USE_BACKEND_AUTH", false),
    backendApiKey: getEnvString("VITE_BACKEND_API_KEY"),
  }
  
  return config
}

/**
 * Validate required environment variables.
 * Returns an array of missing variables.
 */
export function validateEnvConfig(config: EnvConfig): string[] {
  const missing: string[] = []
  const warnings: string[] = []
  
  // Critical variables that should be set for production
  if (!config.neonDatabaseUrl) {
    warnings.push("VITE_NEON_DATABASE_URL - Database features will be limited")
  }
  
  if (!config.geminiApiKey) {
    warnings.push("VITE_GEMINI_API_KEY - Gemini AI features will be unavailable")
  }
  
  // Log warnings in development mode
  if (warnings.length > 0 && typeof import.meta !== "undefined" && import.meta.env?.DEV) {
    console.warn("[env-config] Missing optional environment variables:")
    warnings.forEach(warning => console.warn(`  - ${warning}`))
  }
  
  return missing
}

/**
 * Check if a specific feature is enabled.
 */
export function isFeatureEnabled(feature: keyof Pick<EnvConfig, "enableSentinelBrain" | "enableNGOModule" | "enablePlagiarismChecker" | "enableHumanizer">): boolean {
  const config = loadEnvConfig()
  return config[feature]
}

/**
 * Get a secure configuration value (masks sensitive data in logs).
 */
export function getSecureConfig<K extends keyof EnvConfig>(
  key: K,
  mask: boolean = true
): EnvConfig[K] {
  const config = loadEnvConfig()
  const value = config[key]
  
  // Mask sensitive values if requested
  if (mask && typeof value === "string" && value.length > 0) {
    const sensitiveKeys = ["neonDatabaseUrl", "geminiApiKey", "githubCopilotToken", "sentryDsn"]
    if (sensitiveKeys.includes(key)) {
      // Don't return masked value, just indicate it exists
      return "***CONFIGURED***" as EnvConfig[K]
    }
  }
  
  return value
}

/**
 * Log environment configuration summary (safe for debugging).
 */
export function logEnvConfigSummary(): void {
  const config = loadEnvConfig()
  
  console.group("[env-config] Configuration Summary")
  console.log("Spark App ID:", config.sparkAppId)
  console.log("Debug Mode:", config.sparkDebug)
  console.log("Neon Database:", config.neonDatabaseUrl ? "✓ Configured" : "✗ Not configured")
  console.log("Gemini API:", config.geminiApiKey ? "✓ Configured" : "✗ Not configured")
  console.log("Copilot Token:", config.githubCopilotToken ? "✓ Configured" : "✗ Not configured")
  console.log("Features:")
  console.log("  - Sentinel Brain:", config.enableSentinelBrain ? "✓ Enabled" : "✗ Disabled")
  console.log("  - NGO Module:", config.enableNGOModule ? "✓ Enabled" : "✗ Disabled")
  console.log("  - Plagiarism Checker:", config.enablePlagiarismChecker ? "✓ Enabled" : "✗ Disabled")
  console.log("  - Humanizer:", config.enableHumanizer ? "✓ Enabled" : "✗ Disabled")
  console.log("Rate Limits:")
  console.log("  - Basic Plan: $" + (config.basicPlanBudgetCents / 100).toFixed(2))
  console.log("  - Pro Plan: $" + (config.proPlanBudgetCents / 100).toFixed(2))
  console.log("  - Team Plan: $" + (config.teamPlanBudgetCents / 100).toFixed(2))
  console.log("Branding:")
  console.log("  - Default Theme:", config.defaultBrandTheme)
  console.log("  - Theme Switching:", config.allowThemeSwitching ? "✓ Enabled" : "✗ Disabled")
  console.log("Migration:")
  console.log("  - Backend API:", config.backendApiBaseUrl || "✗ Not configured")
  console.log("  - Backend LLM:", config.useBackendLlm ? "✓ Enabled" : "✗ Disabled")
  console.log("  - Backend Storage:", config.useBackendStorage ? "✓ Enabled" : "✗ Disabled")
  console.log("  - Backend Auth:", config.useBackendAuth ? "✓ Enabled" : "✗ Disabled")
  console.log("  - Backend API Key:", config.backendApiKey ? "✓ Configured" : "✗ Not configured")
  console.groupEnd()
  
  // Validate and show any issues
  const missing = validateEnvConfig(config)
  if (missing.length > 0) {
    console.warn("[env-config] Missing required variables:", missing)
  }
}

// Singleton instance
let cachedConfig: EnvConfig | null = null

/**
 * Get the cached environment configuration.
 * Loads and caches on first call, returns cached value on subsequent calls.
 */
export function getEnvConfig(): EnvConfig {
  if (cachedConfig === null) {
    cachedConfig = loadEnvConfig()
    
    // Log in development mode
    if (typeof import.meta !== "undefined" && import.meta.env?.DEV && getEnvBoolean("VITE_SPARK_DEBUG", false)) {
      logEnvConfigSummary()
    }
  }
  
  return cachedConfig
}

/**
 * Reset the cached configuration (useful for testing).
 */
export function resetEnvConfig(): void {
  cachedConfig = null
}

// Export a default instance
export const envConfig = getEnvConfig()
