/**
 * Cleanup script: removes all payroll-related data for testing.
 * Run: pnpm db:cleanup-payroll
 * WARNING: This will delete all payroll data including attendance, pay periods, payroll runs, and payslips.
 */
import "dotenv/config";
import { db } from "../lib/db";
import {
  attendanceDays,
  attendance,
  deductions,
  earnings,
  payslips,
  payrollRuns,
  payPeriods,
  employees,
} from "../lib/db/schema";

async function cleanupPayroll() {
  console.log("Starting payroll data cleanup...");

  try {
    // Delete in order due to foreign key constraints
    console.log("Deleting attendance days...");
    await db.delete(attendanceDays);
    console.log(`  ✓ Deleted attendance days`);

    console.log("Deleting attendance records...");
    await db.delete(attendance);
    console.log(`  ✓ Deleted attendance records`);

    console.log("Deleting deductions...");
    await db.delete(deductions);
    console.log(`  ✓ Deleted deductions`);

    console.log("Deleting earnings...");
    await db.delete(earnings);
    console.log(`  ✓ Deleted earnings`);

    console.log("Deleting payslips...");
    await db.delete(payslips);
    console.log(`  ✓ Deleted payslips`);

    console.log("Deleting payroll runs...");
    await db.delete(payrollRuns);
    console.log(`  ✓ Deleted payroll runs`);

    console.log("Deleting pay periods...");
    await db.delete(payPeriods);
    console.log(`  ✓ Deleted pay periods`);

    console.log("Deleting employees...");
    await db.delete(employees);
    console.log(`  ✓ Deleted employees`);

    console.log("\n✅ Payroll data cleanup completed successfully!");
    console.log("\nAll payroll data including employees has been removed.");
  } catch (error) {
    console.error("❌ Error during cleanup:", error);
    throw error;
  }

  process.exit(0);
}

cleanupPayroll().catch((err) => {
  console.error(err);
  process.exit(1);
});
