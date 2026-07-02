/**
 * Inline SVG sparkline — the ninja-style mini trend line for table rows.
 * Pure render (no hooks): safe to use from any client component. Color follows
 * the net direction (first → last point): green up, red down.
 */
export function Sparkline({
  data,
  width = 56,
  height = 16,
  className = "",
}: {
  data: number[];
  width?: number;
  height?: number;
  className?: string;
}) {
  const pts = data.filter((v) => Number.isFinite(v));
  if (pts.length < 2) return null;
  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const span = max - min || 1;
  const step = width / (pts.length - 1);
  const points = pts
    .map((v, i) => `${(i * step).toFixed(1)},${(height - 2 - ((v - min) / span) * (height - 4)).toFixed(1)}`)
    .join(" ");
  const up = pts[pts.length - 1]! >= pts[0]!;
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={`inline-block shrink-0 align-middle ${className}`}
      aria-hidden
    >
      <polyline
        points={points}
        fill="none"
        stroke={up ? "#34d399" : "#f87171"}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
