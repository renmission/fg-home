import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { employees, payslips } from "@/lib/db/schema";
import { getSessionOr401, requirePermission } from "@/lib/api-auth";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { eq } from "drizzle-orm";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Returns payslip as PDF. For MVP we return a simple HTML document that can be printed to PDF.
 * Replace with jspdf or @react-pdf/renderer for a proper PDF binary.
 */
export async function GET(_req: NextRequest, context: RouteContext) {
  const { user, response } = await getSessionOr401();
  if (response) return response;
  const forbidden = requirePermission(user, PERMISSIONS.PAYROLL_READ);
  if (forbidden) return forbidden;

  const { id } = await context.params;

  const [slip] = await db
    .select({
      id: payslips.id,
      grossPay: payslips.grossPay,
      totalDeductions: payslips.totalDeductions,
      netPay: payslips.netPay,
      status: payslips.status,
      employeeName: employees.name,
      employeeId: employees.id,
    })
    .from(payslips)
    .innerJoin(employees, eq(payslips.employeeId, employees.id))
    .where(eq(payslips.id, id))
    .limit(1);

  if (!slip) {
    return Response.json({ error: "Payslip not found" }, { status: 404 });
  }

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Payslip ${slip.employeeName}</title></head><body style="font-family:sans-serif;max-width:400px;margin:2rem auto;padding:1rem;">
<h1>Payslip</h1>
<p><strong>Employee:</strong> ${escapeHtml(slip.employeeName)}</p>
<p><strong>Gross pay:</strong> ${formatMoney(slip.grossPay)}</p>
<p><strong>Deductions:</strong> ${formatMoney(slip.totalDeductions)}</p>
<p><strong>Net pay:</strong> ${formatMoney(slip.netPay)}</p>
<p style="margin-top:2rem;color:#666;font-size:0.9rem;">FG Homes Payroll — Payslip ID: ${slip.id}</p>
</body></html>`;

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": `inline; filename="payslip-${id}.html"`,
    },
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatMoney(value: string): string {
  const n = parseFloat(value);
  return Number.isNaN(n) ? value : `₱${n.toLocaleString("en-PH", { minimumFractionDigits: 2 })}`;
}
