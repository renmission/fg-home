import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { products, stockLevels } from "@/lib/db/schema";
import { getSessionOr401, requirePermission } from "@/lib/api-auth";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { productsListQuerySchema, productSchema } from "@/schemas/inventory";
import { and, asc, desc, eq, ilike, or, sql } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const { user, response } = await getSessionOr401();
  if (response) return response;
  const forbidden = requirePermission(user, PERMISSIONS.INVENTORY_READ);
  if (forbidden) return forbidden;

  const parsed = productsListQuerySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  const q = parsed.success
    ? parsed.data
    : { page: 1, limit: 20, sortBy: "name" as const, sortOrder: "asc" as const };

  const page = q.page ?? 1;
  const limit = q.limit ?? 20;
  const offset = (page - 1) * limit;
  const orderBy =
    q.sortBy === "name"
      ? q.sortOrder === "desc"
        ? desc(products.name)
        : asc(products.name)
      : q.sortBy === "sku"
        ? q.sortOrder === "desc"
          ? desc(products.sku)
          : asc(products.sku)
        : q.sortBy === "category"
          ? q.sortOrder === "desc"
            ? desc(products.category)
            : asc(products.category)
          : q.sortBy === "reorderLevel"
            ? q.sortOrder === "desc"
              ? desc(products.reorderLevel)
              : asc(products.reorderLevel)
            : q.sortOrder === "desc"
              ? desc(products.createdAt)
              : asc(products.createdAt);

  const conditions = [];
  if (q.search?.trim()) {
    conditions.push(
      or(
        ilike(products.name, `%${q.search.trim()}%`),
        ilike(products.sku, `%${q.search.trim()}%`),
        ilike(products.category ?? "", `%${q.search.trim()}%`)
      )!
    );
  }
  if (q.category?.trim()) {
    conditions.push(eq(products.category, q.category.trim()));
  }
  if (q.archived === true) {
    conditions.push(eq(products.archived, 1));
  } else if (q.archived === false) {
    conditions.push(eq(products.archived, 0));
  }
  const where = conditions.length ? and(...conditions) : undefined;

  const [rows, countResult] = await Promise.all([
    db
      .select({
        id: products.id,
        name: products.name,
        sku: products.sku,
        category: products.category,
        unit: products.unit,
        reorderLevel: products.reorderLevel,
        archived: products.archived,
        createdAt: products.createdAt,
        quantity: stockLevels.quantity,
      })
      .from(products)
      .leftJoin(stockLevels, eq(products.id, stockLevels.productId))
      .where(where)
      .orderBy(orderBy)
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(products)
      .where(where),
  ]);

  const total = countResult[0]?.count ?? 0;
  return Response.json({
    data: rows.map((r) => ({
      ...r,
      quantity: r.quantity ?? 0,
      lowStock: (r.quantity ?? 0) <= r.reorderLevel && r.reorderLevel > 0,
    })),
    total,
    page,
    limit,
  });
}

export async function POST(req: NextRequest) {
  const { user, response } = await getSessionOr401();
  if (response) return response;
  const forbidden = requirePermission(user, PERMISSIONS.INVENTORY_WRITE);
  if (forbidden) return forbidden;

  const body = await req.json();
  const parsed = productSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { name, sku, category, unit, reorderLevel, archived } = parsed.data;
  const [product] = await db
    .insert(products)
    .values({
      name,
      sku: sku.trim(),
      category: category?.trim() || null,
      unit: unit.trim(),
      reorderLevel: reorderLevel ?? 0,
      archived: archived ?? 0,
    })
    .returning();

  if (!product) {
    return Response.json({ error: "Failed to create product" }, { status: 500 });
  }

  await db.insert(stockLevels).values({
    productId: product.id,
    quantity: 0,
  });

  return Response.json({ data: product }, { status: 201 });
}
