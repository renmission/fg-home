import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { customers } from "@/lib/db/schema";
import { getSessionOr401, requirePermission } from "@/lib/api-auth";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { withRouteErrorHandling } from "@/lib/errors";
import { customersListQuerySchema, customerSchema } from "@/schemas/customers";
import { and, asc, desc, eq, ilike, or, sql } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const { user, response } = await getSessionOr401();
  if (response) return response;
  const forbidden = requirePermission(user, PERMISSIONS.CUSTOMERS_READ);
  if (forbidden) return forbidden;

  const parsed = customersListQuerySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  const q = parsed.success
    ? parsed.data
    : { page: 1, limit: 20, sortBy: "name" as const, sortOrder: "asc" as const };

  const page = q.page ?? 1;
  const limit = q.limit ?? 20;
  const offset = (page - 1) * limit;
  const orderBy =
    q.sortBy === "name"
      ? q.sortOrder === "desc"
        ? desc(customers.name)
        : asc(customers.name)
      : q.sortBy === "email"
        ? q.sortOrder === "desc"
          ? desc(customers.email)
          : asc(customers.email)
        : q.sortBy === "updatedAt"
          ? q.sortOrder === "desc"
            ? desc(customers.updatedAt)
            : asc(customers.updatedAt)
          : q.sortOrder === "desc"
            ? desc(customers.createdAt)
            : asc(customers.createdAt);

  const conditions = [];
  if (q.search?.trim()) {
    conditions.push(
      or(
        ilike(customers.name, `%${q.search.trim()}%`),
        ilike(customers.email ?? "", `%${q.search.trim()}%`),
        ilike(customers.address, `%${q.search.trim()}%`),
        ilike(customers.phone ?? "", `%${q.search.trim()}%`)
      )!
    );
  }
  const where = conditions.length ? and(...conditions) : undefined;

  const [rows, countResult] = await Promise.all([
    db.select().from(customers).where(where).orderBy(orderBy).limit(limit).offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(customers)
      .where(where),
  ]);

  const total = countResult[0]?.count ?? 0;
  return Response.json({
    data: rows.map((r) => ({
      id: r.id,
      name: r.name,
      address: r.address,
      phone: r.phone ?? null,
      email: r.email ?? null,
      notes: r.notes ?? null,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    })),
    total,
    page,
    limit,
  });
}

export async function POST(req: NextRequest) {
  return withRouteErrorHandling(async () => {
    const { user, response } = await getSessionOr401();
    if (response) return response;
    const forbidden = requirePermission(user, PERMISSIONS.CUSTOMERS_WRITE);
    if (forbidden) return forbidden;

    const body = await req.json();
    const parsed = customerSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { name, address, phone, email, notes } = parsed.data;

    const [customer] = await db
      .insert(customers)
      .values({
        name: name.trim(),
        address: address.trim(),
        phone: phone?.trim() || null,
        email: email?.trim() || null,
        notes: notes?.trim() || null,
        createdById: user.id,
      })
      .returning();

    if (!customer) {
      return Response.json({ error: "Failed to create customer" }, { status: 500 });
    }

    return Response.json(
      {
        data: {
          id: customer.id,
          name: customer.name,
          address: customer.address,
          phone: customer.phone ?? null,
          email: customer.email ?? null,
          notes: customer.notes ?? null,
          createdAt: customer.createdAt.toISOString(),
          updatedAt: customer.updatedAt.toISOString(),
        },
      },
      { status: 201 }
    );
  });
}
