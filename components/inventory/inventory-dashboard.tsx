"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect, useCallback } from "react";
import {
  fetchProducts,
  fetchMovements,
  createProduct,
  updateProduct,
  archiveProduct,
  createMovement,
  type ProductListItem,
} from "@/lib/inventory-api";
import type { ProductFormValues } from "@/schemas/inventory";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getErrorMessage } from "@/lib/errors";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { can, type SessionUser } from "@/lib/auth/permissions";

const PRODUCTS_QUERY_KEY = ["inventory", "products"];
const MOVEMENTS_QUERY_KEY = ["inventory", "movements"];

type Tab = "products" | "movements";

type ProductSortBy = "name" | "sku" | "category" | "reorderLevel" | "createdAt";
type MovementSortBy = "createdAt" | "type" | "quantity" | "productName";

const PAGE_SIZE_OPTIONS = [10, 20, 50] as const;

function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export function InventoryDashboard({ user }: { user: SessionUser | null }) {
  const canWrite = user ? can(user, PERMISSIONS.INVENTORY_WRITE) : false;
  const [tab, setTab] = useState<Tab>("products");
  const [productSearch, setProductSearch] = useState("");
  const [productPage, setProductPage] = useState(1);
  const [productLimit, setProductLimit] = useState(20);
  const [productSortBy, setProductSortBy] = useState<ProductSortBy>("name");
  const [productSortOrder, setProductSortOrder] = useState<"asc" | "desc">("asc");
  const [productArchived, setProductArchived] = useState<"all" | "active" | "archived">("active");
  const [productCategory, setProductCategory] = useState("");
  const [movementSearch, setMovementSearch] = useState("");
  const [movementPage, setMovementPage] = useState(1);
  const [movementLimit, setMovementLimit] = useState(20);
  const [movementType, setMovementType] = useState<"all" | "in" | "out" | "adjustment">("all");
  const [movementSortBy, setMovementSortBy] = useState<MovementSortBy>("createdAt");
  const [movementSortOrder, setMovementSortOrder] = useState<"asc" | "desc">("desc");
  const [productDialog, setProductDialog] = useState<"create" | ProductListItem | null>(null);
  const [movementDialog, setMovementDialog] = useState<ProductListItem | null>(null);

  const debouncedProductSearch = useDebouncedValue(productSearch, 300);
  const debouncedMovementSearch = useDebouncedValue(movementSearch, 300);

  const queryClient = useQueryClient();

  const { data: productsData, isLoading: productsLoading } = useQuery({
    queryKey: [
      ...PRODUCTS_QUERY_KEY,
      {
        search: debouncedProductSearch,
        page: productPage,
        limit: productLimit,
        sortBy: productSortBy,
        sortOrder: productSortOrder,
        archived:
          productArchived === "archived" ? true : productArchived === "active" ? false : undefined,
        category: productCategory.trim() || undefined,
      },
    ],
    queryFn: () =>
      fetchProducts({
        search: debouncedProductSearch.trim() || undefined,
        page: productPage,
        limit: productLimit,
        sortBy: productSortBy,
        sortOrder: productSortOrder,
        archived:
          productArchived === "archived" ? true : productArchived === "active" ? false : undefined,
        category: productCategory.trim() || undefined,
      }),
  });

  const { data: categoriesData } = useQuery({
    queryKey: ["settings", "categories"],
    queryFn: async () => {
      const res = await fetch("/api/settings/categories");
      if (!res.ok) return [];
      const json = await res.json();
      return (json.data ?? []) as { id: string; name: string }[];
    },
    retry: false,
    staleTime: 60_000,
  });
  const { data: unitsData } = useQuery({
    queryKey: ["settings", "units"],
    queryFn: async () => {
      const res = await fetch("/api/settings/units");
      if (!res.ok) return [];
      const json = await res.json();
      return (json.data ?? []) as { id: string; name: string }[];
    },
    retry: false,
    staleTime: 60_000,
  });
  const categories = categoriesData?.map((c) => c.name) ?? [];
  const units = unitsData?.map((u) => u.name) ?? [];

  const { data: movementsData, isLoading: movementsLoading } = useQuery({
    queryKey: [
      ...MOVEMENTS_QUERY_KEY,
      {
        search: debouncedMovementSearch,
        page: movementPage,
        limit: movementLimit,
        type: movementType === "all" ? undefined : movementType,
        sortBy: movementSortBy,
        sortOrder: movementSortOrder,
      },
    ],
    queryFn: () =>
      fetchMovements({
        search: debouncedMovementSearch.trim() || undefined,
        page: movementPage,
        limit: movementLimit,
        type: movementType === "all" ? undefined : movementType,
        sortBy: movementSortBy,
        sortOrder: movementSortOrder,
      }),
  });

  const products = productsData?.data ?? [];
  const totalProducts = productsData?.total ?? 0;
  const totalProductPages = Math.ceil(totalProducts / productLimit) || 1;
  const lowStockCount = products.filter((p) => p.lowStock).length;
  const movements = movementsData?.data ?? [];
  const totalMovements = movementsData?.total ?? 0;
  const totalMovementPages = Math.ceil(totalMovements / movementLimit) || 1;

  const handleProductSort = useCallback((column: ProductSortBy) => {
    setProductSortBy((prev) => {
      if (prev === column) {
        setProductSortOrder((o) => (o === "asc" ? "desc" : "asc"));
        return prev;
      }
      setProductSortOrder("asc");
      return column;
    });
    setProductPage(1);
  }, []);

  const handleMovementSort = useCallback((column: MovementSortBy) => {
    setMovementSortBy((prev) => {
      if (prev === column) {
        setMovementSortOrder((o) => (o === "asc" ? "desc" : "asc"));
        return prev;
      }
      setMovementSortOrder(column === "createdAt" ? "desc" : "asc");
      return column;
    });
    setMovementPage(1);
  }, []);

  const createProductMutation = useMutation({
    mutationFn: createProduct,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PRODUCTS_QUERY_KEY });
      setProductDialog(null);
    },
  });

  const updateProductMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: ProductFormValues }) => updateProduct(id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PRODUCTS_QUERY_KEY });
      setProductDialog(null);
    },
  });

  const archiveProductMutation = useMutation({
    mutationFn: archiveProduct,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PRODUCTS_QUERY_KEY });
      setProductDialog(null);
    },
  });

  const createMovementMutation = useMutation({
    mutationFn: createMovement,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PRODUCTS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: MOVEMENTS_QUERY_KEY });
      setMovementDialog(null);
    },
  });

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-semibold sm:text-2xl">Inventory</h1>
        {canWrite && (
          <Button
            onClick={() => setProductDialog("create")}
            className="w-full min-h-11 touch-manipulation sm:w-auto sm:min-h-0"
          >
            Add product
          </Button>
        )}
      </div>

      {lowStockCount > 0 && (
        <Card className="border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30">
          <CardHeader className="pb-2 p-4 sm:p-6">
            <CardTitle className="text-base">Low stock</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
            <p className="text-sm text-muted-foreground">
              {lowStockCount} product{lowStockCount !== 1 ? "s" : ""} at or below reorder level.
            </p>
            <ul className="mt-2 list-inside list-disc text-sm">
              {products
                .filter((p) => p.lowStock)
                .slice(0, 5)
                .map((p) => (
                  <li key={p.id}>
                    {p.name} ({p.sku}) — {p.quantity} {p.unit}
                  </li>
                ))}
              {lowStockCount > 5 && (
                <li className="text-muted-foreground">and {lowStockCount - 5} more</li>
              )}
            </ul>
          </CardContent>
        </Card>
      )}

      <div className="border-b border-border overflow-x-auto">
        <div className="flex gap-0 min-w-0" role="tablist" aria-label="Inventory sections">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "products"}
            className={`min-h-11 touch-manipulation flex-shrink-0 rounded-t-md border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              tab === "products"
                ? "border-primary bg-muted/50 text-foreground"
                : "border-transparent text-muted-foreground hover:bg-muted/30 hover:text-foreground"
            }`}
            onClick={() => setTab("products")}
          >
            Products
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "movements"}
            className={`min-h-11 touch-manipulation flex-shrink-0 rounded-t-md border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              tab === "movements"
                ? "border-primary bg-muted/50 text-foreground"
                : "border-transparent text-muted-foreground hover:bg-muted/30 hover:text-foreground"
            }`}
            onClick={() => setTab("movements")}
          >
            Movement history
          </button>
        </div>
      </div>

      {tab === "products" && (
        <Card>
          <CardHeader className="pb-4 p-4 sm:p-6">
            <div className="space-y-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:flex-wrap">
                <Input
                  placeholder="Search by name, SKU, category..."
                  value={productSearch}
                  onChange={(e) => {
                    setProductSearch(e.target.value);
                    setProductPage(1);
                  }}
                  className="w-full min-h-11 touch-manipulation sm:max-w-xs sm:min-h-0"
                  aria-label="Search products"
                />
                <div className="flex flex-wrap gap-2">
                  <select
                    className="input-select w-full min-h-11 touch-manipulation sm:w-auto sm:min-w-[8rem] sm:min-h-0"
                    value={productArchived}
                    onChange={(e) => {
                      setProductArchived(e.target.value as "all" | "active" | "archived");
                      setProductPage(1);
                    }}
                    aria-label="Filter by status"
                  >
                    <option value="active">Active</option>
                    <option value="archived">Archived</option>
                    <option value="all">All</option>
                  </select>
                  <select
                    className="input-select w-full min-h-11 touch-manipulation sm:w-auto sm:min-w-[10rem] sm:min-h-0"
                    value={productCategory}
                    onChange={(e) => {
                      setProductCategory(e.target.value);
                      setProductPage(1);
                    }}
                    aria-label="Filter by category"
                  >
                    <option value="">All categories</option>
                    {categories.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                    {productCategory.trim() && !categories.includes(productCategory) && (
                      <option value={productCategory}>{productCategory}</option>
                    )}
                  </select>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
            {productsLoading ? (
              <p className="text-muted-foreground">Loading…</p>
            ) : (
              <>
                <div className="overflow-x-auto rounded-md border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>
                          <SortableHeader
                            label="Name"
                            currentSort={productSortBy}
                            sortKey="name"
                            order={productSortOrder}
                            onSort={() => handleProductSort("name")}
                          />
                        </TableHead>
                        <TableHead>
                          <SortableHeader
                            label="SKU"
                            currentSort={productSortBy}
                            sortKey="sku"
                            order={productSortOrder}
                            onSort={() => handleProductSort("sku")}
                          />
                        </TableHead>
                        <TableHead>
                          <SortableHeader
                            label="Category"
                            currentSort={productSortBy}
                            sortKey="category"
                            order={productSortOrder}
                            onSort={() => handleProductSort("category")}
                          />
                        </TableHead>
                        <TableHead>Unit</TableHead>
                        <TableHead className="text-right">Quantity</TableHead>
                        <TableHead className="text-right">
                          <SortableHeader
                            label="Reorder"
                            currentSort={productSortBy}
                            sortKey="reorderLevel"
                            order={productSortOrder}
                            onSort={() => handleProductSort("reorderLevel")}
                          />
                        </TableHead>
                        {canWrite && <TableHead className="w-[120px]">Actions</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {products.length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={canWrite ? 7 : 6}
                            className="text-center text-muted-foreground py-8"
                          >
                            No products found.
                          </TableCell>
                        </TableRow>
                      ) : (
                        products.map((p) => (
                          <TableRow key={p.id}>
                            <TableCell className="font-medium">{p.name}</TableCell>
                            <TableCell>{p.sku}</TableCell>
                            <TableCell>{p.category ?? "—"}</TableCell>
                            <TableCell>{p.unit}</TableCell>
                            <TableCell className="text-right">
                              <span
                                className={
                                  p.lowStock ? "font-medium text-amber-600 dark:text-amber-400" : ""
                                }
                              >
                                {p.quantity}
                              </span>
                            </TableCell>
                            <TableCell className="text-right">{p.reorderLevel}</TableCell>
                            {canWrite && (
                              <TableCell className="whitespace-nowrap">
                                <div className="flex flex-wrap gap-1">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setMovementDialog(p)}
                                  >
                                    Stock
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setProductDialog(p)}
                                  >
                                    Edit
                                  </Button>
                                  {!p.archived && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="text-destructive"
                                      onClick={() => {
                                        if (
                                          confirm(
                                            `Archive "${p.name}"? You can filter archived later.`
                                          )
                                        )
                                          archiveProductMutation.mutate(p.id);
                                      }}
                                    >
                                      Archive
                                    </Button>
                                  )}
                                </div>
                              </TableCell>
                            )}
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
                <TablePagination
                  page={productPage}
                  totalPages={totalProductPages}
                  totalItems={totalProducts}
                  limit={productLimit}
                  limitOptions={PAGE_SIZE_OPTIONS}
                  onPageChange={setProductPage}
                  onLimitChange={(l) => {
                    setProductLimit(l);
                    setProductPage(1);
                  }}
                />
              </>
            )}
          </CardContent>
        </Card>
      )}

      {tab === "movements" && (
        <Card>
          <CardHeader className="pb-4 p-4 sm:p-6">
            <div className="space-y-3">
              <CardTitle className="text-base">Movement history</CardTitle>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:flex-wrap">
                <Input
                  placeholder="Search by product name or SKU..."
                  value={movementSearch}
                  onChange={(e) => {
                    setMovementSearch(e.target.value);
                    setMovementPage(1);
                  }}
                  className="w-full min-h-11 touch-manipulation sm:max-w-xs sm:min-h-0"
                  aria-label="Search movements"
                />
                <select
                  className="input-select w-full min-h-11 touch-manipulation sm:w-auto sm:min-w-[8rem] sm:min-h-0"
                  value={movementType}
                  onChange={(e) => {
                    setMovementType(e.target.value as "all" | "in" | "out" | "adjustment");
                    setMovementPage(1);
                  }}
                  aria-label="Filter by type"
                >
                  <option value="all">All types</option>
                  <option value="in">Received</option>
                  <option value="out">Out</option>
                  <option value="adjustment">Adjustment</option>
                </select>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
            {movementsLoading ? (
              <p className="text-muted-foreground">Loading…</p>
            ) : (
              <>
                <div className="overflow-x-auto rounded-md border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>
                          <SortableHeader
                            label="Date"
                            currentSort={movementSortBy}
                            sortKey="createdAt"
                            order={movementSortOrder}
                            onSort={() => handleMovementSort("createdAt")}
                          />
                        </TableHead>
                        <TableHead>
                          <SortableHeader
                            label="Product"
                            currentSort={movementSortBy}
                            sortKey="productName"
                            order={movementSortOrder}
                            onSort={() => handleMovementSort("productName")}
                          />
                        </TableHead>
                        <TableHead>
                          <SortableHeader
                            label="Type"
                            currentSort={movementSortBy}
                            sortKey="type"
                            order={movementSortOrder}
                            onSort={() => handleMovementSort("type")}
                          />
                        </TableHead>
                        <TableHead className="text-right">
                          <SortableHeader
                            label="Qty"
                            currentSort={movementSortBy}
                            sortKey="quantity"
                            order={movementSortOrder}
                            onSort={() => handleMovementSort("quantity")}
                            className="justify-end"
                          />
                        </TableHead>
                        <TableHead>Reference</TableHead>
                        <TableHead>Note</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {movements.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                            No movements found.
                          </TableCell>
                        </TableRow>
                      ) : (
                        movements.map((m) => (
                          <TableRow key={m.id}>
                            <TableCell className="text-muted-foreground whitespace-nowrap">
                              {new Date(m.createdAt).toLocaleString()}
                            </TableCell>
                            <TableCell>
                              {m.productName} ({m.productSku})
                            </TableCell>
                            <TableCell>
                              {MOVEMENT_TYPE_LABELS[m.type as keyof typeof MOVEMENT_TYPE_LABELS] ??
                                m.type}
                            </TableCell>
                            <TableCell className="text-right">
                              {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
                            </TableCell>
                            <TableCell>{m.reference ?? "—"}</TableCell>
                            <TableCell>{m.note ?? "—"}</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
                <TablePagination
                  page={movementPage}
                  totalPages={totalMovementPages}
                  totalItems={totalMovements}
                  limit={movementLimit}
                  limitOptions={PAGE_SIZE_OPTIONS}
                  onPageChange={setMovementPage}
                  onLimitChange={(l) => {
                    setMovementLimit(l);
                    setMovementPage(1);
                  }}
                />
              </>
            )}
          </CardContent>
        </Card>
      )}

      {productDialog !== null && (
        <ProductFormDialog
          product={productDialog === "create" ? null : productDialog}
          categories={categories}
          units={units}
          onClose={() => setProductDialog(null)}
          onSubmit={(body) => {
            if (productDialog === "create") {
              createProductMutation.mutate(body);
            } else {
              updateProductMutation.mutate({
                id: productDialog.id,
                body,
              });
            }
          }}
          isSubmitting={createProductMutation.isPending || updateProductMutation.isPending}
        />
      )}

      {movementDialog && (
        <MovementFormDialog
          product={movementDialog}
          onClose={() => {
            createMovementMutation.reset();
            setMovementDialog(null);
          }}
          onSubmit={(body) => createMovementMutation.mutate(body)}
          isSubmitting={createMovementMutation.isPending}
          error={
            createMovementMutation.error ? getErrorMessage(createMovementMutation.error) : null
          }
        />
      )}
    </div>
  );
}

function SortableHeader<T extends string>({
  label,
  currentSort,
  sortKey,
  order,
  onSort,
  className,
}: {
  label: string;
  currentSort: T;
  sortKey: T;
  order: "asc" | "desc";
  onSort: () => void;
  className?: string;
}) {
  const isActive = currentSort === sortKey;
  return (
    <button
      type="button"
      onClick={onSort}
      className={`inline-flex items-center gap-1 font-medium hover:text-foreground ${className ?? ""}`}
      aria-sort={isActive ? (order === "asc" ? "ascending" : "descending") : undefined}
    >
      {label}
      {isActive ? (order === "asc" ? " ↑" : " ↓") : ""}
    </button>
  );
}

function TablePagination({
  page,
  totalPages,
  totalItems,
  limit,
  limitOptions,
  onPageChange,
  onLimitChange,
}: {
  page: number;
  totalPages: number;
  totalItems: number;
  limit: number;
  limitOptions: readonly number[];
  onPageChange: (p: number) => void;
  onLimitChange: (l: number) => void;
}) {
  const from = totalItems === 0 ? 0 : (page - 1) * limit + 1;
  const to = Math.min(page * limit, totalItems);

  return (
    <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <span>
          Showing {from}–{to} of {totalItems}
        </span>
        <select
          className="input-select h-8 w-auto min-w-0 py-1 text-xs"
          value={limit}
          onChange={(e) => onLimitChange(Number(e.target.value))}
          aria-label="Rows per page"
        >
          {limitOptions.map((n) => (
            <option key={n} value={n}>
              {n} per page
            </option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="min-h-9"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          Previous
        </Button>
        <span className="text-sm text-muted-foreground">
          Page {page} of {totalPages}
        </span>
        <Button
          variant="outline"
          size="sm"
          className="min-h-9"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}

function ProductFormDialog({
  product,
  categories,
  units,
  onClose,
  onSubmit,
  isSubmitting,
}: {
  product: ProductListItem | null;
  categories: string[];
  units: string[];
  onClose: () => void;
  onSubmit: (body: ProductFormValues) => void;
  isSubmitting: boolean;
}) {
  const [name, setName] = useState(product?.name ?? "");
  const [sku, setSku] = useState(product?.sku ?? "");
  const [category, setCategory] = useState(product?.category ?? "");
  const [unit, setUnit] = useState(product?.unit ?? (units.length > 0 ? units[0] : "pcs"));
  const [reorderLevel, setReorderLevel] = useState(String(product?.reorderLevel ?? 0));
  const categoryOptions: string[] = [
    ...new Set([...categories, product?.category].filter((x): x is string => Boolean(x))),
  ];
  const unitOptions: string[] = [
    ...new Set([...units, product?.unit ?? "pcs"].filter((x): x is string => Boolean(x))),
  ];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      name: name.trim(),
      sku: sku.trim(),
      category: category.trim() || undefined,
      unit: unit.trim(),
      reorderLevel: Math.max(0, parseInt(reorderLevel, 10) || 0),
      archived: product?.archived === 1 ? 1 : 0,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 sm:p-6">
      <Card className="w-full max-w-md max-h-[90vh] flex flex-col shadow-xl">
        <CardHeader className="flex flex-row items-center justify-between shrink-0 p-4 sm:p-6">
          <CardTitle className="text-lg sm:text-xl">
            {product ? "Edit product" : "New product"}
          </CardTitle>
          <Button
            variant="ghost"
            size="icon"
            className="h-11 w-11 touch-manipulation sm:h-9 sm:w-9"
            onClick={onClose}
            aria-label="Close"
          >
            <span className="text-xl font-semibold leading-none sm:text-2xl">×</span>
          </Button>
        </CardHeader>
        <CardContent className="overflow-y-auto p-4 pt-0 sm:p-6 sm:pt-0">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="name">Name</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div>
              <Label htmlFor="sku">SKU</Label>
              <Input
                id="sku"
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                required
                disabled={!!product}
              />
            </div>
            <div>
              <Label htmlFor="category">Category</Label>
              {categoryOptions.length > 0 ? (
                <select
                  id="category"
                  className="input-select mt-2 w-full"
                  value={category ?? ""}
                  onChange={(e) => setCategory(e.target.value)}
                  aria-label="Category"
                >
                  <option value="">—</option>
                  {categoryOptions.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              ) : (
                <Input
                  id="category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="mt-2"
                />
              )}
            </div>
            <div>
              <Label htmlFor="unit">Unit</Label>
              {unitOptions.length > 0 ? (
                <select
                  id="unit"
                  className="input-select mt-2 w-full"
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  required
                  aria-label="Unit"
                >
                  {unitOptions.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              ) : (
                <Input
                  id="unit"
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  placeholder="pcs, kg, bag..."
                  required
                  className="mt-2"
                />
              )}
            </div>
            <div>
              <Label htmlFor="reorderLevel">Reorder level</Label>
              <Input
                id="reorderLevel"
                type="number"
                min={0}
                value={reorderLevel}
                onChange={(e) => setReorderLevel(e.target.value)}
              />
            </div>
            <div className="flex flex-col-reverse gap-2 pt-4 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                className="min-h-11 touch-manipulation sm:min-h-0"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting}
                className="min-h-11 touch-manipulation sm:min-h-0"
              >
                {product ? "Save" : "Create"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

const MOVEMENT_TYPE_LABELS: Record<"in" | "out" | "adjustment", string> = {
  in: "Received",
  out: "Out",
  adjustment: "Adjustment",
};

function MovementFormDialog({
  product,
  onClose,
  onSubmit,
  isSubmitting,
  error,
}: {
  product: ProductListItem;
  onClose: () => void;
  onSubmit: (body: {
    productId: string;
    type: "in" | "out" | "adjustment";
    quantity: number;
    reference?: string;
    note?: string;
  }) => void;
  isSubmitting: boolean;
  error?: string | null;
}) {
  const [type, setType] = useState<"in" | "out" | "adjustment">("in");
  const [quantity, setQuantity] = useState("");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = parseInt(quantity, 10);
    if (Number.isNaN(q)) return;
    if (type !== "adjustment" && q <= 0) return;
    if (type === "adjustment" && q === 0) return;
    const payloadQty = type === "adjustment" ? q : Math.abs(q);
    onSubmit({
      productId: product.id,
      type,
      quantity: payloadQty,
      reference: reference.trim() || undefined,
      note: note.trim() || undefined,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 sm:p-6">
      <Card className="w-full max-w-md max-h-[90vh] flex flex-col shadow-xl">
        <CardHeader className="flex flex-row items-center justify-between shrink-0 p-4 sm:p-6">
          <CardTitle className="text-lg sm:text-xl truncate pr-2">
            Stock movement — {product.name}
          </CardTitle>
          <Button
            variant="ghost"
            size="icon"
            className="h-11 w-11 touch-manipulation shrink-0 sm:h-9 sm:w-9"
            onClick={onClose}
            aria-label="Close"
          >
            <span className="text-xl font-semibold leading-none sm:text-2xl">×</span>
          </Button>
        </CardHeader>
        <CardContent className="overflow-y-auto p-4 pt-0 sm:p-6 sm:pt-0">
          <p className="mb-4 text-sm text-muted-foreground">
            Current stock: {product.quantity} {product.unit}
          </p>
          {error && (
            <p
              className="mb-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
              role="alert"
            >
              {error}
            </p>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>Type</Label>
              <select
                className="input-select mt-2 min-h-11 touch-manipulation sm:min-h-0"
                value={type}
                onChange={(e) => setType(e.target.value as "in" | "out" | "adjustment")}
                aria-label="Movement type"
              >
                <option value="in">Received</option>
                <option value="out">Out</option>
                <option value="adjustment">Adjustment (+ or -)</option>
              </select>
            </div>
            <div>
              <Label htmlFor="qty">
                Quantity {type === "adjustment" ? "(positive or negative)" : ""}
              </Label>
              <Input
                id="qty"
                type="number"
                step={type === "adjustment" ? "1" : "1"}
                min={type === "adjustment" ? undefined : 1}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="ref">Reference</Label>
              <Input
                id="ref"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="PO number, order ID..."
              />
            </div>
            <div>
              <Label htmlFor="note">Note</Label>
              <Input id="note" value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
            <div className="flex flex-col-reverse gap-2 pt-4 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                className="min-h-11 touch-manipulation sm:min-h-0"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting}
                className="min-h-11 touch-manipulation sm:min-h-0"
              >
                Record
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
