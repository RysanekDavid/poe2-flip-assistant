import { compact, fmtSmart } from "../../../lib/format";
import { fmtAgeMin } from "../../ui/StaleBadge";

/** A Divine amount as the Prices tables print it: compact past 10k, smart decimals below. */
export const fmtDiv = (n: number): string => (n >= 10_000 ? compact(n) : fmtSmart(n));

/** "42m" / "5h" / "3d" since an ISO time; "—" when it does not parse. */
export const ageSince = (iso: string, nowMs: number = Date.now()): string => fmtAgeMin((nowMs - Date.parse(iso)) / 60_000);
