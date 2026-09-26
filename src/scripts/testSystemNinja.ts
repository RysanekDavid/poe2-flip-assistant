/* poe.ninja identifies itself honestly — test:system, axios mocked (no network). */
import assert from "node:assert/strict";
import axios, { type AxiosRequestConfig } from "axios";
import { config } from "../config/env";
import { CATEGORIES } from "../api/types";
import { NINJA_USER_AGENT, fetchCategory } from "../api/ninjaClient";

export async function testNinjaUserAgent(): Promise<void> {
  const calls: Array<{ url: string; cfg: AxiosRequestConfig | undefined }> = [];
  const original = axios.get;
  const fake = async (url: string, cfg?: AxiosRequestConfig) => {
    calls.push({ url, cfg });
    return { data: { lines: [{ id: "divine", primaryValue: 1 }], items: [{ id: "divine", name: "Divine Orb" }] } };
  };
  axios.get = fake as unknown as typeof axios.get;
  try {
    const category = CATEGORIES[0];
    assert.ok(category, "at least one ninja category");
    const resp = await fetchCategory(category, "UA Test League");
    assert.equal(resp.lines[0]?.id, "divine", "response still parsed and returned");
  } finally {
    axios.get = original;
  }

  assert.equal(calls.length, 1);
  const headers = (calls[0]?.cfg?.headers ?? {}) as Record<string, unknown>;
  assert.equal(headers["User-Agent"], NINJA_USER_AGENT);
  assert.match(NINJA_USER_AGENT, /^poe2-flip-assistant\/1\.0( \(contact: .+\))?$/);
  if (config.dataSourceContact) assert.ok(NINJA_USER_AGENT.includes(config.dataSourceContact), "contact included when configured");
  // Cloudflare edge rule: the same-site Referer stays exactly as before, only the UA changed.
  assert.equal(headers.Referer, "https://poe.ninja/poe2/economy/uatestleague/currency", "league-specific same-site Referer kept");
  assert.ok(!String(headers["User-Agent"]).includes("Mozilla"), "no browser UA");
  assert.deepEqual(calls[0]?.cfg?.params, { league: "UA Test League", type: category(0) }, "request otherwise unchanged");
  console.log(`PASS  poe.ninja User-Agent is honest ("${NINJA_USER_AGENT}"), same-site Referer kept`);
}

function category(i: number): string {
  const c = CATEGORIES[i];
  if (!c) throw new Error(`no ninja category ${i}`);
  return c.type;
}
