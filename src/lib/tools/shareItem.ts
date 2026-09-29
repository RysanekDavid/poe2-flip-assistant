/*
 * Craft-moves share links: ?tab=craft&tool=moves&item=<base64url(UTF-8 item text)>. Plain browser
 * and Node globals only (TextEncoder, btoa/atob), so the round-trip is unit-tested server-side.
 */

/** Longer items would make URLs chat apps and browsers truncate; the Share button disables past it. */
export const SHARE_MAX_BYTES = 4096;

export const SHARE_PARAM = "item";

export function utf8Bytes(text: string): number {
  return new TextEncoder().encode(text).length;
}

export function encodeItem(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Decodes a share param; throws on anything that is not base64url of valid UTF-8. */
export function decodeItem(param: string): string {
  if (!/^[A-Za-z0-9_-]*$/.test(param)) throw new Error("share link item is not base64url");
  const b64 = param.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(param.length / 4) * 4, "=");
  const binary = atob(b64);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

/** The query string of a share link; null when the item is too long to share by URL. */
export function shareQuery(text: string): string | null {
  if (utf8Bytes(text) > SHARE_MAX_BYTES) return null;
  const params = new URLSearchParams({ tab: "craft", tool: "moves", [SHARE_PARAM]: encodeItem(text) });
  return `?${params.toString()}`;
}
