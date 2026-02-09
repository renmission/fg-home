/**
 * Utility functions for attendance module.
 */

/**
 * Calculate attendance submission deadline (pay date - 3 days).
 * Returns the deadline date as YYYY-MM-DD string.
 */
export function calculateAttendanceDeadline(payDate: string): string {
  const date = new Date(payDate);
  date.setDate(date.getDate() - 3);
  return date.toISOString().split("T")[0]!;
}

/**
 * Check if submission is late (submitted after deadline).
 */
export function isLateSubmission(submittedAt: Date, deadline: string): boolean {
  const deadlineDate = new Date(deadline);
  deadlineDate.setHours(23, 59, 59, 999); // End of deadline day
  return submittedAt > deadlineDate;
}

/**
 * Generate array of dates for a pay period (startDate to endDate inclusive).
 */
export function generatePayPeriodDates(startDate: string, endDate: string): string[] {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const dates: string[] = [];
  const current = new Date(start);

  while (current <= end) {
    dates.push(current.toISOString().split("T")[0]!);
    current.setDate(current.getDate() + 1);
  }

  return dates;
}
