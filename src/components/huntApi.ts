/** Client-side shapes + request helper shared by HuntPanel and HuntForm. */
export interface Hunt {
  id: number;
  label: string;
  mode: string; // legacy DB field — no longer user-facing
  item_name: string | null;
  base_type: string | null;
  category: string | null;
  ilvl_min: number | null;
  rarity: string | null;
  stats_json: string | null;
  max_amount: number | null;
  max_ccy: string | null;
  target_div: number | null;
  active: number;
  last_scan_at: string | null;
  last_hit_at: string | null;
  last_error: string | null; // why this hunt's last scan failed (null after a clean scan)
}

/** Fire a JSON request to the hunts API with a method + body, return the response promise. */
export function huntReq(method: string, url: string, body: unknown): Promise<Response> {
  return fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}
