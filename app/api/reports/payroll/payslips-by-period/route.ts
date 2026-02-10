import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { payslips, payrollRuns, payPeriods, employees } from "@/lib/db/schema";
import { getSessionOr401, requirePermission } from "@/lib/api-auth";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { withRouteErrorHandling } from "@/lib/errors";
import { payrollPayslipsByPeriodQuerySchema } from "@/schemas/reports";
import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";
import { generateReportPdf, formatMoney, formatDate } from "@/lib/pdf-utils";

export async function GET(req: NextRequest) {
  return withRouteErrorHandling(async () => {
    const { user, response } = await getSessionOr401();
    if (response) return response;
    const forbidden = requirePermission(user, PERMISSIONS.REPORTS_READ);
    if (forbidden) return forbidden;

    const parsed = payrollPayslipsByPeriodQuerySchema.safeParse(
      Object.fromEntries(req.nextUrl.searchParams)
    );
    const q = parsed.success ? parsed.data : { format: "json" as const };

    const conditions = [];
    if (q.payPeriodId) {
      conditions.push(eq(payrollRuns.payPeriodId, q.payPeriodId));
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
        payslipId: payslips.id,
        employeeName: employees.name,
        employeeEmail: employees.email,
        payPeriodStart: payPeriods.startDate,
        payPeriodEnd: payPeriods.endDate,
        payDate: payPeriods.payDate,
        grossPay: payslips.grossPay,
        totalDeductions: payslips.totalDeductions,
        netPay: payslips.netPay,
        status: payslips.status,
      })
      .from(payslips)
      .innerJoin(payrollRuns, eq(payslips.payrollRunId, payrollRuns.id))
      .innerJoin(payPeriods, eq(payrollRuns.payPeriodId, payPeriods.id))
      .innerJoin(employees, eq(payslips.employeeId, employees.id))
      .where(where)
      .orderBy(desc(payPeriods.startDate), asc(employees.name));

    const data = rows.map((r) => ({
      payslipId: r.payslipId,
      employeeName: r.employeeName,
      employeeEmail: r.employeeEmail,
      payPeriodStart: r.payPeriodStart,
      payPeriodEnd: r.payPeriodEnd,
      payDate: r.payDate,
      grossPay: Number(r.grossPay),
      totalDeductions: Number(r.totalDeductions),
      netPay: Number(r.netPay),
      status: r.status,
    }));

    if (q.format === "csv") {
      const csv = [
        [
          "Employee Name",
          "Email",
          "Pay Period Start",
          "Pay Period End",
          "Pay Date",
          "Gross Pay",
          "Total Deductions",
          "Net Pay",
          "Status",
        ].join(","),
        ...data.map((r) =>
          [
            `"${r.employeeName}"`,
            r.employeeEmail || "",
            r.payPeriodStart,
            r.payPeriodEnd,
            r.payDate,
            r.grossPay,
            r.totalDeductions,
            r.netPay,
            r.status,
          ].join(",")
        ),
      ].join("\n");

      return new Response(csv, {
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": `attachment; filename="payslips-by-period-${new Date().toISOString().split("T")[0]}.csv"`,
        },
      });
    }

    if (q.format === "pdf") {
      const filters: Record<string, string | null | undefined> = {};
      if (q.payPeriodId) filters["Pay Period ID"] = q.payPeriodId;
      if (q.dateFrom) filters["From"] = q.dateFrom;
      if (q.dateTo) filters["To"] = q.dateTo;

      const pdfBuffer = await generateReportPdf({
        title: "Payslips by Period Report",
        subtitle: "All payslips for the selected pay periods",
        generatedAt: new Date(),
        filters,
        data,
        columns: [
          { key: "employeeName", label: "Employee Name" },
          { key: "employeeEmail", label: "Email" },
          {
            key: "payPeriodStart",
            label: "Period Start",
            format: formatDate,
          },
          {
            key: "payPeriodEnd",
            label: "Period End",
            format: formatDate,
          },
          {
            key: "payDate",
            label: "Pay Date",
            format: formatDate,
          },
          {
            key: "grossPay",
            label: "Gross Pay",
            format: formatMoney,
            align: "right",
          },
          {
            key: "totalDeductions",
            label: "Deductions",
            format: formatMoney,
            align: "right",
          },
          {
            key: "netPay",
            label: "Net Pay",
            format: formatMoney,
            align: "right",
          },
          { key: "status", label: "Status" },
        ],
      });

      return new Response(new Uint8Array(pdfBuffer), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="payslips-by-period-${new Date().toISOString().split("T")[0]}.pdf"`,
        },
      });
    }

    return Response.json({ data });
  });
}
