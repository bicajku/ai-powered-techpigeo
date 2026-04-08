import { SavedReviewDocument, SavedStrategy, BusinessCanvasModel, PitchDeck } from "@/types"
import { format } from "date-fns"
import { ReviewComputationMeta, ReviewFilters, SectionSummary, enrichReviewResult } from "@/lib/review-engine"
import { REPORT_BRAND, reportLogoMarkupAsync } from "@/lib/report-branding"

// ─────────────────────────── H10 XSS Fix: HTML Escaping ──────────
/**
 * Escape user-supplied strings before interpolating into HTML templates.
 * Prevents XSS via injected <script>, event handlers, or entity abuse.
 */
function escapeHtml(str: unknown): string {
  if (str === null || str === undefined) return ""
  const s = String(str)
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

export async function exportStrategyAsPDF(strategy: SavedStrategy) {
  const brand = REPORT_BRAND
  const logoHtml = await reportLogoMarkupAsync(42)
  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(strategy.name)}</title>
  <style>
    body { font-family: Inter, sans-serif; padding: 40px; max-width: 1000px; margin: 0 auto; color: ${brand.colors.text}; }
    .header { border-bottom: 3px solid ${brand.colors.accent}; padding-bottom: 16px; margin-bottom: 24px; display: flex; justify-content: space-between; align-items: center; }
    h1 { color: ${brand.colors.primary}; }
    .section { margin: 20px 0; padding: 15px; border-left: 3px solid ${brand.colors.accent}; background: ${brand.colors.panel}; }
    .footer { margin-top: 50px; border-top: 2px solid ${brand.colors.accent}; padding-top: 20px; text-align: center; font-size: 12px; color: ${brand.colors.muted}; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div style="font-weight: 700; color: ${brand.colors.primary};">${escapeHtml(brand.companyName)}</div>
      <div style="font-size: 12px; color: ${brand.colors.muted};">${escapeHtml(brand.projectName)}</div>
    </div>
    ${logoHtml}
  </div>
  <h1>${escapeHtml(strategy.name)}</h1>
  <p><strong>Created:</strong> ${format(strategy.timestamp, "MMM d, yyyy")}</p>
  <div class="section">
    <h2>Description</h2>
    <p>${escapeHtml(strategy.description)}</p>
  </div>
  <div class="section">
    <h2>Marketing Copy</h2>
    <p>${escapeHtml(strategy.result.marketingCopy)}</p>
  </div>
  <div class="section">
    <h2>Visual Strategy</h2>
    <p>${escapeHtml(strategy.result.visualStrategy)}</p>
  </div>
  <div class="section">
    <h2>Target Audience</h2>
    <p>${escapeHtml(strategy.result.targetAudience)}</p>
  </div>
  <div class="footer">
    <strong>${escapeHtml(brand.companyName)}</strong><br>
    ${escapeHtml(brand.projectName)}<br>
    ${escapeHtml(brand.contactLine)}
  </div>
</body>
</html>
  `
  
  const blob = new Blob([htmlContent], { type: 'text/html' })
  const url = URL.createObjectURL(blob)
  const printWindow = window.open(url, '_blank')
  if (printWindow) {
    printWindow.onload = () => {
      setTimeout(() => {
        printWindow.print()
        URL.revokeObjectURL(url)
      }, 250)
    }
  }
}

export async function exportReviewToPDF(
  review: SavedReviewDocument,
  options?: {
    meta?: ReviewComputationMeta
    sections?: SectionSummary[]
    filters?: ReviewFilters
  }
) {
  const brand = REPORT_BRAND
  const fallback = enrichReviewResult(review.documentText, review.plagiarismResult)
  const meta = options?.meta || fallback.meta
  const sections = options?.sections || []
  const filters = options?.filters

  const techpigeonLogo = await reportLogoMarkupAsync(50)

  const highlightText = (text: string) => {
    // H10: Escape the base text FIRST to prevent XSS, then apply highlight
    // <mark> tags on the already-escaped content. The highlight search strings
    // must also be escaped so the regex matches the escaped output.
    let highlightedText = escapeHtml(text)

    review.plagiarismResult.highlights.forEach((highlight) => {
      const escapedSearch = escapeHtml(highlight.text)
      const regex = new RegExp(escapeRegExp(escapedSearch), 'gi')
      const color = highlight.severity === 'high' ? '#ff4444' : highlight.severity === 'medium' ? '#ff9944' : '#ffcc44'
      highlightedText = highlightedText.replace(
        regex,
        `<mark style="background-color: ${color}; padding: 2px 4px; border-radius: 2px;">$&</mark>`
      )
    })

    review.plagiarismResult.aiHighlights.forEach((aiHighlight) => {
      const escapedSearch = escapeHtml(aiHighlight.text)
      const regex = new RegExp(escapeRegExp(escapedSearch), 'gi')
      highlightedText = highlightedText.replace(
        regex,
        `<mark style="background-color: #9966ff; padding: 2px 4px; border-radius: 2px;">$&</mark>`
      )
    })

    return highlightedText
  }

  const escapeRegExp = (string: string) => {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }

  const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(review.name)} - ${escapeHtml(brand.companyName)} Review Report</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: 'Inter', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      line-height: 1.6;
      color: ${brand.colors.text};
      background: #ffffff;
      padding: 40px;
      max-width: 1000px;
      margin: 0 auto;
    }
    
    .header {
      border-bottom: 3px solid ${brand.colors.accent};
      padding-bottom: 20px;
      margin-bottom: 30px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    
    .header-content h1 {
      font-size: 28px;
      color: ${brand.colors.text};
      margin-bottom: 8px;
    }
    
    .header-content .subtitle {
      font-size: 14px;
      color: ${brand.colors.muted};
    }
    
    .logo-section {
      text-align: right;
    }
    
    .logo-section img {
      width: 50px;
      height: 50px;
    }
    
    .company-name {
      font-size: 18px;
      font-weight: 700;
      color: ${brand.colors.primary};
      margin-top: 5px;
    }
    
    .meta-info {
      background: ${brand.colors.panel};
      border-left: 4px solid ${brand.colors.accent};
      padding: 20px;
      margin-bottom: 30px;
      border-radius: 4px;
    }
    
    .meta-info h2 {
      font-size: 18px;
      margin-bottom: 15px;
      color: ${brand.colors.text};
    }
    
    .meta-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 15px;
    }
    
    .meta-item {
      font-size: 14px;
    }
    
    .meta-label {
      font-weight: 600;
      color: ${brand.colors.muted};
      margin-bottom: 4px;
    }
    
    .meta-value {
      color: ${brand.colors.text};
    }
    
    .scores-section {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 20px;
      margin-bottom: 30px;
    }
    
    .score-card {
      background: #ffffff;
      border: 2px solid #e0e0e0;
      border-radius: 8px;
      padding: 20px;
      text-align: center;
    }
    
    .score-label {
      font-size: 12px;
      text-transform: uppercase;
      color: ${brand.colors.muted};
      margin-bottom: 10px;
      font-weight: 600;
      letter-spacing: 0.5px;
    }
    
    .score-value {
      font-size: 36px;
      font-weight: 700;
      margin-bottom: 5px;
    }
    
    .score-value.good {
      color: #22c55e;
    }
    
    .score-value.warning {
      color: #f59e0b;
    }
    
    .score-value.danger {
      color: #ef4444;
    }
    
    .section {
      margin-bottom: 35px;
    }
    
    .section-title {
      font-size: 20px;
      font-weight: 700;
      color: ${brand.colors.text};
      margin-bottom: 15px;
      padding-bottom: 8px;
      border-bottom: 2px solid ${brand.colors.border};
    }
    
    .section-content {
      font-size: 14px;
      line-height: 1.8;
      color: ${brand.colors.text};
    }
    
    .document-text {
      background: ${brand.colors.panel};
      border: 1px solid ${brand.colors.border};
      border-radius: 6px;
      padding: 20px;
      font-size: 14px;
      line-height: 1.8;
      white-space: pre-wrap;
      word-wrap: break-word;
    }
    
    .legend {
      background: #fffbf0;
      border: 1px solid ${brand.colors.accent};
      border-radius: 6px;
      padding: 15px;
      margin-bottom: 20px;
    }
    
    .legend h3 {
      font-size: 14px;
      font-weight: 700;
      margin-bottom: 10px;
      color: ${brand.colors.text};
    }
    
    .legend-items {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 10px;
    }
    
    .legend-item {
      display: flex;
      align-items: center;
      font-size: 12px;
    }
    
    .legend-color {
      width: 20px;
      height: 20px;
      border-radius: 3px;
      margin-right: 8px;
    }
    
    .highlight-high {
      background-color: #ff4444;
    }
    
    .highlight-medium {
      background-color: #ff9944;
    }
    
    .highlight-low {
      background-color: #ffcc44;
    }
    
    .highlight-ai {
      background-color: #9966ff;
    }
    
    .recommendations {
      list-style: none;
      padding: 0;
    }
    
    .recommendations li {
      background: ${brand.colors.panel};
      border-left: 3px solid ${brand.colors.accent};
      padding: 12px 15px;
      margin-bottom: 10px;
      border-radius: 4px;
      font-size: 14px;
    }
    
    .recommendations li:before {
      content: "✓";
      color: ${brand.colors.accent};
      font-weight: bold;
      margin-right: 10px;
    }
    
    .footer {
      margin-top: 50px;
      padding-top: 20px;
      border-top: 2px solid ${brand.colors.border};
      text-align: center;
      font-size: 12px;
      color: ${brand.colors.muted};
    }
    
    .footer-brand {
      font-weight: 700;
      color: ${brand.colors.primary};
      font-size: 14px;
      margin-bottom: 8px;
    }
    
    .footer-address {
      line-height: 1.6;
      margin-top: 10px;
    }
    
    .turnitin-badge {
      display: inline-block;
      background: ${review.plagiarismResult.turnitinReady ? '#22c55e' : '#ef4444'};
      color: white;
      padding: 8px 16px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      margin-top: 10px;
    }
    
    @media print {
      body {
        padding: 20px;
      }
      
      .score-card {
        break-inside: avoid;
      }
      
      .section {
        break-inside: avoid;
      }
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="header-content">
      <h1>Academic Integrity Report</h1>
      <div class="subtitle">${escapeHtml(brand.projectName)} | Generated by ${escapeHtml(brand.companyName)} Review System</div>
    </div>
    <div class="logo-section">
      ${techpigeonLogo}
      <div class="company-name">${escapeHtml(brand.companyName)}</div>
    </div>
  </div>

  <div class="meta-info">
    <h2>Review Information</h2>
    <div class="meta-grid">
      <div class="meta-item">
        <div class="meta-label">Document Name</div>
        <div class="meta-value">${escapeHtml(review.name)}</div>
      </div>
      <div class="meta-item">
        <div class="meta-label">Original File</div>
        <div class="meta-value">${escapeHtml(review.fileName)}</div>
      </div>
      <div class="meta-item">
        <div class="meta-label">Review Date</div>
        <div class="meta-value">${format(review.timestamp, "MMMM d, yyyy 'at' h:mm a")}</div>
      </div>
      <div class="meta-item">
        <div class="meta-label">Submission Risk</div>
        <div class="meta-value">
          <span class="turnitin-badge">
            ${review.plagiarismResult.turnitinReady ? '✓ Lower Submission Risk' : '✗ Needs Review'}
          </span>
        </div>
      </div>
    </div>
  </div>

  <div class="scores-section">
    <div class="score-card">
      <div class="score-label">Integrity Score</div>
      <div class="score-value ${review.plagiarismResult.overallScore >= 80 ? 'good' : review.plagiarismResult.overallScore >= 60 ? 'warning' : 'danger'}">
        ${review.plagiarismResult.overallScore}%
      </div>
    </div>
    <div class="score-card">
      <div class="score-label">Plagiarism Detected</div>
      <div class="score-value ${review.plagiarismResult.plagiarismPercentage <= 20 ? 'good' : review.plagiarismResult.plagiarismPercentage <= 40 ? 'warning' : 'danger'}">
        ${review.plagiarismResult.plagiarismPercentage}%
      </div>
    </div>
    <div class="score-card">
      <div class="score-label">AI Content</div>
      <div class="score-value ${review.plagiarismResult.aiContentPercentage <= 20 ? 'good' : review.plagiarismResult.aiContentPercentage <= 40 ? 'warning' : 'danger'}">
        ${review.plagiarismResult.aiContentPercentage}%
      </div>
    </div>
    <div class="score-card">
      <div class="score-label">Estimated Similarity Range</div>
      <div class="score-value warning">
        ${meta.likelyTurnitinRange.min}% - ${meta.likelyTurnitinRange.max}%
      </div>
      <div style="font-size: 12px; color: #666;">Confidence: ${escapeHtml(meta.confidenceLabel.toUpperCase())}</div>
    </div>
  </div>

  <div class="section">
    <h2 class="section-title">Scoring Context</h2>
    <div class="section-content">
      ${meta.confidenceReasons.map((reason) => `<div>- ${escapeHtml(reason)}</div>`).join("")}
      <div style="margin-top: 10px;"><strong>Scoring profile:</strong> ${escapeHtml(meta.scoringProfile)} (${escapeHtml(meta.profileVersion)})</div>
      ${filters ? `<div style="margin-top: 10px;"><strong>Active filters:</strong> quotes=${filters.excludeQuotes ? "excluded" : "included"}, references=${filters.excludeReferences ? "excluded" : "included"}, minMatchWords=${filters.minMatchWords}</div>` : ""}
    </div>
  </div>

  ${meta.evidenceItems.length > 0 ? `
  <div class="section">
    <h2 class="section-title">Evidence Ledger</h2>
    <div class="section-content">
      ${meta.evidenceItems.map((item) => `
        <div style="background: ${brand.colors.panel}; border-left: 3px solid ${item.impact === "positive" ? "#22c55e" : item.impact === "neutral" ? brand.colors.accent : "#ef4444"}; padding: 12px 15px; margin-bottom: 10px; border-radius: 4px;">
          <strong>${escapeHtml(item.label)}</strong> <span style="font-size: 12px; color: ${brand.colors.muted}; text-transform: uppercase;">${escapeHtml(item.impact)}</span><br>
          <span>${escapeHtml(item.detail)}</span>
        </div>
      `).join("")}
    </div>
  </div>
  ` : ""}

  ${meta.provenance.length > 0 ? `
  <div class="section">
    <h2 class="section-title">Evidence Provenance</h2>
    <div class="section-content">
      ${meta.provenance.map((item) => `
        <div style="background: #fff; border: 1px solid ${brand.colors.border}; padding: 12px 15px; margin-bottom: 10px; border-radius: 4px;">
          <strong>${escapeHtml(item.label)}</strong> <span style="font-size: 12px; color: ${brand.colors.muted}; text-transform: uppercase;">${escapeHtml(item.status)}</span><br>
          <span>${escapeHtml(item.detail)}</span>
        </div>
      `).join("")}
    </div>
  </div>
  ` : ""}



  <div class="section">
    <h2 class="section-title">Executive Summary</h2>
    <div class="section-content">
      ${escapeHtml(review.summary)}
    </div>
  </div>

  ${sections.length > 0 ? `
  <div class="section">
    <h2 class="section-title">Section Summaries</h2>
    <div class="section-content">
      ${sections
        .map(
          (item) => `
            <div style="background: ${brand.colors.panel}; border-left: 3px solid ${brand.colors.accent}; padding: 12px 15px; margin-bottom: 10px; border-radius: 4px;">
              <strong>${escapeHtml(item.section)}</strong><br>
              <span>${escapeHtml(item.summary)}</span>
            </div>
          `
        )
        .join("")}
    </div>
  </div>
  ` : ""}

  ${review.plagiarismResult.recommendations.length > 0 ? `
  <div class="section">
    <h2 class="section-title">Recommendations</h2>
    <ul class="recommendations">
      ${review.plagiarismResult.recommendations.map(rec => `<li>${escapeHtml(rec)}</li>`).join('')}
    </ul>
  </div>
  ` : ''}

  ${(review.plagiarismResult.highlights.length > 0 || review.plagiarismResult.aiHighlights.length > 0) ? `
  <div class="section">
    <h2 class="section-title">Evidence Highlights</h2>
    <div class="legend">
      <h3>Highlight Legend</h3>
      <div class="legend-items">
        ${review.plagiarismResult.highlights.length > 0 ? `
        <div class="legend-item">
          <div class="legend-color highlight-high"></div>
          <span>High Risk Plagiarism</span>
        </div>
        <div class="legend-item">
          <div class="legend-color highlight-medium"></div>
          <span>Medium Risk Plagiarism</span>
        </div>
        <div class="legend-item">
          <div class="legend-color highlight-low"></div>
          <span>Low Risk Plagiarism</span>
        </div>
        ` : ''}
        ${review.plagiarismResult.aiHighlights.length > 0 ? `
        <div class="legend-item">
          <div class="legend-color highlight-ai"></div>
          <span>AI-Generated Content</span>
        </div>
        ` : ''}
      </div>
    </div>
    <div class="document-text">
      ${highlightText(review.documentText)}
    </div>
  </div>
  ` : `
  <div class="section">
    <h2 class="section-title">Original Document Text</h2>
    <div class="document-text">
      ${escapeHtml(review.documentText)}
    </div>
  </div>
  `}

  ${review.plagiarismResult.detectedSources.length > 0 ? `
  <div class="section">
    <h2 class="section-title">Detected Sources</h2>
    <div class="section-content">
      ${review.plagiarismResult.detectedSources.map(source => `
        <div style="background: ${brand.colors.panel}; border-left: 3px solid ${brand.colors.accent}; padding: 12px 15px; margin-bottom: 10px; border-radius: 4px;">
          <strong>${escapeHtml(source.source)}</strong> - ${source.similarity}% similarity
        </div>
      `).join('')}
    </div>
  </div>
  ` : ''}

  <div class="footer">
    <div class="footer-brand">${escapeHtml(brand.companyName)}</div>
    <div>${escapeHtml(brand.projectName)}</div>
    <div class="footer-address">
      ${escapeHtml(brand.contactLine)}
    </div>
    <div style="margin-top: 15px; font-size: 11px;">
      © ${new Date().getFullYear()} ${escapeHtml(brand.companyName)}. All rights reserved. | <a href="${escapeHtml(brand.website)}" style="color: ${brand.colors.accent}; text-decoration: none;">${escapeHtml(brand.website.replace("https://", ""))}</a>
    </div>
  </div>
</body>
</html>
  `

  const blob = new Blob([htmlContent], { type: 'text/html' })
  const url = URL.createObjectURL(blob)
  
  const printWindow = window.open(url, '_blank')
  if (printWindow) {
    printWindow.onload = () => {
      setTimeout(() => {
        printWindow.print()
        URL.revokeObjectURL(url)
      }, 250)
    }
  } else {
    const link = document.createElement('a')
    link.href = url
    link.download = `${review.name.replace(/[^a-z0-9]/gi, '_')}_NovusSparks_Review.html`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }
}

export async function exportBusinessCanvasAsPDF(canvas: BusinessCanvasModel, ideaName: string) {
  const brand = REPORT_BRAND
  const logoHtml = await reportLogoMarkupAsync(42)

  const stickySections = [
    { title: "Key Resources", content: canvas.keyResources },
    { title: "Customer Relationships", content: canvas.customerRelationships },
    { title: "Channels", content: canvas.channels },
  ]

  const stickyHtml = stickySections
    .map(
      (section, idx) => `
    <div class="sticky" style="transform: rotate(${idx % 2 === 0 ? "-0.8deg" : "0.8deg"});">
      <h4>${escapeHtml(section.title)}</h4>
      <p>${escapeHtml(section.content)}</p>
    </div>
  `
    )
    .join("")

  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Business Model Canvas - ${escapeHtml(ideaName)}</title>
  <style>
    body { font-family: Calibri, Arial, sans-serif; padding: 28px; max-width: 1100px; margin: 0 auto; color: #272727; background: #f7f9fb; }
    .top-strip { background: #3B8E7E; color: #fff; padding: 10px 16px; border-radius: 12px 12px 0 0; display: flex; justify-content: space-between; align-items: center; }
    .top-strip .badge { background: #FF6600; color: #fff; font-size: 10px; font-weight: 700; padding: 5px 9px; border-radius: 999px; }
    .pattern { height: 26px; border-radius: 0 0 12px 12px; margin-bottom: 18px; background-color: #3B8E7E; background-image: radial-gradient(circle at 15% 50%, rgba(255,255,255,0.12) 0, rgba(255,255,255,0.12) 14px, transparent 15px), radial-gradient(circle at 45% 50%, rgba(255,255,255,0.08) 0, rgba(255,255,255,0.08) 12px, transparent 13px), radial-gradient(circle at 78% 50%, rgba(255,255,255,0.1) 0, rgba(255,255,255,0.1) 14px, transparent 15px); }
    h1 { color: #FF6600; font-size: 31px; margin: 10px 0 8px; }
    .meta { font-size: 13px; color: #555; margin-bottom: 20px; }
    .canvas-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; }
    .box { border: 1px solid #27272766; border-radius: 9px; background: #fff; min-height: 164px; padding: 10px; }
    .box h3 { margin: 0 0 8px; font-size: 13px; color: #272727; }
    .box p { margin: 0; white-space: pre-wrap; line-height: 1.55; font-size: 11px; color: #272727dd; }
    .box.vp { background: #fff7ef; }
    .row-bottom { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 8px; }
    .row-bottom .box { min-height: 110px; }
    .row-bottom .rev h3 { color: #FF6600; }
    .sticky-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-top: 16px; }
    .sticky { background: #fff5bf; border: 1px solid #E8D892; border-radius: 8px; padding: 12px; box-shadow: 0 5px 10px rgba(0,0,0,0.08); }
    .sticky h4 { margin: 0 0 6px; font-size: 12px; color: #272727; }
    .sticky p { margin: 0; font-size: 11px; white-space: pre-wrap; color: #272727dd; line-height: 1.55; }
    .footer { margin-top: 28px; border-top: 2px solid #FF6600; padding-top: 14px; text-align: center; font-size: 12px; color: #666; }
    @media print { body { padding: 16px; background: #fff; } }
  </style>
</head>
<body>
  <div class="top-strip">
    <div><strong>Business Model Development</strong></div>
    <div class="badge">TEMPLATE MODE</div>
  </div>
  <div class="pattern"></div>
  <div style="display: flex; justify-content: space-between; align-items: center; gap: 12px;">${logoHtml}<div></div></div>
  <h1>Business Model Canvas</h1>
  <div class="meta">
    <strong>Business Idea:</strong> ${escapeHtml(ideaName)}<br>
    <strong>Generated:</strong> ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
  </div>
  <div class="canvas-grid">
    <div class="box"><h3>KP - Key Partners</h3><p>${escapeHtml(canvas.keyPartners)}</p></div>
    <div class="box"><h3>KA - Key Activities</h3><p>${escapeHtml(canvas.keyActivities)}</p></div>
    <div class="box vp"><h3>VP - Value Proposition</h3><p>${escapeHtml(canvas.valueProposition)}</p></div>
    <div class="box"><h3>CR - Customer Relationships</h3><p>${escapeHtml(canvas.customerRelationships)}</p></div>
    <div class="box"><h3>CS - Customer Segments</h3><p>${escapeHtml(canvas.customerSegments)}</p></div>
  </div>
  <div class="row-bottom">
    <div class="box"><h3>C$ - Cost Structure</h3><p>${escapeHtml(canvas.costStructure)}</p></div>
    <div class="box rev"><h3>R$ - Revenue Streams</h3><p>${escapeHtml(canvas.revenueStreams)}</p></div>
  </div>
  <div class="sticky-row">${stickyHtml}</div>
  <div class="footer">
    <strong>${escapeHtml(brand.companyName)}</strong><br>
    ${escapeHtml(brand.projectName)}<br>
    ${escapeHtml(brand.contactLine)}
  </div>
</body>
</html>
  `

  const blob = new Blob([htmlContent], { type: 'text/html' })
  const url = URL.createObjectURL(blob)
  const printWindow = window.open(url, '_blank')
  if (printWindow) {
    printWindow.onload = () => {
      setTimeout(() => {
        printWindow.print()
        URL.revokeObjectURL(url)
      }, 250)
    }
  } else {
    const link = document.createElement('a')
    link.href = url
    link.download = `Business_Canvas_${ideaName.replace(/[^a-z0-9]/gi, '_')}_NovusSparks.html`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }
}

export async function exportPitchDeckAsPDF(pitchDeck: PitchDeck, ideaName: string) {
  const brand = REPORT_BRAND
  const logoHtml = await reportLogoMarkupAsync(42)

  const slidesHtml = pitchDeck.slides.map((slide, index) => `
    <div class="slide" style="page-break-inside: avoid; margin-bottom: 24px;">
      <div style="background: ${index % 2 === 0 ? "#FF6600" : "#3B8E7E"}; color: white; padding: 11px 16px; font-weight: 700; font-size: 16px; border-radius: 10px 10px 0 0;">Slide ${slide.slideNumber}: ${escapeHtml(slide.title)}</div>
      <div style="padding: 16px; background: #fff; border: 1px solid #d9dde3; border-top: none; border-radius: 0 0 10px 10px;">
        <p style="margin: 0 0 12px 0; line-height: 1.7; white-space: pre-wrap; color: #272727;">${escapeHtml(slide.content)}</p>
        ${slide.notes ? `<div style="margin-top: 12px; padding: 12px; background: #f4f9f7; border-left: 4px solid #3B8E7E; border-radius: 6px;"><strong style="color:#3B8E7E;">Speaker Notes:</strong><br><span style="font-style: italic; color: #4f4f4f;">${escapeHtml(slide.notes)}</span></div>` : ''}
      </div>
    </div>
  `).join('')

  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Pitch Deck - ${escapeHtml(ideaName)}</title>
  <style>
    body { font-family: Calibri, Arial, sans-serif; padding: 28px; max-width: 1000px; margin: 0 auto; color: #272727; background: #f7f9fb; }
    .top-strip { background: #3B8E7E; color: #fff; padding: 10px 16px; border-radius: 12px 12px 0 0; display: flex; justify-content: space-between; align-items: center; }
    .top-strip .badge { background: #FF6600; color: #fff; font-size: 10px; font-weight: 700; padding: 5px 9px; border-radius: 999px; }
    .pattern { height: 26px; border-radius: 0 0 12px 12px; margin-bottom: 18px; background-color: #3B8E7E; background-image: radial-gradient(circle at 15% 50%, rgba(255,255,255,0.12) 0, rgba(255,255,255,0.12) 14px, transparent 15px), radial-gradient(circle at 45% 50%, rgba(255,255,255,0.08) 0, rgba(255,255,255,0.08) 12px, transparent 13px), radial-gradient(circle at 78% 50%, rgba(255,255,255,0.1) 0, rgba(255,255,255,0.1) 14px, transparent 15px); }
    h1 { color: #FF6600; font-size: 31px; margin: 10px 0 8px; }
    .meta { font-size: 13px; color: #555; margin-bottom: 20px; }
    .summary { padding: 18px; background: #fff7ef; border-left: 4px solid #FF6600; margin-bottom: 22px; border-radius: 8px; }
    .footer { margin-top: 34px; border-top: 2px solid #FF6600; padding-top: 16px; text-align: center; font-size: 12px; color: #666; }
    @media print { body { padding: 16px; background: #fff; } }
  </style>
</head>
<body>
  <div class="top-strip">
    <div><strong>Business Model Development</strong></div>
    <div class="badge">PITCH TEMPLATE</div>
  </div>
  <div class="pattern"></div>
  <div style="display: flex; justify-content: space-between; align-items: center; gap: 12px;">${logoHtml}<div></div></div>
  <h1>Pitch Deck: ${escapeHtml(ideaName)}</h1>
  <div class="meta">
    <strong>Slides:</strong> ${pitchDeck.slides.length}<br>
    <strong>Generated:</strong> ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
  </div>
  <div class="summary">
    <strong>Executive Summary</strong><br>
    <p style="margin: 8px 0 0 0; line-height: 1.7; white-space: pre-wrap;">${escapeHtml(pitchDeck.executiveSummary)}</p>
  </div>
  ${slidesHtml}
  <div class="footer">
    <strong>${escapeHtml(brand.companyName)}</strong><br>
    ${escapeHtml(brand.projectName)}<br>
    ${escapeHtml(brand.contactLine)}
  </div>
</body>
</html>
  `

  const blob = new Blob([htmlContent], { type: 'text/html' })
  const url = URL.createObjectURL(blob)
  const printWindow = window.open(url, '_blank')
  if (printWindow) {
    printWindow.onload = () => {
      setTimeout(() => {
        printWindow.print()
        URL.revokeObjectURL(url)
      }, 250)
    }
  } else {
    const link = document.createElement('a')
    link.href = url
    link.download = `Pitch_Deck_${ideaName.replace(/[^a-z0-9]/gi, '_')}_NovusSparks.html`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }
}
