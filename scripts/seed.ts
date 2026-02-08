/**
 * Seed script: creates roles and an admin user for development.
 * Run: pnpm db:seed
 * Requires DATABASE_URL and optionally ADMIN_EMAIL, ADMIN_PASSWORD in env.
 */
import "dotenv/config";
import { db, users, roles, userRoles } from "../lib/db";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { ROLES } from "../lib/auth/permissions";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@fghomes.local";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "admin123";

async function seed() {
  const roleNames = Object.values(ROLES);

  for (const name of roleNames) {
    await db
      .insert(roles)
      .values({ name })
      .onConflictDoNothing({ target: roles.name });
  }

  const roleRows = await db.select().from(roles).where(eq(roles.name, ROLES.ADMIN));
  const adminRoleId = roleRows[0]?.id;
  if (!adminRoleId) throw new Error("Admin role not found after insert");

  const existing = await db.select().from(users).where(eq(users.email, ADMIN_EMAIL)).limit(1);
  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);

  if (existing.length === 0) {
    const [inserted] = await db
      .insert(users)
      .values({
        email: ADMIN_EMAIL,
        name: "Admin",
        passwordHash,
      })
      .returning({ id: users.id });
    if (inserted?.id) {
      await db.insert(userRoles).values({ userId: inserted.id, roleId: adminRoleId }).onConflictDoNothing({ target: [userRoles.userId, userRoles.roleId] });
      console.log("Created admin user:", ADMIN_EMAIL);
    }
  } else {
    await db.update(users).set({ passwordHash }).where(eq(users.id, existing[0].id));
    const ur = await db.select().from(userRoles).where(eq(userRoles.userId, existing[0].id));
    if (ur.length === 0) {
      await db.insert(userRoles).values({ userId: existing[0].id, roleId: adminRoleId }).onConflictDoNothing({ target: [userRoles.userId, userRoles.roleId] });
    }
    console.log("Updated existing admin user:", ADMIN_EMAIL);
  }

  console.log("Seed done. Roles:", roleNames.join(", "));
  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
