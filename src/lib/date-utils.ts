/**
 * Safe date formatting utilities that handle null, 0, and invalid timestamps gracefully
 */

export const safeDateFormatters = {
  /**
   * Format timestamp to locale string (e.g., "4/11/2026, 2:30:45 PM")
   * Returns "-" for null/0/invalid timestamps
   */
  toLocaleString: (timestamp: number | null | undefined, locale: string = "en-US"): string => {
    if (!timestamp || timestamp <= 0) return "-"
    try {
      return new Date(timestamp).toLocaleString(locale)
    } catch {
      return "-"
    }
  },

  /**
   * Format timestamp to locale date string (e.g., "4/11/2026")
   * Returns "-" for null/0/invalid timestamps
   */
  toLocaleDateString: (timestamp: number | null | undefined, locale: string = "en-US"): string => {
    if (!timestamp || timestamp <= 0) return "-"
    try {
      return new Date(timestamp).toLocaleDateString(locale)
    } catch {
      return "-"
    }
  },

  /**
   * Format timestamp to ISO string (e.g., "2026-04-11T14:30:45.000Z")
   * Returns "-" for null/0/invalid timestamps
   */
  toISOString: (timestamp: number | null | undefined): string => {
    if (!timestamp || timestamp <= 0) return "-"
    try {
      return new Date(timestamp).toISOString()
    } catch {
      return "-"
    }
  },

  /**
   * Format timestamp with custom options
   * Returns "-" for null/0/invalid timestamps
   */
  format: (
    timestamp: number | null | undefined,
    options: Intl.DateTimeFormatOptions,
    locale: string = "en-US"
  ): string => {
    if (!timestamp || timestamp <= 0) return "-"
    try {
      return new Date(timestamp).toLocaleDateString(locale, options)
    } catch {
      return "-"
    }
  },
}
