import { SavedStrategy } from "@/types"

export function exportStrategyAsPDF(strategy: SavedStrategy) {
  const doc = document.implementation.createHTMLDocument('Strategy Export')
  
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
        padding-top: 16px;
        border-top: 1px solid #e2e8f0;
        text-align: center;
        color: #94a3b8;
        font-size: 12px;
      }
      .logo {
        color: #2563eb;
        font-weight: 700;
        font-size: 14px;
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
      
      <div class="footer">
        <div class="logo">Techpigeon AI Marketing Assistant</div>
        <div>Powered by AI • www.techpigeon.org</div>
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
