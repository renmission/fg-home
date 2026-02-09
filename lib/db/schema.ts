import {
  pgTable,
  text,
  timestamp,
  integer,
  primaryKey,
  date,
  decimal,
  index,
} from "drizzle-orm/pg-core";
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
  /** 0 = enabled, 1 = disabled (no delete for audit). */
  disabled: integer("disabled").notNull().default(0),
  departmentId: text("department_id").references(() => departments.id, { onDelete: "set null" }),
  salaryRate: decimal("salary_rate", { precision: 12, scale: 2 }), // Optional salary rate
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
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

export const sessions = pgTable(
  "session",
  {
    sessionToken: text("session_token").notNull().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (table) => ({
    userIdIdx: index("session_user_id_idx").on(table.userId),
  })
);

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
    userIdIdx: index("user_role_user_id_idx").on(t.userId),
    roleIdIdx: index("user_role_role_id_idx").on(t.roleId),
  })
);

/** Audit log for user/role changes (who, when, what). */
export const auditLogs = pgTable(
  "audit_log",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    actorId: text("actor_id").references(() => users.id, { onDelete: "set null" }),
    targetUserId: text("target_user_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(), // e.g. "user.created", "user.updated", "user.roles_changed", "user.disabled", "user.enabled"
    details: text("details"), // JSON or free text
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => ({
    actorIdIdx: index("audit_log_actor_id_idx").on(table.actorId),
    targetUserIdIdx: index("audit_log_target_user_id_idx").on(table.targetUserId),
    createdAtIdx: index("audit_log_created_at_idx").on(table.createdAt),
  })
);

// --- Inventory (Phase 2) ---

export const products = pgTable(
  "product",
  {
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
  },
  (table) => ({
    categoryIdx: index("product_category_idx").on(table.category),
    archivedIdx: index("product_archived_idx").on(table.archived),
  })
);

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

export const stockMovements = pgTable(
  "stock_movement",
  {
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
  },
  (table) => ({
    productIdIdx: index("stock_movement_product_id_idx").on(table.productId),
    createdAtIdx: index("stock_movement_created_at_idx").on(table.createdAt),
    typeIdx: index("stock_movement_type_idx").on(table.type),
  })
);

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

export const departments = pgTable("department", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull().unique(),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

// --- Payroll (Phase 3) ---

export const employees = pgTable(
  "employee",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    name: text("name").notNull(),
    email: text("email"),
    department: text("department"), // role/department
    rate: decimal("rate", { precision: 12, scale: 2 }).notNull(), // pay rate (e.g. per hour or per period)
    bankName: text("bank_name"),
    bankAccount: text("bank_account"),
    active: integer("active").notNull().default(1), // 1 = active, 0 = inactive
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => ({
    emailIdx: index("employee_email_idx").on(table.email),
    activeIdx: index("employee_active_idx").on(table.active),
  })
);

export const payPeriodTypes = ["weekly", "bi_weekly", "monthly"] as const;
export type PayPeriodType = (typeof payPeriodTypes)[number];

export const payPeriods = pgTable("pay_period", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  startDate: date("start_date", { mode: "string" }).notNull(),
  endDate: date("end_date", { mode: "string" }).notNull(),
  payDate: date("pay_date", { mode: "string" }).notNull(),
  type: text("type").$type<PayPeriodType>().notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

export const payrollRunStatuses = ["draft", "finalized"] as const;
export type PayrollRunStatus = (typeof payrollRunStatuses)[number];

export const payrollRuns = pgTable(
  "payroll_run",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    payPeriodId: text("pay_period_id")
      .notNull()
      .references(() => payPeriods.id, { onDelete: "cascade" }),
    status: text("status").$type<PayrollRunStatus>().notNull().default("draft"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    createdById: text("created_by_id").references(() => users.id, { onDelete: "set null" }),
  },
  (table) => ({
    payPeriodIdIdx: index("payroll_run_pay_period_id_idx").on(table.payPeriodId),
    statusIdx: index("payroll_run_status_idx").on(table.status),
  })
);

export const payslipStatuses = ["draft", "final"] as const;
export type PayslipStatus = (typeof payslipStatuses)[number];

export const payslips = pgTable(
  "payslip",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    payrollRunId: text("payroll_run_id")
      .notNull()
      .references(() => payrollRuns.id, { onDelete: "cascade" }),
    employeeId: text("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    grossPay: decimal("gross_pay", { precision: 12, scale: 2 }).notNull().default("0"),
    totalDeductions: decimal("total_deductions", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),
    netPay: decimal("net_pay", { precision: 12, scale: 2 }).notNull().default("0"),
    status: text("status").$type<PayslipStatus>().notNull().default("draft"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => ({
    payrollRunIdIdx: index("payslip_payroll_run_id_idx").on(table.payrollRunId),
    employeeIdIdx: index("payslip_employee_id_idx").on(table.employeeId),
    statusIdx: index("payslip_status_idx").on(table.status),
  })
);

export const earningTypes = ["regular", "overtime", "bonus", "allowance"] as const;
export type EarningType = (typeof earningTypes)[number];

export const earnings = pgTable("earning", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  payslipId: text("payslip_id")
    .notNull()
    .references(() => payslips.id, { onDelete: "cascade" }),
  type: text("type").$type<EarningType>().notNull(),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  description: text("description"),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

export const deductionTypes = ["tax", "sss", "philhealth", "pagibig", "loan", "other"] as const;
export type DeductionType = (typeof deductionTypes)[number];

export const deductions = pgTable("deduction", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  payslipId: text("payslip_id")
    .notNull()
    .references(() => payslips.id, { onDelete: "cascade" }),
  type: text("type").$type<DeductionType>().notNull(),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  description: text("description"),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

// --- Attendance ---

export const attendanceStatuses = ["on_time", "late"] as const;
export type AttendanceStatus = (typeof attendanceStatuses)[number];

/** Attendance submission for a pay period. One record per employee per pay period. */
export const attendance = pgTable(
  "attendance",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    employeeId: text("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    payPeriodId: text("pay_period_id")
      .notNull()
      .references(() => payPeriods.id, { onDelete: "cascade" }),
    submittedAt: timestamp("submitted_at", { mode: "date" }).notNull().defaultNow(),
    submittedById: text("submitted_by_id").references(() => users.id, { onDelete: "set null" }),
    status: text("status").$type<AttendanceStatus>().notNull(), // on_time or late
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => ({
    employeeIdIdx: index("attendance_employee_id_idx").on(table.employeeId),
    payPeriodIdIdx: index("attendance_pay_period_id_idx").on(table.payPeriodId),
    statusIdx: index("attendance_status_idx").on(table.status),
  })
);

/** Daily attendance records (present/absent per day). */
export const attendanceDays = pgTable("attendance_day", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  attendanceId: text("attendance_id")
    .notNull()
    .references(() => attendance.id, { onDelete: "cascade" }),
  date: date("date", { mode: "string" }).notNull(),
  present: integer("present").notNull().default(1), // 1 = present, 0 = absent
  hoursWorked: decimal("hours_worked", { precision: 5, scale: 2 }), // optional: hours worked (e.g. 8.0, 4.5)
  notes: text("notes"), // optional notes
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

// --- Customers (Phase 6) ---

/** Customer record: stores customer information for deliveries */
export const customers = pgTable("customer", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  address: text("address").notNull(),
  phone: text("phone"),
  email: text("email"),
  notes: text("notes"), // optional notes about the customer
  createdById: text("created_by_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});

// --- Delivery Tracking (Phase 5) ---

export const deliveryStatuses = [
  "created",
  "picked",
  "in_transit",
  "out_for_delivery",
  "delivered",
  "failed",
  "returned",
] as const;
export type DeliveryStatus = (typeof deliveryStatuses)[number];

/** Delivery record: materials/orders to sites or customers. */
export const deliveries = pgTable(
  "delivery",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    trackingNumber: text("tracking_number").notNull().unique(),
    orderReference: text("order_reference"), // optional: link to order ID
    customerName: text("customer_name"),
    customerAddress: text("customer_address").notNull(),
    customerPhone: text("customer_phone"),
    customerEmail: text("customer_email"),
    status: text("status").$type<DeliveryStatus>().notNull().default("created"),
    notes: text("notes"), // optional notes
    assignedToUserId: text("assigned_to_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }), // Required: delivery must be assigned to a user
    createdById: text("created_by_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => ({
    statusIdx: index("delivery_status_idx").on(table.status),
    assignedToUserIdIdx: index("delivery_assigned_to_user_id_idx").on(table.assignedToUserId),
    createdAtIdx: index("delivery_created_at_idx").on(table.createdAt),
  })
);

/** Delivery status update timeline (TikTok-style tracking). */
export const deliveryStatusUpdates = pgTable(
  "delivery_status_update",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    deliveryId: text("delivery_id")
      .notNull()
      .references(() => deliveries.id, { onDelete: "cascade" }),
    status: text("status").$type<DeliveryStatus>().notNull(),
    note: text("note"), // optional note for this status update
    location: text("location"), // optional location (e.g. "Manila Warehouse", "Quezon City")
    updatedById: text("updated_by_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => ({
    deliveryIdIdx: index("delivery_status_update_delivery_id_idx").on(table.deliveryId),
    createdAtIdx: index("delivery_status_update_created_at_idx").on(table.createdAt),
  })
);

// --- Notifications ---

export const notificationTypes = ["low_stock", "delivery_status", "attendance_deadline"] as const;
export type NotificationType = (typeof notificationTypes)[number];

/** Notifications for users (low stock alerts, delivery updates, etc.) */
export const notifications = pgTable(
  "notification",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<NotificationType>().notNull(),
    title: text("title").notNull(),
    message: text("message").notNull(),
    link: text("link"), // optional link to related resource (e.g. "/dashboard/inventory?product=123")
    read: integer("read").notNull().default(0), // 0 = unread, 1 = read
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => ({
    userIdIdx: index("notification_user_id_idx").on(table.userId),
    readIdx: index("notification_read_idx").on(table.read),
    createdAtIdx: index("notification_created_at_idx").on(table.createdAt),
  })
);
