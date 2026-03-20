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

export type UserRole = "admin" | "client"

export type SubscriptionPlan = "basic" | "pro"
export type SubscriptionStatus = "active" | "inactive" | "grace"

export interface SubscriptionInfo {
  plan: SubscriptionPlan
  status: SubscriptionStatus
  proCredits: number
  updatedAt: number
}

export interface UserProfile {
  id: string
  email: string
  fullName: string
  company?: string
  role: UserRole
  industry?: string
  bio?: string
  avatarUrl?: string
  subscription?: SubscriptionInfo
  createdAt: number
  lastLoginAt: number
}

export interface UserCredentials {
  email: string
  password: string
}

export interface AuthState {
  isAuthenticated: boolean
  user: UserProfile | null
}

export interface PlagiarismHighlight {
  text: string
  startIndex: number
  endIndex: number
  severity: "high" | "medium" | "low"
  source?: string
}

export interface AIDetectionHighlight {
  text: string
  startIndex: number
  endIndex: number
  confidence: number
}

export interface PlagiarismResult {
  overallScore: number
  plagiarismPercentage: number
  aiContentPercentage: number
  highlights: PlagiarismHighlight[]
  aiHighlights: AIDetectionHighlight[]
  summary: string
  recommendations: string[]
  turnitinReady: boolean
  validReferences: { reference: string; isValid: boolean; reason: string }[]
  detectedSources: { source: string; similarity: number }[]
}

export interface DocumentReviewResult {
  documentText: string
  fileName: string
  summary: string
  plagiarismResult: PlagiarismResult
  timestamp: number
}

export interface SavedReviewDocument {
  id: string
  name: string
  documentText: string
  fileName: string
  summary: string
  plagiarismResult: PlagiarismResult
  timestamp: number
  userId: string
}

export interface HumanizedResult {
  originalText: string
  humanizedText: string
  changes: { original: string; humanized: string }[]
  timestamp: number
}

export interface CookedIdea {
  originalIdea: string
  refinedIdea: string
  keyInsights: string[]
  marketOpportunity: string
  competitiveAdvantage: string
  targetMarket: string
  revenueModel: string
  keyRisks: string[]
  nextSteps: string[]
}

export interface BusinessCanvasModel {
  keyPartners: string
  keyActivities: string
  keyResources: string
  valueProposition: string
  customerRelationships: string
  channels: string
  customerSegments: string
  costStructure: string
  revenueStreams: string
}

export interface PitchDeck {
  slides: PitchSlide[]
  executiveSummary: string
}

export interface PitchSlide {
  title: string
  content: string
  notes: string
  slideNumber: number
}

export interface SavedIdea {
  id: string
  name: string
  originalIdea: string
  cookedIdea: CookedIdea
  businessCanvas?: BusinessCanvasModel
  pitchDeck?: PitchDeck
  timestamp: number
  userId: string
}

export type ErrorSeverity = "low" | "medium" | "high" | "critical"

export type ErrorCategory = 
  | "authentication"
  | "generation"
  | "storage"
  | "export"
  | "network"
  | "validation"
  | "system"
  | "unknown"

export interface ErrorLog {
  id: string
  timestamp: number
  message: string
  stack?: string
  errorType: string
  category: ErrorCategory
  severity: ErrorSeverity
  userId?: string
  userAgent: string
  url: string
  metadata?: Record<string, unknown>
  resolved: boolean
  resolvedAt?: number
}
