"use client";

import { useState, useEffect, useRef } from "react";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  DELIVERY_STATUS_LABELS,
  DELIVERY_STATUS_COLORS,
  getAvailableNextStatuses,
} from "./delivery-constants";
import type { DeliveryStatus } from "@/schemas/delivery";

export interface StatusSelectProps {
  /** Selected status value */
  value: DeliveryStatus;
  /** Callback when status is selected */
  onChange: (value: DeliveryStatus) => void;
  /** Whether the select is required */
  required?: boolean;
  /** Label text */
  label?: string;
  /** HTML id attribute */
  id?: string;
  /** Current status of the delivery (for workflow enforcement) */
  currentStatus?: string;
  /** Whether to enforce sequential workflow (only show next status) */
  enforceWorkflow?: boolean;
}

/**
 * Custom status select dropdown component.
 * Opens downward and allows full control over styling.
 */
export function StatusSelect({
  value,
  onChange,
  required = false,
  label = "Status",
  id = "status",
  currentStatus,
  enforceWorkflow = false,
}: StatusSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: Event) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("touchstart", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, [isOpen]);

  const selectedLabel = DELIVERY_STATUS_LABELS[value] ?? value;
  const selectedColor = DELIVERY_STATUS_COLORS[value];

  // Get available statuses based on workflow enforcement
  const getAvailableStatuses = (): string[] => {
    if (enforceWorkflow && currentStatus) {
      // Only show the next status in sequence
      return getAvailableNextStatuses(currentStatus);
    }
    // Show all statuses (default behavior)
    return Object.keys(DELIVERY_STATUS_LABELS);
  };

  const availableStatuses = getAvailableStatuses();

  const handleSelect = (status: DeliveryStatus) => {
    onChange(status);
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className="relative">
      <div>
        <Label htmlFor={id}>
          {label}
          {required && " *"}
        </Label>
        <button
          type="button"
          id={id}
          onClick={() => setIsOpen(!isOpen)}
          className="mt-2 w-full rounded-md border border-input bg-background px-3 py-2.5 text-base min-h-[2.75rem] touch-manipulation ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 flex items-center justify-between"
          style={{ fontSize: "16px", lineHeight: "1.5" }}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
        >
          <span
            className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
              selectedColor ?? "bg-gray-100 text-gray-800"
            }`}
          >
            {selectedLabel}
          </span>
          <svg
            className={`h-4 w-4 transition-transform ${isOpen ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      {/* Dropdown - Always opens downward */}
      {isOpen && (
        <Card className="absolute z-50 w-full mt-1 shadow-lg border max-h-60 overflow-hidden">
          <CardContent className="p-0">
            <div className="max-h-60 overflow-y-auto">
              {availableStatuses.length === 0 ? (
                <div className="px-4 py-3 text-sm text-muted-foreground text-center">
                  No next status available. Delivery is completed or terminated.
                </div>
              ) : (
                availableStatuses.map((statusValue) => {
                  const statusLabel = DELIVERY_STATUS_LABELS[statusValue];
                  const statusColor = DELIVERY_STATUS_COLORS[statusValue];
                  const isSelected = value === statusValue;
                  return (
                    <button
                      key={statusValue}
                      type="button"
                      onClick={() => handleSelect(statusValue as DeliveryStatus)}
                      className={`w-full text-left px-4 py-3 hover:bg-muted transition-colors border-b last:border-b-0 ${
                        isSelected ? "bg-muted font-medium" : ""
                      }`}
                      style={{ fontSize: "16px", lineHeight: "1.5" }}
                    >
                      {statusLabel}
                    </button>
                  );
                })
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
