import { ConceptMode } from "@/types"

export interface StrategyTemplate {
  id: string
  name: string
  category: string
  description: string
  conceptMode: ConceptMode
  promptTemplate: string
  tags: string[]
  icon: string
}

export const STRATEGY_TEMPLATES: StrategyTemplate[] = [
  {
    id: "saas-onboarding",
    name: "SaaS User Onboarding",
    category: "Technology & Digital",
    description: "Complete onboarding strategy for SaaS products to maximize activation and reduce churn",
    conceptMode: "saas",
    promptTemplate: "A SaaS platform for [YOUR PRODUCT] targeting [YOUR AUDIENCE]. Key features include [LIST FEATURES]. Main user pain points: [PAIN POINTS].",
    tags: ["saas", "onboarding", "activation"],
    icon: "🚀"
  },
  {
    id: "ecommerce-launch",
    name: "E-commerce Store Launch",
    category: "Technology & Digital",
    description: "Go-to-market strategy for launching an e-commerce store with conversion optimization",
    conceptMode: "ecommerce",
    promptTemplate: "An e-commerce store selling [PRODUCTS] to [TARGET MARKET]. Unique selling proposition: [USP]. Price range: [PRICE RANGE].",
    tags: ["ecommerce", "launch", "conversion"],
    icon: "🛒"
  },
  {
    id: "lead-generation",
    name: "B2B Lead Generation",
    category: "Business Services",
    description: "Comprehensive lead generation and sales funnel strategy for B2B companies",
    conceptMode: "sales",
    promptTemplate: "A B2B company offering [SERVICE/PRODUCT] to [INDUSTRY]. Typical deal size: [DEAL SIZE]. Sales cycle: [CYCLE LENGTH].",
    tags: ["b2b", "sales", "leads"],
    icon: "📊"
  },
  {
    id: "healthcare-patient",
    name: "Patient Engagement System",
    category: "Healthcare & Wellness",
    description: "Digital patient engagement and appointment management strategy",
    conceptMode: "healthcare",
    promptTemplate: "A healthcare facility providing [SERVICES] to [PATIENT DEMOGRAPHIC]. Current challenges: [CHALLENGES]. Compliance requirements: [REQUIREMENTS].",
    tags: ["healthcare", "patients", "engagement"],
    icon: "🏥"
  },
  {
    id: "restaurant-delivery",
    name: "Restaurant Delivery Service",
    category: "Hospitality & Travel",
    description: "Complete strategy for launching or optimizing restaurant delivery operations",
    conceptMode: "foodservice",
    promptTemplate: "A restaurant offering [CUISINE TYPE] in [LOCATION]. Delivery radius: [RADIUS]. Average order value: [AOV]. Peak hours: [HOURS].",
    tags: ["restaurant", "delivery", "foodservice"],
    icon: "🍽️"
  },
  {
    id: "real-estate-crm",
    name: "Real Estate CRM Strategy",
    category: "Real Estate & Construction",
    description: "Client relationship and property management strategy for real estate agencies",
    conceptMode: "realestate",
    promptTemplate: "A real estate agency managing [PROPERTY TYPES] in [MARKETS]. Average transaction value: [VALUE]. Client acquisition channels: [CHANNELS].",
    tags: ["real estate", "crm", "properties"],
    icon: "🏘️"
  },
  {
    id: "fintech-kyc",
    name: "Fintech KYC & Onboarding",
    category: "Finance & Banking",
    description: "Secure and compliant customer onboarding for fintech products",
    conceptMode: "fintech",
    promptTemplate: "A fintech product offering [SERVICE] to [AUDIENCE]. Regulatory requirements: [REGULATIONS]. Risk profile: [RISK LEVEL].",
    tags: ["fintech", "kyc", "compliance"],
    icon: "💳"
  },
  {
    id: "education-platform",
    name: "Online Learning Platform",
    category: "Education & Training",
    description: "Strategy for launching and scaling an online education platform",
    conceptMode: "education",
    promptTemplate: "An online learning platform teaching [SUBJECTS] to [LEARNERS]. Course format: [FORMAT]. Pricing model: [PRICING].",
    tags: ["education", "elearning", "courses"],
    icon: "📚"
  },
  {
    id: "retail-inventory",
    name: "Retail Inventory Management",
    category: "Retail & Commerce",
    description: "Inventory optimization and omnichannel retail strategy",
    conceptMode: "retail",
    promptTemplate: "A retail business selling [PRODUCTS] across [CHANNELS]. Inventory turnover: [RATE]. Seasonal patterns: [PATTERNS].",
    tags: ["retail", "inventory", "omnichannel"],
    icon: "🏪"
  },
  {
    id: "consulting-workflow",
    name: "Consulting Practice Automation",
    category: "Business Services",
    description: "Workflow automation and client management for consulting firms",
    conceptMode: "consulting",
    promptTemplate: "A consulting firm specializing in [EXPERTISE] serving [CLIENT TYPE]. Project duration: [DURATION]. Team size: [SIZE].",
    tags: ["consulting", "automation", "workflow"],
    icon: "💼"
  },
  {
    id: "manufacturing-supply",
    name: "Manufacturing Supply Chain",
    category: "Industry & Manufacturing",
    description: "Supply chain optimization and production planning strategy",
    conceptMode: "manufacturing",
    promptTemplate: "A manufacturing company producing [PRODUCTS] with [PRODUCTION VOLUME]. Supply chain challenges: [CHALLENGES]. Lead times: [TIMES].",
    tags: ["manufacturing", "supply chain", "production"],
    icon: "🏭"
  },
  {
    id: "logistics-tracking",
    name: "Logistics Tracking System",
    category: "Industry & Manufacturing",
    description: "Real-time tracking and route optimization for logistics operations",
    conceptMode: "logistics",
    promptTemplate: "A logistics company handling [SHIPMENT TYPES] across [COVERAGE AREA]. Fleet size: [SIZE]. Delivery volume: [VOLUME].",
    tags: ["logistics", "tracking", "optimization"],
    icon: "🚚"
  },
  {
    id: "wellness-membership",
    name: "Wellness Membership Program",
    category: "Healthcare & Wellness",
    description: "Membership and retention strategy for wellness centers and gyms",
    conceptMode: "wellness",
    promptTemplate: "A wellness center offering [SERVICES] to [DEMOGRAPHIC]. Membership tiers: [TIERS]. Retention challenges: [CHALLENGES].",
    tags: ["wellness", "membership", "retention"],
    icon: "💪"
  },
  {
    id: "legal-practice",
    name: "Legal Practice Management",
    category: "Business Services",
    description: "Case management and client intake automation for law firms",
    conceptMode: "legal",
    promptTemplate: "A law firm practicing [PRACTICE AREAS] serving [CLIENT TYPE]. Average case duration: [DURATION]. Intake volume: [VOLUME].",
    tags: ["legal", "practice", "automation"],
    icon: "⚖️"
  },
  {
    id: "hotel-booking",
    name: "Hotel Booking Optimization",
    category: "Hospitality & Travel",
    description: "Revenue management and booking optimization for hotels",
    conceptMode: "hospitality",
    promptTemplate: "A hotel with [ROOM COUNT] rooms in [LOCATION]. Property type: [TYPE]. Occupancy rate: [RATE]. Peak seasons: [SEASONS].",
    tags: ["hotel", "booking", "revenue"],
    icon: "🏨"
  },
  {
    id: "fashion-collection",
    name: "Fashion Collection Launch",
    category: "Retail & Commerce",
    description: "Collection launch and brand positioning strategy for fashion brands",
    conceptMode: "fashion",
    promptTemplate: "A fashion brand offering [PRODUCT TYPES] targeting [AUDIENCE]. Style aesthetic: [AESTHETIC]. Price point: [PRICE POINT].",
    tags: ["fashion", "launch", "branding"],
    icon: "👗"
  },
  {
    id: "insurance-claims",
    name: "Insurance Claims Processing",
    category: "Finance & Banking",
    description: "Streamlined claims processing and customer service for insurance",
    conceptMode: "insurance",
    promptTemplate: "An insurance company offering [INSURANCE TYPES] to [CUSTOMER SEGMENT]. Average claim value: [VALUE]. Processing time: [TIME].",
    tags: ["insurance", "claims", "automation"],
    icon: "🛡️"
  },
  {
    id: "nonprofit-fundraising",
    name: "Nonprofit Fundraising Campaign",
    category: "Non-Profit & Social",
    description: "Digital fundraising and donor engagement strategy for nonprofits",
    conceptMode: "nonprofit",
    promptTemplate: "A nonprofit organization focused on [MISSION] serving [BENEFICIARIES]. Fundraising goal: [GOAL]. Donor base: [BASE].",
    tags: ["nonprofit", "fundraising", "donors"],
    icon: "❤️"
  },
  {
    id: "automotive-service",
    name: "Auto Service Center Management",
    category: "Transportation & Automotive",
    description: "Service scheduling and customer retention for auto service centers",
    conceptMode: "automotive",
    promptTemplate: "An automotive service center offering [SERVICES] for [VEHICLE TYPES]. Service bays: [COUNT]. Average ticket: [VALUE].",
    tags: ["automotive", "service", "scheduling"],
    icon: "🚗"
  },
  {
    id: "energy-monitoring",
    name: "Energy Consumption Management",
    category: "Industry & Manufacturing",
    description: "Energy monitoring and optimization strategy for utilities",
    conceptMode: "energy",
    promptTemplate: "An energy provider serving [CUSTOMER TYPE] in [REGION]. Infrastructure: [INFRASTRUCTURE]. Sustainability goals: [GOALS].",
    tags: ["energy", "monitoring", "sustainability"],
    icon: "⚡"
  },
  {
    id: "telecom-customer",
    name: "Telecom Customer Support",
    category: "Technology & Digital",
    description: "AI-powered customer support for telecom service providers",
    conceptMode: "telecom",
    promptTemplate: "A telecom provider offering [SERVICES] to [SUBSCRIBER COUNT] customers. Common issues: [ISSUES]. Support channels: [CHANNELS].",
    tags: ["telecom", "support", "automation"],
    icon: "📱"
  },
  {
    id: "construction-project",
    name: "Construction Project Tracking",
    category: "Real Estate & Construction",
    description: "Project management and progress tracking for construction companies",
    conceptMode: "construction",
    promptTemplate: "A construction company managing [PROJECT TYPES] with [TEAM SIZE]. Average project value: [VALUE]. Key challenges: [CHALLENGES].",
    tags: ["construction", "project", "tracking"],
    icon: "🏗️"
  },
  {
    id: "agriculture-planning",
    name: "Farm Management System",
    category: "Industry & Manufacturing",
    description: "Crop planning and resource optimization for agricultural operations",
    conceptMode: "agriculture",
    promptTemplate: "An agricultural operation growing [CROPS] on [ACREAGE]. Growing season: [SEASON]. Key resources: [RESOURCES].",
    tags: ["agriculture", "farming", "planning"],
    icon: "🌾"
  },
  {
    id: "beauty-booking",
    name: "Beauty Salon Booking System",
    category: "Retail & Commerce",
    description: "Appointment management and customer loyalty for beauty salons",
    conceptMode: "beauty",
    promptTemplate: "A beauty salon offering [SERVICES] to [CLIENTELE]. Service providers: [COUNT]. Average appointment duration: [DURATION].",
    tags: ["beauty", "booking", "loyalty"],
    icon: "💄"
  },
  {
    id: "sports-training",
    name: "Sports Training Program",
    category: "Entertainment & Sports",
    description: "Athletic training and performance tracking system",
    conceptMode: "sports",
    promptTemplate: "A sports training facility for [SPORT/ACTIVITY] serving [ATHLETE TYPE]. Training methodology: [METHOD]. Performance goals: [GOALS].",
    tags: ["sports", "training", "performance"],
    icon: "⚽"
  },
  {
    id: "media-content",
    name: "Media Content Distribution",
    category: "Technology & Digital",
    description: "Content management and distribution strategy for media companies",
    conceptMode: "media",
    promptTemplate: "A media company producing [CONTENT TYPES] for [AUDIENCE]. Distribution channels: [CHANNELS]. Monetization: [MODEL].",
    tags: ["media", "content", "distribution"],
    icon: "🎬"
  },
  {
    id: "travel-booking",
    name: "Travel Agency Booking Platform",
    category: "Hospitality & Travel",
    description: "Integrated booking and itinerary management for travel agencies",
    conceptMode: "travel",
    promptTemplate: "A travel agency specializing in [TRAVEL TYPE] to [DESTINATIONS]. Average booking value: [VALUE]. Customer segments: [SEGMENTS].",
    tags: ["travel", "booking", "itinerary"],
    icon: "✈️"
  },
  {
    id: "entertainment-ticketing",
    name: "Event Ticketing System",
    category: "Entertainment & Sports",
    description: "Ticketing and event management for entertainment venues",
    conceptMode: "entertainment",
    promptTemplate: "An entertainment venue hosting [EVENT TYPES] with [CAPACITY]. Event frequency: [FREQUENCY]. Pricing strategy: [STRATEGY].",
    tags: ["entertainment", "ticketing", "events"],
    icon: "🎭"
  },
  {
    id: "ops-helpdesk",
    name: "Internal Helpdesk System",
    category: "Business Services",
    description: "Employee support and IT helpdesk automation",
    conceptMode: "ops",
    promptTemplate: "An organization with [EMPLOYEE COUNT] employees needing support for [SYSTEMS]. Common tickets: [TICKETS]. SLA requirements: [SLA].",
    tags: ["operations", "helpdesk", "internal"],
    icon: "🎧"
  }
]

export const TEMPLATE_CATEGORIES = [
  "All Templates",
  "Technology & Digital",
  "Business Services",
  "Finance & Banking",
  "Healthcare & Wellness",
  "Education & Training",
  "Retail & Commerce",
  "Hospitality & Travel",
  "Real Estate & Construction",
  "Industry & Manufacturing",
  "Transportation & Automotive",
  "Entertainment & Sports",
  "Non-Profit & Social"
]

export function getTemplatesByCategory(category: string): StrategyTemplate[] {
  if (category === "All Templates") {
    return STRATEGY_TEMPLATES
  }
  return STRATEGY_TEMPLATES.filter(template => template.category === category)
}

export function getTemplateById(id: string): StrategyTemplate | undefined {
  return STRATEGY_TEMPLATES.find(template => template.id === id)
}

export function searchTemplates(query: string): StrategyTemplate[] {
  const lowerQuery = query.toLowerCase()
  return STRATEGY_TEMPLATES.filter(template => 
    template.name.toLowerCase().includes(lowerQuery) ||
    template.description.toLowerCase().includes(lowerQuery) ||
    template.tags.some(tag => tag.toLowerCase().includes(lowerQuery))
  )
}
