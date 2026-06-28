import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PoE2 Flip Assistant",
  description: "Real-time PoE2 currency-exchange flip assistant",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
