import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { inventoryUnits } from "@/lib/db/schema";
import { NextResponse } from "next/server";
import { getSessionOr401, requirePermission } from "@/lib/api-auth";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { asc } from "drizzle-orm";
import { z } from "zod";

const createBodySchema = z.object({ name: z.string().min(1).max(50) });

export async function GET() {
  const { user, response } = await getSessionOr401();
  if (response) return response;
  const allowed =
    requirePermission(user, PERMISSIONS.SETTINGS_READ) === null ||
    requirePermission(user, PERMISSIONS.INVENTORY_READ) === null;
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const rows = await db.select().from(inventoryUnits).orderBy(asc(inventoryUnits.name));
  return Response.json({ data: rows });
}

export async function POST(req: NextRequest) {
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
    .insert(inventoryUnits)
    .values({ name: parsed.data.name.trim() })
    .onConflictDoNothing({ target: inventoryUnits.name })
    .returning();
  if (!inserted) {
    return Response.json({ error: "Unit already exists" }, { status: 409 });
  }
  return Response.json({ data: inserted }, { status: 201 });
}
