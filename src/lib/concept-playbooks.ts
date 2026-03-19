export interface KnowledgebaseConcept {
  id: string
  title: string
  summary: string
  patterns: string[]
  integrations: string[]
  kpis: string[]
  tags: string[]
}

export interface KnowledgeFeedItem {
  id: string
  title: string
  summary: string
  sourceType: "reel" | "article" | "case-study" | "internal-note"
  sourceUrl?: string
  tags: string[]
}

export const DEFAULT_KNOWLEDGEBASE_CONCEPTS: KnowledgebaseConcept[] = [
  {
    id: "sales-agent-dashboard",
    title: "Conversational Sales Agent + Owner Dashboard",
    summary: "Messaging-based AI sales/support automation with live performance dashboard.",
    patterns: [
      "Lead qualification and FAQ handling",
      "Human escalation and appointment booking",
      "Conversation-to-conversion funnel analytics",
    ],
    integrations: ["WhatsApp/DM APIs", "LLM APIs", "Calendly-like scheduling", "CRM sync", "Relational DB"],
    kpis: ["Lead response time", "Booking conversion", "Escalation rate", "Revenue influenced"],
    tags: ["sales", "agent", "dashboard"],
  },
  {
    id: "ecommerce-concierge",
    title: "E-commerce Concierge + Revenue Intelligence",
    summary: "AI shopping assistant with product discovery, order automation, and retention loops.",
    patterns: [
      "Recommendation and cart recovery flows",
      "Order-status and support automation",
      "Cohort and funnel monitoring",
    ],
    integrations: ["Storefront API", "Payments", "Inventory system", "Email/DM channels"],
    kpis: ["Cart recovery rate", "AOV uplift", "Conversion rate", "Repeat purchase rate"],
    tags: ["ecommerce", "retention", "assistant"],
  },
  {
    id: "saas-onboarding",
    title: "SaaS Onboarding + Activation Engine",
    summary: "Product onboarding automation focused on activation and expansion.",
    patterns: [
      "Role-based onboarding checklists",
      "Behavior-triggered nudges",
      "Health scoring and churn prevention",
    ],
    integrations: ["Product events", "In-app messaging", "CRM", "Support platform"],
    kpis: ["Activation rate", "Time-to-value", "Feature adoption", "Churn risk score"],
    tags: ["saas", "activation", "onboarding"],
  },
  {
    id: "education-coach",
    title: "Education Coach + Learning Analytics",
    summary: "AI tutor/coaching flows with adaptive learning and instructor insights.",
    patterns: [
      "Learning path adaptation",
      "Practice and feedback loops",
      "Intervention for struggling learners",
    ],
    integrations: ["LMS", "Assessment engine", "Notification system", "Analytics DB"],
    kpis: ["Mastery progression", "Completion rate", "Streak retention", "Intervention success"],
    tags: ["education", "coach", "analytics"],
  },
  {
    id: "healthcare-triage",
    title: "Healthcare Triage Assistant + Scheduling",
    summary: "Safety-first triage, handoff, and appointment automation with privacy controls.",
    patterns: [
      "Safety boundaries and disclaimers",
      "Clinical handoff routing",
      "Queue and follow-up management",
    ],
    integrations: ["Scheduling", "EHR-compatible services", "Secure messaging", "Audit logging"],
    kpis: ["No-show rate", "Triage completion", "Follow-up adherence", "Escalation accuracy"],
    tags: ["healthcare", "triage", "compliance"],
  },
  {
    id: "fintech-onboarding-risk",
    title: "Fintech Onboarding + Risk Controls",
    summary: "KYC/KYB support and risk-aware onboarding journey automation.",
    patterns: [
      "Document and verification guidance",
      "Fraud/risk checks and fallback handling",
      "Compliance-aware customer communications",
    ],
    integrations: ["KYC APIs", "Risk engine", "Secure tokenization", "Transaction systems"],
    kpis: ["Onboarding completion", "Verification pass rate", "Fraud flag precision", "Resolution time"],
    tags: ["fintech", "risk", "onboarding"],
  },
  {
    id: "ops-copilot",
    title: "Internal Ops Copilot + Workflow Automation",
    summary: "Internal assistant for SOP retrieval, ticket triage, and SLA-driven operations.",
    patterns: [
      "Workflow/approval orchestration",
      "Ticket routing and prioritization",
      "SLA tracking with human override",
    ],
    integrations: ["Ticketing", "Chat platforms", "BI/warehouse", "Role-based access"],
    kpis: ["Time saved", "SLA adherence", "Error rate", "Automation coverage"],
    tags: ["operations", "copilot", "automation"],
  },
]

export const DEFAULT_KNOWLEDGE_FEED_ITEMS: KnowledgeFeedItem[] = [
  {
    id: "feed-whatsapp-agent-dashboard",
    title: "Build a Complete WhatsApp AI Agent & Dashboard",
    summary:
      "End-to-end build flow: WhatsApp API setup, Supabase message storage, LLM + scheduling integration, live demo, and deployment customization.",
    sourceType: "reel",
    sourceUrl: "https://www.facebook.com/share/v/1E4e44gbDq/?mibextid=wwXIfr",
    tags: ["sales-agent", "whatsapp", "dashboard", "supabase", "deployment"],
  },
  {
    id: "feed-saas-activation-play",
    title: "SaaS Activation Playbook",
    summary:
      "Use behavior events to trigger onboarding nudges, map drop-offs, and improve feature adoption using experiment loops.",
    sourceType: "internal-note",
    tags: ["saas", "activation", "analytics"],
  },
  {
    id: "feed-ecommerce-recovery-loop",
    title: "E-commerce Recovery Loop",
    summary:
      "Blend recommendation, cart reminders, and support automation with revenue-focused dashboard KPIs.",
    sourceType: "internal-note",
    tags: ["ecommerce", "retention", "revenue"],
  },
]

export function formatKnowledgebaseForPrompt(concepts: KnowledgebaseConcept[]) {
  return concepts
    .map((concept, index) => {
      const patterns = concept.patterns.map((pattern) => `  - ${pattern}`).join("\n")
      const integrations = concept.integrations.map((integration) => `  - ${integration}`).join("\n")
      const kpis = concept.kpis.map((kpi) => `  - ${kpi}`).join("\n")
      return `Archetype ${index + 1}: ${concept.title}\nSummary: ${concept.summary}\nPatterns:\n${patterns}\nIntegrations:\n${integrations}\nKPIs:\n${kpis}\nTags: ${concept.tags.join(", ")}`
    })
    .join("\n\n")
}

export function formatFeedForPrompt(feed: KnowledgeFeedItem[]) {
  return feed
    .map((item, index) => {
      const source = item.sourceUrl ? `${item.sourceType} (${item.sourceUrl})` : item.sourceType
      return `Feed ${index + 1}: ${item.title}\nSummary: ${item.summary}\nSource: ${source}\nTags: ${item.tags.join(", ")}`
    })
    .join("\n\n")
}
