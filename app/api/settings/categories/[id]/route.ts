import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { inventoryCategories } from "@/lib/db/schema";
import { getSessionOr401, requirePermission } from "@/lib/api-auth";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { eq } from "drizzle-orm";
import { z } from "zod";

const updateBodySchema = z.object({ name: z.string().min(1).max(200) });

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await getSessionOr401();
  if (response) return response;
  const forbidden = requirePermission(user, PERMISSIONS.SETTINGS_WRITE);
  if (forbidden) return forbidden;

  const { id } = await params;
  const body = await req.json();
  const parsed = updateBodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const name = parsed.data.name.trim();
  const existingByName = await db
    .select({ id: inventoryCategories.id })
    .from(inventoryCategories)
    .where(eq(inventoryCategories.name, name))
    .limit(1);
  if (existingByName.length > 0 && existingByName[0]!.id !== id) {
    return Response.json({ error: "A category with this name already exists" }, { status: 409 });
  }

  const [updated] = await db
    .update(inventoryCategories)
    .set({ name })
    .where(eq(inventoryCategories.id, id))
    .returning();
  if (!updated) {
    return Response.json({ error: "Category not found" }, { status: 404 });
  }
  return Response.json({ data: updated });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await getSessionOr401();
  if (response) return response;
  const forbidden = requirePermission(user, PERMISSIONS.SETTINGS_WRITE);
  if (forbidden) return forbidden;

  const { id } = await params;
  const [deleted] = await db
    .delete(inventoryCategories)
    .where(eq(inventoryCategories.id, id))
    .returning({ id: inventoryCategories.id });
  if (!deleted) {
    return Response.json({ error: "Category not found" }, { status: 404 });
  }
  return Response.json({ data: { id: deleted.id } });
}
