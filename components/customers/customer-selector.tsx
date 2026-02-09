"use client";

import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fetchCustomers,
  fetchCustomer,
  createCustomer,
  type CustomerListItem,
} from "@/lib/customers-api";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { CustomerFormValues } from "@/schemas/customers";

const CUSTOMERS_QUERY_KEY = ["customers"];

export interface CustomerSelectorProps {
  /** Selected customer ID */
  value: string | null;
  /** Callback when customer is selected */
  onSelect: (customer: CustomerListItem | null) => void;
  /** Whether to show create button */
  showCreate?: boolean;
  /** Callback when customer is created */
  onCreateSuccess?: (customer: CustomerListItem) => void;
}

/**
 * Customer search and select component with create option.
 * Used in delivery forms to search, select, or create customers.
 */
export function CustomerSelector({
  value,
  onSelect,
  showCreate = true,
  onCreateSuccess,
}: CustomerSelectorProps) {
  const [search, setSearch] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  // Fetch customers for search
  const { data: customersData, isLoading } = useQuery({
    queryKey: [...CUSTOMERS_QUERY_KEY, "search", { search, limit: 10 }],
    queryFn: () => fetchCustomers({ search: search.trim() || undefined, limit: 10, page: 1 }),
    enabled: isOpen && search.trim().length >= 2, // Only search when 2+ characters
  });

  // Fetch selected customer if not in search results
  const { data: selectedCustomerData } = useQuery({
    queryKey: [...CUSTOMERS_QUERY_KEY, value],
    queryFn: () => fetchCustomer(value!),
    enabled: !!value && !customersData?.data?.find((c) => c.id === value),
  });

  const customers = customersData?.data ?? [];
  const selectedCustomer = value
    ? customers.find((c) => c.id === value) || selectedCustomerData?.data || null
    : null;

  const createCustomerMutation = useMutation({
    mutationFn: createCustomer,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: CUSTOMERS_QUERY_KEY });
      setShowCreateForm(false);
      setSearch("");
      setIsOpen(false);
      onSelect(data.data);
      onCreateSuccess?.(data.data);
    },
  });

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setShowCreateForm(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelectCustomer = (customer: CustomerListItem) => {
    onSelect(customer);
    setIsOpen(false);
    setSearch(""); // Clear search but keep selected customer name visible
  };

  const handleCreateCustomer = (formData: CustomerFormValues) => {
    createCustomerMutation.mutate(formData);
  };

  return (
    <div ref={containerRef} className="relative">
      <div>
        <Label htmlFor="customer-search">Customer</Label>
        <div className="relative mt-2">
          <Input
            id="customer-search"
            placeholder="Search or select customer..."
            value={selectedCustomer && !isOpen && !search ? selectedCustomer.name : search}
            onChange={(e) => {
              const newValue = e.target.value;
              setSearch(newValue);
              if (newValue && selectedCustomer) {
                // Clear selection when user starts typing
                onSelect(null);
              }
              setIsOpen(true);
            }}
            onFocus={() => {
              setIsOpen(true);
            }}
            className="pr-10"
          />
          {selectedCustomer && (
            <button
              type="button"
              onClick={() => {
                onSelect(null);
                setSearch("");
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Clear selection"
            >
              ×
            </button>
          )}
        </div>
      </div>

      {/* Dropdown */}
      {isOpen && (
        <Card className="absolute z-50 w-full mt-1 shadow-lg border">
          <CardContent className="p-0">
            {showCreateForm ? (
              <CreateCustomerForm
                onCancel={() => setShowCreateForm(false)}
                onSubmit={handleCreateCustomer}
                isSubmitting={createCustomerMutation.isPending}
                error={createCustomerMutation.error?.message}
              />
            ) : (
              <>
                {isLoading ? (
                  <div className="p-4 text-sm text-muted-foreground">Searching...</div>
                ) : customers.length === 0 && search.trim() ? (
                  <div className="p-4">
                    <div className="text-sm text-muted-foreground mb-2">
                      No customer found for &quot;{search}&quot;
                    </div>
                    {showCreate && (
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => setShowCreateForm(true)}
                        className="w-full"
                      >
                        Create &quot;{search}&quot;
                      </Button>
                    )}
                  </div>
                ) : customers.length > 0 ? (
                  <div className="max-h-60 overflow-y-auto">
                    {customers.map((customer) => (
                      <button
                        key={customer.id}
                        type="button"
                        onClick={() => handleSelectCustomer(customer)}
                        className={`w-full text-left px-4 py-2 hover:bg-muted transition-colors border-b last:border-b-0 ${
                          value === customer.id ? "bg-muted" : ""
                        }`}
                      >
                        <div className="font-medium">{customer.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {customer.address}
                          {customer.phone && ` • ${customer.phone}`}
                        </div>
                      </button>
                    ))}
                  </div>
                ) : search.trim().length < 2 ? (
                  <div className="p-4 text-sm text-muted-foreground">
                    Type at least 2 characters to search customers
                  </div>
                ) : null}
                {showCreate && search.trim() && customers.length === 0 && (
                  <div className="border-t p-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setShowCreateForm(true)}
                      className="w-full"
                    >
                      Create New Customer
                    </Button>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function CreateCustomerForm({
  onCancel,
  onSubmit,
  isSubmitting,
  error,
  initialName,
}: {
  onCancel: () => void;
  onSubmit: (data: CustomerFormValues) => void;
  isSubmitting: boolean;
  error?: string;
  initialName?: string;
}) {
  const [name, setName] = useState(initialName || "");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation(); // Prevent bubbling to parent form
    onSubmit({
      name: name.trim(),
      address: address.trim(),
      phone: phone.trim() || undefined,
      email: email.trim() || undefined,
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.target as HTMLElement).tagName !== "TEXTAREA") {
      e.preventDefault();
      e.stopPropagation();
      if (name.trim() && address.trim()) {
        // Create a synthetic form event for handleSubmit
        const syntheticEvent = {
          ...e,
          preventDefault: () => e.preventDefault(),
          stopPropagation: () => e.stopPropagation(),
          currentTarget: e.currentTarget,
        } as unknown as React.FormEvent<HTMLFormElement>;
        handleSubmit(syntheticEvent);
      }
    }
  };

  return (
    <div className="p-4 space-y-3" onKeyDown={handleKeyDown}>
      {error && (
        <div className="p-2 rounded-md bg-destructive/10 text-destructive text-xs">{error}</div>
      )}
      <div>
        <Label htmlFor="create-name" className="text-xs">
          Name *
        </Label>
        <Input
          id="create-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className="h-9 text-sm"
          autoFocus
        />
      </div>
      <div>
        <Label htmlFor="create-address" className="text-xs">
          Address *
        </Label>
        <Input
          id="create-address"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          required
          className="h-9 text-sm"
        />
      </div>
      <div>
        <Label htmlFor="create-phone" className="text-xs">
          Phone
        </Label>
        <Input
          id="create-phone"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="h-9 text-sm"
        />
      </div>
      <div>
        <Label htmlFor="create-email" className="text-xs">
          Email
        </Label>
        <Input
          id="create-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="h-9 text-sm"
        />
      </div>
      <div className="flex gap-2 pt-1">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onCancel}
          className="flex-1 h-8 text-xs"
        >
          Cancel
        </Button>
        <Button
          type="button"
          disabled={isSubmitting || !name.trim() || !address.trim()}
          onClick={handleSubmit}
          className="flex-1 h-8 text-xs"
        >
          {isSubmitting ? "Creating..." : "Create"}
        </Button>
      </div>
    </div>
  );
}
