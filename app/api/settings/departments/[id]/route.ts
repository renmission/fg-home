import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { departments } from "@/lib/db/schema";
import { getSessionOr401, requirePermission } from "@/lib/api-auth";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { withRouteErrorHandling } from "@/lib/errors";
import { eq } from "drizzle-orm";
import { z } from "zod";

const updateBodySchema = z.object({ name: z.string().min(1).max(200) });

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, context: RouteContext) {
  return withRouteErrorHandling(async () => {
    const { user, response } = await getSessionOr401();
    if (response) return response;
    const forbidden = requirePermission(user, PERMISSIONS.SETTINGS_WRITE);
    if (forbidden) return forbidden;

    const { id } = await context.params;
    const body = await req.json();
    const parsed = updateBodySchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const [updated] = await db
      .update(departments)
      .set({ name: parsed.data.name.trim() })
      .where(eq(departments.id, id))
      .returning();
    if (!updated) {
      return Response.json({ error: "Department not found" }, { status: 404 });
    }
    return Response.json({ data: updated });
  });
}

export async function DELETE(_req: NextRequest, context: RouteContext) {
  return withRouteErrorHandling(async () => {
    const { user, response } = await getSessionOr401();
    if (response) return response;
    const forbidden = requirePermission(user, PERMISSIONS.SETTINGS_WRITE);
    if (forbidden) return forbidden;

    const { id } = await context.params;
    const [deleted] = await db.delete(departments).where(eq(departments.id, id)).returning();
    if (!deleted) {
      return Response.json({ error: "Department not found" }, { status: 404 });
    }
    return Response.json({ data: deleted });
  });
}
