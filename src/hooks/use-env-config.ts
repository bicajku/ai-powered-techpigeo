import { useMemo } from "react"
import { getEnvConfig, isFeatureEnabled, type EnvConfig } from "@/lib/env-config"

/**
 * React hook for accessing environment configuration.
 * Returns a memoized config object that remains stable across renders.
 */
export function useEnvConfig(): EnvConfig {
  return useMemo(() => getEnvConfig(), [])
}

/**
 * React hook for checking if a feature is enabled.
 */
export function useFeatureFlag(
  feature: keyof Pick<
    EnvConfig,
    "enableSentinelBrain" | "enableNGOModule" | "enablePlagiarismChecker" | "enableHumanizer"
  >
): boolean {
  return useMemo(() => isFeatureEnabled(feature), [feature])
}

/**
 * React hook for accessing specific config values with memoization.
 */
export function useConfigValue<K extends keyof EnvConfig>(key: K): EnvConfig[K] {
  const config = useEnvConfig()
  return useMemo(() => config[key], [config, key])
}
