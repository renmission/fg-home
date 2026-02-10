import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  products,
  stockLevels,
  stockMovements,
  deliveries,
  sales,
  payrollRuns,
  payslips,
  employees,
  users,
} from "@/lib/db/schema";
import { getSessionOr401 } from "@/lib/api-auth";
import { withRouteErrorHandling } from "@/lib/errors";
import { ROLES } from "@/lib/auth/permissions";
import { sql, eq, and, gte, lte, desc, count } from "drizzle-orm";

export async function GET(req: NextRequest) {
  return withRouteErrorHandling(async () => {
    const { user, response } = await getSessionOr401();
    if (response) return response;

    if (!user?.roles?.length) {
      return NextResponse.json({ error: "No roles assigned" }, { status: 403 });
    }

    const roles = user.roles;
    const isAdmin = roles.includes(ROLES.ADMIN);
    const isInventoryManager = roles.includes(ROLES.INVENTORY_MANAGER);
    const isPayrollManager = roles.includes(ROLES.PAYROLL_MANAGER);
    const isDeliveryStaff = roles.includes(ROLES.DELIVERY_STAFF);
    const isPosCashier = roles.includes(ROLES.POS_CASHIER);
    const isViewer = roles.includes(ROLES.VIEWER);

    // Get date range for "recent" metrics (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const today = new Date();
    today.setHours(23, 59, 59, 999);

    const stats: Record<string, unknown> = {};

    // Admin: Overview of everything
    if (isAdmin) {
      // Inventory stats
      const [totalProducts] = await db
        .select({ count: count() })
        .from(products)
        .where(eq(products.archived, 0));

      const [lowStockProducts] = await db
        .select({ count: count() })
        .from(products)
        .innerJoin(stockLevels, eq(products.id, stockLevels.productId))
        .where(
          and(eq(products.archived, 0), sql`${stockLevels.quantity} <= ${products.reorderLevel}`)
        );

      // Recent movements
      const recentMovements = await db
        .select({
          type: stockMovements.type,
          count: count(),
        })
        .from(stockMovements)
        .where(gte(stockMovements.createdAt, thirtyDaysAgo))
        .groupBy(stockMovements.type);

      // Delivery stats
      const [totalDeliveries] = await db.select({ count: count() }).from(deliveries);
      const [pendingDeliveries] = await db
        .select({ count: count() })
        .from(deliveries)
        .where(
          sql`${deliveries.status} IN ('created', 'picked', 'in_transit', 'out_for_delivery')`
        );

      // Sales stats (last 30 days)
      const recentSales = await db
        .select({
          total: sql<number>`COALESCE(SUM(${sales.total}), 0)`,
          count: count(),
        })
        .from(sales)
        .where(and(eq(sales.status, "completed"), gte(sales.completedAt, thirtyDaysAgo)));

      // Payroll stats
      const [totalEmployees] = await db
        .select({ count: count() })
        .from(employees)
        .where(eq(employees.active, 1));

      const [recentPayrollRuns] = await db
        .select({ count: count() })
        .from(payrollRuns)
        .where(gte(payrollRuns.createdAt, thirtyDaysAgo));

      // User stats
      const [totalUsers] = await db
        .select({ count: count() })
        .from(users)
        .where(eq(users.disabled, 0));

      stats.admin = {
        inventory: {
          totalProducts: totalProducts.count,
          lowStockCount: lowStockProducts.count,
          recentMovements: recentMovements.map((m) => ({
            type: m.type,
            count: Number(m.count),
          })),
        },
        deliveries: {
          total: totalDeliveries.count,
          pending: pendingDeliveries.count,
        },
        sales: {
          totalAmount: Number(recentSales[0]?.total || 0),
          transactionCount: recentSales[0]?.count || 0,
        },
        payroll: {
          totalEmployees: totalEmployees.count,
          recentRuns: recentPayrollRuns.count,
        },
        users: {
          total: totalUsers.count,
        },
      };
    }

    // Inventory Manager: Stock levels, low stock, recent movements
    if (isInventoryManager) {
      const [totalProducts] = await db
        .select({ count: count() })
        .from(products)
        .where(eq(products.archived, 0));

      const [lowStockProducts] = await db
        .select({ count: count() })
        .from(products)
        .innerJoin(stockLevels, eq(products.id, stockLevels.productId))
        .where(
          and(eq(products.archived, 0), sql`${stockLevels.quantity} <= ${products.reorderLevel}`)
        );

      // Stock movements by type (last 30 days)
      const movementsByType = await db
        .select({
          type: stockMovements.type,
          count: count(),
        })
        .from(stockMovements)
        .where(gte(stockMovements.createdAt, thirtyDaysAgo))
        .groupBy(stockMovements.type);

      // Stock movements by day (last 7 days) for chart
      const movementsByDay = await db
        .select({
          date: sql<string>`DATE(${stockMovements.createdAt})`,
          type: stockMovements.type,
          count: count(),
        })
        .from(stockMovements)
        .where(gte(stockMovements.createdAt, new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)))
        .groupBy(sql`DATE(${stockMovements.createdAt})`, stockMovements.type);

      stats.inventory = {
        totalProducts: totalProducts.count,
        lowStockCount: lowStockProducts.count,
        movementsByType: movementsByType.map((m) => ({
          type: m.type,
          count: Number(m.count),
        })),
        movementsByDay: movementsByDay.map((m) => ({
          date: m.date,
          type: m.type,
          count: Number(m.count),
        })),
      };
    }

    // Payroll Manager: Employee count, recent payroll runs, pending payslips
    if (isPayrollManager) {
      const [totalEmployees] = await db
        .select({ count: count() })
        .from(employees)
        .where(eq(employees.active, 1));

      const recentRuns = await db
        .select()
        .from(payrollRuns)
        .orderBy(desc(payrollRuns.createdAt))
        .limit(5);

      const [pendingPayslips] = await db
        .select({ count: count() })
        .from(payslips)
        .where(eq(payslips.status, "draft"));

      // Payroll runs by month (last 6 months) for chart
      const runsByMonth = await db
        .select({
          month: sql<string>`TO_CHAR(${payrollRuns.createdAt}, 'YYYY-MM')`,
          count: count(),
        })
        .from(payrollRuns)
        .where(gte(payrollRuns.createdAt, new Date(Date.now() - 6 * 30 * 24 * 60 * 60 * 1000)))
        .groupBy(sql`TO_CHAR(${payrollRuns.createdAt}, 'YYYY-MM')`);

      stats.payroll = {
        totalEmployees: totalEmployees.count,
        pendingPayslips: pendingPayslips.count,
        recentRuns: recentRuns.map((r) => ({
          id: r.id,
          payPeriodId: r.payPeriodId,
          status: r.status,
          createdAt: r.createdAt.toISOString(),
        })),
        runsByMonth: runsByMonth.map((r) => ({
          month: r.month,
          count: Number(r.count),
        })),
      };
    }

    // Delivery Staff: Assigned deliveries, status breakdown
    if (isDeliveryStaff) {
      const [myDeliveries] = await db
        .select({ count: count() })
        .from(deliveries)
        .where(eq(deliveries.assignedToUserId, user.id));

      const deliveriesByStatus = await db
        .select({
          status: deliveries.status,
          count: count(),
        })
        .from(deliveries)
        .where(eq(deliveries.assignedToUserId, user.id))
        .groupBy(deliveries.status);

      const [pendingDeliveries] = await db
        .select({ count: count() })
        .from(deliveries)
        .where(
          and(
            eq(deliveries.assignedToUserId, user.id),
            sql`${deliveries.status} IN ('created', 'picked', 'in_transit', 'out_for_delivery')`
          )
        );

      // If no deliveries assigned, return empty stats
      if (myDeliveries.count === 0) {
        stats.delivery = {
          total: 0,
          pending: 0,
          byStatus: [],
        };
      } else {
        stats.delivery = {
          total: myDeliveries.count,
          pending: pendingDeliveries.count,
          byStatus: deliveriesByStatus.map((d) => ({
            status: d.status,
            count: Number(d.count),
          })),
        };
      }
    }

    // POS Cashier: Recent sales, today's sales
    if (isPosCashier) {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const [todaySales] = await db
        .select({
          total: sql<number>`COALESCE(SUM(${sales.total}), 0)`,
          count: count(),
        })
        .from(sales)
        .where(and(eq(sales.status, "completed"), gte(sales.completedAt, todayStart)));

      const recentSales = await db
        .select({
          total: sql<number>`COALESCE(SUM(${sales.total}), 0)`,
          count: count(),
        })
        .from(sales)
        .where(and(eq(sales.status, "completed"), gte(sales.completedAt, thirtyDaysAgo)));

      // Sales by day (last 7 days) for chart
      const salesByDay = await db
        .select({
          date: sql<string>`DATE(${sales.completedAt})`,
          total: sql<number>`COALESCE(SUM(${sales.total}), 0)`,
          count: count(),
        })
        .from(sales)
        .where(
          and(
            eq(sales.status, "completed"),
            gte(sales.completedAt, new Date(Date.now() - 7 * 24 * 60 * 60 * 1000))
          )
        )
        .groupBy(sql`DATE(${sales.completedAt})`);

      stats.pos = {
        today: {
          totalAmount: Number(todaySales.total || 0),
          transactionCount: todaySales.count || 0,
        },
        recent: {
          totalAmount: Number(recentSales[0]?.total || 0),
          transactionCount: recentSales[0]?.count || 0,
        },
        salesByDay: salesByDay.map((s) => ({
          date: s.date,
          total: Number(s.total),
          count: Number(s.count),
        })),
      };
    }

    // Viewer: Read-only overview
    if (isViewer) {
      const [totalProducts] = await db
        .select({ count: count() })
        .from(products)
        .where(eq(products.archived, 0));

      const [totalDeliveries] = await db.select({ count: count() }).from(deliveries);

      const [totalEmployees] = await db
        .select({ count: count() })
        .from(employees)
        .where(eq(employees.active, 1));

      stats.viewer = {
        inventory: {
          totalProducts: totalProducts.count,
        },
        deliveries: {
          total: totalDeliveries.count,
        },
        payroll: {
          totalEmployees: totalEmployees.count,
        },
      };
    }

    return NextResponse.json({ data: stats });
  });
}
