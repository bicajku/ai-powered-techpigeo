export interface MarketingResult {
  marketingCopy: string
  visualStrategy: string
  targetAudience: string
  applicationWorkflow?: string
  uiWorkflow?: string
  databaseWorkflow?: string
  mobileWorkflow?: string
  implementationChecklist?: string
}

export interface SavedStrategy {
  id: string
  name: string
  description: string
  result: MarketingResult
  timestamp: number
}
