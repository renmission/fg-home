import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { payslips, payrollRuns, payPeriods, employees } from "@/lib/db/schema";
import { getSessionOr401, requirePermission } from "@/lib/api-auth";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { withRouteErrorHandling } from "@/lib/errors";
import { payrollEmployeeSummaryQuerySchema } from "@/schemas/reports";
import { and, asc, eq, gte, lte, sql } from "drizzle-orm";
import { generateReportPdf, formatMoney } from "@/lib/pdf-utils";

export async function GET(req: NextRequest) {
  return withRouteErrorHandling(async () => {
    const { user, response } = await getSessionOr401();
    if (response) return response;
    const forbidden = requirePermission(user, PERMISSIONS.REPORTS_READ);
    if (forbidden) return forbidden;

    const parsed = payrollEmployeeSummaryQuerySchema.safeParse(
      Object.fromEntries(req.nextUrl.searchParams)
    );
    const q = parsed.success ? parsed.data : { format: "json" as const };

    const conditions = [];
    if (q.employeeId) {
      conditions.push(eq(employees.id, q.employeeId));
    }
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
    const where = conditions.length ? and(...conditions) : undefined;

    const rows = await db
      .select({
        employeeId: employees.id,
        employeeName: employees.name,
        employeeEmail: employees.email,
        totalGrossPay: sql<number>`SUM(${payslips.grossPay})`.as("total_gross_pay"),
        totalDeductions: sql<number>`SUM(${payslips.totalDeductions})`.as("total_deductions"),
        totalNetPay: sql<number>`SUM(${payslips.netPay})`.as("total_net_pay"),
        payslipCount: sql<number>`COUNT(*)`.as("payslip_count"),
      })
      .from(payslips)
      .innerJoin(payrollRuns, eq(payslips.payrollRunId, payrollRuns.id))
      .innerJoin(payPeriods, eq(payrollRuns.payPeriodId, payPeriods.id))
      .innerJoin(employees, eq(payslips.employeeId, employees.id))
      .where(where)
      .groupBy(employees.id, employees.name, employees.email)
      .orderBy(asc(employees.name));

    const data = rows.map((r) => ({
      employeeId: r.employeeId,
      employeeName: r.employeeName,
      employeeEmail: r.employeeEmail,
      totalGrossPay: Number(r.totalGrossPay),
      totalDeductions: Number(r.totalDeductions),
      totalNetPay: Number(r.totalNetPay),
      payslipCount: Number(r.payslipCount),
    }));

    if (q.format === "csv") {
      const csv = [
        [
          "Employee Name",
          "Email",
          "Total Gross Pay",
          "Total Deductions",
          "Total Net Pay",
          "Payslip Count",
        ].join(","),
        ...data.map((r) =>
          [
            `"${r.employeeName}"`,
            r.employeeEmail || "",
            r.totalGrossPay,
            r.totalDeductions,
            r.totalNetPay,
            r.payslipCount,
          ].join(",")
        ),
      ].join("\n");

      return new Response(csv, {
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": `attachment; filename="employee-summary-${new Date().toISOString().split("T")[0]}.csv"`,
        },
      });
    }

    if (q.format === "pdf") {
      const filters: Record<string, string | null | undefined> = {};
      if (q.employeeId) filters["Employee ID"] = q.employeeId;
      if (q.dateFrom) filters["From"] = q.dateFrom;
      if (q.dateTo) filters["To"] = q.dateTo;

      const pdfBuffer = await generateReportPdf({
        title: "Employee Summary Report",
        subtitle: "Payroll summary by employee",
        generatedAt: new Date(),
        filters,
        data,
        columns: [
          { key: "employeeName", label: "Employee Name" },
          { key: "employeeEmail", label: "Email" },
          {
            key: "totalGrossPay",
            label: "Total Gross Pay",
            format: formatMoney,
            align: "right",
          },
          {
            key: "totalDeductions",
            label: "Total Deductions",
            format: formatMoney,
            align: "right",
          },
          {
            key: "totalNetPay",
            label: "Total Net Pay",
            format: formatMoney,
            align: "right",
          },
          { key: "payslipCount", label: "Payslip Count", align: "right" },
        ],
      });

      return new Response(new Uint8Array(pdfBuffer), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="employee-summary-${new Date().toISOString().split("T")[0]}.pdf"`,
        },
      });
    }

    return Response.json({ data });
  });
}
