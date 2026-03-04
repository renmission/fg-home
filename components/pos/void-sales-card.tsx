"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { SaleDetail } from "@/lib/pos-api";

interface VoidSaleItem {
  id: string;
  total: string | number;
  completedAt?: string | null;
}

interface VoidSalesCardProps {
  sales: VoidSaleItem[];
  isPending: boolean;
  onVoid: (saleId: string) => void;
  onClose: () => void;
}

export function VoidSalesCard({ sales, isPending, onVoid, onClose }: VoidSalesCardProps) {
  const handleVoid = (saleId: string) => {
    if (confirm("Void this sale? Stock will be restored.")) {
      onVoid(saleId);
    }
  };

  return (
    // Backdrop
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      {/* Card — stop click propagation so clicking inside doesn't close */}
      <Card className="w-full max-w-sm shadow-xl" onClick={(e) => e.stopPropagation()}>
        <CardContent className="pt-5 pb-5">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-foreground">Void a Sale</h3>
            <button
              type="button"
              aria-label="Close"
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground transition-colors text-lg leading-none"
            >
              ✕
            </button>
          </div>

          {sales.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No recent completed sales.
            </p>
          ) : (
            <div className="space-y-1.5 max-h-72 overflow-y-auto">
              {sales.map((s) => {
                const date = s.completedAt ? new Date(s.completedAt).toLocaleString() : null;
                return (
                  <div
                    key={s.id}
                    className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm"
                  >
                    <div className="min-w-0">
                      <p className="font-medium truncate">#{s.id.slice(0, 8)}</p>
                      {date && <p className="text-xs text-muted-foreground">{date}</p>}
                      <p className="text-xs font-semibold text-primary">
                        ₱{Number(s.total).toFixed(2)}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 shrink-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                      disabled={isPending}
                      onClick={() => handleVoid(s.id)}
                    >
                      Void
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
