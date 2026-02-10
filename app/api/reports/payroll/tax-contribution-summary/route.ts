import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { deductions, payslips, payrollRuns, payPeriods } from "@/lib/db/schema";
import { getSessionOr401, requirePermission } from "@/lib/api-auth";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { withRouteErrorHandling } from "@/lib/errors";
import { payrollTaxContributionSummaryQuerySchema } from "@/schemas/reports";
import { and, asc, eq, gte, lte, sql } from "drizzle-orm";
import { generateReportPdf, formatMoney } from "@/lib/pdf-utils";

export async function GET(req: NextRequest) {
  return withRouteErrorHandling(async () => {
    const { user, response } = await getSessionOr401();
    if (response) return response;
    const forbidden = requirePermission(user, PERMISSIONS.REPORTS_READ);
    if (forbidden) return forbidden;

    const parsed = payrollTaxContributionSummaryQuerySchema.safeParse(
      Object.fromEntries(req.nextUrl.searchParams)
    );
    const q = parsed.success ? parsed.data : { format: "json" as const };

    const conditions = [];
    // Date filtering: include pay periods that overlap with the date range
    // A period overlaps if: startDate <= dateTo AND endDate >= dateFrom
    if (q.dateFrom && q.dateTo) {
      conditions.push(
        sql`${payPeriods.startDate} <= ${q.dateTo} AND ${payPeriods.endDate} >= ${q.dateFrom}`
      );
    } else if (q.dateFrom) {
      conditions.push(gte(payPeriods.endDate, q.dateFrom));
    } else if (q.dateTo) {
      conditions.push(lte(payPeriods.startDate, q.dateTo));
    }
    // Filter for Philippine contributions: tax, sss, philhealth, pagibig
    conditions.push(sql`${deductions.type} IN ('tax', 'sss', 'philhealth', 'pagibig')`);
    const where = conditions.length ? and(...conditions) : undefined;

    const rows = await db
      .select({
        type: deductions.type,
        totalAmount: sql<number>`SUM(${deductions.amount})`.as("total_amount"),
        count: sql<number>`COUNT(*)`.as("count"),
      })
      .from(deductions)
      .innerJoin(payslips, eq(deductions.payslipId, payslips.id))
      .innerJoin(payrollRuns, eq(payslips.payrollRunId, payrollRuns.id))
      .innerJoin(payPeriods, eq(payrollRuns.payPeriodId, payPeriods.id))
      .where(where)
      .groupBy(deductions.type)
      .orderBy(asc(deductions.type));

    const data = rows.map((r) => ({
      type: r.type,
      label:
        r.type === "tax"
          ? "Tax"
          : r.type === "sss"
            ? "SSS"
            : r.type === "philhealth"
              ? "PhilHealth"
              : r.type === "pagibig"
                ? "Pag-IBIG"
                : r.type,
      totalAmount: Number(r.totalAmount),
      count: Number(r.count),
    }));

    if (q.format === "csv") {
      const csv = [
        ["Contribution Type", "Total Amount", "Count"].join(","),
        ...data.map((r) => [r.label, r.totalAmount, r.count].join(",")),
      ].join("\n");

      return new Response(csv, {
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": `attachment; filename="tax-contribution-summary-${new Date().toISOString().split("T")[0]}.csv"`,
        },
      });
    }

    if (q.format === "pdf") {
      const filters: Record<string, string | null | undefined> = {};
      if (q.dateFrom) filters["From"] = q.dateFrom;
      if (q.dateTo) filters["To"] = q.dateTo;

      const pdfBuffer = await generateReportPdf({
        title: "Tax & Contribution Summary Report",
        subtitle: "Philippine tax and contribution summary (SSS, PhilHealth, Pag-IBIG)",
        generatedAt: new Date(),
        filters,
        data,
        columns: [
          { key: "label", label: "Contribution Type" },
          {
            key: "totalAmount",
            label: "Total Amount",
            format: formatMoney,
            align: "right",
          },
          { key: "count", label: "Count", align: "right" },
        ],
      });

      return new Response(new Uint8Array(pdfBuffer), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="tax-contribution-summary-${new Date().toISOString().split("T")[0]}.pdf"`,
        },
      });
    }

    return Response.json({ data });
  });
}
