/**
 * navigator.clipboard only exists on secure origins (https, localhost); on a plain-http LAN
 * address it is undefined. Reject with a readable reason so callers show "Copy failed" instead of
 * throwing a TypeError out of a click handler.
 */
export function writeClipboard(text: string): Promise<void> {
  if (typeof navigator === "undefined" || !navigator.clipboard) {
    return Promise.reject(new Error("clipboard unavailable (the page is not on a secure https/localhost origin)"));
  }
  return navigator.clipboard.writeText(text);
}
