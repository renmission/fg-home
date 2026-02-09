"use client";

import { useEffect } from "react";

/**
 * Catches errors at the root. Replaces the root layout when triggered, so we must include html/body.
 * Use for unhandled errors that escape segment error boundaries.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    if (typeof window !== "undefined") {
      // eslint-disable-next-line no-console
      console.error("[Global error]", error.message, error.digest);
    }
  }, [error]);

  const message =
    error instanceof Error ? error.message : "An unexpected error occurred. Please try again.";

  return (
    <html lang="en">
      <body className="antialiased">
        <main
          style={{
            minHeight: "100vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "1.5rem",
            fontFamily: "system-ui, sans-serif",
            backgroundColor: "hsl(0 0% 98%)",
            color: "hsl(222 47% 11%)",
          }}
        >
          <h1 style={{ fontSize: "1.25rem", fontWeight: 600, marginBottom: "0.5rem" }}>
            Something went wrong
          </h1>
          <p
            style={{
              fontSize: "0.875rem",
              color: "hsl(222 13% 46%)",
              marginBottom: "1.5rem",
              textAlign: "center",
              maxWidth: "28rem",
            }}
          >
            {message}
          </p>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              padding: "0.5rem 1rem",
              fontSize: "0.875rem",
              fontWeight: 500,
              backgroundColor: "hsl(221 83% 53%)",
              color: "white",
              border: "none",
              borderRadius: "0.5rem",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
