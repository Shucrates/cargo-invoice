# Design System: Modern Enterprise SaaS (Cargo Platform)

## Overview

**Creative Theme: "Modern Enterprise SaaS (Linear + Stripe + Vercel)"**

The Cargo Logistics Platform UI is built around a calm, spacious, modern enterprise SaaS aesthetic. It reduces visual clutter, floats white cards over a soft background canvas (`#F6F8FB`), and uses explicit typography hierarchy, subtle borders, and smooth micro-interactions.

---

## Color Palette

### 1. Canvas & Surface Hierarchy
- `Page Canvas` — `#F6F8FB` (Soft light grey-blue background canvas)
- `Card / Modal Surface` — `#FFFFFF` (White paper floating canvas)
- `Hover Background` — `#F3F5F8` / `#F8FAFC`
- `Selected Row / Active Pill` — `#EFF6FF` / `#EEF4FF`
- `Borders & Dividers` — `#EEF1F4` / `#E2E8F0`

### 2. Accent Color
- **Primary Brand Accent**: `#2563EB` (Bright SaaS Blue)
  - Hover: `#1D4ED8`
  - Active: `#1E40AF`
  - Used for: Primary buttons, active nav tabs, active row selection, links, focus rings, and line charts.

### 3. Muted Status Color System
- **Success (Paid / Active)**: Background `#E8F7EF`, Text `#1F8A4C`
- **Warning (Credit / Unpaid)**: Background `#FFF6DD`, Text `#B7791F`
- **Danger (Voided / Due)**: Background `#FDECEC`, Text `#D14343`
- **Info (Draft / Issued)**: Background `#EEF4FF`, Text `#2563EB`

---

## Typography & Hierarchy

- **Font Family**: Inter / SF Pro System Stack
- **Monospace Font**: JetBrains Mono / SF Mono (for Docket numbers, tracking codes, and monetary figures)

### Typography Scale & Weights
- **Dashboard Title**: 32px (`text-3xl font-bold tracking-tight text-slate-900`)
- **Section Header**: 24px (`text-2xl font-bold text-slate-900`)
- **Card Header**: 18px (`text-lg font-semibold text-slate-900`)
- **Body / Standard**: 14px (`text-sm font-normal text-slate-700`)
- **Secondary**: 13px (`text-[13px] text-slate-500`)
- **Caption / Mono**: 12px (`text-xs text-slate-400 font-mono`)

---

## Component Specifications

### 1. Cards
- Radius: `16px` (`rounded-2xl`)
- Border: `1px solid #EEF1F4`
- Padding: `24px` (`p-6`)
- Shadow: `0 4px 20px rgba(0,0,0,0.03)`

### 2. Navigation Sidebar
- Width: `260px` (`w-[260px]`)
- Background: `#FFFFFF`
- Active Nav Pill: `#EFF6FF` background, `#2563EB` text/icon, `12px` radius (`rounded-xl`).

### 3. Tables
- Row Height: `60px`–`72px`
- Table Headers: `13px`/`14px` medium slate (`#64748B`), soft border bottom.
- Dividers: Horizontal hairline dividers (`border-b border-slate-100`), no vertical borders.
- Badges: Pill-style status badges (`rounded-full px-3 py-1 text-xs font-medium`).

### 4. Inputs & Buttons
- Inputs: `48px` height (`h-12`), `12px` radius (`rounded-xl`), `#E5EAF0` border, soft blue glow on focus.
- Primary Buttons: `44px` height (`h-11`), `12px` radius (`rounded-xl`), `#2563EB` blue background, white text, 200ms transition.

