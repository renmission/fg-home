/**
 * Philippine Government Mandatory Payroll Deductions Calculator
 * Based on 2024-2025 rates
 */

/**
 * Calculate SSS (Social Security System) contribution
 * Rate: 4.5% of monthly salary, capped at ₱30,000 salary base
 * Employee share: 4.5%
 */
export function calculateSSS(grossPay: number): number {
  const salaryBase = Math.min(grossPay, 30000); // Cap at ₱30,000
  return salaryBase * 0.045; // 4.5% employee contribution
}

/**
 * Calculate PhilHealth (Philippine Health Insurance Corporation) contribution
 * Rate: 4% of monthly salary in 2025, capped at ₱100,000 salary base
 * Employee share: 4%
 */
export function calculatePhilHealth(grossPay: number): number {
  const salaryBase = Math.min(grossPay, 100000); // Cap at ₱100,000
  return salaryBase * 0.04; // 4% employee contribution
}

/**
 * Calculate Pag-IBIG (Home Development Mutual Fund) contribution
 * Rate varies by salary range:
 * - ₱12,000 to ₱18,000: 1% of salary
 * - ₱18,000 to ₱60,000: 2% of salary
 * - Above ₱60,000: 2% of ₱5,000 maximum contribution base
 * Employee share: 1% or 2% depending on salary
 */
export function calculatePagIBIG(grossPay: number): number {
  if (grossPay < 12000) {
    return 0; // Below minimum threshold
  } else if (grossPay >= 12000 && grossPay < 18000) {
    return grossPay * 0.01; // 1% for ₱12,000 to ₱18,000
  } else if (grossPay >= 18000 && grossPay <= 60000) {
    return grossPay * 0.02; // 2% for ₱18,000 to ₱60,000
  } else {
    return 5000 * 0.02; // 2% of maximum ₱5,000 contribution base
  }
}

/**
 * Calculate Income Tax (BIR - Bureau of Internal Revenue)
 * Progressive tax rates for 2024-2025:
 * - 0% on ₱0 to ₱250,000
 * - 15% on ₱250,000.01 to ₱400,000
 * - 20% on ₱400,000.01 to ₱800,000
 * - 25% on ₱800,000.01 to ₱2,000,000
 * - 30% on ₱2,000,000.01 to ₱8,000,000
 * - 35% on above ₱8,000,000
 *
 * Note: This calculates annual tax, then converts to monthly/bi-weekly based on period
 */
export function calculateIncomeTax(annualGrossPay: number): number {
  let tax = 0;

  if (annualGrossPay <= 250000) {
    tax = 0;
  } else if (annualGrossPay <= 400000) {
    tax = (annualGrossPay - 250000) * 0.15;
  } else if (annualGrossPay <= 800000) {
    tax = 22500 + (annualGrossPay - 400000) * 0.2; // 15% of ₱150,000 = ₱22,500
  } else if (annualGrossPay <= 2000000) {
    tax = 102500 + (annualGrossPay - 800000) * 0.25; // Previous + 20% of ₱400,000 = ₱80,000
  } else if (annualGrossPay <= 8000000) {
    tax = 402500 + (annualGrossPay - 2000000) * 0.3; // Previous + 25% of ₱1,200,000 = ₱300,000
  } else {
    tax = 2202500 + (annualGrossPay - 8000000) * 0.35; // Previous + 30% of ₱6,000,000 = ₱1,800,000
  }

  return tax;
}

/**
 * Calculate all Philippine mandatory deductions
 * @param grossPay - Monthly gross pay
 * @param payPeriodType - Type of pay period (weekly, bi_weekly, monthly)
 * @returns Object containing all deduction amounts
 */
export function calculatePhilippineDeductions(
  grossPay: number,
  payPeriodType: "weekly" | "bi_weekly" | "monthly" = "monthly"
): {
  sss: number;
  philhealth: number;
  pagibig: number;
  incomeTax: number;
  total: number;
} {
  // For weekly/bi-weekly, convert to monthly equivalent for calculations
  let monthlyGrossPay = grossPay;
  if (payPeriodType === "weekly") {
    monthlyGrossPay = grossPay * 4.33; // Average weeks per month
  } else if (payPeriodType === "bi_weekly") {
    monthlyGrossPay = grossPay * 2.17; // Average bi-weekly periods per month
  }

  // Calculate deductions based on monthly equivalent
  const sss = calculateSSS(monthlyGrossPay);
  const philhealth = calculatePhilHealth(monthlyGrossPay);
  const pagibig = calculatePagIBIG(monthlyGrossPay);

  // Calculate annual income for tax calculation
  const annualGrossPay = monthlyGrossPay * 12;
  const annualTax = calculateIncomeTax(annualGrossPay);

  // Convert annual tax back to pay period
  let incomeTax = annualTax / 12; // Monthly tax
  if (payPeriodType === "weekly") {
    incomeTax = annualTax / 52; // Weekly tax
  } else if (payPeriodType === "bi_weekly") {
    incomeTax = annualTax / 26; // Bi-weekly tax
  }

  // For non-monthly periods, adjust SSS, PhilHealth, and Pag-IBIG proportionally
  let adjustedSSS = sss;
  let adjustedPhilHealth = philhealth;
  let adjustedPagIBIG = pagibig;

  if (payPeriodType === "weekly") {
    adjustedSSS = sss / 4.33;
    adjustedPhilHealth = philhealth / 4.33;
    adjustedPagIBIG = pagibig / 4.33;
  } else if (payPeriodType === "bi_weekly") {
    adjustedSSS = sss / 2.17;
    adjustedPhilHealth = philhealth / 2.17;
    adjustedPagIBIG = pagibig / 2.17;
  }

  const total = adjustedSSS + adjustedPhilHealth + adjustedPagIBIG + incomeTax;

  return {
    sss: Math.round(adjustedSSS * 100) / 100,
    philhealth: Math.round(adjustedPhilHealth * 100) / 100,
    pagibig: Math.round(adjustedPagIBIG * 100) / 100,
    incomeTax: Math.round(incomeTax * 100) / 100,
    total: Math.round(total * 100) / 100,
  };
}
