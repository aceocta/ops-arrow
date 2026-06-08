# Ops Arrow — Web Portal

A React + TypeScript web portal for **company owners and shop managers**. It talks to the **same backend API** as the mobile app (`ScratchCard.Api`), reusing the same JWT auth, subscription feature-gating and DTOs. Staff continue to use the mobile app for on-the-floor capture; the web focuses on oversight, analysis, bulk work and configuration.

## Stack
- Vite + React 18 + TypeScript
- React Router, TanStack Query, Axios
- Tailwind CSS, Recharts, lucide-react

## Getting started
```bash
cd ScratchCard.Web
npm install
cp .env.example .env        # set VITE_API_BASE_URL to your API (…/api)
npm run dev                  # http://localhost:5173
```
The API already allows `http://localhost:5173` via CORS (`Program.cs`).

## What's implemented (foundation)
- Email/password login against `/auth/login` + token refresh (separate web token storage, no impact on mobile).
- Profile + multi-shop switcher (`/auth/me`), entitlements per shop (`/shop-subscription/entitlements`).
- Feature-gated sidebar nav.
- **Dashboard** — multi-shop owner overview (`/reports/owner-overview`): stat cards, scratch-card sales chart, shops table, 7/30-day range.
- Placeholder pages for Rota, Timesheets, Temperature, Compliance, Settings.

## API performance principle
Reuse mobile endpoints where they're efficient. For web-heavy needs (large date ranges, full tables, bulk ops, server-side exports) add **web-specific endpoints** (e.g. paginated/filterable report queries) so the mobile app's performance is never affected. Mark such endpoints clearly and keep business logic shared in the services.

## Next phases
1. Reports + server-side CSV/PDF/Excel export.
2. Rota planner (week/month grid, drag-drop, bulk generate, external staff).
3. Timesheets + approvals (bulk approve, payroll export).
4. Configuration (shop settings, schedules, checklists, users/billing).
5. Compliance / temperature / refusals / visitors history + audit log.
