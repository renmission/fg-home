"use client";

import { create } from "zustand";

/** Global UI state. Use for shared client state (sidebar, etc.). */
type UIState = {
  /** Mobile: drawer open. Desktop: sidebar expanded (w-56) vs collapsed (w-16). */
  sidebarOpen: boolean;
  openSidebar: () => void;
  closeSidebar: () => void;
  toggleSidebar: () => void;
};

export const useUIStore = create<UIState>((set) => ({
  sidebarOpen: true,
  openSidebar: () => set({ sidebarOpen: true }),
  closeSidebar: () => set({ sidebarOpen: false }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
}));
