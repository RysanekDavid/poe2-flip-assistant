"use client";

import { useCallback, useState } from "react";
import type { ZodType, ZodTypeDef } from "zod";
import { assertOk, describeError } from "../../lib/clientWarn";
import { useVisiblePoll } from "../../lib/useVisiblePoll";
import type { HomePick } from "./homePicks";

/** A card's line while it loads or after a failure, beside the pickers' own ok / empty lines. */
export type HomeLine = HomePick | { kind: "loading" } | { kind: "error"; message: string } | { kind: "off" };

// Home is a jumping-off page: the pages themselves refresh faster once opened.
const POLL_MS = 15 * 60_000;

/**
 * GET `url`, validate it with `schema`, reduce it to one line with `pick`. A failure is logged and
 * shown as an error line (with the reason on hover), never as an empty result. A disabled card
 * never fetches: an Advanced-only feed is not spent on a Beginner's Home.
 */
export function useHomePick<T>(url: string, schema: ZodType<T, ZodTypeDef, unknown>, pick: (data: T) => HomePick, enabled: boolean): HomeLine {
  const [line, setLine] = useState<HomeLine>(enabled ? { kind: "loading" } : { kind: "off" });
  const load = useCallback(() => {
    if (!enabled) return;
    fetch(url, { cache: "no-store" })
      .then(async (r) => pick(schema.parse(await assertOk(r, url).json())))
      .then(setLine)
      .catch((e: unknown) => {
        console.error(`[home] ${url} failed`, e);
        setLine({ kind: "error", message: describeError(e) });
      });
  }, [url, schema, pick, enabled]);
  useVisiblePoll(load, POLL_MS);
  return enabled ? line : { kind: "off" };
}
