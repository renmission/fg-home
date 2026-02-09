"use client";

import { getErrorMessage, parseApiResponse } from "@/lib/errors";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
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

const API = "/api/settings/units";

type Unit = { id: string; name: string; createdAt: string };

async function fetchUnits(): Promise<Unit[]> {
  const res = await fetch(API);
  const json = await parseApiResponse<{ data: Unit[] }>(res, "Failed to load units");
  return json?.data ?? [];
}

async function createUnit(name: string) {
  const res = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: name.trim() }),
  });
  return parseApiResponse<{ data: Unit }>(res, "Failed to create unit");
}

async function updateUnit(id: string, name: string) {
  const res = await fetch(`${API}/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: name.trim() }),
  });
  return parseApiResponse<{ data: Unit }>(res, "Failed to update unit");
}

async function deleteUnit(id: string) {
  const res = await fetch(`${API}/${id}`, { method: "DELETE" });
  return parseApiResponse<{ data: unknown }>(res, "Failed to delete unit");
}

export function SettingsUnitsClient({ canWrite }: { canWrite: boolean }) {
  const queryClient = useQueryClient();
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const { data: units = [], isLoading } = useQuery({
    queryKey: ["settings", "units"],
    queryFn: fetchUnits,
  });

  const createMutation = useMutation({
    mutationFn: createUnit,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings", "units"] });
      setNewName("");
      setAddModalOpen(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => updateUnit(id, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings", "units"] });
      setEditingId(null);
      setEditName("");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteUnit,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings", "units"] });
    },
  });

  const startEdit = (u: Unit) => {
    setEditingId(u.id);
    setEditName(u.name);
  };
  const cancelEdit = () => {
    setEditingId(null);
    setEditName("");
  };
  const saveEdit = () => {
    if (editingId && editName.trim()) updateMutation.mutate({ id: editingId, name: editName });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    createMutation.mutate(newName);
  };

  return (
    <div className="mt-6 space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">All units</CardTitle>
          {canWrite && (
            <Button onClick={() => setAddModalOpen(true)} size="sm">
              Add unit
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-muted-foreground">Loading…</p>
          ) : units.length === 0 ? (
            <p className="text-muted-foreground">No units yet. Add one using the button above.</p>
          ) : (
            <>
              <div className="overflow-x-auto rounded-md border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      {canWrite && <TableHead className="w-[140px]">Actions</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {units.map((u) => (
                      <TableRow key={u.id}>
                        <TableCell className="font-medium">
                          {editingId === u.id ? (
                            <Input
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              className="max-w-xs"
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === "Enter") saveEdit();
                                if (e.key === "Escape") cancelEdit();
                              }}
                            />
                          ) : (
                            u.name
                          )}
                        </TableCell>
                        {canWrite && (
                          <TableCell className="whitespace-nowrap">
                            {editingId === u.id ? (
                              <div className="flex gap-1">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={saveEdit}
                                  disabled={updateMutation.isPending || !editName.trim()}
                                >
                                  Save
                                </Button>
                                <Button size="sm" variant="ghost" onClick={cancelEdit}>
                                  Cancel
                                </Button>
                              </div>
                            ) : (
                              <div className="flex gap-1">
                                <Button size="sm" variant="outline" onClick={() => startEdit(u)}>
                                  Edit
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="text-destructive hover:text-destructive"
                                  onClick={() => {
                                    if (
                                      confirm(
                                        `Delete unit "${u.name}"? Products using it will keep the text value.`
                                      )
                                    )
                                      deleteMutation.mutate(u.id);
                                  }}
                                  disabled={deleteMutation.isPending}
                                >
                                  Delete
                                </Button>
                              </div>
                            )}
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {(createMutation.isError || updateMutation.isError || deleteMutation.isError) && (
                <p className="mt-2 text-sm text-destructive" role="alert">
                  {getErrorMessage(
                    createMutation.error ?? updateMutation.error ?? deleteMutation.error
                  )}
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {canWrite && addModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 sm:p-6">
          <Card className="w-full max-w-md shadow-xl">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg">Add unit</CardTitle>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9"
                onClick={() => {
                  setAddModalOpen(false);
                  setNewName("");
                }}
                aria-label="Close"
              >
                Close
              </Button>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="add-unit-name">Name</Label>
                  <Input
                    id="add-unit-name"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="e.g. pcs, kg, bag"
                    disabled={createMutation.isPending}
                  />
                </div>
                {createMutation.isError && (
                  <p className="text-sm text-destructive">
                    {createMutation.error instanceof Error
                      ? createMutation.error.message
                      : "Failed to add"}
                  </p>
                )}
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setAddModalOpen(false);
                      setNewName("");
                    }}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={createMutation.isPending || !newName.trim()}>
                    Add
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
