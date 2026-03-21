# Changelog

All notable changes to this project are documented in this file.

## [Unreleased]

### Added
- Fast-track Review Section feature specification in [PRD.md](PRD.md).
- Day-based implementation plan for summary, plagiarism checks, AI detection, and scoring.
- Turnitin-style matching logic guidance:
  - Exclude bibliography
  - Exclude quotes
  - Ignore short matches
  - Count unique matched words once
- Review computation engine in [src/lib/review-engine.ts](src/lib/review-engine.ts):
  - Integrity score calculation (weighted plagiarism/AI/citation risk)
  - Likely Turnitin range estimate
  - Scoring confidence label and reasons
  - Filter-aware scoring controls:
    - Exclude quoted matches
    - Exclude references/bibliography-style matches
    - Minimum match-word threshold
  - Automatic section summary extraction for thesis/article-like documents
- Review UI enhancement in [src/components/PlagiarismChecker.tsx](src/components/PlagiarismChecker.tsx):
  - Integrated enriched scoring metadata
  - Added Turnitin range card
  - Added scoring confidence panel
  - Added scoring filter controls in UI
  - Added section summary cards in Summary tab
  - Export now carries filter-aware metadata
- Subscription entitlement foundation:
  - Added subscription model to user profiles in [src/types.ts](src/types.ts)
  - Added centralized entitlement + credit logic in [src/lib/subscription.ts](src/lib/subscription.ts)
  - Auth now initializes/migrates users to default Basic subscription in [src/lib/auth.ts](src/lib/auth.ts)
  - Humanizer now enforces Basic locked / Pro credit-based access in [src/components/PlagiarismChecker.tsx](src/components/PlagiarismChecker.tsx)
  - Added plan/credit visibility in [src/components/UserMenu.tsx](src/components/UserMenu.tsx) and [src/components/AdminDashboard.tsx](src/components/AdminDashboard.tsx)
- Review Engine v1 for thesis/article documents:
  - Structured summary generation via `extractSectionSummaries` with section-boundary detection and abstract/intro/methodology/results/discussion/conclusion/references extraction
  - Plagiarism analysis with source evidence: detected sources panel in Similarity tab showing source name and similarity % contribution bar
  - AI-writing risk analysis with explainable scoring: algorithmic signal breakdown (entropy, burstiness, stylometric, repetition) + per-highlight `indicators` field and "Why it was flagged" display
  - Exportable review report for academic review workflows with Turnitin range, confidence context, filter details, and section summaries

### Improved
- PDF review export in [src/lib/pdf-export.ts](src/lib/pdf-export.ts):
  - Adds Turnitin likely range and confidence context
  - Adds scoring context section with active filter details
  - Adds section-level summaries in report output
- Export/report branding consistency:
  - Added centralized brand tokens in [src/lib/report-branding.ts](src/lib/report-branding.ts)
  - Updated all PDF/Word exports to use unified company colors and identity
  - Replaced placeholder export logo with authentic company logo asset path
  - Standardized footer, contact line, and website presentation across reports

### Changed
- Admin dashboard stats synchronization logic to compute card totals from the same loaded datasets used by tables.
- Error logger module restored and stabilized after syntax corruption.
- Error fallback component restored after JSX corruption.
- `AIDetectionHighlight` type extended with optional `indicators?: string[]` for explainable AI flagging.
- `performEnhancedPlagiarismCheck` return type now properly typed as `AdvancedDetectionResult` instead of `any`.
