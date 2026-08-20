import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  fetchPatchHtml,
  type HttpFetcher,
} from "../sources/patchNotes/client";

const threadHtml = readFileSync(
  join(process.cwd(), "src/sources/patchNotes/fixtures/thread.html"),
  "utf8",
);

export async function testRedirectIdentityBoundary(): Promise<void> {
  await rejectUnsafeRedirect();
  await assert.rejects(redirectFetch([redirect(null)]), /missing Location/);
  await assert.rejects(redirectFetch([redirect("/forum/view-forum/2222")]), /loop/);
  await assert.rejects(
    redirectFetch([redirect("/forum/view-thread/3991000/filter-account-type/staff")]),
    /resource identity/,
  );
  await rejectCrossThreadRedirect();
  await assert.rejects(
    redirectFetch([
      redirect("https://pathofexile.com/forum/view-forum/2222"),
      redirect("https://pathofexile.com/forum/view-forum/2222/"),
      redirect("https://www.pathofexile.com/forum/view-forum/2222/"),
      redirect("https://pathofexile.com/forum/view-forum/2222"),
    ]),
    /limit exceeded/,
  );
}

export async function testAllowedRedirectHeaders(): Promise<void> {
  const responses = [
    redirect("https://pathofexile.com/forum/view-forum/2222/"),
    htmlResponse(threadHtml),
  ];
  const seen: Array<{ etag: string | null; contact: string | null }> = [];
  const fetcher: HttpFetcher = async (_input, init) => {
    const headers = new Headers(init?.headers);
    seen.push({ etag: headers.get("if-none-match"), contact: headers.get("user-agent") });
    const next = responses.shift();
    if (!next) throw new Error("unexpected redirect fetch");
    return next;
  };
  const result = await fetchPatchHtml(
    "https://www.pathofexile.com/forum/view-forum/2222",
    "tests@example.invalid",
    { etag: "conditional-etag", lastModified: null },
    10_000,
    fetcher,
  );
  assert.equal(result.status, 200);
  assert.deepEqual(seen.map((entry) => entry.etag), ["conditional-etag", "conditional-etag"]);
  assert.ok(seen.every((entry) => entry.contact?.includes("tests@example.invalid")));
}

async function rejectUnsafeRedirect(): Promise<void> {
  const invoked: string[] = [];
  const fetcher: HttpFetcher = async (input) => {
    invoked.push(String(input));
    return redirect("https://evil.example/forum/view-forum/2222");
  };
  await assert.rejects(redirectFetchWith(fetcher), /unsafe/);
  assert.equal(invoked.length, 1, "an unsafe redirect target must never be fetched");
}

async function rejectCrossThreadRedirect(): Promise<void> {
  const invoked: string[] = [];
  const fetcher: HttpFetcher = async (input) => {
    invoked.push(String(input));
    return redirect("/forum/view-thread/3990574/filter-account-type/staff");
  };
  await assert.rejects(
    fetchPatchHtml(
      "https://www.pathofexile.com/forum/view-thread/3991000/filter-account-type/staff",
      "tests@example.invalid",
      { etag: null, lastModified: null },
      1_000,
      fetcher,
    ),
    /resource identity/,
  );
  assert.equal(invoked.length, 1, "a cross-thread redirect target must never be fetched");
}

function redirectFetch(responses: Response[]): Promise<unknown> {
  return redirectFetchWith(queueFetcher(responses));
}

function redirectFetchWith(fetcher: HttpFetcher): Promise<unknown> {
  return fetchPatchHtml(
    "https://www.pathofexile.com/forum/view-forum/2222",
    "tests@example.invalid",
    { etag: "etag", lastModified: "date" },
    1_000,
    fetcher,
  );
}

function redirect(location: string | null): Response {
  const headers = new Headers();
  if (location) headers.set("location", location);
  return new Response(null, { status: 302, headers });
}

function htmlResponse(body: string): Response {
  return new Response(body, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8", etag: "redirected" },
  });
}

function queueFetcher(responses: Response[]): HttpFetcher {
  return async () => {
    const next = responses.shift();
    if (!next) throw new Error("unexpected offline fetch");
    return next;
  };
}
