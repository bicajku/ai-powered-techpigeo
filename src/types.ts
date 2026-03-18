export interface MarketingResult {
  marketingCopy: string
  visualStrategy: string
  targetAudience: string
}

export interface SavedStrategy {
  id: string
  name: string
  description: string
  result: MarketingResult
  timestamp: number
}
