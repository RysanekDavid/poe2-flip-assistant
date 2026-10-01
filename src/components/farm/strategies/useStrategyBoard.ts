"use client";

import { useCallback, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { assertOk, describeError, warnOnFailure } from "../../../lib/clientWarn";
import { strategiesResponseSchema, type StrategiesResponse } from "../../../lib/strategiesContract";
import { useVisiblePoll } from "../../../lib/useVisiblePoll";

// Prices come from poe.ninja (hourly); the curated facts change only with a release.
const POLL_MS = 15 * 60_000;
const ROUTE = "/api/farm/strategies";
/** ?strategy=<id> opens that strategy's drawer, so a strategy deep-links and Back closes it. */
const OPEN_PARAM = "strategy";
/** The first links used ?s=; still read, and rewritten to ?strategy= on the next open or close. */
const LEGACY_OPEN_PARAM = "s";

/** The whole strategy board (every kind); each tool narrows it to its kind. */
export function useStrategies(label: string) {
  const [data, setData] = useState<StrategiesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    fetch(ROUTE, { cache: "no-store" })
      .then(async (r) => {
        setData(strategiesResponseSchema.parse(await assertOk(r, ROUTE).json()));
        setError(null);
      })
      .catch((e: unknown) => {
        warnOnFailure(`[${label}] strategies`)(e);
        setError(describeError(e));
      });
  }, [label]);
  useVisiblePoll(load, POLL_MS);
  return { data, error, reload: load };
}

/**
 * The open strategy lives in ?strategy= (an early ?s= link still opens). Opening pushes history;
 * closing a drawer opened here goes Back to that entry, and closing one that came in on a deep link
 * replaces the URL — Back must not leave the app. Only Farm › Strategies ever issued ?s= links, so
 * only it reads them: elsewhere ?s= is the Regex tool's share code.
 */
export function useOpenStrategy(readLegacy = false) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const openedHere = useRef(false);
  const openId = params.get(OPEN_PARAM) ?? (readLegacy ? params.get(LEGACY_OPEN_PARAM) : null);
  const hrefWith = useCallback(
    (id: string | null) => {
      const url = new URL(window.location.href);
      url.searchParams.delete(LEGACY_OPEN_PARAM);
      if (id === null) url.searchParams.delete(OPEN_PARAM);
      else url.searchParams.set(OPEN_PARAM, id);
      return `${pathname}${url.search}`;
    },
    [pathname],
  );
  const open = useCallback(
    (id: string) => {
      openedHere.current = true;
      router.push(hrefWith(id), { scroll: false });
    },
    [hrefWith, router],
  );
  const close = useCallback(() => {
    if (openedHere.current) {
      openedHere.current = false;
      router.back();
    } else router.replace(hrefWith(null), { scroll: false });
  }, [hrefWith, router]);
  return { openId, open, close };
}
