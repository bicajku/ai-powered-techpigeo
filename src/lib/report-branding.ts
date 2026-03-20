export const REPORT_BRAND = {
  companyName: "Techpigeon",
  projectName: "Drive 2 AI Sparks",
  companyTagline: "Drive 2 AI Sparks",
  website: "https://www.techpigeon.org",
  logoPath: "https://ai-powered-techpigeo--umerslone.github.app/assets/techpigeon-logo-CjLW5l5l.png",
  colors: {
    primary: "#0B1D3A",
    secondary: "#3BA8D4",
    accent: "#BBA442",
    text: "#1A1A1A",
    muted: "#666666",
    panel: "#F8F9FA",
    border: "#E0E0E0",
  },
  contactLine: "G-7/4, Islamabad 44000, Pakistan | Ph: +92(300) 0529697 | USA: +1(786) 8226386 | Oman: +968 76786324",
}

export function reportLogoMarkup(size = 44): string {
  return `<img src="${REPORT_BRAND.logoPath}" alt="${REPORT_BRAND.companyName} logo" width="${size}" height="${size}" style="object-fit: contain;" />`
}
