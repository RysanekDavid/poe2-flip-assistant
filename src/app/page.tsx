import { Suspense } from "react";
import { AppShell } from "../components/shell/AppShell";

// Suspense is required: AppShell reads ?tab=&tool= via useSearchParams, which otherwise fails the
// static prerender of this page.
export default function DashboardPage() {
  return (
    <Suspense>
      <AppShell />
    </Suspense>
  );
}
