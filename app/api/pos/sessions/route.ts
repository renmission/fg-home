import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { posSessions } from "@/lib/db/schema";
import { getSessionOr401, requirePermission } from "@/lib/api-auth";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { withRouteErrorHandling } from "@/lib/errors";
import { openSessionSchema } from "@/schemas/pos";
import { and, eq } from "drizzle-orm";

export async function GET() {
  const { user, response } = await getSessionOr401();
  if (response) return response;
  const forbidden = requirePermission(user, PERMISSIONS.POS_READ);
  if (forbidden) return forbidden;

  const [session] = await db
    .select()
    .from(posSessions)
    .where(and(eq(posSessions.userId, user.id), eq(posSessions.status, "open")))
    .limit(1);

  return Response.json({ data: session || null });
}

export async function POST(req: NextRequest) {
  return withRouteErrorHandling(async () => {
    const { user, response } = await getSessionOr401();
    if (response) return response;
    const forbidden = requirePermission(user, PERMISSIONS.POS_WRITE);
    if (forbidden) return forbidden;

    const body = await req.json();
    const parsed = openSessionSchema.parse(body);

    const [existingSession] = await db
      .select()
      .from(posSessions)
      .where(and(eq(posSessions.userId, user.id), eq(posSessions.status, "open")))
      .limit(1);

    if (existingSession) {
      return Response.json({ error: "Register is already open" }, { status: 400 });
    }

    const [newSession] = await db
      .insert(posSessions)
      .values({
        userId: user.id,
        startingCash: parsed.startingCash.toString(),
        status: "open",
      })
      .returning();

    return Response.json({ data: newSession }, { status: 201 });
  });
}
