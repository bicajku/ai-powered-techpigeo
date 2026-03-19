import { SavedStrategy } from "@/types"

export function exportStrategyAsPDF(strategy: SavedStrategy) {
  const optionalSections = [
    { title: "Application Workflow", content: strategy.result.applicationWorkflow },
    { title: "UI Workflow", content: strategy.result.uiWorkflow },
    { title: "Database Workflow", content: strategy.result.databaseWorkflow },
    { title: "Mobile Workflow", content: strategy.result.mobileWorkflow },
    { title: "Implementation Checklist", content: strategy.result.implementationChecklist },
  ].filter((section) => !!section.content)

  const optionalSectionsHtml = optionalSections
    .map(
      (section) => `
      <div class="section">
        <div class="section-title">${section.title}</div>
        <div class="section-content">${section.content}</div>
      </div>
      `
    )
    .join("")
  
  const styles = `
    <style>
      @page {
        margin: 2cm;
      }
      body {
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        line-height: 1.6;
        color: #1a1a1a;
        max-width: 800px;
        margin: 0 auto;
      }
      h1 {
        font-family: 'Plus Jakarta Sans', sans-serif;
        color: #2563eb;
        font-size: 28px;
        margin-bottom: 8px;
        font-weight: 700;
      }
      .subtitle {
        color: #64748b;
        font-size: 14px;
        margin-bottom: 24px;
      }
      .description {
        background: #f8fafc;
        padding: 16px;
        border-radius: 8px;
        margin-bottom: 24px;
        border-left: 4px solid #2563eb;
      }
      .description-label {
        font-weight: 600;
        color: #475569;
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        margin-bottom: 8px;
      }
      .section {
        margin-bottom: 32px;
        page-break-inside: avoid;
      }
      .section-title {
        font-family: 'Plus Jakarta Sans', sans-serif;
        font-size: 20px;
        font-weight: 600;
        color: #1e293b;
        margin-bottom: 12px;
        padding-bottom: 8px;
        border-bottom: 2px solid #e2e8f0;
      }
      .section-content {
        color: #334155;
        white-space: pre-wrap;
        font-size: 14px;
      }
      .footer {
        margin-top: 48px;
        padding-top: 24px;
        border-top: 2px solid #2563eb;
      }
      .footer-logo {
        color: #2563eb;
        font-weight: 700;
        font-size: 18px;
        margin-bottom: 16px;
        text-align: center;
      }
      .footer-tagline {
        color: #64748b;
        font-size: 13px;
        text-align: center;
        margin-bottom: 20px;
      }
      .contact-section {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 20px;
        margin-bottom: 16px;
      }
      .contact-block {
        background: #f8fafc;
        padding: 16px;
        border-radius: 8px;
        border-left: 3px solid #2563eb;
      }
      .contact-title {
        font-weight: 700;
        color: #1e293b;
        font-size: 14px;
        margin-bottom: 8px;
      }
      .contact-info {
        font-size: 12px;
        color: #475569;
        line-height: 1.8;
      }
      .footer-bottom {
        text-align: center;
        padding-top: 16px;
        border-top: 1px solid #e2e8f0;
        color: #94a3b8;
        font-size: 11px;
      }
      .website-link {
        color: #2563eb;
        text-decoration: none;
        font-weight: 600;
      }
    </style>
  `
  
  const content = `
    ${styles}
    <body>
      <h1>${strategy.name}</h1>
      <div class="subtitle">Generated on ${new Date(strategy.timestamp).toLocaleString(undefined, { 
        month: 'long', 
        day: 'numeric', 
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })}</div>
      
      <div class="description">
        <div class="description-label">Topic / Description</div>
        <div>${strategy.description}</div>
      </div>
      
      <div class="section">
        <div class="section-title">Marketing Copy</div>
        <div class="section-content">${strategy.result.marketingCopy}</div>
      </div>
      
      <div class="section">
        <div class="section-title">Visual Strategy</div>
        <div class="section-content">${strategy.result.visualStrategy}</div>
      </div>
      
      <div class="section">
        <div class="section-title">Target Audience</div>
        <div class="section-content">${strategy.result.targetAudience}</div>
      </div>

      ${optionalSectionsHtml}
      
      <div class="footer">
        <div class="footer-logo">Techpigeon</div>
        <div class="footer-tagline">AI-Powered Marketing Intelligence Platform</div>
        
        <div class="contact-section">
          <div class="contact-block">
            <div class="contact-title">Techpigeon Pakistan</div>
            <div class="contact-info">
              G-7/4, Islamabad 44000, Pakistan<br>
              Phone: +1 (786) 822-6386
            </div>
          </div>
          
          <div class="contact-block">
            <div class="contact-title">Techpigeon Spark LLC 🇴🇲</div>
            <div class="contact-info">
              Dohat al adab st, Alkhuwair, 133<br>
              Muscat, Oman<br>
              Phone: +968 767 86324
            </div>
          </div>
        </div>
        
        <div class="footer-bottom">
          © ${new Date().getFullYear()} Techpigeon. All rights reserved.<br>
          Visit us at <a href="https://www.techpigeon.org" class="website-link">www.techpigeon.org</a>
        </div>
      </div>
    </body>
  `
  
  const printWindow = window.open('', '_blank')
  if (printWindow) {
    printWindow.document.write(content)
    printWindow.document.close()
    
    setTimeout(() => {
      printWindow.print()
    }, 250)
  }
}
