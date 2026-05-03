import novussparksLogo from "@/assets/images/logo.png"

// Cache the base64 version of the logo for use in exported reports
let cachedLogoDataUrl: string | null = null

async function getLogoAsDataUrl(): Promise<string> {
  if (cachedLogoDataUrl) return cachedLogoDataUrl
  try {
    const response = await fetch(novussparksLogo)
    const blob = await response.blob()
    return new Promise((resolve) => {
      const reader = new FileReader()
      reader.onloadend = () => {
        cachedLogoDataUrl = reader.result as string
        resolve(cachedLogoDataUrl)
      }
      reader.onerror = () => resolve(novussparksLogo)
      reader.readAsDataURL(blob)
    })
  } catch {
    return novussparksLogo
  }
}

// Eagerly load the logo data URL on module import
getLogoAsDataUrl()

export const REPORT_BRAND = {
  companyName: "NovusSparks",
  projectName: "NovusSparks AI",
  companyTagline: "Enterprise AI Platform",
  website: "https://www.novussparks.com",
  logoPath: novussparksLogo,
  colors: {
    primary: "#38BDF8",
    secondary: "#6EE7A0",
    accent: "#E5A932",
    text: "#1C1414",
    muted: "#6A5B5B",
    panel: "#F0FAF5",
    border: "#DDD6D2",
  },
  contactLine: "G-7/4, Islamabad 44000, Pakistan | Ph: +92(300) 0529697 | USA: +1(786) 8226386 | Oman: +968 76786324",
}

export function reportLogoMarkup(size = 44): string {
  // Use cached base64 data URL if available (works in blob:// context for reports)
  const logoSrc = cachedLogoDataUrl || REPORT_BRAND.logoPath
  return `<img src="${logoSrc}" alt="${REPORT_BRAND.companyName} logo" width="${size}" height="${size}" style="object-fit: contain;" />`
}

export async function reportLogoMarkupAsync(size = 44): Promise<string> {
  const logoSrc = await getLogoAsDataUrl()
  return `<img src="${logoSrc}" alt="${REPORT_BRAND.companyName} logo" width="${size}" height="${size}" style="object-fit: contain;" />`
}
