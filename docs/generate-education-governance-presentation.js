const fs = require('fs')
const path = require('path')

const root = process.cwd()
const outPath = path.join(root, 'docs', 'NovusSparks-Education-Governance-Platform-Stakeholder-Deck.pptx')

const COLORS = {
  navy: '1B223B',
  blue: '2D70B7',
  yellow: 'FDBA0C',
  bg: 'F5F8FC',
  panel: 'FFFFFF',
  text: '1F2937',
  mute: '5B657A',
  white: 'FFFFFF',
}

const slides = [
  {
    type: 'title',
    title: 'NovusSparks Education Governance Platform',
    subtitle: 'From syllabus to classroom to oversight',
    urdu: 'نصاب سے کلاس روم تک اور پھر مؤثر نگرانی تک',
    footer: 'Bilingual AI for planning, compliance, smart classrooms, and education governance',
  },
  {
    title: 'Why This Matters Now',
    subtitle: 'Why education systems need a new operating model',
    leftTitle: 'English',
    rightTitle: 'اردو',
    left: [
      'Teacher planning remains highly manual',
      'Syllabus compliance is difficult to track consistently',
      'Reporting from school to district is fragmented',
      'Bilingual digital workflows remain limited',
    ],
    right: [
      'اساتذہ کی منصوبہ بندی اب بھی زیادہ تر دستی ہے',
      'نصابی تکمیل کی مسلسل نگرانی مشکل ہے',
      'اسکول سے ضلع تک رپورٹنگ بکھری ہوئی ہے',
      'اردو اور انگریزی دونوں زبانوں میں ڈیجیٹل نظام محدود ہیں',
    ],
  },
  {
    title: 'The Problem We Are Solving',
    subtitle: 'Disconnected planning, delivery, and oversight',
    leftTitle: 'English',
    rightTitle: 'اردو',
    left: [
      'Curriculum planning and classroom delivery are disconnected',
      'Smart classroom initiatives often lack academic intelligence',
      'District leadership gets delayed and incomplete visibility',
      'Local systems need bilingual-first education tools',
    ],
    right: [
      'نصابی منصوبہ بندی اور کلاس روم عمل درآمد ایک دوسرے سے جدا ہیں',
      'اسمارٹ کلاس روم پروگراموں میں تعلیمی ذہانت کی کمی ہے',
      'ضلعی قیادت کو تاخیر سے اور نامکمل معلومات ملتی ہیں',
      'مقامی نظام کو دو لسانی بنیاد پر حل درکار ہیں',
    ],
  },
  {
    title: 'Our Solution',
    subtitle: 'A standalone education vertical under NovusSparks',
    leftTitle: 'English',
    rightTitle: 'اردو',
    left: [
      'Digitize syllabus ingestion and curriculum mapping',
      'Generate lesson plans and teaching support with AI',
      'Connect classroom delivery with evidence and monitoring',
      'Provide school, district, and regional oversight dashboards',
    ],
    right: [
      'نصاب کی ڈیجیٹل وصولی اور نصابی نقشہ سازی',
      'اے آئی کے ذریعے سبق منصوبہ بندی اور تدریسی معاونت',
      'کلاس روم سرگرمی کو شواہد اور نگرانی سے جوڑنا',
      'اسکول، ضلع اور علاقائی سطح کے ڈیش بورڈ فراہم کرنا',
    ],
  },
  {
    title: 'Who It Serves',
    subtitle: 'Multi-level value for institutions and authorities',
    leftTitle: 'English',
    rightTitle: 'اردو',
    left: [
      'Teachers and academic coordinators',
      'Principals and school administrators',
      'District education offices',
      'Provincial and government leadership',
      'Curriculum and textbook boards',
    ],
    right: [
      'اساتذہ اور تعلیمی رابطہ کار',
      'پرنسپلز اور اسکول منتظمین',
      'ضلعی تعلیمی دفاتر',
      'صوبائی اور حکومتی قیادت',
      'نصاب اور ٹیکسٹ بک بورڈز',
    ],
  },
  {
    title: 'Platform Pillars',
    subtitle: 'Five pillars of the education operating model',
    leftTitle: 'English',
    rightTitle: 'اردو',
    left: [
      'Syllabus intelligence',
      'Teaching operations',
      'Smart classroom monitoring',
      'Governance dashboards',
      'Reporting and compliance',
    ],
    right: [
      'نصابی ذہانت',
      'تدریسی عمل کا انتظام',
      'اسمارٹ کلاس روم نگرانی',
      'گورننس ڈیش بورڈز',
      'رپورٹنگ اور تعمیل',
    ],
  },
  {
    title: 'Core Capabilities',
    subtitle: 'What the module includes from day one',
    leftTitle: 'English',
    rightTitle: 'اردو',
    left: [
      'Bilingual syllabus upload and indexing',
      'AI lesson plans and strategy generation',
      'Academic calendar alignment',
      'Teacher copilot and classroom support',
      'Dashboards, reports, and exports',
    ],
    right: [
      'اردو اور انگریزی نصاب کی اپ لوڈنگ اور انڈیکسنگ',
      'اے آئی سبق منصوبہ بندی اور حکمت عملی سازی',
      'تعلیمی کیلنڈر کے ساتھ مطابقت',
      'ٹیچر کوپائلٹ اور کلاس روم معاونت',
      'ڈیش بورڈز، رپورٹس اور ایکسپورٹس',
    ],
  },
  {
    title: 'How It Works',
    subtitle: 'A clear flow from curriculum to reporting',
    leftTitle: 'English',
    rightTitle: 'اردو',
    left: [
      'Upload syllabus and policy documents',
      'Structure curriculum by grade, subject, and timeline',
      'Generate teacher plans and classroom guidance',
      'Capture delivery, evidence, and progress',
      'Monitor compliance and trigger interventions',
    ],
    right: [
      'نصاب اور پالیسی دستاویزات اپ لوڈ کریں',
      'جماعت، مضمون اور ٹائم لائن کے مطابق نصاب منظم کریں',
      'اساتذہ کے لیے منصوبے اور رہنمائی تیار کریں',
      'تدریس، شواہد اور پیش رفت کو ریکارڈ کریں',
      'تعمیل کی نگرانی کریں اور بروقت اقدام کریں',
    ],
  },
  {
    title: 'Why It Is Different',
    subtitle: 'Localized, practical, and government-ready',
    leftTitle: 'English',
    rightTitle: 'اردو',
    left: [
      'Bilingual by design, not translation afterthought',
      'Built for Pakistan and AJK education realities',
      'Connects classroom activity with authority oversight',
      'Deployable as cloud, hybrid, or on-premises',
    ],
    right: [
      'ابتدا ہی سے دو لسانی ڈیزائن، بعد کی ترجمانی نہیں',
      'پاکستان اور آزاد کشمیر کے تعلیمی حالات کے مطابق تیار',
      'کلاس روم سرگرمی کو حکومتی نگرانی سے جوڑتا ہے',
      'کلاؤڈ، ہائبرڈ یا آن پریمس تعیناتی کے قابل',
    ],
  },
  {
    title: 'Governance, Security, and Deployment',
    subtitle: 'Trust, control, and public-sector readiness',
    leftTitle: 'English',
    rightTitle: 'اردو',
    left: [
      'Role-based access and controlled permissions',
      'Audit-ready administrative logging',
      'Encrypted data and secure APIs',
      'Government-owned data and hosting flexibility',
    ],
    right: [
      'کردار کی بنیاد پر رسائی اور منظم اجازتیں',
      'آڈٹ کے لیے تیار انتظامی لاگز',
      'خفیہ کاری شدہ ڈیٹا اور محفوظ APIs',
      'حکومتی ملکیت والا ڈیٹا اور لچکدار ہوسٹنگ',
    ],
  },
  {
    title: 'Pilot Proposal',
    subtitle: 'A practical path to validate value quickly',
    leftTitle: 'English',
    rightTitle: 'اردو',
    left: [
      'Launch in 10 to 20 schools',
      'Run a 60 to 90 day pilot',
      'Train teachers and administrators bilingually',
      'Measure compliance visibility, time savings, and adoption',
    ],
    right: [
      '10 سے 20 اسکولوں میں آغاز',
      '60 سے 90 دن کا پائلٹ پروگرام',
      'اساتذہ اور منتظمین کی دو لسانی تربیت',
      'تعمیل، وقت کی بچت اور استعمال کے نتائج کی پیمائش',
    ],
  },
  {
    title: 'Call to Action',
    subtitle: 'Align stakeholders and move to pilot readiness',
    leftTitle: 'English',
    rightTitle: 'اردو',
    left: [
      'Approve pilot scope',
      'Nominate focal persons',
      'Finalize rollout requirements',
      'Begin implementation workshop and demo',
    ],
    right: [
      'پائلٹ کے دائرہ کار کی منظوری دیں',
      'فوکل پرسنز نامزد کریں',
      'نفاذ کی ضروریات طے کریں',
      'ورکشاپ اور ڈیمو کے ساتھ آغاز کریں',
    ],
  },
]

function esc(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function crc32(buf) {
  let crc = 0xffffffff
  for (let i = 0; i < buf.length; i += 1) {
    crc ^= buf[i]
    for (let j = 0; j < 8; j += 1) {
      const mask = -(crc & 1)
      crc = (crc >>> 1) ^ (0xedb88320 & mask)
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

function dosDateTime(date) {
  const year = Math.max(1980, date.getFullYear())
  const dosTime = ((date.getHours() & 0x1f) << 11) | ((date.getMinutes() & 0x3f) << 5) | ((Math.floor(date.getSeconds() / 2)) & 0x1f)
  const dosDate = (((year - 1980) & 0x7f) << 9) | (((date.getMonth() + 1) & 0xf) << 5) | (date.getDate() & 0x1f)
  return { dosTime, dosDate }
}

function makeZip(entries) {
  const now = new Date()
  const { dosTime, dosDate } = dosDateTime(now)
  const files = []
  const central = []
  let offset = 0

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name.replace(/\\/g, '/'), 'utf8')
    const dataBuf = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data, 'utf8')
    const crc = crc32(dataBuf)

    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0, 6)
    local.writeUInt16LE(0, 8)
    local.writeUInt16LE(dosTime, 10)
    local.writeUInt16LE(dosDate, 12)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(dataBuf.length, 18)
    local.writeUInt32LE(dataBuf.length, 22)
    local.writeUInt16LE(nameBuf.length, 26)
    local.writeUInt16LE(0, 28)
    files.push(local, nameBuf, dataBuf)

    const centralHeader = Buffer.alloc(46)
    centralHeader.writeUInt32LE(0x02014b50, 0)
    centralHeader.writeUInt16LE(20, 4)
    centralHeader.writeUInt16LE(20, 6)
    centralHeader.writeUInt16LE(0, 8)
    centralHeader.writeUInt16LE(0, 10)
    centralHeader.writeUInt16LE(dosTime, 12)
    centralHeader.writeUInt16LE(dosDate, 14)
    centralHeader.writeUInt32LE(crc, 16)
    centralHeader.writeUInt32LE(dataBuf.length, 20)
    centralHeader.writeUInt32LE(dataBuf.length, 24)
    centralHeader.writeUInt16LE(nameBuf.length, 28)
    centralHeader.writeUInt16LE(0, 30)
    centralHeader.writeUInt16LE(0, 32)
    centralHeader.writeUInt16LE(0, 34)
    centralHeader.writeUInt16LE(0, 36)
    centralHeader.writeUInt32LE(0, 38)
    centralHeader.writeUInt32LE(offset, 42)
    central.push(centralHeader, nameBuf)

    offset += local.length + nameBuf.length + dataBuf.length
  }

  const centralSize = central.reduce((sum, part) => sum + part.length, 0)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(0, 4)
  end.writeUInt16LE(0, 6)
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(centralSize, 12)
  end.writeUInt32LE(offset, 16)
  end.writeUInt16LE(0, 20)

  return Buffer.concat([...files, ...central, end])
}

function groupShape() {
  return `
  <p:nvGrpSpPr>
    <p:cNvPr id="1" name=""/>
    <p:cNvGrpSpPr/>
    <p:nvPr/>
  </p:nvGrpSpPr>
  <p:grpSpPr>
    <a:xfrm>
      <a:off x="0" y="0"/>
      <a:ext cx="0" cy="0"/>
      <a:chOff x="0" y="0"/>
      <a:chExt cx="0" cy="0"/>
    </a:xfrm>
  </p:grpSpPr>`
}

function rectShape(id, name, x, y, cx, cy, color) {
  return `
  <p:sp>
    <p:nvSpPr>
      <p:cNvPr id="${id}" name="${esc(name)}"/>
      <p:cNvSpPr/>
      <p:nvPr/>
    </p:nvSpPr>
    <p:spPr>
      <a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>
      <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
      <a:solidFill><a:srgbClr val="${color}"/></a:solidFill>
      <a:ln><a:noFill/></a:ln>
    </p:spPr>
    <p:txBody><a:bodyPr/><a:lstStyle/><a:p/></p:txBody>
  </p:sp>`
}

function textParagraph(text, options = {}) {
  const {
    size = 1800,
    bold = false,
    color = COLORS.text,
    align = 'l',
    rtl = false,
    bullet = false,
  } = options
  return `<a:p${rtl ? ' rtl="1"' : ''}><a:pPr algn="${align}">${bullet ? '<a:buChar char="-"/>' : ''}</a:pPr><a:r><a:rPr lang="${rtl ? 'ur-PK' : 'en-US'}" sz="${size}"${bold ? ' b="1"' : ''}${rtl ? ' rtl="1"' : ''}><a:solidFill><a:srgbClr val="${color}"/></a:solidFill></a:rPr><a:t>${esc(text)}</a:t></a:r><a:endParaRPr lang="${rtl ? 'ur-PK' : 'en-US'}" sz="${size}"/></a:p>`
}

function textBox(id, name, x, y, cx, cy, paragraphs, options = {}) {
  return `
  <p:sp>
    <p:nvSpPr>
      <p:cNvPr id="${id}" name="${esc(name)}"/>
      <p:cNvSpPr txBox="1"/>
      <p:nvPr/>
    </p:nvSpPr>
    <p:spPr>
      <a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>
      <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
      <a:noFill/>
      <a:ln><a:noFill/></a:ln>
    </p:spPr>
    <p:txBody>
      <a:bodyPr wrap="square"${options.rtl ? ' rtlCol="1"' : ''} anchor="t"/>
      <a:lstStyle/>
      ${paragraphs.join('')}
    </p:txBody>
  </p:sp>`
}

function panel(x, y, cx, cy, title, bullets, options = {}) {
  const rtl = Boolean(options.rtl)
  const align = rtl ? 'r' : 'l'
  const titlePara = textParagraph(title, { size: 2000, bold: true, color: COLORS.navy, align, rtl })
  const bulletParas = bullets.map((item) => textParagraph(item, { size: 1550, color: COLORS.text, align, rtl, bullet: true }))
  return [
    rectShape(options.baseId, `${title} panel`, x, y, cx, cy, COLORS.panel),
    textBox(options.baseId + 1, `${title} text`, x + 250000, y + 180000, cx - 500000, cy - 260000, [titlePara, ...bulletParas], { rtl }),
  ].join('')
}

function titleSlideXml(slide) {
  const shapes = [
    rectShape(2, 'Header', 0, 0, 12192000, 1200000, COLORS.navy),
    rectShape(3, 'Accent', 0, 6150000, 12192000, 180000, COLORS.yellow),
    textBox(4, 'Title', 700000, 1400000, 10800000, 1200000, [
      textParagraph(slide.title, { size: 2800, bold: true, color: COLORS.navy }),
    ]),
    textBox(5, 'Subtitle', 700000, 2700000, 10800000, 700000, [
      textParagraph(slide.subtitle, { size: 2000, bold: true, color: COLORS.blue }),
    ]),
    textBox(6, 'Urdu', 700000, 3450000, 10800000, 700000, [
      textParagraph(slide.urdu, { size: 1850, color: COLORS.text, align: 'r', rtl: true }),
    ], { rtl: true }),
    textBox(7, 'Footer', 700000, 4700000, 10800000, 900000, [
      textParagraph(slide.footer, { size: 1600, color: COLORS.mute }),
    ]),
  ].join('')

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:bg><p:bgPr><a:solidFill><a:srgbClr val="${COLORS.bg}"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>
    <p:spTree>${groupShape()}${shapes}
    </p:spTree>
  </p:cSld>
  <p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
</p:sld>`
}

function standardSlideXml(slide) {
  const shapes = [
    rectShape(2, 'Top Bar', 0, 0, 12192000, 800000, COLORS.navy),
    rectShape(3, 'Accent', 0, 6100000, 12192000, 140000, COLORS.yellow),
    textBox(4, 'Title', 650000, 320000, 7000000, 650000, [
      textParagraph(slide.title, { size: 2400, bold: true, color: COLORS.white }),
    ]),
    textBox(5, 'Subtitle', 650000, 1100000, 10800000, 450000, [
      textParagraph(slide.subtitle, { size: 1500, color: COLORS.mute }),
    ]),
    panel(650000, 1700000, 4950000, 3800000, slide.leftTitle, slide.left, { baseId: 6 }),
    panel(5800000, 1700000, 4950000, 3800000, slide.rightTitle, slide.right, { baseId: 20, rtl: true }),
  ].join('')

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:bg><p:bgPr><a:solidFill><a:srgbClr val="${COLORS.bg}"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>
    <p:spTree>${groupShape()}${shapes}
    </p:spTree>
  </p:cSld>
  <p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
</p:sld>`
}

function slideXml(slide) {
  return slide.type === 'title' ? titleSlideXml(slide) : standardSlideXml(slide)
}

function slideRelsXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
</Relationships>`
}

const presentationXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" saveSubsetFonts="1" autoCompressPictures="0" bookmarkIdSeed="1">
  <p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>
  <p:sldIdLst>
    ${slides.map((_, index) => `<p:sldId id="${256 + index}" r:id="rId${index + 2}"/>`).join('')}
  </p:sldIdLst>
  <p:sldSz cx="12192000" cy="6858000"/>
  <p:notesSz cx="6858000" cy="9144000"/>
  <p:defaultTextStyle>
    <a:defPPr/>
    <a:lvl1pPr marL="0" indent="0"/>
    <a:lvl2pPr marL="457200" indent="0"/>
    <a:lvl3pPr marL="914400" indent="0"/>
  </p:defaultTextStyle>
</p:presentation>`

const presentationRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>
  ${slides.map((_, index) => `<Relationship Id="rId${index + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${index + 1}.xml"/>`).join('')}
  <Relationship Id="rId${slides.length + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/presProps" Target="presProps.xml"/>
  <Relationship Id="rId${slides.length + 3}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/viewProps" Target="viewProps.xml"/>
  <Relationship Id="rId${slides.length + 4}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/tableStyles" Target="tableStyles.xml"/>
</Relationships>`

const slideMasterXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld name="Master">
    <p:bg><p:bgPr><a:solidFill><a:srgbClr val="${COLORS.bg}"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>
    <p:spTree>${groupShape()}</p:spTree>
  </p:cSld>
  <p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>
  <p:sldLayoutIdLst><p:sldLayoutId id="1" r:id="rId1"/></p:sldLayoutIdLst>
  <p:txStyles>
    <p:titleStyle><a:lvl1pPr algn="l"/></p:titleStyle>
    <p:bodyStyle><a:lvl1pPr algn="l" marL="0" indent="0"/></p:bodyStyle>
    <p:otherStyle><a:defPPr/></p:otherStyle>
  </p:txStyles>
</p:sldMaster>`

const slideMasterRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/>
</Relationships>`

const slideLayoutXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="titleAndObj" preserve="1">
  <p:cSld name="Layout">
    <p:spTree>${groupShape()}</p:spTree>
  </p:cSld>
  <p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
</p:sldLayout>`

const slideLayoutRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/>
</Relationships>`

const themeXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="NovusSparks Theme">
  <a:themeElements>
    <a:clrScheme name="NovusSparks">
      <a:dk1><a:srgbClr val="${COLORS.navy}"/></a:dk1>
      <a:lt1><a:srgbClr val="${COLORS.white}"/></a:lt1>
      <a:dk2><a:srgbClr val="${COLORS.text}"/></a:dk2>
      <a:lt2><a:srgbClr val="EAF0F8"/></a:lt2>
      <a:accent1><a:srgbClr val="${COLORS.blue}"/></a:accent1>
      <a:accent2><a:srgbClr val="${COLORS.yellow}"/></a:accent2>
      <a:accent3><a:srgbClr val="3A86C8"/></a:accent3>
      <a:accent4><a:srgbClr val="5B657A"/></a:accent4>
      <a:accent5><a:srgbClr val="7CB6E8"/></a:accent5>
      <a:accent6><a:srgbClr val="D9A441"/></a:accent6>
      <a:hlink><a:srgbClr val="0563C1"/></a:hlink>
      <a:folHlink><a:srgbClr val="954F72"/></a:folHlink>
    </a:clrScheme>
    <a:fontScheme name="NovusSparks Fonts">
      <a:majorFont><a:latin typeface="Aptos Display"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont>
      <a:minorFont><a:latin typeface="Aptos"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont>
    </a:fontScheme>
    <a:fmtScheme name="NovusSparks Format">
      <a:fillStyleLst>
        <a:solidFill><a:schemeClr val="phClr"/></a:solidFill>
        <a:solidFill><a:schemeClr val="accent1"/></a:solidFill>
        <a:solidFill><a:schemeClr val="accent2"/></a:solidFill>
      </a:fillStyleLst>
      <a:lnStyleLst>
        <a:ln w="9525" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="accent1"/></a:solidFill><a:prstDash val="solid"/></a:ln>
        <a:ln w="25400" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="accent1"/></a:solidFill><a:prstDash val="solid"/></a:ln>
        <a:ln w="38100" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="accent1"/></a:solidFill><a:prstDash val="solid"/></a:ln>
      </a:lnStyleLst>
      <a:effectStyleLst>
        <a:effectStyle><a:effectLst/></a:effectStyle>
        <a:effectStyle><a:effectLst/></a:effectStyle>
        <a:effectStyle><a:effectLst/></a:effectStyle>
      </a:effectStyleLst>
      <a:bgFillStyleLst>
        <a:solidFill><a:schemeClr val="lt1"/></a:solidFill>
        <a:solidFill><a:schemeClr val="lt2"/></a:solidFill>
        <a:solidFill><a:schemeClr val="dk1"/></a:solidFill>
      </a:bgFillStyleLst>
    </a:fmtScheme>
  </a:themeElements>
  <a:objectDefaults/>
  <a:extraClrSchemeLst/>
</a:theme>`

const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  <Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>
  <Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>
  <Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>
  <Override PartName="/ppt/presProps.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presProps+xml"/>
  <Override PartName="/ppt/viewProps.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.viewProps+xml"/>
  <Override PartName="/ppt/tableStyles.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.tableStyles+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
  ${slides.map((_, index) => `<Override PartName="/ppt/slides/slide${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`).join('')}
</Types>`

const rootRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`

const nowIso = new Date().toISOString()

const coreXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>NovusSparks Education Governance Platform Stakeholder Deck</dc:title>
  <dc:subject>Stakeholder presentation</dc:subject>
  <dc:creator>Dvina Code</dc:creator>
  <cp:lastModifiedBy>Dvina Code</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${nowIso}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${nowIso}</dcterms:modified>
</cp:coreProperties>`

const appXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>Microsoft Office PowerPoint</Application>
  <Slides>${slides.length}</Slides>
  <Notes>0</Notes>
  <PresentationFormat>Widescreen</PresentationFormat>
  <Company>NovusSparks</Company>
  <TitlesOfParts>
    <vt:vector size="${slides.length}" baseType="lpstr">
      ${slides.map((slide) => `<vt:lpstr>${esc(slide.title)}</vt:lpstr>`).join('')}
    </vt:vector>
  </TitlesOfParts>
</Properties>`

const presPropsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentationPr xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" showSpecialPlsOnTitleSld="1"><p:extLst/></p:presentationPr>`

const viewPropsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:viewPr xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" lastView="sldView">
  <p:normalViewPr horizBarState="restore" vertBarState="restore"><p:restoredLeft sz="15620"/><p:restoredTop sz="94660"/></p:normalViewPr>
  <p:slideViewPr><p:cSldViewPr snapToGrid="1" snapToObjects="1" showGuides="1"/></p:slideViewPr>
  <p:notesTextViewPr/>
  <p:gridSpacing cx="780288" cy="780288"/>
</p:viewPr>`

const tableStylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<a:tblStyleLst xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" def="{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}"/>`

const entries = [
  { name: '[Content_Types].xml', data: contentTypesXml },
  { name: '_rels/.rels', data: rootRelsXml },
  { name: 'docProps/core.xml', data: coreXml },
  { name: 'docProps/app.xml', data: appXml },
  { name: 'ppt/presentation.xml', data: presentationXml },
  { name: 'ppt/_rels/presentation.xml.rels', data: presentationRelsXml },
  { name: 'ppt/presProps.xml', data: presPropsXml },
  { name: 'ppt/viewProps.xml', data: viewPropsXml },
  { name: 'ppt/tableStyles.xml', data: tableStylesXml },
  { name: 'ppt/slideMasters/slideMaster1.xml', data: slideMasterXml },
  { name: 'ppt/slideMasters/_rels/slideMaster1.xml.rels', data: slideMasterRelsXml },
  { name: 'ppt/slideLayouts/slideLayout1.xml', data: slideLayoutXml },
  { name: 'ppt/slideLayouts/_rels/slideLayout1.xml.rels', data: slideLayoutRelsXml },
  { name: 'ppt/theme/theme1.xml', data: themeXml },
]

slides.forEach((slide, index) => {
  entries.push({ name: `ppt/slides/slide${index + 1}.xml`, data: slideXml(slide) })
  entries.push({ name: `ppt/slides/_rels/slide${index + 1}.xml.rels`, data: slideRelsXml() })
})

fs.writeFileSync(outPath, makeZip(entries))
console.log(`Created ${outPath}`)
