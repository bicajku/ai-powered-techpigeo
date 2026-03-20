export const BRAND_THEME_STORAGE_KEY = "techpigeon-brand-theme"

export const BRAND_THEMES = {
  techpigeon_brand: {
    name: "techpigeon_brand",
    label: "TechPigeon Brand",
    description: "Picton Blue, Roti, Cocoa Brown, and Bay Leaf",
  },
  techpigeon_classic: {
    name: "techpigeon_classic",
    label: "TechPigeon Classic",
    description: "Original navy, sky blue, and gold palette",
  },
} as const

export type BrandThemeName = keyof typeof BRAND_THEMES

export const DEFAULT_BRAND_THEME: BrandThemeName = "techpigeon_brand"

export const BRAND_THEME_OPTIONS = Object.values(BRAND_THEMES)

export function isBrandThemeName(value: string | null | undefined): value is BrandThemeName {
  return typeof value === "string" && value in BRAND_THEMES
}