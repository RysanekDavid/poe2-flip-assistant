import { Suspense } from "react";
import { AppShell } from "../components/shell/AppShell";
import { ShellFallback } from "../components/shell/ShellFallback";

// Suspense is required: AppShell reads ?tab=&tool= via useSearchParams, which otherwise fails the
// static prerender of this page. The fallback paints the static chrome instead of a blank flash.
export default function DashboardPage() {
  return (
    <Suspense fallback={<ShellFallback />}>
      <AppShell />
    </Suspense>
  );
}
