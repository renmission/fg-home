"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const SunIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2" />
    <path d="M12 20v2" />
    <path d="m4.93 4.93 1.41 1.41" />
    <path d="m17.66 17.66 1.41 1.41" />
    <path d="M2 12h2" />
    <path d="M20 12h2" />
    <path d="m6.34 17.66-1.41 1.41" />
    <path d="m19.07 4.93-1.41 1.41" />
  </svg>
);

const MoonIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
  </svg>
);

export function ThemeToggle({ className }: { className?: string }) {
  const [mounted, setMounted] = useState(false);
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    setMounted(true);
    const root = document.documentElement;
    setIsDark(root.classList.contains("dark"));
  }, []);

  const toggle = () => {
    const root = document.documentElement;
    const next = root.classList.contains("dark") ? "light" : "dark";
    root.classList.toggle("dark", next === "dark");
    localStorage.setItem("theme", next);
    setIsDark(next === "dark");
  };

  const isFullWidth = className?.includes("justify-start") || className?.includes("w-full");

  if (!mounted) {
    return (
      <Button
        variant="ghost"
        size={isFullWidth ? "default" : "icon"}
        className={cn(isFullWidth ? "h-10 w-full justify-start gap-2" : "h-10 w-10", className)}
        aria-label="Toggle theme"
      >
        <span className="h-5 w-5" />
        {isFullWidth && <span className="text-sm">Toggle theme</span>}
      </Button>
    );
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size={isFullWidth ? "default" : "icon"}
      className={cn(isFullWidth ? "h-10 w-full justify-start gap-2" : "h-10 w-10", className)}
      onClick={toggle}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
    >
      {isDark ? <SunIcon /> : <MoonIcon />}
      {isFullWidth && <span className="text-sm">{isDark ? "Light mode" : "Dark mode"}</span>}
    </Button>
  );
}
