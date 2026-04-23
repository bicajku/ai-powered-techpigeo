/**
 * Techpigeon / NovusSparks AI — AWS Activate Pitch Deck Generator
 * Run: node generate-pitch-deck.mjs
 * Output: Techpigeon-PitchDeck.pptx
 */
import PptxGenJS from "pptxgenjs"

const pptx = new PptxGenJS()

// ── Brand palette ──
const C = {
  bg: "0B0F1A",        // deep navy
  bgAlt: "10152A",     // slightly lighter navy
  accent: "6C5CE7",    // vivid purple
  accentAlt: "4834D4", // deeper purple
  cyan: "00CEC9",      // teal/cyan accent
  green: "00B894",     // success green
  orange: "E17055",    // warning orange
  red: "D63031",       // alert red
  white: "FFFFFF",
  muted: "A0A0B8",     // muted text
  card: "161B33",      // card background
}

// ── Defaults ──
pptx.author = "Techpigeon"
pptx.company = "Techpigeon"
pptx.subject = "AWS Activate Pitch Deck"
pptx.title = "Techpigeon — NovusSparks AI Pitch Deck"
pptx.layout = "LAYOUT_WIDE" // 13.33 x 7.5

function addBg(slide) {
  slide.background = { color: C.bg }
}

function addFooter(slide, text = "techpigeon.org  |  novussparks.com") {
  slide.addText(text, {
    x: 0.5, y: 6.9, w: 12.33, h: 0.4,
    fontSize: 9, color: C.muted, align: "center",
    fontFace: "Arial",
  })
}

function addAccentLine(slide, y = 1.3) {
  slide.addShape(pptx.ShapeType.rect, {
    x: 0.5, y, w: 2, h: 0.06,
    fill: { color: C.accent },
  })
}

// ═══════════════════════════════════════════════════════════════
// SLIDE 1 — Title & Elevator Pitch
// ═══════════════════════════════════════════════════════════════
{
  const s = pptx.addSlide()
  addBg(s)

  s.addText("TECHPIGEON", {
    x: 0.5, y: 0.5, w: 5, h: 0.6,
    fontSize: 14, color: C.cyan, bold: true, letterSpacing: 6,
    fontFace: "Arial",
  })

  s.addText("Stop guessing.\nBuild with Techpigeon.", {
    x: 0.5, y: 1.5, w: 8, h: 1.6,
    fontSize: 40, color: C.white, bold: true,
    fontFace: "Arial", lineSpacingMultiple: 1.1,
  })

  s.addText(
    "Techpigeon is a B2B software company bridging the gap between cutting-edge technology and strict enterprise governance.",
    {
      x: 0.5, y: 3.3, w: 8, h: 0.8,
      fontSize: 16, color: C.muted,
      fontFace: "Arial",
    }
  )

  // Key fact blocks
  const facts = [
    { label: "Focus", value: "B2B SaaS &\nEnterprise AI" },
    { label: "Infrastructure", value: "AWS-Native\nArchitecture" },
    { label: "Sectors", value: "Finance, Healthcare,\nEnterprise, NGOs" },
    { label: "Flagship", value: "NovusSparks AI" },
  ]
  facts.forEach((f, i) => {
    const x = 0.5 + i * 3.1
    s.addShape(pptx.ShapeType.roundRect, {
      x, y: 4.6, w: 2.8, h: 1.6,
      fill: { color: C.card }, rectRadius: 0.1,
    })
    s.addText(f.label.toUpperCase(), {
      x, y: 4.7, w: 2.8, h: 0.4,
      fontSize: 10, color: C.cyan, bold: true, align: "center",
      fontFace: "Arial",
    })
    s.addText(f.value, {
      x, y: 5.1, w: 2.8, h: 0.9,
      fontSize: 13, color: C.white, align: "center",
      fontFace: "Arial",
    })
  })

  addFooter(s)
}

// ═══════════════════════════════════════════════════════════════
// SLIDE 2 — The Problem
// ═══════════════════════════════════════════════════════════════
{
  const s = pptx.addSlide()
  addBg(s)

  s.addText("THE PROBLEM", {
    x: 0.5, y: 0.5, w: 5, h: 0.5,
    fontSize: 12, color: C.orange, bold: true, letterSpacing: 4,
    fontFace: "Arial",
  })
  addAccentLine(s, 1.0)

  s.addText("On average, enterprises waste months\nand millions trying to adopt AI safely.", {
    x: 0.5, y: 1.3, w: 8, h: 1.2,
    fontSize: 32, color: C.white, bold: true,
    fontFace: "Arial", lineSpacingMultiple: 1.1,
  })

  s.addText(
    "The biggest roadblock to enterprise AI adoption isn't technology — it's trust.",
    {
      x: 0.5, y: 2.7, w: 8, h: 0.6,
      fontSize: 16, color: C.muted,
      fontFace: "Arial",
    }
  )

  // Problem bullets
  const problems = [
    { icon: "⚠", title: "AI Hallucinations", desc: "Unverifiable outputs erode stakeholder confidence", color: C.red },
    { icon: "🔍", title: "No Audit Trails", desc: "Lack of provenance makes compliance impossible", color: C.orange },
    { icon: "🔒", title: "Data Privacy Risks", desc: "Compliance risks block enterprise-wide rollout", color: C.accent },
  ]
  problems.forEach((p, i) => {
    const y = 3.7 + i * 1.1
    s.addShape(pptx.ShapeType.roundRect, {
      x: 0.5, y, w: 7.5, h: 0.9,
      fill: { color: C.card }, rectRadius: 0.08,
    })
    s.addText(p.title, {
      x: 1.0, y, w: 3, h: 0.9,
      fontSize: 16, color: C.white, bold: true, valign: "middle",
      fontFace: "Arial",
    })
    s.addText(p.desc, {
      x: 4.0, y, w: 3.8, h: 0.9,
      fontSize: 13, color: C.muted, valign: "middle",
      fontFace: "Arial",
    })
  })

  // Cost of AI Failure bar chart (right side)
  s.addText("Cost of AI Failure", {
    x: 8.8, y: 3.4, w: 4, h: 0.4,
    fontSize: 12, color: C.muted, bold: true, align: "center",
    fontFace: "Arial",
  })
  const bars = [
    { label: "SMB", h: 0.8, cost: "$120K" },
    { label: "Mid", h: 1.4, cost: "$800K" },
    { label: "Enterprise", h: 2.2, cost: "$4.2M" },
  ]
  bars.forEach((b, i) => {
    const x = 9.2 + i * 1.2
    const baseY = 6.2
    s.addShape(pptx.ShapeType.rect, {
      x, y: baseY - b.h, w: 0.8, h: b.h,
      fill: { color: i === 2 ? C.red : i === 1 ? C.orange : C.accent },
    })
    s.addText(b.cost, {
      x, y: baseY - b.h - 0.35, w: 0.8, h: 0.3,
      fontSize: 9, color: C.white, align: "center", bold: true,
      fontFace: "Arial",
    })
    s.addText(b.label, {
      x, y: baseY + 0.05, w: 0.8, h: 0.3,
      fontSize: 9, color: C.muted, align: "center",
      fontFace: "Arial",
    })
  })

  addFooter(s)
}

// ═══════════════════════════════════════════════════════════════
// SLIDE 3 — The Solution
// ═══════════════════════════════════════════════════════════════
{
  const s = pptx.addSlide()
  addBg(s)

  s.addText("THE SOLUTION", {
    x: 0.5, y: 0.5, w: 5, h: 0.5,
    fontSize: 12, color: C.green, bold: true, letterSpacing: 4,
    fontFace: "Arial",
  })
  addAccentLine(s, 1.0)

  s.addText("All your enterprise solutions\nin one governed ecosystem.", {
    x: 0.5, y: 1.3, w: 9, h: 1.2,
    fontSize: 32, color: C.white, bold: true,
    fontFace: "Arial", lineSpacingMultiple: 1.1,
  })

  s.addText(
    "Techpigeon builds the secure infrastructure businesses need to adopt next-gen tools.",
    {
      x: 0.5, y: 2.7, w: 9, h: 0.6,
      fontSize: 16, color: C.muted,
      fontFace: "Arial",
    }
  )

  const checks = [
    "Secure Cloud Data Handling",
    "Enterprise Command Center Controls",
    "Role-Based Access & Usage Tracking",
    "Tailored B2B SaaS Ecosystems",
  ]
  checks.forEach((c, i) => {
    const y = 3.7 + i * 0.7
    s.addText(`✓  ${c}`, {
      x: 0.8, y, w: 8, h: 0.6,
      fontSize: 18, color: C.white,
      fontFace: "Arial",
    })
  })

  // Transition callout
  s.addShape(pptx.ShapeType.roundRect, {
    x: 0.5, y: 6.1, w: 12.33, h: 0.6,
    fill: { color: C.accentAlt }, rectRadius: 0.08,
  })
  s.addText("▸  Introducing our flagship project: NovusSparks AI", {
    x: 0.5, y: 6.1, w: 12.33, h: 0.6,
    fontSize: 16, color: C.white, bold: true, align: "center",
    fontFace: "Arial",
  })

  addFooter(s)
}

// ═══════════════════════════════════════════════════════════════
// SLIDE 4 — NovusSparks AI
// ═══════════════════════════════════════════════════════════════
{
  const s = pptx.addSlide()
  addBg(s)

  s.addText("NOVUSSPARKS AI", {
    x: 0.5, y: 0.5, w: 5, h: 0.5,
    fontSize: 12, color: C.cyan, bold: true, letterSpacing: 4,
    fontFace: "Arial",
  })
  addAccentLine(s, 1.0)

  s.addText("Benefit from hallucination-free AI\nwith NovusSparks.", {
    x: 0.5, y: 1.3, w: 9, h: 1.2,
    fontSize: 32, color: C.white, bold: true,
    fontFace: "Arial", lineSpacingMultiple: 1.1,
  })

  s.addText(
    "An Enterprise Business Intelligence Suite combining strategy generation, integrity review, and AI-pattern detection in one governed workflow.",
    {
      x: 0.5, y: 2.7, w: 10, h: 0.7,
      fontSize: 15, color: C.muted,
      fontFace: "Arial",
    }
  )

  const features = [
    { icon: "⚡", title: "Strategy Engine", desc: "Generate data-driven business strategies from natural language prompts" },
    { icon: "🧠", title: "Semantic RAG (Cortex)", desc: "Retrieval-augmented generation with verified enterprise knowledge bases" },
    { icon: "🔗", title: "Consensus Protocol", desc: "Multi-engine validation cross-checks outputs across leading AI models" },
    { icon: "📋", title: "Evidence Ledger", desc: "Full audit trail with source attribution for every generated insight" },
  ]
  features.forEach((f, i) => {
    const x = 0.5 + (i % 2) * 6.2
    const y = 3.8 + Math.floor(i / 2) * 1.6
    s.addShape(pptx.ShapeType.roundRect, {
      x, y, w: 5.8, h: 1.3,
      fill: { color: C.card }, rectRadius: 0.1,
    })
    s.addText(f.title, {
      x: x + 0.3, y, w: 5.2, h: 0.6,
      fontSize: 16, color: C.white, bold: true, valign: "bottom",
      fontFace: "Arial",
    })
    s.addText(f.desc, {
      x: x + 0.3, y: y + 0.6, w: 5.2, h: 0.5,
      fontSize: 12, color: C.muted, valign: "top",
      fontFace: "Arial",
    })
  })

  addFooter(s)
}

// ═══════════════════════════════════════════════════════════════
// SLIDE 5 — How It Works
// ═══════════════════════════════════════════════════════════════
{
  const s = pptx.addSlide()
  addBg(s)

  s.addText("HOW IT WORKS", {
    x: 0.5, y: 0.5, w: 5, h: 0.5,
    fontSize: 12, color: C.accent, bold: true, letterSpacing: 4,
    fontFace: "Arial",
  })
  addAccentLine(s, 1.0)

  s.addText("Trust your AI. Verify every step.", {
    x: 0.5, y: 1.3, w: 9, h: 0.8,
    fontSize: 32, color: C.white, bold: true,
    fontFace: "Arial",
  })

  s.addText(
    "We cross-validate outputs across the best AI engines available.",
    {
      x: 0.5, y: 2.2, w: 9, h: 0.5,
      fontSize: 16, color: C.muted,
      fontFace: "Arial",
    }
  )

  const steps = [
    { num: "01", title: "Prompt", desc: "Natural language\nor documents", color: C.cyan },
    { num: "02", title: "Orchestrate", desc: "Consensus Engine\nqueries multiple models", color: C.accent },
    { num: "03", title: "Validate", desc: "RGS layer cross-checks\nfacts against secure data", color: C.green },
    { num: "04", title: "Deploy", desc: "Receive accurate,\nscored strategies", color: C.orange },
  ]

  // Connecting line
  s.addShape(pptx.ShapeType.rect, {
    x: 1.5, y: 4.0, w: 10.5, h: 0.04,
    fill: { color: C.accent },
  })

  steps.forEach((st, i) => {
    const x = 0.7 + i * 3.1
    // Circle number
    s.addShape(pptx.ShapeType.ellipse, {
      x: x + 0.6, y: 3.5, w: 0.9, h: 0.9,
      fill: { color: st.color },
    })
    s.addText(st.num, {
      x: x + 0.6, y: 3.5, w: 0.9, h: 0.9,
      fontSize: 18, color: C.bg, bold: true, align: "center", valign: "middle",
      fontFace: "Arial",
    })
    // Card below
    s.addShape(pptx.ShapeType.roundRect, {
      x, y: 4.6, w: 2.8, h: 1.8,
      fill: { color: C.card }, rectRadius: 0.1,
    })
    s.addText(st.title, {
      x, y: 4.7, w: 2.8, h: 0.5,
      fontSize: 16, color: C.white, bold: true, align: "center",
      fontFace: "Arial",
    })
    s.addText(st.desc, {
      x, y: 5.2, w: 2.8, h: 1.0,
      fontSize: 12, color: C.muted, align: "center",
      fontFace: "Arial",
    })
  })

  addFooter(s)
}

// ═══════════════════════════════════════════════════════════════
// SLIDE 6 — Trust, Governance & Certifications
// ═══════════════════════════════════════════════════════════════
{
  const s = pptx.addSlide()
  addBg(s)

  s.addText("TRUST & GOVERNANCE", {
    x: 0.5, y: 0.5, w: 5, h: 0.5,
    fontSize: 12, color: C.green, bold: true, letterSpacing: 4,
    fontFace: "Arial",
  })
  addAccentLine(s, 1.0)

  s.addText("Engineered for the strictest\ncompliance standards.", {
    x: 0.5, y: 1.3, w: 9, h: 1.2,
    fontSize: 32, color: C.white, bold: true,
    fontFace: "Arial", lineSpacingMultiple: 1.1,
  })

  s.addText(
    "Ensure your entire AI workflow stays governed from prompt to PDF.",
    {
      x: 0.5, y: 2.7, w: 9, h: 0.5,
      fontSize: 16, color: C.muted,
      fontFace: "Arial",
    }
  )

  const govFeatures = [
    { title: "Exportable Audit Summaries", desc: "PDF/PPTX reports with full evidence chains for compliance review" },
    { title: "Source-Verification Visibility", desc: "Every claim linked to its originating data source and model" },
    { title: "Profile-Versioned Scoring", desc: "Review scoring calibrated to user profile and evolving standards" },
  ]
  govFeatures.forEach((g, i) => {
    const x = 0.5 + i * 4.1
    s.addShape(pptx.ShapeType.roundRect, {
      x, y: 3.6, w: 3.8, h: 2.4,
      fill: { color: C.card }, rectRadius: 0.1,
    })
    s.addShape(pptx.ShapeType.rect, {
      x, y: 3.6, w: 3.8, h: 0.06,
      fill: { color: C.green },
    })
    s.addText(g.title, {
      x: x + 0.2, y: 3.8, w: 3.4, h: 0.7,
      fontSize: 16, color: C.white, bold: true,
      fontFace: "Arial",
    })
    s.addText(g.desc, {
      x: x + 0.2, y: 4.5, w: 3.4, h: 1.2,
      fontSize: 13, color: C.muted,
      fontFace: "Arial",
    })
  })

  addFooter(s)
}

// ═══════════════════════════════════════════════════════════════
// SLIDE 7 — Industry Verticals
// ═══════════════════════════════════════════════════════════════
{
  const s = pptx.addSlide()
  addBg(s)

  s.addText("INDUSTRY VERTICALS", {
    x: 0.5, y: 0.5, w: 5, h: 0.5,
    fontSize: 12, color: C.cyan, bold: true, letterSpacing: 4,
    fontFace: "Arial",
  })
  addAccentLine(s, 1.0)

  s.addText("Tailored AI capabilities to accelerate\nyour sector's hardest challenges.", {
    x: 0.5, y: 1.3, w: 10, h: 1.2,
    fontSize: 32, color: C.white, bold: true,
    fontFace: "Arial", lineSpacingMultiple: 1.1,
  })

  const industries = [
    { title: "Financial Services", desc: "Automate risk assessment & compliance reporting with auditable AI", color: C.cyan },
    { title: "Healthcare", desc: "Synthesize medical literature and clinical data with full traceability", color: C.green },
    { title: "Enterprise Ops", desc: "Build custom isolated knowledge bases for departmental intelligence", color: C.accent },
    { title: "Non-Profits & NGOs", desc: "Dedicated module for donor analysis, grant writing & impact reporting", color: C.orange },
  ]
  industries.forEach((ind, i) => {
    const x = 0.5 + (i % 2) * 6.2
    const y = 3.2 + Math.floor(i / 2) * 2.0
    s.addShape(pptx.ShapeType.roundRect, {
      x, y, w: 5.8, h: 1.7,
      fill: { color: C.card }, rectRadius: 0.1,
    })
    s.addShape(pptx.ShapeType.rect, {
      x, y, w: 0.08, h: 1.7,
      fill: { color: ind.color },
    })
    s.addText(ind.title, {
      x: x + 0.4, y, w: 5, h: 0.7,
      fontSize: 18, color: C.white, bold: true, valign: "bottom",
      fontFace: "Arial",
    })
    s.addText(ind.desc, {
      x: x + 0.4, y: y + 0.7, w: 5, h: 0.8,
      fontSize: 13, color: C.muted, valign: "top",
      fontFace: "Arial",
    })
  })

  addFooter(s)
}

// ═══════════════════════════════════════════════════════════════
// SLIDE 8 — Pricing
// ═══════════════════════════════════════════════════════════════
{
  const s = pptx.addSlide()
  addBg(s)

  s.addText("PRICING", {
    x: 0.5, y: 0.5, w: 5, h: 0.5,
    fontSize: 12, color: C.accent, bold: true, letterSpacing: 4,
    fontFace: "Arial",
  })
  addAccentLine(s, 1.0)

  s.addText("Simple, transparent pricing.\nThe software that pays for itself.", {
    x: 0.5, y: 1.3, w: 9, h: 1.0,
    fontSize: 30, color: C.white, bold: true,
    fontFace: "Arial", lineSpacingMultiple: 1.1,
  })

  const plans = [
    {
      name: "Basic", price: "Free", color: C.muted,
      features: ["Idea Cooking", "Canvas Generation", "3 exports / month"],
    },
    {
      name: "Pro", price: "$20/mo", color: C.accent, highlight: true,
      features: ["50 review credits", "Evidence-backed workspace", "NGO module access"],
    },
    {
      name: "Enterprise", price: "$50/mo per user", color: C.cyan,
      features: ["Unlimited exports", "Custom branding", "Workspace auditability"],
    },
  ]
  plans.forEach((p, i) => {
    const x = 0.5 + i * 4.2
    const cardColor = p.highlight ? C.accentAlt : C.card
    s.addShape(pptx.ShapeType.roundRect, {
      x, y: 2.8, w: 3.9, h: 3.8,
      fill: { color: cardColor }, rectRadius: 0.12,
    })
    if (p.highlight) {
      s.addText("MOST POPULAR", {
        x, y: 2.9, w: 3.9, h: 0.35,
        fontSize: 9, color: C.white, bold: true, align: "center",
        fontFace: "Arial",
      })
    }
    s.addText(p.name, {
      x, y: 3.3, w: 3.9, h: 0.5,
      fontSize: 20, color: C.white, bold: true, align: "center",
      fontFace: "Arial",
    })
    s.addText(p.price, {
      x, y: 3.8, w: 3.9, h: 0.6,
      fontSize: 28, color: p.color, bold: true, align: "center",
      fontFace: "Arial",
    })
    p.features.forEach((feat, fi) => {
      s.addText(`▸  ${feat}`, {
        x: x + 0.4, y: 4.6 + fi * 0.5, w: 3.2, h: 0.45,
        fontSize: 13, color: C.white,
        fontFace: "Arial",
      })
    })
  })

  addFooter(s)
}

// ═══════════════════════════════════════════════════════════════
// SLIDE 9 — Journey & AWS Ask
// ═══════════════════════════════════════════════════════════════
{
  const s = pptx.addSlide()
  addBg(s)

  s.addText("THE JOURNEY & AWS ASK", {
    x: 0.5, y: 0.5, w: 6, h: 0.5,
    fontSize: 12, color: C.orange, bold: true, letterSpacing: 4,
    fontFace: "Arial",
  })
  addAccentLine(s, 1.0)

  s.addText("From initial prompt to\nenterprise-wide scaling.", {
    x: 0.5, y: 1.3, w: 9, h: 1.0,
    fontSize: 30, color: C.white, bold: true,
    fontFace: "Arial", lineSpacingMultiple: 1.1,
  })

  // Timeline phases
  const phases = [
    { label: "Phase 1", desc: "Natural language\nprompting", color: C.cyan },
    { label: "Phase 2", desc: "Multi-step business\nworkflows", color: C.accent },
    { label: "Phase 3", desc: "Secure, isolated\nenterprise deployments", color: C.green },
    { label: "Phase 4", desc: "Massive cross-dept\nscaling", color: C.orange },
  ]

  // Timeline line
  s.addShape(pptx.ShapeType.rect, {
    x: 1.2, y: 3.25, w: 11, h: 0.04,
    fill: { color: C.accent },
  })

  phases.forEach((ph, i) => {
    const x = 0.6 + i * 3.1
    s.addShape(pptx.ShapeType.ellipse, {
      x: x + 1.0, y: 2.9, w: 0.7, h: 0.7,
      fill: { color: ph.color },
    })
    s.addText(ph.label, {
      x, y: 3.7, w: 2.8, h: 0.4,
      fontSize: 12, color: ph.color, bold: true, align: "center",
      fontFace: "Arial",
    })
    s.addText(ph.desc, {
      x, y: 4.1, w: 2.8, h: 0.8,
      fontSize: 12, color: C.muted, align: "center",
      fontFace: "Arial",
    })
  })

  // AWS Ask callout box
  s.addShape(pptx.ShapeType.roundRect, {
    x: 0.5, y: 5.2, w: 12.33, h: 1.5,
    fill: { color: "1A1040" }, rectRadius: 0.12,
    line: { color: C.accent, width: 1.5 },
  })
  s.addText("☁  THE AWS ASK", {
    x: 0.8, y: 5.3, w: 5, h: 0.4,
    fontSize: 13, color: C.cyan, bold: true,
    fontFace: "Arial",
  })
  s.addText(
    "Scaling NovusSparks' multi-engine validation and semantic RAG requires immense, reliable compute power. We are partnering with AWS to fuel our heavy GPU inference and secure document storage as we onboard our enterprise waitlist.",
    {
      x: 0.8, y: 5.7, w: 11.7, h: 0.9,
      fontSize: 13, color: C.white,
      fontFace: "Arial",
    }
  )

  addFooter(s)
}

// ═══════════════════════════════════════════════════════════════
// SLIDE 10 — Call to Action
// ═══════════════════════════════════════════════════════════════
{
  const s = pptx.addSlide()
  addBg(s)

  s.addText("Ready to Make\nSmarter Decisions?", {
    x: 0.5, y: 1.5, w: 12, h: 2.0,
    fontSize: 44, color: C.white, bold: true, align: "center",
    fontFace: "Arial", lineSpacingMultiple: 1.1,
  })

  s.addText(
    "Join forward-thinking teams using Techpigeon's multi-engine AI consensus\nto validate ideas, build strategies, and ship with confidence.",
    {
      x: 1.5, y: 3.6, w: 10, h: 1.0,
      fontSize: 16, color: C.muted, align: "center",
      fontFace: "Arial",
    }
  )

  // CTA button
  s.addShape(pptx.ShapeType.roundRect, {
    x: 4.2, y: 4.8, w: 5, h: 0.8,
    fill: { color: C.accent }, rectRadius: 0.4,
  })
  s.addText("Get Started — It's Free", {
    x: 4.2, y: 4.8, w: 5, h: 0.8,
    fontSize: 20, color: C.white, bold: true, align: "center", valign: "middle",
    fontFace: "Arial",
  })

  // Contact info
  s.addShape(pptx.ShapeType.roundRect, {
    x: 3.2, y: 5.9, w: 7, h: 1.0,
    fill: { color: C.card }, rectRadius: 0.1,
  })
  s.addText("umer@techpigeon.org   |   www.techpigeon.org   |   www.novussparks.com", {
    x: 3.2, y: 5.9, w: 7, h: 1.0,
    fontSize: 14, color: C.cyan, align: "center", valign: "middle",
    fontFace: "Arial",
  })

  addFooter(s, "© 2026 Techpigeon. All rights reserved.")
}

// ── Generate ──
const filename = "Techpigeon-PitchDeck.pptx"
await pptx.writeFile({ fileName: filename })
console.log(`✅ Generated: ${filename}`)
