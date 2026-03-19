import { SavedStrategy, BusinessCanvasModel, PitchDeck } from "@/types"

export function exportStrategyAsWord(strategy: SavedStrategy) {
  const htmlContent = `
<!DOCTYPE html>
<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
<head>
  <meta charset="UTF-8">
  <title>${strategy.name}</title>
  <xml>
    <w:WordDocument>
      <w:View>Print</w:View>
      <w:Zoom>100</w:Zoom>
    </w:WordDocument>
  </xml>
  <style>
    @page {
      size: 8.5in 11in;
      margin: 1in;
    }
    body {
      font-family: 'Inter', 'Calibri', sans-serif;
      font-size: 11pt;
      line-height: 1.5;
    }
    h1 {
      font-family: 'Lora', 'Cambria', serif;
      font-size: 24pt;
      font-weight: bold;
      color: #33334D;
      margin-top: 0;
      page-break-inside: avoid;
    }
    h2 {
      font-size: 16pt;
      font-weight: bold;
      color: #33334D;
      margin-top: 18pt;
      margin-bottom: 8pt;
      page-break-inside: avoid;
    }
    .header {
      background: #8A91E3;
      color: white;
      padding: 24pt;
      margin: -1in -1in 24pt -1in;
      text-align: center;
    }
    .header h1 {
      color: white;
      font-size: 32pt;
      margin: 0;
    }
    .section {
      margin: 12pt 0;
      padding: 12pt;
      border: 1pt solid #E0E0E0;
      background: #F8F9FA;
      page-break-inside: avoid;
    }
    .meta {
      font-size: 10pt;
      color: #666;
      margin-bottom: 18pt;
    }
    .implementation-section {
      margin-top: 24pt;
      padding-top: 18pt;
      border-top: 2pt solid #8A91E3;
    }
    .footer {
      margin-top: 36pt;
      padding-top: 18pt;
      border-top: 2pt solid #8A91E3;
      text-align: center;
      font-size: 9pt;
      color: #666;
    }
    .footer-brand {
      font-size: 20pt;
      font-weight: bold;
      color: #8A91E3;
      margin-bottom: 8pt;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>TECHPIGEON</h1>
    <div>Pakistan's Leading AI Platform for Intelligent Marketing Strategies</div>
  </div>

  <h1>${strategy.name}</h1>

  <div class="meta">
    <p><strong>Strategy ID:</strong> ${strategy.id}</p>
    <p><strong>Generated:</strong> ${new Date(strategy.timestamp).toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric'
    })}</p>
    <p><strong>Time:</strong> ${new Date(strategy.timestamp).toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit'
    })}</p>
  </div>

  <div class="section">
    <h2>Project Description</h2>
    <p>${strategy.description}</p>
  </div>

  <div class="section">
    <h2>Marketing Copy</h2>
    <p>${(strategy.result.marketingCopy || '').replace(/\n/g, '</p><p>')}</p>
  </div>

  <div class="section">
    <h2>Visual Strategy</h2>
    <p>${(strategy.result.visualStrategy || '').replace(/\n/g, '</p><p>')}</p>
  </div>

  <div class="section">
    <h2>Target Audience</h2>
    <p>${(strategy.result.targetAudience || '').replace(/\n/g, '</p><p>')}</p>
  </div>

  <div class="implementation-section">
    <h1>Implementation Workflows</h1>

    <div class="section">
      <h2>Application Workflow</h2>
      <p>${(strategy.result.applicationWorkflow || 'Not available').replace(/\n/g, '</p><p>')}</p>
    </div>

    <div class="section">
      <h2>UI Workflow</h2>
      <p>${(strategy.result.uiWorkflow || 'Not available').replace(/\n/g, '</p><p>')}</p>
    </div>

    <div class="section">
      <h2>Database Workflow</h2>
      <p>${(strategy.result.databaseWorkflow || 'Not available').replace(/\n/g, '</p><p>')}</p>
    </div>

    <div class="section">
      <h2>Mobile Workflow</h2>
      <p>${(strategy.result.mobileWorkflow || 'Not available').replace(/\n/g, '</p><p>')}</p>
    </div>

    <div class="section">
      <h2>Implementation Checklist</h2>
      <p>${(strategy.result.implementationChecklist || 'Not available').replace(/\n/g, '</p><p>')}</p>
    </div>
  </div>

  <div class="footer">
    <div class="footer-brand">TECHPIGEON</div>
    <p>G-7/4, Islamabad 44000, Pakistan • Ph: +92(300) 0529697 | USA: +1(786) 8226386 | Oman: +968 76786324</p>
    <p>© ${new Date().getFullYear()} Techpigeon. All rights reserved. | www.techpigeon.org</p>
  </div>
</body>
</html>
  `

  const blob = new Blob(['\ufeff', htmlContent], { 
    type: 'application/msword' 
  })
  
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `Strategy_${strategy.name.replace(/[^a-z0-9]/gi, '_')}_Techpigeon.doc`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export function exportBusinessCanvasAsWord(canvas: BusinessCanvasModel, ideaName: string) {
  const htmlContent = `
<!DOCTYPE html>
<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
<head>
  <meta charset="UTF-8">
  <title>Business Model Canvas - ${ideaName}</title>
  <xml>
    <w:WordDocument>
      <w:View>Print</w:View>
      <w:Zoom>100</w:Zoom>
    </w:WordDocument>
  </xml>
  <style>
    @page {
      size: 8.5in 11in;
      margin: 1in;
    }
    body {
      font-family: 'Inter', 'Calibri', sans-serif;
      font-size: 11pt;
      line-height: 1.5;
    }
    h1 {
      font-family: 'Lora', 'Cambria', serif;
      font-size: 24pt;
      font-weight: bold;
      color: #33334D;
      margin-top: 0;
      page-break-inside: avoid;
    }
    h2 {
      font-size: 16pt;
      font-weight: bold;
      color: #33334D;
      margin-top: 18pt;
      margin-bottom: 8pt;
      page-break-inside: avoid;
    }
    .header {
      background: #8A91E3;
      color: white;
      padding: 24pt;
      margin: -1in -1in 24pt -1in;
      text-align: center;
    }
    .header h1 {
      color: white;
      font-size: 32pt;
      margin: 0;
    }
    .section {
      margin: 12pt 0;
      padding: 12pt;
      border: 1pt solid #E0E0E0;
      background: #F8F9FA;
      page-break-inside: avoid;
    }
    .meta {
      font-size: 10pt;
      color: #666;
      margin-bottom: 18pt;
    }
    .footer {
      margin-top: 36pt;
      padding-top: 18pt;
      border-top: 2pt solid #8A91E3;
      text-align: center;
      font-size: 9pt;
      color: #666;
    }
    .footer-brand {
      font-size: 20pt;
      font-weight: bold;
      color: #8A91E3;
      margin-bottom: 8pt;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>TECHPIGEON</h1>
    <div>AI-Powered Business Intelligence</div>
  </div>

  <h1>Business Model Canvas</h1>

  <div class="meta">
    <p><strong>Business Idea:</strong> ${ideaName}</p>
    <p><strong>Generated:</strong> ${new Date().toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric'
    })}</p>
  </div>

  <div class="section">
    <h2>Value Proposition</h2>
    <p>${canvas.valueProposition}</p>
  </div>

  <div class="section">
    <h2>Key Partners</h2>
    <p>${canvas.keyPartners}</p>
  </div>

  <div class="section">
    <h2>Key Activities</h2>
    <p>${canvas.keyActivities}</p>
  </div>

  <div class="section">
    <h2>Key Resources</h2>
    <p>${canvas.keyResources}</p>
  </div>

  <div class="section">
    <h2>Customer Segments</h2>
    <p>${canvas.customerSegments}</p>
  </div>

  <div class="section">
    <h2>Customer Relationships</h2>
    <p>${canvas.customerRelationships}</p>
  </div>

  <div class="section">
    <h2>Channels</h2>
    <p>${canvas.channels}</p>
  </div>

  <div class="section">
    <h2>Cost Structure</h2>
    <p>${canvas.costStructure}</p>
  </div>

  <div class="section">
    <h2>Revenue Streams</h2>
    <p>${canvas.revenueStreams}</p>
  </div>

  <div class="footer">
    <div class="footer-brand">TECHPIGEON</div>
    <p>G-7/4, Islamabad 44000, Pakistan • Ph: +92(300) 0529697</p>
    <p>© ${new Date().getFullYear()} Techpigeon. All rights reserved. | www.techpigeon.org</p>
  </div>
</body>
</html>
  `

  const blob = new Blob(['\ufeff', htmlContent], { 
    type: 'application/msword' 
  })

  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `Business_Canvas_${ideaName.replace(/[^a-z0-9]/gi, '_')}_Techpigeon.doc`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export function exportPitchDeckAsWord(pitchDeck: PitchDeck, ideaName: string) {
  const slidesHtml = pitchDeck.slides.map((slide, index) => `
    <div class="slide">
      <h2 style="background: ${index % 2 === 0 ? '#8A91E3' : '#90CA77'}; color: white; padding: 12pt;">Slide ${slide.slideNumber}: ${slide.title}</h2>
      <div class="slide-content">
        <p>${slide.content.replace(/\n/g, '</p><p>')}</p>
      </div>
      ${slide.notes ? `
      <div style="margin-top: 12pt; padding: 12pt; background: #F0F0F0; border-left: 4pt solid #8A91E3;">
        <h3>Speaker Notes:</h3>
        <p style="font-style: italic; color: #666;">${slide.notes}</p>
      </div>
      ` : ''}
    </div>
  `).join('')

  const htmlContent = `
<!DOCTYPE html>
<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
<head>
  <meta charset="UTF-8">
  <title>Pitch Deck - ${ideaName}</title>
  <xml>
    <w:WordDocument>
      <w:View>Print</w:View>
      <w:Zoom>100</w:Zoom>
    </w:WordDocument>
  </xml>
  <style>
    @page {
      size: 8.5in 11in;
      margin: 1in;
    }
    body {
      font-family: 'Inter', 'Calibri', sans-serif;
      font-size: 11pt;
      line-height: 1.5;
    }
    h1 {
      font-family: 'Lora', 'Cambria', serif;
      font-size: 28pt;
      font-weight: bold;
      color: white;
      margin: 0;
    }
    h2 {
      font-family: 'Lora', 'Cambria', serif;
      font-size: 16pt;
      font-weight: bold;
      color: white;
      padding: 12pt;
      margin: 0 0 12pt 0;
    }
    h3 {
      font-size: 12pt;
      font-weight: bold;
      color: #33334D;
      margin: 12pt 0 6pt 0;
    }
    p {
      margin: 0 0 10pt 0;
    }
    .cover {
      background: #8A91E3;
      color: white;
      padding: 72pt;
      text-align: center;
      margin: -1in -1in 24pt -1in;
      page-break-after: always;
    }
    .cover-subtitle {
      font-size: 16pt;
      margin-top: 12pt;
    }
    .slide {
      margin-bottom: 24pt;
      page-break-inside: avoid;
    }
    .slide-content {
      padding: 12pt;
      background: #F8F9FA;
      border: 1pt solid #E0E0E0;
    }
    .footer {
      margin-top: 36pt;
      padding-top: 18pt;
      border-top: 2pt solid #8A91E3;
      text-align: center;
      font-size: 9pt;
      color: #666;
    }
    .footer-brand {
      font-size: 20pt;
      font-weight: bold;
      color: #8A91E3;
      margin-bottom: 8pt;
    }
  </style>
</head>
<body>
  <div class="cover">
    <h1>${ideaName}</h1>
    <div class="cover-subtitle">Pitch Deck</div>
    <div style="margin-top: 24pt; font-size: 12pt;">
      Generated by Techpigeon AI Platform<br>
      ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
    </div>
  </div>

  ${slidesHtml}

  <div class="footer">
    <div class="footer-brand">TECHPIGEON</div>
    <p>G-7/4, Islamabad 44000, Pakistan • Ph: +92(300) 0529697</p>
    <p>© ${new Date().getFullYear()} Techpigeon. All rights reserved. | www.techpigeon.org</p>
  </div>
</body>
</html>
  `

  const blob = new Blob(['\ufeff', htmlContent], { 
    type: 'application/msword' 
  })

  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `Pitch_Deck_${ideaName.replace(/[^a-z0-9]/gi, '_')}_Techpigeon.doc`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
