---
target: "app: dashboard, login, tracking (desktop + mobile)"
total_score: 26
max_score: 40
na_heuristics: 
p0_count: 2
p1_count: 2
timestamp: 2026-08-18T10-26-29Z
slug: app-dashboard-login-tracking-desktop-mobile
---
Method: dual-agent (A: aff86a7777b019f09 · B: general-purpose detector agent). Browser step degraded: no browser tool this session — fallback used, source-level grep audit instead.

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Dashboard fetch has no per-card skeleton, full-page block on load (dashboard/page.tsx:198-254) |
| 2 | Match System/Real World | 4 | Strong freight vocab (LR, GSTIN, docket charges) throughout |
| 3 | User Control & Freedom | 3 | Stepper circles not clickable — can't jump back a step (CargoDocketForm.tsx:432-454) |
| 4 | Consistency & Standards | 2 | 4 input heights in live use: h-8/h-9/h-10/h-12, DESIGN.md specs one (h-12) |
| 5 | Error Prevention | 2 | Payment amount field: min="0.01", no max={amountDue} — overpayment possible (RecordPaymentModal.tsx:174-182) |
| 6 | Recognition > Recall | 3 | No persistent Step1/2 summary while on Step 4/5 |
| 7 | Flexibility & Efficiency | 2 | No keyboard shortcuts, non-clickable stepper |
| 8 | Aesthetic & Minimalist | 3 | Billing/Quotation tables dense but functional |
| 9 | Error Recovery | 2 | Generic banner only, no field-level red border despite Input supporting error prop unused |
| 10 | Help & Documentation | 2 | No legend for the 3 overlapping badge taxonomies (delivery/payment/docket status) |
| **Total** | | **26/40** | **Acceptable** |

## Design Specificity Verdict

Domain vocab genuine, not template-generic. Two dead files, KpiStats.tsx and DocketList.tsx (unimported anywhere, confirmed by both assessments), carry an entirely different old design system — teal #1C3E4E, emoji icons, uppercase everything. Drift risk if reintroduced. Delete.

## Overall Impression

Desktop surface solid, domain-authentic, decent heuristic score. Mobile surface has 1 architecture-breaking gap: no way to navigate off the mobile shell. Everything else secondary to that.

## What's Working

1. ShipmentStepper.tsx — real dual-viewport component. Horizontal 6-node stepper desktop (hidden sm:flex, 74-112), separate vertical timeline mobile (sm:hidden, 114-143), independent icon sizing.
2. DashboardCharts.tsx:40-44 — empty-state honesty. Comment documents a prior fake-sample-data version deliberately replaced with real empty state.
3. Role-aware nav/KPI — AppShell.tsx:175 filters nav by adminOnly, dashboard swaps KPI card sets staff vs admin.
4. Void-docket flow — typed reason required, confirm disabled till valid, explicit irreversibility warning (ShipmentDetailView.tsx:537-568).

## Priority Issues

[P0] No mobile navigation beyond "New LR" — MOBILE
AppShell.tsx:317-331 — mobile header has only logo + "New LR" button. No hamburger, no bottom bar. No path to Shipments/Customers/Billing/etc from mobile shell. Confirmed independently by both assessments.
Fix: add mobile nav drawer/bottom-tab covering same items as desktop sidebar.
Command: /impeccable adapt

[P0] Quotation rate table clips off-screen on mobile, no scroll — MOBILE
QuotationView.tsx:554-599 — wraps table in overflow-hidden (not overflow-x-auto, unlike every sibling table: dashboard/page.tsx:998, BillingView.tsx:936, DocketList.tsx:393). At 375-430px, extra columns clipped, undiscoverable, unscrollable.
Fix: swap overflow-hidden to overflow-x-auto on that wrapper.
Command: /impeccable adapt

[P1] Touch targets under 44px on primary mobile actions — MOBILE
dashboard/page.tsx:943-964 mobile shipment-card quick actions h-8 (32px), 3-col grid. RecordPaymentModal.tsx:174-221, TrackingTimelineModal.tsx:219-256 inputs h-8. CargoDocketForm.tsx:727,740 selects h-9. Button sm/icon sizes h-9 (ui/button.tsx:23,26). Icon-only buttons with no aria-label: AppShell.tsx:104-121, :283-289, RecordPaymentModal.tsx:114, DocketList.tsx:575.
Fix: bump to h-11/h-12 on touch-relevant controls, add aria-label to icon-only buttons.
Command: /impeccable audit then /impeccable polish

[P1] Zero safe-area-inset handling — MOBILE
grep -r "safe-area" src/ returns 0 hits, both assessments confirm. Fixed mobile header + 4 fixed inset-0 modals will sit flush against notch/home-indicator on iOS.
Fix: add env(safe-area-inset-*) padding to fixed header/modals.
Command: /impeccable harden

[P2] Contrast risk — gray-on-color, BOTH
Detector flagged: dashboard/page.tsx:948,971 text-slate-700 on bg-blue-50; :1034 text-slate-400 on bg-red-50; CargoDocketForm.tsx:870, StaffManager.tsx:170 same pattern; BillingView.tsx:1471,2035 side-tab/border-accent findings. Heavy volume of text-slate-300/400 (31 hits in dashboard) for body-relevant text.
Fix: verify 4.5:1, darken text or lighten bg on flagged pairs.
Command: /impeccable audit

[P2] Desktop action-bar overflow + Void undifferentiated in placement — BOTH, worse mobile
ShipmentDetailView.tsx:225-251 — Print/Download/Edit/Void as 4 size="sm" buttons, one row, no flex-wrap, no scroll. Void only differs by red color, same size/adjacency as safe actions.
Fix: wrap row, separate Void with divider/distance.
Command: /impeccable adapt

[P3] 4 inconsistent input heights fragment design system — BOTH
ui/input.tsx h-12 (canonical per DESIGN.md), AppShell.tsx search h-10, CargoDocketForm.tsx select h-9, modal fields h-8.
Fix: standardize on h-12/h-11 per DESIGN.md spec.
Command: /impeccable polish

## Persona Red Flags

Alex (power user, desktop): Can't click stepper circles to jump back a step. Records payment via row Wallet icon, amount field pre-fills amountDue with no max — fat-finger risk, zero warning.

Casey (mobile, one-handed, field): Lands on wrong tab, cannot navigate to Shipments at all — worst single finding in report. If already on Shipments card view, "Status" button is 32px in a 3-col grid. Unauthenticated public /tracking page is more mobile-competent than the authenticated staff dashboard he actually needs.

## Minor Observations

- login/page.tsx:11,184-188 — password field pre-filled password123, plaintext demo creds printed on page.
- login/page.tsx:167 — password-visibility eye icon w-4 h-4, no button padding, ~16px hit target.
- 3 overlapping badge taxonomies (delivery/payment/docket status) shown per row with zero legend.
- 3 money-formatting conventions coexist: compact lakh (KPIs), full toLocaleString (Reports), raw toFixed(2) (form/modals).
- CargoDocketForm.tsx:445 step labels hidden sm:inline — mobile sees numbered circles only, no text.
- KpiStats.tsx/DocketList.tsx dead code, different design system — delete.
