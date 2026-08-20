import type { ConditionalHeaders, HtmlFetchResult } from "./contracts";

const REQUEST_TIMEOUT_MS = 15_000;
const MAX_REDIRECTS = 3;
const ALLOWED_HOSTS = new Set(["pathofexile.com", "www.pathofexile.com"]);
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export type HttpFetcher = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export async function fetchPatchHtml(
  url: string,
  contact: string,
  conditional: ConditionalHeaders,
  maxBytes: number,
  fetcher: HttpFetcher = fetch,
): Promise<HtmlFetchResult> {
  const requested = validatePatchUrl(url);
  const identifyingContact = contact.trim();
  if (!identifyingContact) {
    throw new Error("DATA_SOURCE_CONTACT or POE_CONTACT is required for patch-note requests");
  }
  const headers = new Headers({
    Accept: "text/html, application/xhtml+xml;q=0.9",
    "User-Agent": `POE2TradeChecker/0.1 (+${identifyingContact})`,
  });
  if (conditional.etag) headers.set("If-None-Match", conditional.etag);
  if (conditional.lastModified) headers.set("If-Modified-Since", conditional.lastModified);
  const { response, finalUrl } = await requestWithRedirects(requested, headers, fetcher);
  validateResponseMetadata(finalUrl, response.status, response.headers, maxBytes);
  const metadata = {
    url: finalUrl,
    etag: response.headers.get("etag"),
    lastModified: response.headers.get("last-modified"),
    retrievedAt: new Date().toISOString(),
  };
  if (response.status === 304) {
    return { status: 304, html: null, raw: null, bytes: 0, ...metadata };
  }
  if (response.status !== 200) throw new Error(`patch-note request failed with HTTP ${response.status}`);
  const body = await readBoundedBody(response, maxBytes);
  return {
    status: 200,
    html: new TextDecoder("utf-8", { fatal: false }).decode(body),
    raw: body,
    bytes: body.byteLength,
    ...metadata,
  };
}

async function requestWithRedirects(
  requested: URL,
  headers: Headers,
  fetcher: HttpFetcher,
): Promise<{ response: Response; finalUrl: string }> {
  const signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  const seen = new Set([requested.href]);
  const requestedIdentity = patchResourceIdentity(requested);
  let current = requested;
  let redirects = 0;
  while (true) {
    const response = await fetcher(current, {
      method: "GET",
      headers,
      redirect: "manual",
      signal,
    });
    const responseUrl = response.url || current.href;
    const responseLocation = validatePatchUrl(responseUrl);
    assertResourceIdentity(requestedIdentity, responseLocation);
    if (!REDIRECT_STATUSES.has(response.status)) {
      return { response, finalUrl: responseUrl };
    }
    if (redirects >= MAX_REDIRECTS) throw new Error(`patch-note redirect limit exceeded (${MAX_REDIRECTS})`);
    const location = response.headers.get("location");
    if (!location) throw new Error("patch-note redirect is missing Location");
    const target = validatePatchUrl(new URL(location, responseUrl).href);
    assertResourceIdentity(requestedIdentity, target);
    if (seen.has(target.href)) throw new Error("patch-note redirect loop detected");
    seen.add(target.href);
    current = target;
    redirects += 1;
  }
}

function patchResourceIdentity(url: URL): string {
  if (/^\/forum\/view-forum\/2222\/?$/.test(url.pathname)) return "index:2222";
  const thread = /^\/forum\/view-thread\/(\d+)\/filter-account-type\/staff\/?$/.exec(url.pathname);
  if (thread?.[1]) return `thread:${thread[1]}`;
  throw new Error(`unexpected patch-note path: ${url.pathname}`);
}

function assertResourceIdentity(expected: string, target: URL): void {
  const actual = patchResourceIdentity(target);
  if (actual !== expected) {
    throw new Error(`patch-note redirect changed resource identity from ${expected} to ${actual}`);
  }
}

export function validatePatchUrl(value: string): URL {
  const url = new URL(value);
  if (url.protocol !== "https:" || !ALLOWED_HOSTS.has(url.hostname.toLowerCase())) {
    throw new Error(`unsafe patch-note URL: ${url.href}`);
  }
  if (!/^\/forum\/(view-forum\/2222|view-thread\/\d+\/filter-account-type\/staff)\/?$/.test(url.pathname)) {
    throw new Error(`unexpected patch-note path: ${url.pathname}`);
  }
  return url;
}

export function validateResponseMetadata(
  finalUrl: string,
  status: number,
  headers: Headers,
  maxBytes: number,
): void {
  validatePatchUrl(finalUrl);
  if (status === 304) return;
  const contentType = headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.startsWith("text/html") && !contentType.startsWith("application/xhtml+xml")) {
    throw new Error(`unexpected patch-note content type: ${contentType || "missing"}`);
  }
  const length = headers.get("content-length");
  if (length && Number(length) > maxBytes) {
    throw new Error(`patch-note response exceeds ${maxBytes} bytes`);
  }
}

async function readBoundedBody(response: Response, maxBytes: number): Promise<Uint8Array> {
  if (!response.body) throw new Error("patch-note response had no body");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel("response too large");
      throw new Error(`patch-note response exceeds ${maxBytes} bytes`);
    }
    chunks.push(value);
  }
  const combined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return combined;
}
