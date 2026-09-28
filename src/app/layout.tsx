import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PoE2 Flip Assistant",
  description: "Real-time PoE2 currency-exchange flip assistant",
};

// GGG's developer terms require this exact sentence, visibly, on every page of a public
// third-party app — so it lives in the root layout (covers /login too) and test:deploy-config
// fails if it is dropped or reworded.
function LegalFooter() {
  return (
    <footer className="border-t border-neutral-900 px-6 py-3 text-center text-xs text-neutral-400">
      {"This product isn't affiliated with or endorsed by Grinding Gear Games in any way."}
    </footer>
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      {/* column flex keeps the footer on screen under short pages like /login */}
      <body className="flex min-h-screen flex-col antialiased">
        {children}
        <LegalFooter />
      </body>
    </html>
  );
}
