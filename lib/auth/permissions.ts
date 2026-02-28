/**
 * RBAC: role → permissions map and can() helper.
 * Used by middleware, API routes, and UI to gate access.
 */

export const PERMISSIONS = {
  // Inventory
  INVENTORY_READ: "inventory:read",
  INVENTORY_WRITE: "inventory:write",
  // Payroll
  PAYROLL_READ: "payroll:read",
  PAYROLL_RUN: "payroll:run",
  PAYROLL_WRITE: "payroll:write",
  // Deliveries
  DELIVERIES_READ: "deliveries:read",
  DELIVERIES_UPDATE_STATUS: "deliveries:update_status",
  DELIVERIES_WRITE: "deliveries:write",
  // Customers
  CUSTOMERS_READ: "customers:read",
  CUSTOMERS_WRITE: "customers:write",
  // User management
  USERS_READ: "users:read",
  USERS_WRITE: "users:write",
  // Attendance
  ATTENDANCE_READ: "attendance:read",
  ATTENDANCE_WRITE: "attendance:write",
  // Settings (admin only)
  SETTINGS_READ: "settings:read",
  SETTINGS_WRITE: "settings:write",
  // POS (Point of Sale)
  POS_READ: "pos:read",
  POS_WRITE: "pos:write",
  // Reports
  REPORTS_READ: "reports:read",
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

/** Role name as stored in DB (role.name) */
export const ROLES = {
  ADMIN: "admin",
  INVENTORY_MANAGER: "inventory_manager",
  PAYROLL_MANAGER: "payroll_manager",
  DELIVERY_STAFF: "delivery_staff",
  POS_CASHIER: "pos_cashier",
  VIEWER: "viewer",
} as const;

export const ROLE_PERMISSIONS: Record<string, Permission[]> = {
  [ROLES.ADMIN]: Object.values(PERMISSIONS), // admin has all permissions including USERS_READ, USERS_WRITE
  [ROLES.INVENTORY_MANAGER]: [
    PERMISSIONS.INVENTORY_READ,
    PERMISSIONS.INVENTORY_WRITE,
    PERMISSIONS.DELIVERIES_READ,
    PERMISSIONS.DELIVERIES_WRITE, // Can create deliveries when preparing shipments
    PERMISSIONS.CUSTOMERS_READ,
    PERMISSIONS.CUSTOMERS_WRITE,
    PERMISSIONS.POS_READ,
    PERMISSIONS.POS_WRITE,
    PERMISSIONS.REPORTS_READ, // Can view inventory and delivery reports
  ],
  // PAYROLL_MANAGER = HR role - has full CRUD for Users
  [ROLES.PAYROLL_MANAGER]: [
    PERMISSIONS.INVENTORY_READ,
    PERMISSIONS.PAYROLL_READ,
    PERMISSIONS.PAYROLL_RUN,
    PERMISSIONS.PAYROLL_WRITE,
    PERMISSIONS.USERS_READ, // HR can read users
    PERMISSIONS.USERS_WRITE, // HR can create/update/delete users
    PERMISSIONS.ATTENDANCE_READ,
    PERMISSIONS.ATTENDANCE_WRITE,
    PERMISSIONS.REPORTS_READ, // Can view payroll reports
  ],
  [ROLES.DELIVERY_STAFF]: [PERMISSIONS.DELIVERIES_READ, PERMISSIONS.DELIVERIES_UPDATE_STATUS],
  [ROLES.POS_CASHIER]: [
    PERMISSIONS.POS_READ,
    PERMISSIONS.POS_WRITE,
    PERMISSIONS.INVENTORY_READ, // Read-only access to products, prices, stock levels
    PERMISSIONS.DELIVERIES_READ, // Can view deliveries if POS sales create them
    PERMISSIONS.CUSTOMERS_READ, // Can view customer info when processing sales
    PERMISSIONS.CUSTOMERS_WRITE, // Can create/update customers during sales
    PERMISSIONS.ATTENDANCE_READ,
    PERMISSIONS.ATTENDANCE_WRITE,
  ],
  [ROLES.VIEWER]: [
    PERMISSIONS.INVENTORY_READ,
    PERMISSIONS.DELIVERIES_READ,
    PERMISSIONS.ATTENDANCE_READ,
    PERMISSIONS.ATTENDANCE_WRITE,
    PERMISSIONS.REPORTS_READ, // Viewers can view reports
  ],
};

export type SessionUser = {
  id: string;
  email?: string | null;
  name?: string | null;
  image?: string | null;
  roles?: string[];
};

/**
 * Returns true if the user has the given permission (via any of their roles).
 */
export function can(user: SessionUser | null | undefined, permission: Permission): boolean {
  if (!user?.roles?.length) return false;
  for (const role of user.roles) {
    const perms = ROLE_PERMISSIONS[role];
    if (perms?.includes(permission)) return true;
  }
  return false;
}

/**
 * Nav groups with required permission (null = no permission gated, show to all authenticated).
 * Items within each group are filtered by permission at render time in the dashboard layout.
 */
export type NavGroup = {
  label: string;
  items: { href: string; label: string; permission: Permission | null }[];
};

export const NAV_TOP_ITEMS: { href: string; label: string; permission: Permission | null }[] = [
  { href: "/dashboard", label: "Dashboard", permission: null },
  { href: "/dashboard/personal-attendance", label: "My Attendance", permission: null },
  {
    href: "/dashboard/deliveries",
    label: "Deliveries",
    permission: PERMISSIONS.DELIVERIES_READ,
  },
  { href: "/dashboard/reports", label: "Reports", permission: PERMISSIONS.REPORTS_READ },
];

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Retail & Sales",
    items: [
      { href: "/dashboard/pos", label: "POS", permission: PERMISSIONS.POS_READ },
      { href: "/dashboard/customers", label: "Customers", permission: PERMISSIONS.CUSTOMERS_READ },
    ],
  },
  {
    label: "Operations",
    items: [
      { href: "/dashboard/inventory", label: "Inventory", permission: PERMISSIONS.INVENTORY_READ },
    ],
  },
  {
    label: "Human Resources",
    items: [
      {
        href: "/dashboard/attendance",
        label: "Attendance",
        permission: PERMISSIONS.ATTENDANCE_READ,
      },
      { href: "/dashboard/payroll", label: "Payroll", permission: PERMISSIONS.PAYROLL_READ },
      { href: "/dashboard/employees", label: "Employees", permission: PERMISSIONS.USERS_READ },
    ],
  },
  {
    label: "Settings",
    items: [
      {
        href: "/dashboard/settings/categories",
        label: "Categories",
        permission: PERMISSIONS.SETTINGS_READ,
      },
      { href: "/dashboard/settings/units", label: "Units", permission: PERMISSIONS.SETTINGS_READ },
      {
        href: "/dashboard/settings/departments",
        label: "Departments",
        permission: PERMISSIONS.SETTINGS_READ,
      },
      { href: "/dashboard/users", label: "Users", permission: PERMISSIONS.SETTINGS_READ },
    ],
  },
];
