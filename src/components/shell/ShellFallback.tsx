import { Brand } from "./Brand";

/**
 * Static chrome shown while AppShell waits on the URL params and the signed-in user: the same grid
 * as ShellHeader (brand block over both rows from md up, compact brand below), so the first paint
 * is the app rather than a blank page. Tab slots are unlabelled skeletons because which tabs exist
 * depends on the user's nav mode, not yet known here. Nothing here is interactive.
 */
export function ShellFallback() {
  return (
    <main className="mx-auto w-full max-w-screen-2xl flex-1 space-y-4 p-6" aria-busy="true">
      <header className="sticky top-0 z-40 -mx-6 -mt-6 border-b border-line bg-neutral-950/85">
        <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 px-4 md:gap-x-5 md:px-6 md:pt-1">
          <h1 className="col-start-1 row-start-1 md:row-span-2 md:mb-2 md:self-end md:border-r md:border-line md:pr-[18px]">
            <Brand size="header" />
          </h1>
          <div aria-hidden className="col-start-2 row-start-1 h-[52px]" />
          <div className="col-span-2 row-start-2 flex items-end gap-0.5 overflow-hidden md:col-span-1 md:col-start-2">
            {[0, 1, 2, 3, 4].map((slot) => (
              <span key={slot} aria-hidden className="flex shrink-0 items-center gap-2 border-b-2 border-transparent px-2.5 py-1.5">
                <span className="h-7 w-7 rounded bg-neutral-900" />
                <span className="h-3 w-14 rounded bg-neutral-900" />
              </span>
            ))}
          </div>
        </div>
      </header>
      <div aria-hidden className="h-24 rounded-lg border border-line bg-neutral-900/30" />
    </main>
  );
}
