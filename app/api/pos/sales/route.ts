import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { sales } from "@/lib/db/schema";
import { getSessionOr401, requirePermission } from "@/lib/api-auth";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { withRouteErrorHandling } from "@/lib/errors";
import { salesListQuerySchema } from "@/schemas/pos";
import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const { user, response } = await getSessionOr401();
  if (response) return response;
  const forbidden = requirePermission(user, PERMISSIONS.POS_READ);
  if (forbidden) return forbidden;

  const parsed = salesListQuerySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  const q = parsed.success
    ? parsed.data
    : { page: 1, limit: 20, sortBy: "createdAt" as const, sortOrder: "desc" as const };

  const page = q.page ?? 1;
  const limit = q.limit ?? 20;
  const offset = (page - 1) * limit;

  const conditions = [];
  if (q.status)
    conditions.push(eq(sales.status, q.status as "draft" | "held" | "completed" | "voided"));
  if (q.dateFrom) conditions.push(gte(sales.createdAt, new Date(q.dateFrom)));
  if (q.dateTo) conditions.push(lte(sales.createdAt, new Date(q.dateTo)));
  const where = conditions.length ? and(...conditions) : undefined;

  const orderBy =
    q.sortBy === "total"
      ? q.sortOrder === "desc"
        ? desc(sales.total)
        : asc(sales.total)
      : q.sortBy === "status"
        ? q.sortOrder === "desc"
          ? desc(sales.status)
          : asc(sales.status)
        : q.sortOrder === "desc"
          ? desc(sales.createdAt)
          : asc(sales.createdAt);

  const [rows, countResult] = await Promise.all([
    db
      .select({
        id: sales.id,
        status: sales.status,
        subtotal: sales.subtotal,
        discountAmount: sales.discountAmount,
        discountType: sales.discountType,
        total: sales.total,
        createdById: sales.createdById,
        completedAt: sales.completedAt,
        createdAt: sales.createdAt,
      })
      .from(sales)
      .where(where)
      .orderBy(orderBy)
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(sales)
      .where(where),
  ]);

  const total = countResult[0]?.count ?? 0;
  return Response.json({ data: rows, total, page, limit });
}

export async function POST() {
  return withRouteErrorHandling(async () => {
    const { user, response } = await getSessionOr401();
    if (response) return response;
    const forbidden = requirePermission(user, PERMISSIONS.POS_WRITE);
    if (forbidden) return forbidden;

    const [sale] = await db
      .insert(sales)
      .values({
        status: "draft",
        createdById: user?.id ?? null,
      })
      .returning();

    if (!sale) {
      return Response.json({ error: "Failed to create sale" }, { status: 500 });
    }

    return Response.json({ data: sale }, { status: 201 });
  });
}
