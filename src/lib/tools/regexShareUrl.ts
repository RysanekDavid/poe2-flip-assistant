/*
 * Share links for the Regex tool: `?tab=regex&tool=<tab>&s=<encodeShare(selection)>`.
 * The query form (not `#regex=`) is deliberate — the shell router owns ?tab/&tool, so the link
 * opens the right sub-tab first and the panel then decodes `s`. Decode failures are returned as
 * data so the tool can show them in a visible banner instead of silently opening an empty form.
 */
import { SHARE_PARAM, decodeShare, encodeShare, type TabSelection } from "./regexPoolContract";

export type ShareRead =
  | { kind: "none" }
  | { kind: "ok"; selection: TabSelection }
  | { kind: "error"; message: string };

/** Absolute share URL for a selection. Throws (from encodeShare) when the code would be too long. */
export function shareUrl(origin: string, pathname: string, selection: TabSelection): string {
  const params = new URLSearchParams({ tab: "regex", tool: selection.tab, [SHARE_PARAM]: encodeShare(selection) });
  return `${origin}${pathname}?${params.toString()}`;
}

/**
 * The `s` query value → selection. The decoded selection names its own tab; a `tool` that
 * disagrees (hand-edited link) is reported rather than guessed around.
 */
export function readShare(tool: string | null, code: string | null): ShareRead {
  if (code === null) return { kind: "none" };
  let selection: TabSelection;
  try {
    selection = decodeShare(code);
  } catch (error: unknown) {
    return { kind: "error", message: error instanceof Error ? error.message : String(error) };
  }
  if (tool !== null && tool !== selection.tab) {
    return { kind: "error", message: `share link holds a ${selection.tab} selection but opens the ${tool} tab` };
  }
  return { kind: "ok", selection };
}
