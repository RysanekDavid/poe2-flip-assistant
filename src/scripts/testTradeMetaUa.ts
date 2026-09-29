/* trade2 static data identifies itself honestly — test:system, axios mocked (no network). */
import assert from "node:assert/strict";
import axios, { type AxiosRequestConfig } from "axios";
import { config } from "../config/env";
import { fetchTradeMeta, tradeMetaUserAgent } from "../api/tradeMeta";

const CONTACT = "ops@example.test";

function testUserAgentBuilder(): void {
  assert.equal(tradeMetaUserAgent(CONTACT), `poe2-flip-assistant/0.1 read-only data (+${CONTACT})`);
  assert.equal(tradeMetaUserAgent(`  ${CONTACT}\n`), tradeMetaUserAgent(CONTACT), "contact is trimmed");
  for (const empty of ["", "   "]) {
    assert.throws(() => tradeMetaUserAgent(empty), /DATA_SOURCE_CONTACT or POE_CONTACT is required/);
  }
  assert.ok(!tradeMetaUserAgent(CONTACT).includes("Mozilla"), "no browser UA");
}

// `config` is `as const` for app code; the suite swaps the contact and always restores it.
async function withContact<T>(contact: string, run: () => Promise<T>): Promise<T> {
  const writable = config as { dataSourceContact: string };
  const original = writable.dataSourceContact;
  writable.dataSourceContact = contact;
  try {
    return await run();
  } finally {
    writable.dataSourceContact = original;
  }
}

async function withFakeAxios(calls: Array<AxiosRequestConfig | undefined>, run: () => Promise<void>): Promise<void> {
  const original = axios.get;
  const fake = async (_url: string, cfg?: AxiosRequestConfig) => {
    calls.push(cfg);
    return { data: { result: [] } };
  };
  axios.get = fake as unknown as typeof axios.get;
  try {
    await run();
  } finally {
    axios.get = original;
  }
}

export async function testTradeMetaUserAgent(): Promise<void> {
  testUserAgentBuilder();

  const refused: Array<AxiosRequestConfig | undefined> = [];
  await withFakeAxios(refused, () =>
    withContact("", () => assert.rejects(fetchTradeMeta(), /DATA_SOURCE_CONTACT or POE_CONTACT is required/)),
  );
  assert.equal(refused.length, 0, "no contact means no request at all");

  const sent: Array<AxiosRequestConfig | undefined> = [];
  await withFakeAxios(sent, () => withContact(CONTACT, async () => void (await fetchTradeMeta())));
  assert.equal(sent.length, 2, "stats + items");
  for (const cfg of sent) {
    const headers = (cfg?.headers ?? {}) as Record<string, unknown>;
    assert.equal(headers["User-Agent"], tradeMetaUserAgent(CONTACT));
  }
  console.log(`PASS  trade2 data User-Agent is honest ("${tradeMetaUserAgent(CONTACT)}"), refuses without a contact`);
}
