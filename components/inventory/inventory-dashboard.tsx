"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
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
import { PERMISSIONS } from "@/lib/auth/permissions";
import { can, type SessionUser } from "@/lib/auth/permissions";

const PRODUCTS_QUERY_KEY = ["inventory", "products"];
const MOVEMENTS_QUERY_KEY = ["inventory", "movements"];

type Tab = "products" | "movements";

export function InventoryDashboard({ user }: { user: SessionUser | null }) {
  const canWrite = user ? can(user, PERMISSIONS.INVENTORY_WRITE) : false;
  const [tab, setTab] = useState<Tab>("products");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState<"name" | "sku">("name");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [productDialog, setProductDialog] = useState<"create" | ProductListItem | null>(null);
  const [movementDialog, setMovementDialog] = useState<ProductListItem | null>(null);
  const [movementsPage, setMovementsPage] = useState(1);

  const queryClient = useQueryClient();

  const { data: productsData, isLoading: productsLoading } = useQuery({
    queryKey: [...PRODUCTS_QUERY_KEY, { search, page, sortBy, sortOrder }],
    queryFn: () =>
      fetchProducts({
        search: search || undefined,
        page,
        limit: 20,
        sortBy,
        sortOrder,
      }),
  });

  const { data: movementsData, isLoading: movementsLoading } = useQuery({
    queryKey: [...MOVEMENTS_QUERY_KEY, { page: movementsPage }],
    queryFn: () => fetchMovements({ page: movementsPage, limit: 20 }),
  });

  const products = productsData?.data ?? [];
  const totalProducts = productsData?.total ?? 0;
  const lowStockCount = products.filter((p) => p.lowStock).length;
  const movements = movementsData?.data ?? [];
  const totalMovements = movementsData?.total ?? 0;

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
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold">Inventory</h1>
        {canWrite && <Button onClick={() => setProductDialog("create")}>Add product</Button>}
      </div>

      {lowStockCount > 0 && (
        <Card className="border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Low stock</CardTitle>
          </CardHeader>
          <CardContent>
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

      <div className="flex gap-2 border-b">
        <Button
          variant={tab === "products" ? "secondary" : "ghost"}
          size="sm"
          onClick={() => setTab("products")}
        >
          Products
        </Button>
        <Button
          variant={tab === "movements" ? "secondary" : "ghost"}
          size="sm"
          onClick={() => setTab("movements")}
        >
          Movement history
        </Button>
      </div>

      {tab === "products" && (
        <Card>
          <CardHeader className="pb-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <Input
                placeholder="Search by name, SKU, category..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="max-w-sm"
              />
              <div className="flex gap-2">
                <select
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as "name" | "sku")}
                >
                  <option value="name">Sort by name</option>
                  <option value="sku">Sort by SKU</option>
                </select>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSortOrder((o) => (o === "asc" ? "desc" : "asc"))}
                >
                  {sortOrder === "asc" ? "↑" : "↓"}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {productsLoading ? (
              <p className="text-muted-foreground">Loading…</p>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>SKU</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Unit</TableHead>
                      <TableHead className="text-right">Quantity</TableHead>
                      <TableHead className="text-right">Reorder</TableHead>
                      {canWrite && <TableHead className="w-[120px]" />}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {products.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell className="font-medium">{p.name}</TableCell>
                        <TableCell>{p.sku}</TableCell>
                        <TableCell>{p.category ?? "—"}</TableCell>
                        <TableCell>{p.unit}</TableCell>
                        <TableCell className="text-right">
                          <span className={p.lowStock ? "font-medium text-amber-600" : ""}>
                            {p.quantity}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">{p.reorderLevel}</TableCell>
                        {canWrite && (
                          <TableCell className="flex gap-1">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setMovementDialog(p)}
                            >
                              Stock
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => setProductDialog(p)}>
                              Edit
                            </Button>
                            {!p.archived && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-destructive"
                                onClick={() => {
                                  if (
                                    confirm(`Archive "${p.name}"? You can filter archived later.`)
                                  )
                                    archiveProductMutation.mutate(p.id);
                                }}
                              >
                                Archive
                              </Button>
                            )}
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {totalProducts > 20 && (
                  <div className="mt-4 flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">
                      Page {page} of {Math.ceil(totalProducts / 20)}
                    </p>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={page <= 1}
                        onClick={() => setPage((p) => p - 1)}
                      >
                        Previous
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={page >= Math.ceil(totalProducts / 20)}
                        onClick={() => setPage((p) => p + 1)}
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}

      {tab === "movements" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent movements</CardTitle>
          </CardHeader>
          <CardContent>
            {movementsLoading ? (
              <p className="text-muted-foreground">Loading…</p>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead>Reference</TableHead>
                      <TableHead>Note</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {movements.map((m) => (
                      <TableRow key={m.id}>
                        <TableCell className="text-muted-foreground">
                          {new Date(m.createdAt).toLocaleString()}
                        </TableCell>
                        <TableCell>
                          {m.productName} ({m.productSku})
                        </TableCell>
                        <TableCell>{m.type}</TableCell>
                        <TableCell className="text-right">
                          {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
                        </TableCell>
                        <TableCell>{m.reference ?? "—"}</TableCell>
                        <TableCell>{m.note ?? "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {totalMovements > 20 && (
                  <div className="mt-4 flex justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={movementsPage <= 1}
                      onClick={() => setMovementsPage((p) => p - 1)}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={movementsPage >= Math.ceil(totalMovements / 20)}
                      onClick={() => setMovementsPage((p) => p + 1)}
                    >
                      Next
                    </Button>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}

      {productDialog !== null && (
        <ProductFormDialog
          product={productDialog === "create" ? null : productDialog}
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
          onClose={() => setMovementDialog(null)}
          onSubmit={(body) => createMovementMutation.mutate(body)}
          isSubmitting={createMovementMutation.isPending}
        />
      )}
    </div>
  );
}

function ProductFormDialog({
  product,
  onClose,
  onSubmit,
  isSubmitting,
}: {
  product: ProductListItem | null;
  onClose: () => void;
  onSubmit: (body: ProductFormValues) => void;
  isSubmitting: boolean;
}) {
  const [name, setName] = useState(product?.name ?? "");
  const [sku, setSku] = useState(product?.sku ?? "");
  const [category, setCategory] = useState(product?.category ?? "");
  const [unit, setUnit] = useState(product?.unit ?? "pcs");
  const [reorderLevel, setReorderLevel] = useState(String(product?.reorderLevel ?? 0));

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <Card className="w-full max-w-md">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>{product ? "Edit product" : "New product"}</CardTitle>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </CardHeader>
        <CardContent>
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
              <Input id="category" value={category} onChange={(e) => setCategory(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="unit">Unit</Label>
              <Input
                id="unit"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder="pcs, kg, bag..."
                required
              />
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
            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {product ? "Save" : "Create"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function MovementFormDialog({
  product,
  onClose,
  onSubmit,
  isSubmitting,
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <Card className="w-full max-w-md">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Stock movement — {product.name}</CardTitle>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-sm text-muted-foreground">
            Current stock: {product.quantity} {product.unit}
          </p>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>Type</Label>
              <select
                className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={type}
                onChange={(e) => setType(e.target.value as "in" | "out" | "adjustment")}
              >
                <option value="in">In (receive)</option>
                <option value="out">Out (dispatch)</option>
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
            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                Record
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
