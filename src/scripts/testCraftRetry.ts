/* retryFrom invariants: every "go back and repeat" failure branch in the curated guides must
 * resolve to a real, not-later step of its own recipe, and the resolver must reject broken
 * references instead of guessing. Pure data checks, no network or DB. */
import { RECIPES, type CraftGuide, type GuideStep } from "../core/craftRecipes";
import { assertGuideRetryRefs, flattenGuide, resolveRetry } from "../core/craftRetry";

let fail = 0;
const ok = (name: string, cond: boolean, extra = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? ` — ${extra}` : ""}`);
  if (!cond) fail++;
};

// --- every retryFrom in the shipped data resolves, and only sits on a step that can fail ---
{
  const broken: string[] = [];
  const orphan: string[] = [];
  let count = 0;
  for (const r of RECIPES) {
    flattenGuide(r.guide).forEach((s, idx) => {
      if (!s.step.retryFrom) return;
      count++;
      if (!s.step.onFail) orphan.push(`${r.key}#${idx}`);
      const res = resolveRetry(r.guide, idx);
      if (!res || !res.ok) broken.push(`${r.key}#${idx}: ${res ? res.reason : "unresolved"}`);
    });
  }
  ok("curated guides carry retryFrom targets", count >= 10, String(count));
  ok("every retryFrom resolves to an existing, not-later step", broken.length === 0, broken.join(" | "));
  ok("retryFrom only on steps with an onFail branch", orphan.length === 0, orphan.join(","));
}

// --- an onFail that says "do it again" must offer the jump (keeps new guide text honest) ---
{
  const SAYS_RETRY = /\bagain\b|\bre-(slam|desecrate)|\bslam a fresh\b|\bback to\b|\brepeat\b/i;
  const missing = RECIPES.flatMap((r) =>
    flattenGuide(r.guide)
      .filter((s) => SAYS_RETRY.test(s.step.onFail ?? "") && !s.step.retryFrom)
      .map((s) => `${r.key} / ${s.phase} #${s.stepInPhase}`),
  );
  ok("every retry-style onFail has a retryFrom", missing.length === 0, missing.join(" | "));
}

// --- the owner's live case: fractured jewel Contempt miss → back to the second-suffix step ---
{
  const r = RECIPES.find((x) => x.key === "jewel_fractured_5mod");
  if (!r) throw new Error("recipe jewel_fractured_5mod missing");
  const flat = flattenGuide(r.guide);
  const contempt = flat.findIndex((s) => s.phase === "Contempt + desecrated suffix" && s.stepInPhase === 1);
  const second = flat.findIndex((s) => s.phase === "Second caster suffix" && s.stepInPhase === 1);
  const res = resolveRetry(r.guide, contempt);
  ok("fractured Contempt step resolves", res?.ok === true, res && !res.ok ? res.reason : "");
  ok("…to the first 'Second caster suffix' step", res?.ok === true && second >= 0 && res.target.idx === second, `${res?.ok ? res.target.idx : "-"} vs ${second}`);
}

// --- a retry names its phase by title, so titles must be unique within each guide ---
{
  const dupes = RECIPES.flatMap((r) => {
    const titles = r.guide.phases.map((p) => p.title);
    return titles.filter((t, i) => titles.indexOf(t) !== i).map((t) => `${r.key}: ${t}`);
  });
  ok("phase titles are unique per guide", dupes.length === 0, dupes.join(" | "));
}

// --- the resolver rejects references that don't land on a real, earlier step ---
{
  const step = (retryFrom?: GuideStep["retryFrom"]): GuideStep => ({ do: "fixture", onFail: "fixture", retryFrom });
  const guide = (steps: GuideStep[][]): CraftGuide => ({
    goal: "",
    shopping: "",
    marketCheck: "",
    brick: "",
    phases: steps.map((s, i) => ({ title: `P${i + 1}`, steps: s })),
  });
  const g = guide([[step(), step()], [step({ phase: "P1", step: 2 }), step({ phase: "Nope" }), step({ phase: "P1", step: 3 }), step({ phase: "P3" })], [step({ phase: "P3" })]]);
  const at = (idx: number) => resolveRetry(g, idx);
  ok("no retryFrom → null", at(0) === null);
  const back = at(2);
  ok("earlier step resolves to its flat index", back?.ok === true && back.target.idx === 1 && back.target.label === "P1 · step 2");
  ok("unknown phase is rejected", at(3)?.ok === false);
  ok("step number past the phase is rejected", at(4)?.ok === false);
  ok("forward jump is rejected", at(5)?.ok === false);
  const self = at(6);
  ok("a single-step phase can retry itself, labelled by phase alone", self?.ok === true && self.target.idx === 6 && self.target.label === "P3");
  ok("an out-of-range failing index is rejected", resolveRetry(g, 99)?.ok === false);

  const throws = (fn: () => void): boolean => {
    try {
      fn();
      return false;
    } catch (error: unknown) {
      return error instanceof Error;
    }
  };
  ok("load-time check throws on a broken ref", throws(() => assertGuideRetryRefs("fixture", g)));
  ok("load-time check passes a clean guide", !throws(() => assertGuideRetryRefs("fixture", guide([[step(), step({ phase: "P1" })]]))));
  const twin: CraftGuide = { ...guide([[step()], [step()]]), phases: [{ title: "Same", steps: [step()] }, { title: "Same", steps: [step()] }] };
  ok("load-time check throws on a repeated phase title", throws(() => assertGuideRetryRefs("fixture", twin)));
}

console.log(fail === 0 ? "\nALL PASS" : `\n${fail} FAILED`);
if (fail > 0) process.exit(1);
