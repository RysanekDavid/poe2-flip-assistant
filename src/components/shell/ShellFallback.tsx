/**
 * Static chrome shown while AppShell waits on the URL params and the signed-in user: same header
 * geometry and title, so the first paint is the app rather than a blank page. Tab slots are
 * unlabelled skeletons because which tabs exist depends on the user's nav mode, not yet known here.
 * Nothing here is interactive.
 */
export function ShellFallback() {
  return (
    <main className="mx-auto w-full max-w-screen-2xl flex-1 space-y-4 p-6" aria-busy="true">
      <header className="sticky top-0 z-40 -mx-6 -mt-6 border-b border-line bg-neutral-950/85">
        <div className="flex h-[76px] items-center px-6 py-2">
          <h1 className="text-xl font-bold">PoE2 Flip Assistant</h1>
        </div>
        <div className="flex items-end gap-0.5 px-6">
          {[0, 1, 2, 3, 4].map((slot) => (
            <span key={slot} aria-hidden className="flex items-center gap-2 border-b-2 border-transparent px-2.5 py-1.5">
              <span className="h-7 w-7 rounded bg-neutral-900" />
              <span className="h-3 w-14 rounded bg-neutral-900" />
            </span>
          ))}
        </div>
      </header>
      <div aria-hidden className="h-24 rounded-lg border border-line bg-neutral-900/30" />
    </main>
  );
}
