"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect, useMemo } from "react";
import { fetchProducts } from "@/lib/inventory-api";
import {
  fetchSale,
  createSale,
  addLineItem,
  removeLineItem,
  updateLineItem,
  updateSaleDiscount,
  addPayment,
  completeSale,
  holdSale,
  retrieveSale,
  voidSale,
  fetchSales,
  type SaleDetail,
  type SaleLineItem,
} from "@/lib/pos-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { getErrorMessage } from "@/lib/errors";
import { can, type SessionUser } from "@/lib/auth/permissions";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { cn } from "@/lib/utils";
import {
  PAYMENT_OPTIONS,
  paymentRequiresReference,
  type PaymentMethodValue,
} from "@/lib/pos-constants";

const SALES_QUERY_KEY = ["pos", "sales"];
const SALE_QUERY_KEY = (id: string) => ["pos", "sale", id];
const PRODUCTS_QUERY_KEY = ["inventory", "products"];

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

const SearchIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.3-4.3" />
  </svg>
);

const AddIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <path d="M12 5v14" />
    <path d="M5 12h14" />
  </svg>
);

const ProductPlaceholder = ({ name }: { name: string }) => (
  <div className="flex h-20 w-full items-center justify-center rounded-lg bg-muted text-2xl font-semibold text-muted-foreground">
    {name.charAt(0).toUpperCase()}
  </div>
);

export function PosDashboard({ user }: { user: SessionUser | null }) {
  const canWrite = user ? can(user, PERMISSIONS.POS_WRITE) : false;
  const queryClient = useQueryClient();

  const [currentSaleId, setCurrentSaleId] = useState<string | null>(null);
  const [productSearch, setProductSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [saleDiscountAmount, setSaleDiscountAmount] = useState("");
  const [saleDiscountType, setSaleDiscountType] = useState<"percent" | "fixed">("fixed");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodValue>("cash");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentReference, setPaymentReference] = useState("");
  const [completedMessage, setCompletedMessage] = useState<string | null>(null);
  const [lastCompletedSaleId, setLastCompletedSaleId] = useState<string | null>(null);
  const [showPaymentSection, setShowPaymentSection] = useState(false);
  const [showHeldCarts, setShowHeldCarts] = useState(false);
  const [forDelivery, setForDelivery] = useState(false);

  const debouncedSearch = useDebouncedValue(productSearch, 300);

  const createSaleMutation = useMutation({
    mutationFn: createSale,
    onSuccess: (data) => {
      setCurrentSaleId(data.data.id);
      setCompletedMessage(null);
      queryClient.invalidateQueries({ queryKey: SALES_QUERY_KEY });
    },
  });

  useEffect(() => {
    if (canWrite && !currentSaleId && !createSaleMutation.isPending && !completedMessage) {
      createSaleMutation.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally run only when sale id/message change
  }, [canWrite, currentSaleId, completedMessage]);

  const { data: saleData, isLoading: saleLoading } = useQuery({
    queryKey: SALE_QUERY_KEY(currentSaleId ?? ""),
    queryFn: () => fetchSale(currentSaleId!),
    enabled: !!currentSaleId,
    refetchInterval: (query) =>
      query.state.data?.data?.status === "draft" || query.state.data?.data?.status === "held"
        ? 2000
        : false,
  });

  const { data: productsData } = useQuery({
    queryKey: [...PRODUCTS_QUERY_KEY, { search: debouncedSearch, archived: false, limit: 50 }],
    queryFn: () =>
      fetchProducts({
        search: debouncedSearch.trim() || undefined,
        archived: false,
        limit: 50,
      }),
    enabled: !!currentSaleId,
  });

  const products = productsData?.data ?? [];
  const categories = useMemo(() => {
    const set = new Set(products.map((p) => p.category).filter(Boolean) as string[]);
    return Array.from(set).sort();
  }, [products]);

  const filteredProducts = useMemo(() => {
    if (categoryFilter === "all") return products;
    return products.filter((p) => p.category === categoryFilter);
  }, [products, categoryFilter]);

  const addLineMutation = useMutation({
    mutationFn: ({
      saleId,
      productId,
      quantity,
      unitPrice,
    }: {
      saleId: string;
      productId: string;
      quantity: number;
      unitPrice?: number;
    }) => addLineItem(saleId, { productId, quantity, lineDiscountAmount: 0, unitPrice }),
    onSuccess: (_, { saleId }) => {
      queryClient.invalidateQueries({ queryKey: SALE_QUERY_KEY(saleId) });
    },
  });

  const removeLineMutation = useMutation({
    mutationFn: ({ saleId, lineId }: { saleId: string; lineId: string }) =>
      removeLineItem(saleId, lineId),
    onSuccess: (_, { saleId }) => {
      queryClient.invalidateQueries({ queryKey: SALE_QUERY_KEY(saleId) });
    },
  });

  const updateLineMutation = useMutation({
    mutationFn: ({
      saleId,
      lineId,
      quantity,
    }: {
      saleId: string;
      lineId: string;
      quantity: number;
    }) => updateLineItem(saleId, lineId, { quantity }),
    onSuccess: (_, { saleId }) => {
      queryClient.invalidateQueries({ queryKey: SALE_QUERY_KEY(saleId) });
    },
  });

  const discountMutation = useMutation({
    mutationFn: ({
      saleId,
      amount,
      type,
    }: {
      saleId: string;
      amount: number;
      type: "percent" | "fixed";
    }) => updateSaleDiscount(saleId, amount, type),
    onSuccess: (_, { saleId }) => {
      queryClient.invalidateQueries({ queryKey: SALE_QUERY_KEY(saleId) });
    },
  });

  const addPaymentMutation = useMutation({
    mutationFn: ({
      saleId,
      method,
      amount,
      reference,
    }: {
      saleId: string;
      method: PaymentMethodValue;
      amount: number;
      reference?: string;
    }) => addPayment(saleId, { method, amount, reference }),
    onSuccess: (_, { saleId }) => {
      queryClient.invalidateQueries({ queryKey: SALE_QUERY_KEY(saleId) });
      setPaymentAmount("");
      setPaymentReference("");
    },
  });

  const completeMutation = useMutation({
    mutationFn: ({
      saleId,
      forDelivery,
      customerName,
      customerAddress,
      customerPhone,
      customerEmail,
      deliveryNotes,
    }: {
      saleId: string;
      forDelivery?: boolean;
      customerName?: string;
      customerAddress?: string;
      customerPhone?: string;
      customerEmail?: string;
      deliveryNotes?: string;
    }) =>
      completeSale(saleId, {
        forDelivery,
        customerName,
        customerAddress,
        customerPhone,
        customerEmail,
        deliveryNotes,
      }),
    onSuccess: (data, { saleId }) => {
      queryClient.invalidateQueries({ queryKey: SALE_QUERY_KEY(saleId) });
      queryClient.invalidateQueries({ queryKey: SALES_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: PRODUCTS_QUERY_KEY });
      if (data.deliveryId) {
        queryClient.invalidateQueries({ queryKey: ["deliveries"] });
      }
      setCurrentSaleId(null);
      setLastCompletedSaleId(saleId);
      setCompletedMessage("Sale completed successfully.");
      // Reset delivery checkbox
      setForDelivery(false);
    },
  });

  const holdMutation = useMutation({
    mutationFn: holdSale,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SALES_QUERY_KEY });
      setCurrentSaleId(null);
      createSaleMutation.mutate();
    },
  });

  const retrieveMutation = useMutation({
    mutationFn: retrieveSale,
    onSuccess: (_, saleId) => {
      queryClient.invalidateQueries({ queryKey: SALE_QUERY_KEY(saleId) });
      queryClient.invalidateQueries({ queryKey: SALES_QUERY_KEY });
      setCurrentSaleId(saleId);
      setShowHeldCarts(false);
    },
  });

  const voidMutation = useMutation({
    mutationFn: voidSale,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SALES_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: PRODUCTS_QUERY_KEY });
    },
  });

  const sale = saleData?.data;
  const isDraft = sale?.status === "draft" || sale?.status === "held";
  const total = sale ? Number(sale.total) : 0;
  const paymentTotal = sale?.paymentTotal ?? 0;
  const canComplete = isDraft && sale?.lines?.length && paymentTotal >= total && total > 0;
  const lines = (sale as SaleDetail)?.lines ?? [];

  const handleAddToCart = (productId: string, listPrice: string | null) => {
    if (!currentSaleId || !canWrite) return;
    const unitPrice = listPrice != null ? Number(listPrice) : undefined;
    addLineMutation.mutate({ saleId: currentSaleId, productId, quantity: 1, unitPrice });
  };

  const handleQuantityChange = (line: SaleLineItem, delta: number) => {
    if (!currentSaleId || !canWrite) return;
    const newQty = line.quantity + delta;
    if (newQty < 1) {
      removeLineMutation.mutate({ saleId: currentSaleId, lineId: line.id });
    } else {
      updateLineMutation.mutate({ saleId: currentSaleId, lineId: line.id, quantity: newQty });
    }
  };

  const handleApplyDiscount = () => {
    if (!currentSaleId || !canWrite) return;
    const amount = Number(saleDiscountAmount);
    if (isNaN(amount) || amount < 0) return;
    discountMutation.mutate({ saleId: currentSaleId, amount, type: saleDiscountType });
    setSaleDiscountAmount("");
  };

  const requiresReference = paymentRequiresReference(paymentMethod);
  const canAddPayment =
    Number(paymentAmount) > 0 && (!requiresReference || paymentReference.trim().length > 0);

  const handleAddPayment = () => {
    if (!currentSaleId || !canWrite || !canAddPayment) return;
    const amount = Number(paymentAmount);
    if (isNaN(amount) || amount <= 0) return;
    addPaymentMutation.mutate({
      saleId: currentSaleId,
      method: paymentMethod,
      amount,
      reference: requiresReference ? paymentReference.trim() : undefined,
    });
  };

  const handleComplete = () => {
    if (!currentSaleId || !canWrite || !canComplete) return;
    completeMutation.mutate({
      saleId: currentSaleId,
      forDelivery: forDelivery ? true : undefined,
    });
  };

  const handleNewSale = () => {
    setCompletedMessage(null);
    setLastCompletedSaleId(null);
    setShowPaymentSection(false);
    createSaleMutation.mutate();
  };

  const handlePrintReceipt = () => {
    if (!lastCompletedSaleId) return;
    // Open window synchronously on user click to avoid popup blockers; then load content async.
    const w = window.open("", "_blank");
    if (!w) {
      alert("Please allow popups for this site to print receipts.");
      return;
    }
    w.document.write(
      '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Receipt</title></head><body style="font-family:system-ui;padding:2rem;text-align:center;color:#666;">Loading receipt…</body></html>'
    );
    w.document.close();

    (async () => {
      try {
        const { data } = await fetchSale(lastCompletedSaleId!);
        const s = data as SaleDetail;
        const date = s.completedAt
          ? new Date(s.completedAt).toLocaleString()
          : new Date(s.createdAt).toLocaleString();

        const linesHtml = (s.lines ?? [])
          .map((l) => {
            const unitPrice = Number(l.unitPrice);
            const lineDiscount = Number(l.lineDiscountAmount ?? 0);
            const lineSubtotal = l.quantity * unitPrice;
            const lineTotal = lineSubtotal - lineDiscount;
            const discountText = lineDiscount > 0 ? ` • Disc: -₱${lineDiscount.toFixed(2)}` : "";
            return `<div class="item-row"><div class="item-main"><div class="item-name">${escapeHtml(
              l.productName
            )}</div><div class="item-meta">Qty ${l.quantity} × ₱${unitPrice.toFixed(
              2
            )}${discountText}</div></div><div class="item-amount">₱${lineTotal.toFixed(
              2
            )}</div></div>`;
          })
          .join("");

        const paymentsHtml = (s.payments ?? [])
          .map((p) => {
            const amount = Number(p.amount);
            return `<div class="payment-row"><span>${escapeHtml(
              String(p.method)
            )}</span><span>₱${amount.toFixed(2)}</span></div>`;
          })
          .join("");

        const hasPayments = (s.payments ?? []).length > 0;
        const discountAmount = Number(s.discountAmount) || 0;
        const discountRowHtml =
          discountAmount > 0
            ? `<div class="totals-row"><span>Discount</span><span>-₱${discountAmount.toFixed(
                2
              )}</span></div>`
            : "";
        const paymentsSectionHtml = hasPayments
          ? `<div class="section-title">Payments</div><div class="payments">${paymentsHtml}</div>`
          : "";

        const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Receipt</title>
<style>
  *{box-sizing:border-box;}
  body{
    font-family: system-ui,-apple-system,BlinkMacSystemFont,"SF Pro Text",sans-serif;
    max-width: 320px;
    margin: 0 auto;
    padding: 12px;
    font-size: 12px;
    color: #111;
    background: #fff;
  }
  .receipt-header{
    text-align: center;
    margin-bottom: 8px;
  }
  .receipt-header .name{
    font-weight: 600;
    letter-spacing: 0.08em;
    font-size: 13px;
    text-transform: uppercase;
  }
  .receipt-header .meta{
    font-size: 11px;
    color: #555;
    margin-top: 2px;
  }
  .section-title{
    margin: 8px 0 4px;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #555;
  }
  .divider{
    border-top: 1px dashed #ccc;
    margin: 4px 0;
  }
  .line-items{
    padding: 4px 0;
  }
  .item-row{
    display: flex;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 4px;
  }
  .item-main{
    flex: 1;
    min-width: 0;
  }
  .item-name{
    font-weight: 500;
    word-break: break-word;
  }
  .item-meta{
    font-size: 11px;
    color: #666;
    margin-top: 1px;
  }
  .item-amount{
    white-space: nowrap;
    text-align: right;
  }
  .totals{
    margin-top: 4px;
  }
  .totals-row{
    display: flex;
    justify-content: space-between;
    margin-top: 2px;
  }
  .totals-row.total{
    font-weight: 600;
    border-top: 1px solid #000;
    padding-top: 4px;
    margin-top: 4px;
  }
  .payments{
    margin-top: 8px;
  }
  .payment-row{
    display: flex;
    justify-content: space-between;
    margin-top: 2px;
  }
  .footer{
    margin-top: 12px;
    text-align: center;
    font-size: 11px;
    color: #555;
  }
</style></head><body>
<div class="receipt-header">
  <div class="name">FG Homes</div>
  <div class="meta">Official Receipt</div>
  <div class="meta">Sale #${escapeHtml(s.id.slice(0, 8))}</div>
  <div class="meta">${escapeHtml(date)}</div>
</div>
<div class="divider"></div>
<div class="section-title">Items</div>
<div class="line-items">
  ${linesHtml}
</div>
<div class="divider"></div>
<div class="totals">
  <div class="totals-row"><span>Subtotal</span><span>₱${Number(s.subtotal).toFixed(2)}</span></div>
  ${discountRowHtml}
  <div class="totals-row total"><span>Total</span><span>₱${Number(s.total).toFixed(2)}</span></div>
</div>
${paymentsSectionHtml}
<div class="footer">
  Thank you for your purchase.
</div>
</body></html>`;
        w.document.open();
        w.document.write(html);
        w.document.close();
        w.focus();
        // Short delay so the receipt renders before the print dialog opens
        setTimeout(() => {
          w.print();
          w.onafterprint = () => w.close();
          // Fallback close if onafterprint is not fired (e.g. user cancels)
          setTimeout(() => {
            try {
              if (!w.closed) w.close();
            } catch {
              // ignore
            }
          }, 1000);
        }, 150);
      } catch (err) {
        w.document.open();
        w.document.write(
          `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Error</title></head><body style="font-family:system-ui;padding:2rem;">Failed to load receipt: ${escapeHtml(getErrorMessage(err))}</body></html>`
        );
        w.document.close();
      }
    })();
  };

  const { data: heldSalesData } = useQuery({
    queryKey: [...SALES_QUERY_KEY, { status: "held", limit: 10 }],
    queryFn: () => fetchSales({ status: "held", limit: 10 }),
    enabled: canWrite,
  });
  const { data: recentCompletedData } = useQuery({
    queryKey: [...SALES_QUERY_KEY, { status: "completed", limit: 5 }],
    queryFn: () => fetchSales({ status: "completed", limit: 5 }),
    enabled: canWrite,
  });
  const heldSales = heldSalesData?.data ?? [];
  const recentCompleted = recentCompletedData?.data ?? [];

  if (completedMessage) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Card className="w-full max-w-sm">
          <CardContent className="pt-6 space-y-4">
            <p className="text-center text-muted-foreground">{completedMessage}</p>
            <div className="flex flex-col gap-2">
              {lastCompletedSaleId && (
                <Button variant="outline" onClick={handlePrintReceipt}>
                  Print receipt
                </Button>
              )}
              <Button
                className="w-full"
                onClick={handleNewSale}
                disabled={createSaleMutation.isPending}
              >
                {createSaleMutation.isPending ? "Creating…" : "New sale"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-8rem)] min-h-[500px] gap-4">
      {/* Items — product catalog */}
      <div className="flex flex-1 flex-col min-w-0 rounded-xl border border-border bg-card overflow-hidden">
        <div className="shrink-0 border-b border-border px-4 py-3">
          <h2 className="text-lg font-semibold text-primary">Items</h2>
          <div className="mt-2 flex items-center gap-2">
            <div className="relative flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                <SearchIcon />
              </span>
              <Input
                placeholder="Search products…"
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                className="pl-9 h-10"
              />
            </div>
          </div>
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            <button
              type="button"
              onClick={() => setCategoryFilter("all")}
              className={cn(
                "shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
                categoryFilter === "all"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              )}
            >
              All
            </button>
            {categories.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategoryFilter(cat)}
                className={cn(
                  "shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
                  categoryFilter === cat
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                )}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {!currentSaleId ? (
            <p className="text-muted-foreground text-sm">Starting new sale…</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {filteredProducts.map((p) => (
                <div
                  key={p.id}
                  className="flex flex-col rounded-lg border border-border bg-background p-3 shadow-sm transition-shadow hover:shadow-md"
                >
                  <ProductPlaceholder name={p.name} />
                  <p className="mt-2 line-clamp-2 text-sm font-medium text-foreground">{p.name}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {p.quantity} {p.unit} in stock
                  </p>
                  <p className="mt-0.5 text-sm font-semibold text-primary">
                    {p.listPrice != null && p.listPrice !== ""
                      ? `₱${Number(p.listPrice).toFixed(2)}`
                      : "—"}
                  </p>
                  <Button
                    size="icon"
                    className="mt-2 h-10 w-10 shrink-0 rounded-full self-end"
                    disabled={!canWrite || p.archived === 1 || addLineMutation.isPending}
                    onClick={() => handleAddToCart(p.id, p.listPrice)}
                    aria-label={`Add ${p.name}`}
                  >
                    <AddIcon />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Current Order */}
      <div className="flex w-full max-w-md flex-col shrink-0 rounded-xl border border-border bg-card overflow-hidden">
        <div className="shrink-0 border-b border-border px-4 py-3">
          <h2 className="text-lg font-semibold text-primary">Current Order</h2>
          {sale && (
            <p className="text-xs text-muted-foreground mt-0.5">
              #{sale.id.slice(0, 8)} · {sale.status}
            </p>
          )}
        </div>

        <div className="flex-1 overflow-y-auto flex flex-col">
          {saleLoading || !sale ? (
            <p className="p-4 text-muted-foreground text-sm">Loading…</p>
          ) : (
            <>
              <div className="flex-1 p-4 space-y-3">
                {lines.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-6 text-center">
                    Cart is empty. Add items from the left.
                  </p>
                ) : (
                  lines.map((line) => {
                    const lineTotal =
                      line.quantity * Number(line.unitPrice) - Number(line.lineDiscountAmount ?? 0);
                    return (
                      <div
                        key={line.id}
                        className="flex items-center gap-3 rounded-lg border border-border bg-background p-3"
                      >
                        <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-muted flex items-center justify-center text-lg font-semibold text-muted-foreground">
                          {line.productName.charAt(0)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{line.productName}</p>
                          <p className="text-sm font-semibold text-primary">
                            ₱{Number(line.unitPrice).toFixed(2)}
                          </p>
                        </div>
                        {canWrite && isDraft ? (
                          <div className="flex items-center gap-1 shrink-0">
                            <Button
                              size="icon"
                              variant="outline"
                              className="h-8 w-8"
                              disabled={
                                updateLineMutation.isPending || removeLineMutation.isPending
                              }
                              onClick={() => handleQuantityChange(line, -1)}
                              aria-label="Decrease quantity"
                            >
                              −
                            </Button>
                            <span className="min-w-[2rem] text-center text-sm font-medium">
                              {line.quantity}
                            </span>
                            <Button
                              size="icon"
                              variant="outline"
                              className="h-8 w-8"
                              disabled={updateLineMutation.isPending}
                              onClick={() => handleQuantityChange(line, 1)}
                              aria-label="Increase quantity"
                            >
                              +
                            </Button>
                          </div>
                        ) : (
                          <span className="text-sm font-medium">×{line.quantity}</span>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              {/* Summary */}
              <div className="shrink-0 border-t border-border p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>₱{Number(sale.subtotal).toFixed(2)}</span>
                </div>
                {Number(sale.discountAmount) > 0 && (
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>Discount</span>
                    <span>
                      −₱{Number(sale.discountAmount).toFixed(2)}
                      {sale.discountType === "percent" ? ` (${sale.discountAmount}%)` : ""}
                    </span>
                  </div>
                )}
                <div className="flex justify-between font-semibold pt-2">
                  <span>Total</span>
                  <span className="text-primary">₱{Number(sale.total).toFixed(2)}</span>
                </div>
                {(sale as SaleDetail).payments?.length > 0 && (
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>Paid</span>
                    <span>₱{paymentTotal.toFixed(2)}</span>
                  </div>
                )}

                {isDraft && canWrite && (
                  <>
                    <div className="flex flex-wrap items-center gap-2 pt-2">
                      <Input
                        type="number"
                        min={0}
                        step={0.01}
                        placeholder="Discount"
                        value={saleDiscountAmount}
                        onChange={(e) => setSaleDiscountAmount(e.target.value)}
                        className="h-9 w-24"
                      />
                      <select
                        value={saleDiscountType}
                        onChange={(e) => setSaleDiscountType(e.target.value as "percent" | "fixed")}
                        className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                      >
                        <option value="fixed">₱</option>
                        <option value="percent">%</option>
                      </select>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={handleApplyDiscount}
                        disabled={discountMutation.isPending}
                      >
                        Apply
                      </Button>
                    </div>

                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full text-muted-foreground"
                      onClick={() => setShowPaymentSection(!showPaymentSection)}
                    >
                      {showPaymentSection ? "Hide payment" : "Add payment"}
                    </Button>
                    {showPaymentSection && (
                      <div className="space-y-3 rounded-lg border border-border p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <select
                            value={paymentMethod}
                            onChange={(e) => {
                              setPaymentMethod(e.target.value as PaymentMethodValue);
                              setPaymentReference("");
                            }}
                            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                          >
                            {PAYMENT_OPTIONS.map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                          <Input
                            type="number"
                            min={0.01}
                            step={0.01}
                            placeholder="Amount"
                            value={paymentAmount}
                            onChange={(e) => setPaymentAmount(e.target.value)}
                            className="h-9 w-28"
                          />
                        </div>
                        {requiresReference && (
                          <div>
                            <label className="text-xs font-medium text-foreground">
                              Reference # <span className="text-destructive">*</span>
                            </label>
                            <Input
                              type="text"
                              placeholder="Transaction / reference number"
                              value={paymentReference}
                              onChange={(e) => setPaymentReference(e.target.value)}
                              className="mt-1 h-9"
                            />
                          </div>
                        )}
                        <Button
                          size="sm"
                          onClick={handleAddPayment}
                          disabled={addPaymentMutation.isPending || !canAddPayment}
                        >
                          Add
                        </Button>
                      </div>
                    )}
                  </>
                )}

                {canWrite && isDraft && (
                  <div className="mt-3 space-y-3">
                    {/* For Delivery checkbox */}
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={forDelivery}
                        onChange={(e) => setForDelivery(e.target.checked)}
                        className="h-4 w-4 rounded border-gray-300"
                      />
                      <span className="text-sm font-medium">For Delivery</span>
                    </label>

                    {/* Info message when For Delivery is checked */}
                    {forDelivery && (
                      <div className="rounded-lg border border-border p-3 bg-muted/30">
                        <p className="text-xs text-muted-foreground">
                          A draft delivery will be created. Customer information can be added later
                          in the Deliveries module.
                        </p>
                      </div>
                    )}

                    {/* Action buttons */}
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        className="flex-1"
                        disabled={holdMutation.isPending || lines.length === 0}
                        onClick={() => holdMutation.mutate(currentSaleId!)}
                      >
                        {holdMutation.isPending ? "Holding…" : "Hold"}
                      </Button>
                      <Button
                        className="flex-1 h-12 text-base font-semibold"
                        disabled={!canComplete || completeMutation.isPending}
                        onClick={handleComplete}
                      >
                        {completeMutation.isPending
                          ? "Completing…"
                          : paymentTotal < total && total > 0
                            ? `Complete · Add ₱${(total - paymentTotal).toFixed(2)}`
                            : "Complete sale"}
                      </Button>
                    </div>
                  </div>
                )}
                {completeMutation.isError && (
                  <p className="text-sm text-destructive mt-2">
                    {getErrorMessage(completeMutation.error)}
                  </p>
                )}
                {canWrite && heldSales.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-border">
                    <button
                      type="button"
                      className="text-sm font-medium text-primary"
                      onClick={() => setShowHeldCarts(!showHeldCarts)}
                    >
                      {showHeldCarts ? "Hide" : "Show"} held carts ({heldSales.length})
                    </button>
                    {showHeldCarts && (
                      <div className="mt-2 space-y-1">
                        {heldSales.map((s) => (
                          <div
                            key={s.id}
                            className="flex items-center justify-between rounded border border-border px-2 py-1.5 text-sm"
                          >
                            <span className="text-muted-foreground">
                              #{s.id.slice(0, 8)} · ₱{Number(s.total).toFixed(2)}
                            </span>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7"
                              disabled={retrieveMutation.isPending}
                              onClick={() => retrieveMutation.mutate(s.id)}
                            >
                              Retrieve
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {canWrite && recentCompleted.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-border">
                    <p className="text-xs font-medium text-muted-foreground mb-2">Recent sales</p>
                    <div className="space-y-1">
                      {recentCompleted.map((s) => (
                        <div
                          key={s.id}
                          className="flex items-center justify-between rounded border border-border px-2 py-1.5 text-sm"
                        >
                          <span>
                            #{s.id.slice(0, 8)} · ₱{Number(s.total).toFixed(2)}
                          </span>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-destructive hover:text-destructive"
                            disabled={voidMutation.isPending}
                            onClick={() => {
                              if (confirm("Void this sale? Stock will be restored.")) {
                                voidMutation.mutate(s.id);
                              }
                            }}
                          >
                            Void
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
