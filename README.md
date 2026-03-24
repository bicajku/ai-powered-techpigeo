# 🚀 AI-Powered Techpigeon Assistant (Drive 2 AI Sparks)

Welcome to the **AI-Powered Techpigeon Assistant** — your intelligent marketing strategy and business insights platform built with cutting-edge AI technology.

## 🎯 About Techpigeon

**TechPigeon** is Pakistan's leading platform for AI Boot Camps, Cloud Computing, and IT Training. This assistant leverages TechPigeon's expertise to help you create powerful marketing strategies and business solutions.

**Visit us:** [www.techpigeon.org](https://www.techpigeon.org)

## ✨ What This App Does

- 📊 **Generate Marketing Strategies** - AI-powered marketing copy, visual strategies, and target audience analysis
- 💾 **Save & Compare** - Store your strategies and compare up to 3 versions side-by-side
- 🎨 **Visual Strategy Recommendations** - Get detailed guidance on colors, imagery, and design aesthetics
- 🔍 **Audience Analysis** - Understand your target demographic with demographic and psychographic insights

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Configure environment variables
cp .env.example .env.local
# Edit .env.local and add your API keys

# Start development server
npm run dev

# Build for production
npm run build
```

### Environment Configuration

The application requires environment variables for full functionality. See [ENV_CONFIG.md](ENV_CONFIG.md) for detailed setup instructions.

**Required for core features:**
- `VITE_NEON_DATABASE_URL` - PostgreSQL database connection
- `VITE_GEMINI_API_KEY` - Google Gemini API key

**Optional enhancements:**
- `VITE_GITHUB_COPILOT_TOKEN` - GitHub Copilot integration
- Feature flags for enabling/disabling modules
- Rate limit configuration

Run with debug mode to see configuration status:
```bash
VITE_SPARK_DEBUG=true npm run dev
```

## 🛠 Features

- ✅ Built with React + TypeScript
- ✅ AI-powered strategy generation
- ✅ Responsive design with Tailwind CSS
- ✅ Local storage for saved strategies
- ✅ Side-by-side comparison view
- ✅ TechPigeon brand colors & typography

## 🎨 Branding

This app ships with named TechPigeon presets and a menu-based selector in the user profile.

Default theme: **techpigeon_brand**
- **Picton Blue:** #5cc3eb
- **Roti:** #bca444
- **Cocoa Brown:** #1c1414
- **Bay Leaf:** #8cb499

Secondary theme: **techpigeon_classic**
- **Primary Navy:** #0b1d3a
- **Secondary Blue:** #3ba8d4
- **Accent Gold:** #bba442
- **Typography:** Aleo (headings), Inter (body)

## 📝 License

For Spark Template Resources: MIT License - Copyright GitHub, Inc.

## 🧭 Fast-Track Review Roadmap

This project is moving with a compressed timeline (days, not weeks).

### Phase A (Core in Days)
- Day 1: Thesis/article file ingestion + section parsing + structured summary
- Day 2: Plagiarism detection v1 (exact overlap + source matches)
- Day 3: AI detection v1 (stylometry + perplexity signals)
- Day 4: Turnitin-style controls (exclude references/quotes/short matches) + final scoring panel

### Phase B (Hardening)
- Threshold calibration against benchmark documents
- False-positive reduction for properly cited text
- Report export improvements and evidence explainability

## 📓 Development Log

Track implementation progress in [CHANGELOG.md](CHANGELOG.md).

---

**Powered by TechPigeon** | Pakistan's Leading AI & IT Training Platform
