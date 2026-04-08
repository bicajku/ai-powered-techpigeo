import { SavedStrategy, BusinessCanvasModel, PitchDeck } from "@/types"
import { REPORT_BRAND, reportLogoMarkupAsync } from "@/lib/report-branding"
import PptxGenJS from "pptxgenjs"

const TEMPLATE_COLORS = {
  orange: "FF6600",
  charcoal: "272727",
  teal: "3B8E7E",
  aqua: "5CC4EB",
  lime: "CCFF33",
  navy: "002060",
  paper: "F6F8FA",
  border: "D6D6D6",
  white: "FFFFFF",
  gray: "5E5E5E",
}

const sanitizeFileName = (value: string, fallback: string) => {
  const cleaned = value.replace(/[^a-z0-9]/gi, "_").replace(/_+/g, "_").replace(/^_|_$/g, "")
  return cleaned.length > 0 ? cleaned : fallback
}

const compactLines = (value: string, maxLines = 7) => {
  const normalized = value
    .replace(/\r/g, "\n")
    .split(/\n+/)
    .flatMap((line) => line.split(/(?<=[.!?])\s+/))
    .map((line) => line.trim())
    .filter(Boolean)

  if (normalized.length === 0) return ["No details available."]
  return normalized.slice(0, maxLines)
}

const addTemplateStrip = (pptx: PptxGenJS, slide: PptxGenJS.Slide, heading: string, subheading?: string) => {
  slide.background = { color: TEMPLATE_COLORS.paper }
  slide.addShape(pptx.ShapeType.rect, {
    x: 0,
    y: 0,
    w: 13.333,
    h: 0.72,
    fill: { color: TEMPLATE_COLORS.teal },
    line: { color: TEMPLATE_COLORS.teal },
  })
  slide.addText("Business Model Development", {
    x: 0.45,
    y: 0.18,
    w: 5.2,
    h: 0.35,
    color: TEMPLATE_COLORS.white,
    fontFace: "Calibri",
    fontSize: 15,
    bold: true,
  })
  slide.addShape(pptx.ShapeType.roundRect, {
    x: 11.85,
    y: 0.16,
    w: 1.18,
    h: 0.36,
    fill: { color: TEMPLATE_COLORS.orange },
    line: { color: TEMPLATE_COLORS.orange },
  })
  slide.addText("NovusSparks", {
    x: 11.96,
    y: 0.24,
    w: 0.95,
    h: 0.2,
    color: TEMPLATE_COLORS.white,
    fontFace: "Calibri",
    fontSize: 8,
    bold: true,
    align: "center",
  })

  slide.addText(heading, {
    x: 0.55,
    y: 0.95,
    w: 8.4,
    h: 0.45,
    color: TEMPLATE_COLORS.orange,
    fontFace: "Calibri Light",
    fontSize: 26,
    bold: true,
  })

  if (subheading) {
    slide.addText(subheading, {
      x: 0.58,
      y: 1.42,
      w: 10.8,
      h: 0.26,
      color: TEMPLATE_COLORS.gray,
      fontFace: "Calibri",
      fontSize: 12,
    })
  }
}

const addBullets = (slide: PptxGenJS.Slide, text: string, box: { x: number; y: number; w: number; h: number }) => {
  const bullets = compactLines(text, 8).map((line) => ({
    text: line,
    options: { bullet: { indent: 10 } },
  }))

  slide.addText(bullets, {
    ...box,
    color: TEMPLATE_COLORS.charcoal,
    fontFace: "Calibri",
    fontSize: 13,
    breakLine: true,
    valign: "top",
    margin: 2,
  })
}

export async function exportStrategyAsWord(strategy: SavedStrategy) {
  const brand = REPORT_BRAND
  const logoHtml = await reportLogoMarkupAsync(36)
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
      color: ${brand.colors.primary};
      margin-top: 0;
      page-break-inside: avoid;
    }
    h2 {
      font-size: 16pt;
      font-weight: bold;
      color: ${brand.colors.primary};
      margin-top: 18pt;
      margin-bottom: 8pt;
      page-break-inside: avoid;
    }
    .header {
      background: ${brand.colors.primary};
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
      border-top: 2pt solid ${brand.colors.accent};
    }
    .footer {
      margin-top: 36pt;
      padding-top: 18pt;
      border-top: 2pt solid ${brand.colors.accent};
      text-align: center;
      font-size: 9pt;
      color: #666;
    }
    .footer-brand {
      font-size: 20pt;
      font-weight: bold;
      color: ${brand.colors.primary};
      margin-bottom: 8pt;
    }
  </style>
</head>
<body>
  <div class="header">
    <div style="margin-bottom: 8pt;">${logoHtml}</div>
    <h1>${brand.companyName}</h1>
    <div>${brand.projectName}</div>
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
    <div class="footer-brand">${brand.companyName}</div>
    <p>${brand.contactLine}</p>
    <p>© ${new Date().getFullYear()} ${brand.companyName}. All rights reserved. | ${brand.website.replace("https://", "")}</p>
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
  link.download = `Strategy_${strategy.name.replace(/[^a-z0-9]/gi, '_')}_NovusSparks.doc`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export async function exportBusinessCanvasAsWord(canvas: BusinessCanvasModel, ideaName: string) {
  const brand = REPORT_BRAND
  const logoHtml = await reportLogoMarkupAsync(36)
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
      color: ${brand.colors.primary};
      margin-top: 0;
      page-break-inside: avoid;
    }
    h2 {
      font-size: 16pt;
      font-weight: bold;
      color: ${brand.colors.primary};
      margin-top: 18pt;
      margin-bottom: 8pt;
      page-break-inside: avoid;
    }
    .header {
      background: ${brand.colors.primary};
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
      border-top: 2pt solid ${brand.colors.accent};
      text-align: center;
      font-size: 9pt;
      color: #666;
    }
    .footer-brand {
      font-size: 20pt;
      font-weight: bold;
      color: ${brand.colors.primary};
      margin-bottom: 8pt;
    }
  </style>
</head>
<body>
  <div class="header">
    <div style="margin-bottom: 8pt;">${logoHtml}</div>
    <h1>${brand.companyName}</h1>
    <div>${brand.projectName}</div>
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
    <div class="footer-brand">${brand.companyName}</div>
    <p>${brand.contactLine}</p>
    <p>© ${new Date().getFullYear()} ${brand.companyName}. All rights reserved. | ${brand.website.replace("https://", "")}</p>
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
  link.download = `Business_Canvas_${ideaName.replace(/[^a-z0-9]/gi, '_')}_NovusSparks.doc`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export async function exportBusinessCanvasAsPPTX(canvas: BusinessCanvasModel, ideaName: string) {
  const pptx = new PptxGenJS()
  pptx.layout = "LAYOUT_WIDE"
  pptx.author = REPORT_BRAND.companyName
  pptx.company = REPORT_BRAND.companyName
  pptx.subject = "Business Model Canvas"
  pptx.title = `Business Model Canvas - ${ideaName}`

  const cover = pptx.addSlide()
  addTemplateStrip(
    pptx,
    cover,
    "Business Model Canvas",
    `${ideaName} • ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`
  )
  cover.addShape(pptx.ShapeType.roundRect, {
    x: 0.6,
    y: 2.2,
    w: 12.1,
    h: 2.2,
    fill: { color: TEMPLATE_COLORS.white },
    line: { color: TEMPLATE_COLORS.border, pt: 1 },
  })
  cover.addText("Structured for strategy, investor discussion, and execution planning", {
    x: 0.95,
    y: 2.7,
    w: 11.5,
    h: 0.4,
    color: TEMPLATE_COLORS.charcoal,
    fontFace: "Calibri Light",
    fontSize: 21,
    bold: true,
    align: "center",
  })
  cover.addText("Includes all nine blocks mapped from your generated concept.", {
    x: 0.95,
    y: 3.25,
    w: 11.5,
    h: 0.28,
    color: TEMPLATE_COLORS.gray,
    fontFace: "Calibri",
    fontSize: 13,
    align: "center",
  })

  const canvasSlide = pptx.addSlide()
  addTemplateStrip(pptx, canvasSlide, "Canvas Overview", "Template-matched arrangement inspired by your provided deck")

  const sectionStyle = (x: number, y: number, w: number, h: number, title: string, color = TEMPLATE_COLORS.orange) => {
    canvasSlide.addShape(pptx.ShapeType.rect, {
      x,
      y,
      w,
      h,
      fill: { color: TEMPLATE_COLORS.white },
      line: { color: TEMPLATE_COLORS.charcoal, pt: 1 },
    })
    canvasSlide.addShape(pptx.ShapeType.rect, {
      x,
      y,
      w,
      h: 0.36,
      fill: { color },
      line: { color },
    })
    canvasSlide.addText(title, {
      x: x + 0.1,
      y: y + 0.08,
      w: w - 0.2,
      h: 0.2,
      color: TEMPLATE_COLORS.white,
      fontFace: "Calibri",
      fontSize: 11,
      bold: true,
      align: "center",
    })
  }

  const topY = 1.9
  const topH = 3.4
  const bottomY = 5.34
  const bottomH = 1.6
  sectionStyle(0.35, topY, 2.45, topH, "Key Partners", TEMPLATE_COLORS.teal)
  sectionStyle(2.8, topY, 2.45, topH, "Key Activities", TEMPLATE_COLORS.aqua)
  sectionStyle(5.25, topY, 2.9, topH, "Value Proposition", TEMPLATE_COLORS.orange)
  sectionStyle(8.15, topY, 2.45, topH, "Customer Relationships", TEMPLATE_COLORS.teal)
  sectionStyle(10.6, topY, 2.4, topH, "Customer Segments", TEMPLATE_COLORS.aqua)
  sectionStyle(0.35, bottomY, 6.45, bottomH, "Cost Structure", TEMPLATE_COLORS.charcoal)
  sectionStyle(6.8, bottomY, 6.2, bottomH, "Revenue Streams", TEMPLATE_COLORS.orange)

  addBullets(canvasSlide, canvas.keyPartners, { x: 0.45, y: 2.33, w: 2.25, h: 2.8 })
  addBullets(canvasSlide, canvas.keyActivities, { x: 2.9, y: 2.33, w: 2.25, h: 2.8 })
  addBullets(canvasSlide, canvas.valueProposition, { x: 5.35, y: 2.33, w: 2.7, h: 2.8 })
  addBullets(canvasSlide, canvas.customerRelationships, { x: 8.25, y: 2.33, w: 2.25, h: 1.35 })
  addBullets(canvasSlide, canvas.channels, { x: 8.25, y: 3.8, w: 2.25, h: 1.35 })
  addBullets(canvasSlide, canvas.customerSegments, { x: 10.7, y: 2.33, w: 2.2, h: 2.8 })
  addBullets(canvasSlide, canvas.costStructure, { x: 0.45, y: 5.76, w: 6.2, h: 1.1 })
  addBullets(canvasSlide, canvas.revenueStreams, { x: 6.9, y: 5.76, w: 5.95, h: 1.1 })

  const sections: Array<{ title: string; content: string; color: string }> = [
    { title: "Value Proposition", content: canvas.valueProposition, color: TEMPLATE_COLORS.orange },
    { title: "Key Partners", content: canvas.keyPartners, color: TEMPLATE_COLORS.teal },
    { title: "Key Activities", content: canvas.keyActivities, color: TEMPLATE_COLORS.aqua },
    { title: "Key Resources", content: canvas.keyResources, color: TEMPLATE_COLORS.lime },
    { title: "Customer Segments", content: canvas.customerSegments, color: TEMPLATE_COLORS.aqua },
    { title: "Customer Relationships", content: canvas.customerRelationships, color: TEMPLATE_COLORS.teal },
    { title: "Channels", content: canvas.channels, color: TEMPLATE_COLORS.navy },
    { title: "Cost Structure", content: canvas.costStructure, color: TEMPLATE_COLORS.charcoal },
    { title: "Revenue Streams", content: canvas.revenueStreams, color: TEMPLATE_COLORS.orange },
  ]

  sections.forEach((section) => {
    const slide = pptx.addSlide()
    addTemplateStrip(pptx, slide, section.title, ideaName)
    slide.addShape(pptx.ShapeType.roundRect, {
      x: 0.65,
      y: 2.0,
      w: 12.0,
      h: 4.6,
      fill: { color: TEMPLATE_COLORS.white },
      line: { color: TEMPLATE_COLORS.border, pt: 1 },
    })
    slide.addShape(pptx.ShapeType.roundRect, {
      x: 0.86,
      y: 2.22,
      w: 2.8,
      h: 0.52,
      fill: { color: section.color },
      line: { color: section.color },
    })
    slide.addText(section.title, {
      x: 1.05,
      y: 2.35,
      w: 2.45,
      h: 0.26,
      color: TEMPLATE_COLORS.white,
      fontFace: "Calibri",
      fontSize: 12,
      bold: true,
      align: "center",
    })
    addBullets(slide, section.content, { x: 1.05, y: 2.95, w: 11.2, h: 3.35 })
  })

  await pptx.writeFile({
    fileName: `Business_Canvas_${sanitizeFileName(ideaName, "Idea")}_NovusSparks.pptx`,
  })
}

export async function exportBusinessCanvasAsPptxWord(canvas: BusinessCanvasModel, ideaName: string) {
  await exportBusinessCanvasAsPPTX(canvas, ideaName)
}

export async function exportPitchDeckAsWord(pitchDeck: PitchDeck, ideaName: string) {
  const brand = REPORT_BRAND
  const logoHtml = await reportLogoMarkupAsync(40)
  const slidesHtml = pitchDeck.slides.map((slide, index) => `
    <div class="slide">
      <h2 style="background: ${index % 2 === 0 ? brand.colors.primary : brand.colors.secondary}; color: white; padding: 12pt;">Slide ${slide.slideNumber}: ${slide.title}</h2>
      <div class="slide-content">
        <p>${slide.content.replace(/\n/g, '</p><p>')}</p>
      </div>
      ${slide.notes ? `
      <div style="margin-top: 12pt; padding: 12pt; background: #F0F0F0; border-left: 4pt solid ${brand.colors.accent};">
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
      color: ${brand.colors.primary};
      margin: 12pt 0 6pt 0;
    }
    p {
      margin: 0 0 10pt 0;
    }
    .cover {
      background: ${brand.colors.primary};
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
      border-top: 2pt solid ${brand.colors.accent};
      text-align: center;
      font-size: 9pt;
      color: #666;
    }
    .footer-brand {
      font-size: 20pt;
      font-weight: bold;
      color: ${brand.colors.primary};
      margin-bottom: 8pt;
    }
  </style>
</head>
<body>
  <div class="cover">
    <div style="margin-bottom: 12pt;">${logoHtml}</div>
    <h1>${ideaName}</h1>
    <div class="cover-subtitle">Pitch Deck</div>
    <div style="margin-top: 24pt; font-size: 12pt;">
      ${brand.projectName}<br>
      Generated by ${brand.companyName} AI Platform<br>
      ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
    </div>
  </div>

  ${slidesHtml}

  <div class="footer">
    <div class="footer-brand">${brand.companyName}</div>
    <p>${brand.contactLine}</p>
    <p>© ${new Date().getFullYear()} ${brand.companyName}. All rights reserved. | ${brand.website.replace("https://", "")}</p>
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
  link.download = `Pitch_Deck_${ideaName.replace(/[^a-z0-9]/gi, '_')}_NovusSparks.doc`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export async function exportPitchDeckAsPPTX(pitchDeck: PitchDeck, ideaName: string) {
  const pptx = new PptxGenJS()
  pptx.layout = "LAYOUT_WIDE"
  pptx.author = REPORT_BRAND.companyName
  pptx.company = REPORT_BRAND.companyName
  pptx.subject = "Investor Pitch Deck"
  pptx.title = `Pitch Deck - ${ideaName}`

  const cover = pptx.addSlide()
  addTemplateStrip(
    pptx,
    cover,
    "Investor Pitch Deck",
    `${ideaName} • ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`
  )
  cover.addShape(pptx.ShapeType.roundRect, {
    x: 0.6,
    y: 2.2,
    w: 12.1,
    h: 2.2,
    fill: { color: TEMPLATE_COLORS.white },
    line: { color: TEMPLATE_COLORS.border, pt: 1 },
  })
  cover.addText("Built from your generated business concept and ready for presentation.", {
    x: 0.95,
    y: 2.7,
    w: 11.5,
    h: 0.35,
    color: TEMPLATE_COLORS.charcoal,
    fontFace: "Calibri Light",
    fontSize: 21,
    bold: true,
    align: "center",
  })

  const summarySlide = pptx.addSlide()
  addTemplateStrip(pptx, summarySlide, "Executive Summary", ideaName)
  summarySlide.addShape(pptx.ShapeType.roundRect, {
    x: 0.65,
    y: 1.95,
    w: 12.0,
    h: 4.8,
    fill: { color: TEMPLATE_COLORS.white },
    line: { color: TEMPLATE_COLORS.border, pt: 1 },
  })
  addBullets(summarySlide, pitchDeck.executiveSummary, { x: 0.95, y: 2.3, w: 11.45, h: 4.2 })

  pitchDeck.slides.forEach((entry, index) => {
    const slide = pptx.addSlide()
    addTemplateStrip(pptx, slide, `Slide ${index + 1}: ${entry.title}`, ideaName)
    slide.addShape(pptx.ShapeType.roundRect, {
      x: 0.65,
      y: 1.95,
      w: 12.0,
      h: 3.35,
      fill: { color: TEMPLATE_COLORS.white },
      line: { color: TEMPLATE_COLORS.border, pt: 1 },
    })
    slide.addShape(pptx.ShapeType.roundRect, {
      x: 0.65,
      y: 5.42,
      w: 12.0,
      h: 1.45,
      fill: { color: "F4F9F7" },
      line: { color: TEMPLATE_COLORS.teal, pt: 1 },
    })
    addBullets(slide, entry.content, { x: 0.95, y: 2.25, w: 11.45, h: 2.9 })
    slide.addText("Speaker Notes", {
      x: 0.95,
      y: 5.6,
      w: 2.2,
      h: 0.2,
      color: TEMPLATE_COLORS.teal,
      fontFace: "Calibri",
      fontSize: 12,
      bold: true,
    })
    addBullets(slide, entry.notes || "No speaker notes available.", { x: 0.95, y: 5.84, w: 11.45, h: 0.9 })
  })

  await pptx.writeFile({
    fileName: `Pitch_Deck_${sanitizeFileName(ideaName, "Idea")}_NovusSparks.pptx`,
  })
}
