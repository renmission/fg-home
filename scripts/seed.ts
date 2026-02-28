/**
 * Seed script: creates roles, an admin user, and sample inventory for development.
 * Run: pnpm db:seed
 * Requires DATABASE_URL and optionally ADMIN_EMAIL, ADMIN_PASSWORD in env.
 */
import "dotenv/config";
import {
  db,
  users,
  roles,
  userRoles,
  products,
  stockLevels,
  stockMovements,
  inventoryCategories,
  inventoryUnits,
  employees,
  departments,
} from "../lib/db";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { ROLES } from "../lib/auth/permissions";

/** Sample inventory items (construction materials & supplies). listPrice in PHP (₱). */
const SAMPLE_PRODUCTS = [
  {
    sku: "CEM-50",
    name: "Portland Cement 50kg",
    category: "Cement",
    unit: "bag",
    reorderLevel: 20,
    listPrice: 285,
  },
  {
    sku: "CEM-40",
    name: "Portland Cement 40kg",
    category: "Cement",
    unit: "bag",
    reorderLevel: 15,
    listPrice: 235,
  },
  {
    sku: "SND-1",
    name: "Sand (cu.m)",
    category: "Aggregates",
    unit: "cu.m",
    reorderLevel: 5,
    listPrice: 850,
  },
  {
    sku: "GRV-1",
    name: "Gravel (cu.m)",
    category: "Aggregates",
    unit: "cu.m",
    reorderLevel: 5,
    listPrice: 920,
  },
  {
    sku: "RBR-10",
    name: "Rebar 10mm x 6m",
    category: "Steel",
    unit: "pcs",
    reorderLevel: 50,
    listPrice: 185,
  },
  {
    sku: "RBR-12",
    name: "Rebar 12mm x 6m",
    category: "Steel",
    unit: "pcs",
    reorderLevel: 40,
    listPrice: 265,
  },
  {
    sku: "PLY-4x8",
    name: "Plywood 4x8 ft",
    category: "Lumber",
    unit: "sheet",
    reorderLevel: 30,
    listPrice: 720,
  },
  {
    sku: "LBR-2x4x8",
    name: "Lumber 2x4x8",
    category: "Lumber",
    unit: "pcs",
    reorderLevel: 100,
    listPrice: 95,
  },
  {
    sku: "LBR-2x6x8",
    name: "Lumber 2x6x8",
    category: "Lumber",
    unit: "pcs",
    reorderLevel: 80,
    listPrice: 145,
  },
  {
    sku: "NIL-2",
    name: 'Common Nails 2"',
    category: "Hardware",
    unit: "kg",
    reorderLevel: 25,
    listPrice: 58,
  },
  {
    sku: "NIL-3",
    name: 'Common Nails 3"',
    category: "Hardware",
    unit: "kg",
    reorderLevel: 20,
    listPrice: 62,
  },
  {
    sku: "PVC-4",
    name: 'PVC Pipe 4"',
    category: "Plumbing",
    unit: "pcs",
    reorderLevel: 30,
    listPrice: 380,
  },
  {
    sku: "PVC-2",
    name: 'PVC Pipe 2"',
    category: "Plumbing",
    unit: "pcs",
    reorderLevel: 50,
    listPrice: 125,
  },
  {
    sku: "WIR-12",
    name: "Electrical Wire 12 AWG",
    category: "Electrical",
    unit: "m",
    reorderLevel: 200,
    listPrice: 28,
  },
  {
    sku: "WIR-14",
    name: "Electrical Wire 14 AWG",
    category: "Electrical",
    unit: "m",
    reorderLevel: 200,
    listPrice: 18,
  },
  {
    sku: "PNT-W1",
    name: "White Latex Paint 1gal",
    category: "Paint",
    unit: "gal",
    reorderLevel: 20,
    listPrice: 420,
  },
  {
    sku: "PNT-W4",
    name: "White Latex Paint 4gal",
    category: "Paint",
    unit: "gal",
    reorderLevel: 10,
    listPrice: 1580,
  },
  {
    sku: "TIL-30x30",
    name: "Floor Tile 30x30cm",
    category: "Tiles",
    unit: "box",
    reorderLevel: 50,
    listPrice: 185,
  },
  {
    sku: "GRT-25",
    name: "Grout 25kg",
    category: "Tiles",
    unit: "bag",
    reorderLevel: 10,
    listPrice: 245,
  },
];

/** Inventory categories (used in Inventory). */
const SAMPLE_CATEGORIES = [
  "Aggregates",
  "Cement",
  "Electrical",
  "Hardware",
  "Lumber",
  "Paint",
  "Plumbing",
  "Steel",
  "Tiles",
];

/** Inventory units (used in Inventory). */
const SAMPLE_UNITS = ["bag", "box", "cu.m", "gal", "kg", "m", "pcs", "sheet"];

/** Sample departments (used in Users and Employees). */
const SAMPLE_DEPARTMENTS = ["HR", "IT", "Operations", "Finance", "Sales", "Marketing", "Logistics"];

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@fghomes.local";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "admin123";
const VIEWER_EMAIL = "viewer@fghomes.local";

async function seed() {
  const roleNames = Object.values(ROLES);

  for (const name of roleNames) {
    await db.insert(roles).values({ name }).onConflictDoNothing({ target: roles.name });
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
      await db
        .insert(userRoles)
        .values({ userId: inserted.id, roleId: adminRoleId })
        .onConflictDoNothing({ target: [userRoles.userId, userRoles.roleId] });
      console.log("Created admin user:", ADMIN_EMAIL);
    }
  } else {
    await db.update(users).set({ passwordHash }).where(eq(users.id, existing[0].id));
    const ur = await db.select().from(userRoles).where(eq(userRoles.userId, existing[0].id));
    if (ur.length === 0) {
      await db
        .insert(userRoles)
        .values({ userId: existing[0].id, roleId: adminRoleId })
        .onConflictDoNothing({ target: [userRoles.userId, userRoles.roleId] });
    }
    console.log("Updated existing admin user:", ADMIN_EMAIL);
  }

  // --- Sample inventory ---
  for (const p of SAMPLE_PRODUCTS) {
    const [inserted] = await db
      .insert(products)
      .values({
        name: p.name,
        sku: p.sku,
        category: p.category,
        unit: p.unit,
        reorderLevel: p.reorderLevel,
        listPrice: p.listPrice != null ? String(p.listPrice) : null,
      })
      .onConflictDoNothing({ target: products.sku })
      .returning({ id: products.id });
    if (inserted?.id) {
      await db.insert(stockLevels).values({
        productId: inserted.id,
        quantity: Math.floor(Math.random() * 80) + 10,
      });
    }
  }

  // Update listPrice on existing products (so re-running seed applies prices)
  for (const p of SAMPLE_PRODUCTS) {
    if (p.listPrice == null) continue;
    await db
      .update(products)
      .set({ listPrice: String(p.listPrice), updatedAt: new Date() })
      .where(eq(products.sku, p.sku));
  }

  const productRows = await db.select({ id: products.id }).from(products);
  const adminId = existing.length > 0 ? existing[0].id : null;
  for (let i = 0; i < Math.min(5, productRows.length); i++) {
    await db.insert(stockMovements).values({
      productId: productRows[i]!.id,
      type: "in",
      quantity: 40 + i * 15,
      reference: "SEED-IN",
      note: "Initial stock",
      createdById: adminId ?? undefined,
    });
  }

  for (const name of SAMPLE_CATEGORIES) {
    await db
      .insert(inventoryCategories)
      .values({ name })
      .onConflictDoNothing({ target: inventoryCategories.name });
  }
  for (const name of SAMPLE_UNITS) {
    await db
      .insert(inventoryUnits)
      .values({ name })
      .onConflictDoNothing({ target: inventoryUnits.name });
  }

  // --- Sample departments ---
  for (const name of SAMPLE_DEPARTMENTS) {
    await db.insert(departments).values({ name }).onConflictDoNothing({ target: departments.name });
  }

  // --- Assign departments to existing users based on roles ---
  const allUsers = await db.select().from(users);
  const allDepartments = await db.select().from(departments);
  const allRoles = await db.select().from(roles);

  const departmentMap = new Map(allDepartments.map((d) => [d.name.toLowerCase(), d.id]));
  const roleMap = new Map(allRoles.map((r) => [r.name, r.id]));

  const ROLE_DEPARTMENT_MAP: Record<string, string> = {
    admin: "IT",
    payroll_manager: "Finance",
    inventory_manager: "Operations",
    delivery_staff: "Logistics",
    pos_cashier: "Sales",
    viewer: "Operations",
  };

  for (const user of allUsers) {
    // Skip if user already has a department
    if (user.departmentId) continue;

    // Get user's roles
    const userRoleRows = await db
      .select({ roleName: roles.name })
      .from(userRoles)
      .innerJoin(roles, eq(userRoles.roleId, roles.id))
      .where(eq(userRoles.userId, user.id));

    const userRolesList = userRoleRows.map((r) => r.roleName).filter(Boolean);
    if (userRolesList.length === 0) continue;

    // Find department based on primary role
    const primaryRole = userRolesList.includes("admin") ? "admin" : (userRolesList[0] ?? "");

    const departmentName = ROLE_DEPARTMENT_MAP[primaryRole];
    if (!departmentName) continue;

    const departmentId = departmentMap.get(departmentName.toLowerCase());
    if (!departmentId) continue;

    // Assign department
    await db.update(users).set({ departmentId }).where(eq(users.id, user.id));
    console.log(`Assigned ${user.email} (${primaryRole}) → ${departmentName}`);
  }

  // --- Create employee records for all non-admin users (for attendance module) ---
  const allUsersForEmployees = await db.select().from(users);

  for (const u of allUsersForEmployees) {
    if (!u.email) continue;

    // Check if user is admin
    const userRoleRows = await db
      .select({ roleName: roles.name })
      .from(userRoles)
      .innerJoin(roles, eq(userRoles.roleId, roles.id))
      .where(eq(userRoles.userId, u.id));

    const userRolesList = userRoleRows.map((r) => r.roleName).filter(Boolean);
    const isAdmin = userRolesList.includes(ROLES.ADMIN);

    // Skip admin users (they don't submit attendance)
    if (isAdmin) continue;

    // Check if employee record already exists
    const existingEmployee = await db
      .select()
      .from(employees)
      .where(eq(employees.email, u.email))
      .limit(1);

    if (existingEmployee.length === 0) {
      // Determine department based on role
      const primaryRole = userRolesList[0] ?? "viewer";
      const departmentName = ROLE_DEPARTMENT_MAP[primaryRole] ?? "General";

      await db.insert(employees).values({
        userId: u.id,
        name: u.name ?? u.email.split("@")[0],
        email: u.email,
        department: departmentName,
        rate: "1000.00", // Default rate
        active: 1,
      });
      console.log(`Created employee record for: ${u.email} (${primaryRole})`);
    } else if (!existingEmployee[0].userId) {
      // Link the existing employee correctly
      await db
        .update(employees)
        .set({ userId: u.id })
        .where(eq(employees.id, existingEmployee[0].id));
      console.log(`Linked existing employee record to user for: ${u.email}`);
    }
  }

  console.log(
    "Seed done. Roles:",
    roleNames.join(", "),
    "| Products:",
    SAMPLE_PRODUCTS.length,
    "| Categories:",
    SAMPLE_CATEGORIES.length,
    "| Units:",
    SAMPLE_UNITS.length,
    "| Departments:",
    SAMPLE_DEPARTMENTS.length
  );
  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
