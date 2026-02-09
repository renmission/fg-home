import { pgTable, text, timestamp, integer, primaryKey } from "drizzle-orm/pg-core";
import type { AdapterAccount } from "next-auth/adapters";

// --- Auth.js (NextAuth) tables ---

export const users = pgTable("user", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").notNull().unique(),
  emailVerified: timestamp("email_verified", { mode: "date" }),
  image: text("image"),
  passwordHash: text("password_hash"),
});

export const accounts = pgTable(
  "account",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<AdapterAccount["type"]>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (account) => ({
    compoundKey: primaryKey({
      columns: [account.provider, account.providerAccountId],
    }),
  })
);

export const sessions = pgTable("session", {
  sessionToken: text("session_token").notNull().primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const verificationTokens = pgTable("verification_token", {
  identifier: text("identifier").notNull(),
  token: text("token").notNull(),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

// --- RBAC ---

export const roles = pgTable("role", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull().unique(),
});

export const userRoles = pgTable(
  "user_role",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    roleId: text("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.roleId] }),
  })
);

// --- Inventory (Phase 2) ---

export const products = pgTable("product", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  sku: text("sku").notNull().unique(),
  category: text("category"),
  unit: text("unit").notNull(), // e.g. "pcs", "kg", "bag"
  reorderLevel: integer("reorder_level").notNull().default(0),
  archived: integer("archived").notNull().default(0), // 0 = active, 1 = archived
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});

/** Single location for MVP: one row per product with current quantity. */
export const stockLevels = pgTable("stock_level", {
  productId: text("product_id")
    .primaryKey()
    .references(() => products.id, { onDelete: "cascade" }),
  quantity: integer("quantity").notNull().default(0),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});

export const stockMovementTypes = ["in", "out", "adjustment"] as const;
export type StockMovementType = (typeof stockMovementTypes)[number];

export const stockMovements = pgTable("stock_movement", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  productId: text("product_id")
    .notNull()
    .references(() => products.id, { onDelete: "cascade" }),
  type: text("type").$type<StockMovementType>().notNull(),
  quantity: integer("quantity").notNull(), // positive for in/adjustment up, negative for out
  reference: text("reference"), // optional ref (e.g. PO number, order id)
  note: text("note"),
  createdById: text("created_by_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

// --- Settings: reference data used in Inventory ---

export const inventoryCategories = pgTable("inventory_category", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull().unique(),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

export const inventoryUnits = pgTable("inventory_unit", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull().unique(), // e.g. "pcs", "kg", "bag"
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});
