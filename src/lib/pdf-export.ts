import { SavedReviewDocument, SavedStrategy } from "@/types"
import { format } from "date-fns"

export async function exportStrategyAsPDF(strategy: SavedStrategy) {
  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${strategy.name}</title>
  <style>
    body { font-family: Inter, sans-serif; padding: 40px; max-width: 1000px; margin: 0 auto; }
    h1 { color: #E0BF6B; }
    .section { margin: 20px 0; padding: 15px; border-left: 3px solid #E0BF6B; background: #f8f9fa; }
    .footer { margin-top: 50px; border-top: 2px solid #E0BF6B; padding-top: 20px; text-align: center; font-size: 12px; }
  </style>
</head>
<body>
  <h1>${strategy.name}</h1>
  <p><strong>Created:</strong> ${format(strategy.timestamp, "MMM d, yyyy")}</p>
  <div class="section">
    <h2>Description</h2>
    <p>${strategy.description}</p>
  </div>
  <div class="section">
    <h2>Marketing Copy</h2>
    <p>${strategy.result.marketingCopy}</p>
  </div>
  <div class="section">
    <h2>Visual Strategy</h2>
    <p>${strategy.result.visualStrategy}</p>
  </div>
  <div class="section">
    <h2>Target Audience</h2>
    <p>${strategy.result.targetAudience}</p>
  </div>
  <div class="footer">
    <strong>Techpigeon</strong><br>
    G-7/4, Islamabad 44000, Pakistan • Ph: +92(300) 0529697<br>
    Ph: +1(786) 8226386 • Techpigeon Spark LLC, Muscat, Oman 🇴🇲 • Ph: +968 76786324
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

export async function exportReviewToPDF(review: SavedReviewDocument) {
  const techpigeonLogo = `
    <svg width="40" height="40" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <circle cx="50" cy="50" r="45" fill="#E0BF6B" opacity="0.2"/>
      <path d="M50 20 L35 45 L50 40 L65 45 Z" fill="#E0BF6B"/>
      <circle cx="50" cy="55" r="20" fill="#E0BF6B"/>
      <circle cx="43" cy="52" r="3" fill="#000"/>
      <circle cx="57" cy="52" r="3" fill="#000"/>
    </svg>
  `

  const highlightText = (text: string) => {
    let highlightedText = text

    review.plagiarismResult.highlights.forEach((highlight) => {
      const regex = new RegExp(escapeRegExp(highlight.text), 'gi')
      const color = highlight.severity === 'high' ? '#ff4444' : highlight.severity === 'medium' ? '#ff9944' : '#ffcc44'
      highlightedText = highlightedText.replace(
        regex,
        `<mark style="background-color: ${color}; padding: 2px 4px; border-radius: 2px;">$&</mark>`
      )
    })

    review.plagiarismResult.aiHighlights.forEach((aiHighlight) => {
      const regex = new RegExp(escapeRegExp(aiHighlight.text), 'gi')
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
  <title>${review.name} - Techpigeon Review Report</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: 'Inter', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      line-height: 1.6;
      color: #1a1a1a;
      background: #ffffff;
      padding: 40px;
      max-width: 1000px;
      margin: 0 auto;
    }
    
    .header {
      border-bottom: 3px solid #E0BF6B;
      padding-bottom: 20px;
      margin-bottom: 30px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    
    .header-content h1 {
      font-size: 28px;
      color: #1a1a1a;
      margin-bottom: 8px;
    }
    
    .header-content .subtitle {
      font-size: 14px;
      color: #666;
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
      color: #E0BF6B;
      margin-top: 5px;
    }
    
    .meta-info {
      background: #f8f9fa;
      border-left: 4px solid #E0BF6B;
      padding: 20px;
      margin-bottom: 30px;
      border-radius: 4px;
    }
    
    .meta-info h2 {
      font-size: 18px;
      margin-bottom: 15px;
      color: #1a1a1a;
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
      color: #666;
      margin-bottom: 4px;
    }
    
    .meta-value {
      color: #1a1a1a;
    }
    
    .scores-section {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
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
      color: #666;
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
      color: #1a1a1a;
      margin-bottom: 15px;
      padding-bottom: 8px;
      border-bottom: 2px solid #e0e0e0;
    }
    
    .section-content {
      font-size: 14px;
      line-height: 1.8;
      color: #333;
    }
    
    .document-text {
      background: #f8f9fa;
      border: 1px solid #e0e0e0;
      border-radius: 6px;
      padding: 20px;
      font-size: 14px;
      line-height: 1.8;
      white-space: pre-wrap;
      word-wrap: break-word;
    }
    
    .legend {
      background: #fffbf0;
      border: 1px solid #E0BF6B;
      border-radius: 6px;
      padding: 15px;
      margin-bottom: 20px;
    }
    
    .legend h3 {
      font-size: 14px;
      font-weight: 700;
      margin-bottom: 10px;
      color: #1a1a1a;
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
      background: #f8f9fa;
      border-left: 3px solid #E0BF6B;
      padding: 12px 15px;
      margin-bottom: 10px;
      border-radius: 4px;
      font-size: 14px;
    }
    
    .recommendations li:before {
      content: "✓";
      color: #E0BF6B;
      font-weight: bold;
      margin-right: 10px;
    }
    
    .footer {
      margin-top: 50px;
      padding-top: 20px;
      border-top: 2px solid #e0e0e0;
      text-align: center;
      font-size: 12px;
      color: #666;
    }
    
    .footer-brand {
      font-weight: 700;
      color: #E0BF6B;
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
      <h1>Document Review Report</h1>
      <div class="subtitle">Reviewed by Techpigeon Review System</div>
    </div>
    <div class="logo-section">
      ${techpigeonLogo}
      <div class="company-name">Techpigeon</div>
    </div>
  </div>

  <div class="meta-info">
    <h2>Review Information</h2>
    <div class="meta-grid">
      <div class="meta-item">
        <div class="meta-label">Document Name</div>
        <div class="meta-value">${review.name}</div>
      </div>
      <div class="meta-item">
        <div class="meta-label">Original File</div>
        <div class="meta-value">${review.fileName}</div>
      </div>
      <div class="meta-item">
        <div class="meta-label">Review Date</div>
        <div class="meta-value">${format(review.timestamp, "MMMM d, yyyy 'at' h:mm a")}</div>
      </div>
      <div class="meta-item">
        <div class="meta-label">Turnitin Status</div>
        <div class="meta-value">
          <span class="turnitin-badge">
            ${review.plagiarismResult.turnitinReady ? '✓ Ready for Submission' : '✗ Needs Review'}
          </span>
        </div>
      </div>
    </div>
  </div>

  <div class="scores-section">
    <div class="score-card">
      <div class="score-label">Originality Score</div>
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
  </div>

  <div class="section">
    <h2 class="section-title">Executive Summary</h2>
    <div class="section-content">
      ${review.summary}
    </div>
  </div>

  ${review.plagiarismResult.recommendations.length > 0 ? `
  <div class="section">
    <h2 class="section-title">Recommendations</h2>
    <ul class="recommendations">
      ${review.plagiarismResult.recommendations.map(rec => `<li>${rec}</li>`).join('')}
    </ul>
  </div>
  ` : ''}

  ${(review.plagiarismResult.highlights.length > 0 || review.plagiarismResult.aiHighlights.length > 0) ? `
  <div class="section">
    <h2 class="section-title">Document Analysis with Highlights</h2>
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
      ${review.documentText}
    </div>
  </div>
  `}

  ${review.plagiarismResult.detectedSources.length > 0 ? `
  <div class="section">
    <h2 class="section-title">Detected Sources</h2>
    <div class="section-content">
      ${review.plagiarismResult.detectedSources.map(source => `
        <div style="background: #f8f9fa; border-left: 3px solid #E0BF6B; padding: 12px 15px; margin-bottom: 10px; border-radius: 4px;">
          <strong>${source.source}</strong> - ${source.similarity}% similarity
        </div>
      `).join('')}
    </div>
  </div>
  ` : ''}

  <div class="footer">
    <div class="footer-brand">TECHPIGEON</div>
    <div>AI-Powered Document Review & Plagiarism Detection System</div>
    <div class="footer-address">
      <strong>Pakistan Office:</strong> G-7/4, Islamabad 44000, Pakistan • Ph: +92(300) 0529697<br>
      <strong>USA Office:</strong> Ph: +1(786) 8226386<br>
      <strong>Oman Office:</strong> Techpigeon Spark LLC, Dohat al adab st, Alkhuwair, 133, Muscat, Oman 🇴🇲 • Ph: +968 76786324
    </div>
    <div style="margin-top: 15px; font-size: 11px;">
      © ${new Date().getFullYear()} Techpigeon. All rights reserved. | <a href="https://www.techpigeon.org" style="color: #E0BF6B; text-decoration: none;">www.techpigeon.org</a>
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
    link.download = `${review.name.replace(/[^a-z0-9]/gi, '_')}_Techpigeon_Review.html`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }
}
