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
  // User management
  USERS_READ: "users:read",
  USERS_WRITE: "users:write",
  // Settings (admin only)
  SETTINGS_READ: "settings:read",
  SETTINGS_WRITE: "settings:write",
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

/** Role name as stored in DB (role.name) */
export const ROLES = {
  ADMIN: "admin",
  INVENTORY_MANAGER: "inventory_manager",
  PAYROLL_MANAGER: "payroll_manager",
  DELIVERY_STAFF: "delivery_staff",
  VIEWER: "viewer",
} as const;

const ROLE_PERMISSIONS: Record<string, Permission[]> = {
  [ROLES.ADMIN]: Object.values(PERMISSIONS), // admin has all including USERS_READ, USERS_WRITE
  [ROLES.INVENTORY_MANAGER]: [
    PERMISSIONS.INVENTORY_READ,
    PERMISSIONS.INVENTORY_WRITE,
    PERMISSIONS.DELIVERIES_READ,
  ],
  [ROLES.PAYROLL_MANAGER]: [
    PERMISSIONS.INVENTORY_READ,
    PERMISSIONS.PAYROLL_READ,
    PERMISSIONS.PAYROLL_RUN,
    PERMISSIONS.PAYROLL_WRITE,
    PERMISSIONS.USERS_READ,
    PERMISSIONS.USERS_WRITE,
  ],
  [ROLES.DELIVERY_STAFF]: [
    PERMISSIONS.INVENTORY_READ,
    PERMISSIONS.DELIVERIES_READ,
    PERMISSIONS.DELIVERIES_UPDATE_STATUS,
  ],
  [ROLES.VIEWER]: [
    PERMISSIONS.INVENTORY_READ,
    PERMISSIONS.PAYROLL_READ,
    PERMISSIONS.DELIVERIES_READ,
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
 * Nav items with required permission (null = no permission gated, show to all authenticated).
 */
export const NAV_ITEMS: { href: string; label: string; permission: Permission | null }[] = [
  { href: "/dashboard", label: "Dashboard", permission: null },
  { href: "/dashboard/inventory", label: "Inventory", permission: PERMISSIONS.INVENTORY_READ },
  { href: "/dashboard/payroll", label: "Payroll", permission: PERMISSIONS.PAYROLL_READ },
  { href: "/dashboard/deliveries", label: "Deliveries", permission: PERMISSIONS.DELIVERIES_READ },
  { href: "/dashboard/users", label: "Users", permission: PERMISSIONS.USERS_READ },
];
