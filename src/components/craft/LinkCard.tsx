"use client";

export function LinkCard({ href, tone, title, sub }: { href: string | null; tone: "good" | "bad"; title: string; sub: string }) {
  const cls = tone === "good" ? "text-good" : "text-bad";
  if (!href) {
    return (
      <div className="rounded-lg border border-neutral-800 bg-neutral-800/20 p-3 opacity-50">
        <div className={`text-sm font-semibold ${cls}`}>{title}</div>
        <div className="text-xs text-neutral-600">{sub}</div>
      </div>
    );
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="rounded-lg border border-neutral-700 bg-neutral-800/40 p-3 transition hover:border-neutral-500 hover:bg-neutral-800/70"
    >
      <div className={`text-sm font-semibold ${cls}`}>{title}</div>
      <div className="text-xs text-neutral-500">{sub}</div>
    </a>
  );
}
