import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { departments } from "@/lib/db/schema";
import { getSessionOr401, requirePermission } from "@/lib/api-auth";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { withRouteErrorHandling } from "@/lib/errors";
import { asc } from "drizzle-orm";
import { z } from "zod";

const createBodySchema = z.object({ name: z.string().min(1).max(200) });

export async function GET() {
  const { user, response } = await getSessionOr401();
  if (response) return response;
  const forbidden = requirePermission(user, PERMISSIONS.SETTINGS_READ);
  if (forbidden) return forbidden;

  const rows = await db.select().from(departments).orderBy(asc(departments.name));
  return Response.json({ data: rows });
}

export async function POST(req: NextRequest) {
  return withRouteErrorHandling(async () => {
    const { user, response } = await getSessionOr401();
    if (response) return response;
    const forbidden = requirePermission(user, PERMISSIONS.SETTINGS_WRITE);
    if (forbidden) return forbidden;

    const body = await req.json();
    const parsed = createBodySchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const [inserted] = await db
      .insert(departments)
      .values({ name: parsed.data.name.trim() })
      .onConflictDoNothing({ target: departments.name })
      .returning();
    if (!inserted) {
      return Response.json({ error: "Department already exists" }, { status: 409 });
    }
    return Response.json({ data: inserted }, { status: 201 });
  });
}
