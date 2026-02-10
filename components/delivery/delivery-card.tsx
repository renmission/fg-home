"use client";

import * as React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { DeliveryListItem } from "@/lib/delivery-api";
import { DELIVERY_STATUS_COLORS, DELIVERY_STATUS_LABELS } from "./delivery-constants";

export interface DeliveryCardProps {
  /** Delivery item data */
  delivery: DeliveryListItem;
  /** Whether user can write/edit deliveries */
  canWrite?: boolean;
  /** Whether user can update delivery status */
  canUpdateStatus?: boolean;
  /** Callback when card is clicked/tapped */
  onView?: () => void;
  /** Callback when edit action is triggered */
  onEdit?: () => void;
  /** Callback when update status action is triggered */
  onUpdateStatus?: () => void;
  /** Callback when delete action is triggered */
  onDelete?: () => void;
  /** Custom actions component (e.g., dropdown menu). If provided, replaces default actions. */
  actionsComponent?: React.ReactNode;
  /** Additional CSS classes */
  className?: string;
  /** Show mobile-optimized action buttons instead of dropdown */
  showMobileActions?: boolean;
  /** Whether actions are disabled (for FIFO - only first delivery is actionable) */
  disabled?: boolean;
}

/**
 * Reusable mobile card component for displaying delivery items.
 * Optimized for mobile devices with touch-friendly interactions.
 */
export function DeliveryCard({
  delivery,
  canWrite = false,
  canUpdateStatus = false,
  onView,
  onEdit,
  onUpdateStatus,
  onDelete,
  actionsComponent,
  className,
  showMobileActions = false,
  disabled = false,
}: DeliveryCardProps) {
  const getStatusColor = (status: string): string => {
    switch (status) {
      case "delivered":
        return "#22c55e"; // green
      case "failed":
      case "returned":
        return "#ef4444"; // red
      case "out_for_delivery":
        return "#f97316"; // orange
      case "in_transit":
        return "#eab308"; // yellow
      case "picked":
        return "#3b82f6"; // blue
      default:
        return "#6b7280"; // gray
    }
  };

  const handleCardClick = () => {
    if (onView && !disabled) {
      onView();
    }
  };

  const handleViewClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onView && !disabled) {
      onView();
    }
  };

  const handleUpdateStatusClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onUpdateStatus && !disabled) {
      onUpdateStatus();
    }
  };

  return (
    <Card
      className={`touch-manipulation active:scale-[0.98] transition-transform border-l-4 shadow-sm hover:shadow-md ${
        !showMobileActions ? "relative" : ""
      } ${disabled ? "opacity-60" : ""} ${className ?? ""}`}
      style={{
        borderLeftColor: getStatusColor(delivery.status),
      }}
      onClick={showMobileActions ? undefined : handleCardClick}
    >
      <CardContent className="p-3.5">
        {/* Header: Tracking Number + Status Badge */}
        <div className="flex items-center justify-between gap-2 mb-2">
          <h3 className="font-semibold text-base truncate flex-1">{delivery.trackingNumber}</h3>
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium shrink-0 ${
              DELIVERY_STATUS_COLORS[delivery.status] ?? "bg-gray-100 text-gray-800"
            }`}
          >
            {DELIVERY_STATUS_LABELS[delivery.status] ?? delivery.status}
          </span>
        </div>

        {/* Customer Name */}
        {delivery.customerName && (
          <p className="text-sm font-medium text-foreground mb-1.5 truncate">
            {delivery.customerName}
          </p>
        )}

        {/* Address */}
        <p className="text-sm text-muted-foreground mb-2 line-clamp-2 leading-snug">
          {delivery.customerAddress}
        </p>

        {/* Metadata: Order Reference + Assigned To + Date */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {delivery.orderReference && (
            <span className="truncate max-w-[140px]">Order: {delivery.orderReference}</span>
          )}
          {delivery.assignedToUserName ? (
            <span className="truncate max-w-[140px]">Assigned: {delivery.assignedToUserName}</span>
          ) : (
            <span className="truncate max-w-[140px] text-muted-foreground italic">Unassigned</span>
          )}
          <span>{new Date(delivery.createdAt).toLocaleDateString()}</span>
        </div>

        {/* Mobile Action Buttons */}
        {showMobileActions && (canUpdateStatus || onView) && (
          <div
            className="flex gap-2 pt-3 mt-3 border-t border-border"
            onClick={(e) => e.stopPropagation()}
          >
            {onView && (
              <Button
                variant="outline"
                size="sm"
                className="flex-1 min-h-10 touch-manipulation text-xs font-medium"
                onClick={handleViewClick}
                disabled={disabled}
              >
                View
              </Button>
            )}
            {canUpdateStatus && onUpdateStatus && (
              <Button
                size="sm"
                className="flex-1 min-h-10 touch-manipulation text-xs font-medium"
                onClick={handleUpdateStatusClick}
                disabled={disabled}
              >
                Update Status
              </Button>
            )}
          </div>
        )}

        {/* Desktop Actions Menu (if not using mobile actions) */}
        {!showMobileActions && (canWrite || canUpdateStatus || actionsComponent) && (
          <div
            className="absolute top-3 right-3"
            onClick={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
          >
            {actionsComponent}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
