# AJK Education Governance Platform - Implementation Guide

**Status**: Phase 1 Scaffolding Complete  
**Powered by**: NovusSparks AI  
**Last Updated**: April 11, 2026

## Quick Start

The Education Governance Platform is now scaffolded in `src/projects/education-governance/` with:

- **Types** (`types/index.ts`): GovernanceRole, School, Staff, PolicyCircular, LeaveRequest, etc.
- **RBAC** (`lib/rbac.ts`): Role-based access control with module permissions
- **Components** (`components/`): 9 core module skeleton components
- **Main Platform** (`components/EducationGovernancePlatform.tsx`): Tab-based navigation, bilingual support, header

## Project Structure

```
src/projects/education-governance/
├── types/
│   └── index.ts              # All TypeScript interfaces
├── lib/
│   ├── index.ts              # Barrel export
│   └── rbac.ts               # Role permissions, visibility rules
├── components/
│   ├── index.ts              # Barrel export
│   ├── EducationGovernancePlatform.tsx   # Main shell
│   ├── GovernanceDashboard.tsx
│   ├── SchoolManagement.tsx
│   ├── PolicyCenter.tsx
│   ├── LeaveManagement.tsx
│   ├── AttendanceTracker.tsx
│   ├── DocumentTracker.tsx
│   ├── NotificationsCenter.tsx
│   ├── ComplianceQA.tsx
│   └── FinanceManagement.tsx
└── index.ts                  # Project barrel export
```

## Phase 1 Modules

All 9 core modules are scaffolded with skeleton components:

| Module | Component | Purpose |
|--------|-----------|---------|
| Governance Dashboard | `GovernanceDashboard` | Department/district/school summary, alerts, insights |
| School & Staff Management | `SchoolManagement` | Directory, staff records, assignments, staffing |
| Policy Center | `PolicyCenter` | Upload circulars, bilingual display, acknowledgement |
| Leave & Substitute Management | `LeaveManagement` | Applications, approvals, substitute assignment |
| Attendance & Operations | `AttendanceTracker` | Daily attendance, progress, issue logging |
| Document & Project Lifecycle | `DocumentTracker` | Registration, movement history, auditing |
| Notifications & Communication | `NotificationsCenter` | Targeted notices, delivery, stakeholder threads |
| Compliance & QA | `ComplianceQA` | Inspections, checklists, heatmaps, scorecards |
| Resource & Finance | `FinanceManagement` | Requests, approvals, budget, expenses |

## RBAC Roles

```typescript
type GovernanceRole = 
  | "secretariat_admin"  // Full access
  | "deo_male"           // District oversight (male)
  | "deo_female"         // District oversight (female)
  | "principal"          // School operations
  | "teacher_staff"      // Day-to-day operations
  | "parent_student"     // View & notifications only
```

See `lib/rbac.ts` for module access matrix and permission helpers.

## Bilingual Support

- `user.languagePreference`: "urdu" | "english" | "bilingual"
- All entities support bilingual fields: `name` + `nameUrdu`, `title` + `titleUrdu`, etc.
- UI labels from `RoleLabels` in `lib/rbac.ts`
- Example in main platform component demonstrates bilingual header

## Integration Points

### With NovusSparks Core

1. **Auth**: Uses same `GovernanceUser` shape (extends from `User`)
2. **AI Insights**: Sentinel Brain connector for policy analysis, trend detection, recommendations
3. **Notifications**: Reuse notification center infra from core
4. **Chat**: Governance-aware chatbot for policy lookup, workflow guidance

### Data Model Foundation

All entity types are defined in `types/index.ts`. Hook up to:
- Neon PostgreSQL tables (matching AJK schema naming)
- Sentinel Brain for policy embeddings and similarity search
- Notifications table for targeted alerts

## Next Steps

### Phase 1 Implementation (MVP)

1. **Database Schema** — Create AJK-specific tables (schools, staff, policies, etc.)
2. **CRUD APIs** — Backend routes for all entity types
3. **Module Implementation** — Replace skeleton components with real UI
4. **AI Integration** — Wire Sentinel Brain for policy analysis & insights
5. **Approval Workflows** — Implement leave, policy, resource approval flows
6. **Compliance Engine** — Automated checking & escalation

### Phase 2 (Post-Phase 1)

- External integrations (HRIS, treasury, etc.)
- Virtual/3D school representation
- Advanced analytics and forecasting

## Design Notes

- **Government-ready**: Serious, modern operations platform aesthetic
- **Auditability**: Every action logged with timestamp, actor, change history
- **Approvals**: Multi-level approval chains shown clearly
- **Heatmaps**: Compliance and operational status at-a-glance
- **Responsive**: Mobile-friendly dashboards resizing gracefully
- **Accessibility**: WCAG compliance for public sector use

## Files to Integrate

When ready to ship:

1. Import `EducationGovernancePlatform` in `src/App.tsx`
2. Add route `/governance` or new sidebar item `Education Governance`
3. Pass authenticated `user` and `GovernanceUser` cast
4. Ensure NovusSparks auth middleware validates `isAdmin` flag for role transitions

## Notes

- All 9 module components currently show placeholder alerts
- This is the **scaffolding baseline** — modules are ready for real implementation
- RBAC and types are production-ready; use them directly
- Bilingual support is wired in; just populate translated strings
- Powered by NovusSparks AI is hard-coded in the footer

---

**Questions?** Refer to the prototype spec docs:
- `docs/education-governance-prototype-prompt.md` — Design brief
- `docs/education-governance-ai-ajk-prototype-readme.md` — Feature list
