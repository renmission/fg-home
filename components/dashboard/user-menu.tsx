"use client";

import { useState, useRef, useEffect } from "react";
import { signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { IconChevronDown } from "@/components/dashboard/sidebar-icons";
import { cn } from "@/lib/utils";

export type UserMenuUser = {
  name?: string | null;
  email?: string | null;
  image?: string | null;
};

function getInitials(name?: string | null, email?: string | null): string {
  if (name) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  }
  if (email) return email.slice(0, 2).toUpperCase();
  return "?";
}

export function UserMenu({ user }: { user: UserMenuUser }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) {
      document.addEventListener("click", handleClickOutside);
    }
    return () => document.removeEventListener("click", handleClickOutside);
  }, [open]);

  const displayName = user.name || user.email || "User";
  const initials = getInitials(user.name, user.email);

  return (
    <div className="relative" ref={ref}>
      <Button
        type="button"
        variant="ghost"
        className="h-10 gap-2 rounded-md px-2 py-1.5 font-normal"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label="User menu"
      >
        {user.image ? (
          <img
            src={user.image}
            alt=""
            className="h-8 w-8 rounded-full object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground"
            aria-hidden
          >
            {initials}
          </span>
        )}
        <span className="hidden max-w-[8rem] truncate text-left text-sm sm:inline">
          {displayName}
        </span>
        <IconChevronDown className={cn("shrink-0 transition-transform", open && "rotate-180")} />
      </Button>
      {open && (
        <div
          className="absolute right-0 top-full z-50 mt-2 w-56 rounded-md border border-border bg-card py-1 shadow-lg"
          role="menu"
        >
          <div className="px-3 py-2 text-sm">
            <p className="font-medium text-foreground truncate">{displayName}</p>
            {user.email && <p className="truncate text-muted-foreground text-xs">{user.email}</p>}
          </div>
          <div className="border-t border-border" />
          <Button
            type="button"
            variant="ghost"
            className="h-auto w-full justify-start rounded-none px-3 py-2 text-sm font-normal"
            onClick={() => signOut({ callbackUrl: "/login" })}
            role="menuitem"
          >
            Sign out
          </Button>
        </div>
      )}
    </div>
  );
}
