/**
 * Delivery workflow utilities
 * Shared between frontend and backend for status progression validation
 */

// Status order for workflow progression
export const STATUS_ORDER: Record<string, number> = {
  created: 0,
  picked: 1,
  in_transit: 2,
  out_for_delivery: 3,
  delivered: 4,
  failed: -1,
  returned: -1,
};

/**
 * Get the next status in the workflow sequence
 * Returns undefined if current status is terminal (delivered, failed, returned)
 */
export function getNextStatus(currentStatus: string): string | undefined {
  const currentOrder = STATUS_ORDER[currentStatus];

  // Terminal states have no next status
  if (currentOrder === -1 || currentOrder === 4) {
    return undefined;
  }

  // Find the next status in sequence
  const nextOrder = currentOrder + 1;
  const nextStatus = Object.entries(STATUS_ORDER).find(([_, order]) => order === nextOrder)?.[0];

  return nextStatus;
}

/**
 * Get all available next statuses (for workflow progression)
 * Currently only returns the immediate next status, but could be extended
 * to allow skipping steps if needed in the future.
 */
export function getAvailableNextStatuses(currentStatus: string): string[] {
  const nextStatus = getNextStatus(currentStatus);
  return nextStatus ? [nextStatus] : [];
}

/**
 * Validate if a status transition is valid (sequential workflow)
 */
export function isValidStatusTransition(currentStatus: string, newStatus: string): boolean {
  const nextStatus = getNextStatus(currentStatus);
  return nextStatus === newStatus;
}
