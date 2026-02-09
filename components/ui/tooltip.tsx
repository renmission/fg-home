"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export function Tooltip({
  content,
  children,
  side = "right",
  className,
}: {
  content: React.ReactNode;
  children: React.ReactElement;
  side?: "left" | "right" | "top" | "bottom";
  className?: string;
}) {
  const positionClasses = {
    right: "left-full top-1/2 -translate-y-1/2 ml-2",
    left: "right-full top-1/2 -translate-y-1/2 mr-2",
    top: "bottom-full left-1/2 -translate-x-1/2 mb-2",
    bottom: "left-1/2 top-full -translate-x-1/2 mt-2",
  };

  return (
    <span className={cn("group relative inline-flex", className)}>
      {children}
      <span
        role="tooltip"
        className={cn(
          "pointer-events-none absolute z-50 whitespace-nowrap rounded-md border border-border bg-card px-2.5 py-1.5 text-sm text-card-foreground shadow-md",
          "opacity-0 transition-opacity duration-150 group-hover:opacity-100",
          positionClasses[side]
        )}
      >
        {content}
      </span>
    </span>
  );
}
