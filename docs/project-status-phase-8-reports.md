# Project Status — Phase 8 (Reports)

Phase 8 scope (per [PROJECT_PLAN.md](./PROJECT_PLAN.md) § Phase 8 — Reports): Inventory reports (stock levels, movement summary, low-stock list, reorder suggestions), payroll reports (payslips by period, summary by employee, deductions breakdown, tax/contribution summary), delivery reports (by status, by date range, average time to deliver, optional by customer/route). Export (CSV/PDF); optional scheduled reports and saved report parameters. Reports permissions and nav.

---

## Checklist

| Module    | Vertical                                                                                    | API | UI  | Nav | Permissions | Export | Status |
| --------- | ------------------------------------------------------------------------------------------- | --- | --- | --- | ----------- | ------ | ------ |
| **Reports** | Inventory: Stock levels (current, by category)                                              | [x] | [x] | —   | [x]         | [x]    | **Done** |
| **Reports** | Inventory: Movement summary (in/out/adjustment by period)                                  | [x] | [x] | —   | [x]         | [x]    | **Done** |
| **Reports** | Inventory: Low-stock list                                                                   | [x] | [x] | —   | [x]         | [x]    | **Done** |
| **Reports** | Inventory: Reorder suggestions                                                              | [x] | [x] | —   | [x]         | [x]    | **Done** |
| **Reports** | Payroll: Payslips by period                                                                 | [x] | [x] | —   | [x]         | [x]    | **Done** |
| **Reports** | Payroll: Summary by employee                                                                 | [x] | [x] | —   | [x]         | [x]    | **Done** |
| **Reports** | Payroll: Deductions breakdown                                                                | [x] | [x] | —   | [x]         | [x]    | **Done** |
| **Reports** | Payroll: Tax/contribution summary                                                           | [x] | [x] | —   | [x]         | [x]    | **Done** |
| **Reports** | Delivery: By status                                                                          | [x] | [x] | —   | [x]         | [x]    | **Done** |
| **Reports** | Delivery: By date range                                                                      | [x] | [x] | —   | [x]         | [x]    | **Done** |
| **Reports** | Delivery: Average time to deliver                                                           | [x] | [x] | —   | [x]         | [x]    | **Done** |
| **Reports** | Delivery: Optional — by customer or route                                                    | —   | —   | —   | —           | —      | Optional |
| **Reports** | Export: CSV format                                                                           | [x] | [x] | —   | —           | [x]    | **Done** |
| **Reports** | Export: PDF format                                                                           | [x] | [x] | —   | —           | [x]    | **Done** |
| **Reports** | Reports permissions and nav (`reports:read`)                                                | —   | —   | [x] | [x]         | —      | **Done** |
| **Reports** | Role-based visibility                                                                        | —   | [x] | —   | [x]         | —      | **Done** |
| **Reports** | Optional: Scheduled reports                                                                 | [ ] | [ ] | —   | —           | —      | Optional |
| **Reports** | Optional: Saved report parameters (filters, date range)                                     | [ ] | [ ] | —   | —           | —      | Optional |

---

## Notes

- **API:** Route handlers for reports (`GET /api/reports/inventory/*`, `/api/reports/payroll/*`, `/api/reports/deliveries/*`). Each report endpoint accepts query parameters for filters (date range, status, category, etc.). Export endpoints return CSV or PDF format.
- **UI:** Reports dashboard (`/dashboard/reports`) with tabs/sections for Inventory, Payroll, and Delivery reports. Each report shows data table with filters (date range picker, status dropdown, category filter, etc.). Export buttons (CSV/PDF) for each report. Optional: saved report templates, scheduled report configuration.
- **Nav:** Add "Reports" to sidebar; visible only to users with `reports:read` permission. Link to reports dashboard.
- **Permissions:** `reports:read` for viewing and exporting reports. Enforce in API routes and UI. Add to `lib/auth/permissions.ts` (PERMISSIONS, ROLE_PERMISSIONS, NAV_ITEMS). Role-based visibility: different roles may see different reports (e.g., payroll_manager sees payroll reports, inventory_manager sees inventory reports, admin sees all).
- **Export formats:**
  - **CSV:** Use a CSV library (e.g., `papaparse` or native implementation) to generate CSV files. Download via `Content-Disposition: attachment`.
  - **PDF:** Use a PDF generation library (e.g., `pdfkit`, `jspdf`, or server-side `@react-pdf/renderer`). For payroll payslips, reuse existing PDF generation logic.
- **Key entities (from plan):** Report definitions (in code or config); generated artifacts (file store or transient); optional `saved_reports`, `report_schedules` tables.
- **Inventory Reports:**
  - **Stock levels:** Current quantity per product, grouped by category. Show available, reserved, low-stock status.
  - **Movement summary:** Aggregate movements by type (in/out/adjustment) within date range. Group by product, category, or period (daily/weekly/monthly).
  - **Low-stock list:** Products where `current_quantity <= reorder_level`. Sort by urgency (lowest stock first).
  - **Reorder suggestions:** Products that need reordering based on reorder level and current stock.
- **Payroll Reports:**
  - **Payslips by period:** List all payslips for a selected pay period. Include employee name, gross pay, deductions, net pay. Link to PDF download.
  - **Summary by employee:** Aggregate payslip data by employee over date range. Show total earnings, deductions, net pay.
  - **Deductions breakdown:** Group deductions by type (SSS, PhilHealth, Pag-IBIG, tax, loans, etc.) over date range. Show totals per deduction type.
  - **Tax/contribution summary:** Summary of Philippine contributions (SSS, PhilHealth, Pag-IBIG) and tax deductions. Useful for compliance reporting.
- **Delivery Reports:**
  - **By status:** Count and list deliveries grouped by status (Created, Picked, In Transit, Out for Delivery, Delivered, Failed, Returned).
  - **By date range:** Deliveries created or updated within date range. Show status distribution, completion rate.
  - **Average time to deliver:** Calculate average time from "Created" to "Delivered" status. Group by date range or customer.
  - **By customer/route (optional):** Group deliveries by customer or delivery route. Show delivery frequency, average delivery time per customer/route.

---

## Changelog

- **2026-02-10:** Feature branch `feature/phase-8-reports` created; this status file added.
- **2026-02-10:** Phase 8 implementation:
  - **Permissions:** Added `reports:read` permission; updated role permissions (admin, inventory_manager, payroll_manager, viewer get reports access); added Reports nav item.
  - **Schemas:** Created `schemas/reports.ts` with Zod schemas for all report query parameters (inventory, payroll, delivery).
  - **API Endpoints:**
    - Inventory: `/api/reports/inventory/stock-levels`, `/api/reports/inventory/movement-summary`, `/api/reports/inventory/low-stock`, `/api/reports/inventory/reorder-suggestions`
    - Payroll: `/api/reports/payroll/payslips-by-period`, `/api/reports/payroll/employee-summary`, `/api/reports/payroll/deductions-breakdown`, `/api/reports/payroll/tax-contribution-summary`
    - Delivery: `/api/reports/deliveries/by-status`, `/api/reports/deliveries/by-date-range`, `/api/reports/deliveries/average-time`
  - **CSV Export:** All report endpoints support CSV export via `format=csv` query parameter. CSV files download with appropriate filenames.
  - **UI:** Created `/dashboard/reports` page and `components/reports/reports-dashboard.tsx` with tabs for Inventory, Payroll, and Delivery reports. Each report shows data tables with filters (date range, status, category). Export CSV buttons for each report. Role-based visibility: inventory_manager sees inventory reports, payroll_manager sees payroll reports, admin sees all.
  - **Role-based visibility:** Reports dashboard shows only relevant tabs based on user role (inventory_manager → inventory tab, payroll_manager → payroll tab, admin → all tabs).
- **2026-02-10:** Data accuracy fixes:
  - Fixed Movement Summary GROUP BY issue (productName/productCategory not in GROUP BY for day/week/month grouping)
  - Fixed payroll reports date filtering (now checks for period overlap instead of just startDate >= dateFrom)
  - Fixed delivery reports date range inclusion (now includes full days: 00:00:00 to 23:59:59.999)
  - Fixed delivery average time week calculation (now uses Monday as start of week, ISO week)
  - Fixed low stock and stock levels NULL quantity handling (using COALESCE)
- **2026-02-10:** PDF export implementation:
  - Implemented PDF export using `pdf-lib` library (pure JavaScript, no native dependencies)
  - All 11 report endpoints now support PDF export via `format=pdf` query parameter
  - PDF generation includes formatted tables, headers, filters, and proper styling
  - PDF files download with appropriate filenames and `application/pdf` content type
- **2026-02-10:** Role-based access implementation:
  - Updated reports dashboard to properly handle VIEWER role (can view all reports)
  - Implemented proper role-based tab visibility (canViewInventoryReports, canViewPayrollReports)
  - Final access matrix: ADMIN (all), INVENTORY_MANAGER (inventory + delivery), PAYROLL_MANAGER (payroll + delivery), VIEWER (all), DELIVERY_STAFF (none), POS_CASHIER (none)
- **2026-02-10:** Note: Scheduled reports and saved report parameters are optional features not implemented in MVP.

---

_Update this file as Phase 8 tasks are completed._
