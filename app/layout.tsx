import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FG Homes",
  description: "FG Home Builders and Construction Supply — Internal management platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
