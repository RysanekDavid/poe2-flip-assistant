import { TABS } from "./tabRegistry";

/**
 * Static chrome shown while AppShell waits on the URL params: same header geometry, title and tab
 * labels, so the first paint is the app rather than a blank page. Nothing here is interactive.
 */
export function ShellFallback() {
  return (
    <main className="mx-auto w-full max-w-screen-2xl flex-1 space-y-4 p-6" aria-busy="true">
      <header className="sticky top-0 z-40 -mx-6 -mt-6 border-b border-line bg-neutral-950/85">
        <div className="flex h-[76px] items-center px-6 py-2">
          <h1 className="text-xl font-bold">PoE2 Flip Assistant</h1>
        </div>
        <div className="flex items-end gap-0.5 px-6">
          {TABS.filter((t) => t.id !== "coach").map((t) => (
            <span key={t.id} className="flex items-center gap-2 border-b-2 border-transparent px-2.5 py-1.5 text-sm font-medium text-neutral-400">
              <span aria-hidden className="h-7 w-7 rounded bg-neutral-900" />
              {t.label}
            </span>
          ))}
        </div>
      </header>
      <div aria-hidden className="h-24 rounded-lg border border-line bg-neutral-900/30" />
    </main>
  );
}
