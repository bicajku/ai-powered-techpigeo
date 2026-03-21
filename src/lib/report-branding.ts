import techpigeonLogo from "@/assets/images/logo.png"

export const REPORT_BRAND = {
  companyName: "Techpigeon",
  projectName: "Drive 2 AI Sparks",
  companyTagline: "Drive 2 AI Sparks",
  website: "https://www.techpigeon.org",
  logoPath: techpigeonLogo,
  colors: {
    primary: "#5CC3EB",
    secondary: "#8CB499",
    accent: "#BCA444",
    text: "#1C1414",
    muted: "#6A5B5B",
    panel: "#F2F7F3",
    border: "#DDD6D2",
  },
  contactLine: "G-7/4, Islamabad 44000, Pakistan | Ph: +92(300) 0529697 | USA: +1(786) 8226386 | Oman: +968 76786324",
}

export function reportLogoMarkup(size = 44): string {
  return `<img src="${REPORT_BRAND.logoPath}" alt="${REPORT_BRAND.companyName} logo" width="${size}" height="${size}" style="object-fit: contain;" />`
}
