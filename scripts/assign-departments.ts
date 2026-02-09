/**
 * Script to assign departments to existing users based on their roles.
 * Run: tsx scripts/assign-departments.ts
 */
import "dotenv/config";
import { db } from "../lib/db";
import { users, userRoles, roles, departments } from "../lib/db/schema";
import { eq } from "drizzle-orm";

// Map roles to departments
const ROLE_DEPARTMENT_MAP: Record<string, string> = {
  admin: "IT", // Admin typically manages IT systems
  payroll_manager: "Finance",
  inventory_manager: "Operations",
  delivery_staff: "Logistics",
  viewer: "Operations", // General employees
};

async function assignDepartments() {
  console.log("Fetching users and departments...");

  // Get all users with their roles
  const allUsers = await db.select().from(users);
  const allDepartments = await db.select().from(departments);
  const allRoles = await db.select().from(roles);

  const departmentMap = new Map(allDepartments.map((d) => [d.name.toLowerCase(), d.id]));
  const roleMap = new Map(allRoles.map((r) => [r.name, r.id]));

  console.log(`Found ${allUsers.length} users`);
  console.log(
    `Found ${allDepartments.length} departments: ${allDepartments.map((d) => d.name).join(", ")}`
  );

  let assigned = 0;
  let skipped = 0;

  for (const user of allUsers) {
    // Skip if user already has a department
    if (user.departmentId) {
      console.log(`Skipping ${user.email} - already has department`);
      skipped++;
      continue;
    }

    // Get user's roles
    const userRoleRows = await db
      .select({ roleName: roles.name })
      .from(userRoles)
      .innerJoin(roles, eq(userRoles.roleId, roles.id))
      .where(eq(userRoles.userId, user.id));

    const userRolesList = userRoleRows.map((r) => r.roleName).filter(Boolean);

    if (userRolesList.length === 0) {
      console.log(`Skipping ${user.email} - no roles assigned`);
      skipped++;
      continue;
    }

    // Find department based on primary role (first role, or admin if present)
    const primaryRole = userRolesList.includes("admin") ? "admin" : (userRolesList[0] ?? "");

    const departmentName = ROLE_DEPARTMENT_MAP[primaryRole];
    if (!departmentName) {
      console.log(`Skipping ${user.email} - no department mapping for role: ${primaryRole}`);
      skipped++;
      continue;
    }

    const departmentId = departmentMap.get(departmentName.toLowerCase());
    if (!departmentId) {
      console.log(`Skipping ${user.email} - department "${departmentName}" not found`);
      skipped++;
      continue;
    }

    // Assign department
    await db.update(users).set({ departmentId }).where(eq(users.id, user.id));

    console.log(`✓ Assigned ${user.email} (${primaryRole}) → ${departmentName}`);
    assigned++;
  }

  console.log("\n=== Summary ===");
  console.log(`Assigned: ${assigned}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Total: ${allUsers.length}`);
}

assignDepartments()
  .then(() => {
    console.log("\nDone!");
    process.exit(0);
  })
  .catch((err) => {
    console.error("Error:", err);
    process.exit(1);
  });
