export const BRAND_THEME_STORAGE_KEY = "novussparks-brand-theme"

export const BRAND_THEMES = {
  novussparks_brand: {
    name: "novussparks_brand",
    label: "NovusSparks Brand",
    description: "Electric Cyan, Neural Sage, and Spark Gold",
  },
  novussparks_classic: {
    name: "novussparks_classic",
    label: "NovusSparks Classic",
    description: "Deep navy, sky blue, and gold palette",
  },
} as const

export type BrandThemeName = keyof typeof BRAND_THEMES

export const DEFAULT_BRAND_THEME: BrandThemeName = "novussparks_brand"

export const BRAND_THEME_OPTIONS = Object.values(BRAND_THEMES)

export function isBrandThemeName(value: string | null | undefined): value is BrandThemeName {
  return typeof value === "string" && value in BRAND_THEMES
}
