import { ALL_MATERIALS } from "../../craftMaterials";
import { CATALYSTS } from "./catalystTags";
import { CRAFTED_WRITE_OUTCOMES } from "./essenceOutcomes";

/**
 * Every material any planner method can use. Kept free of DB imports (unlike load.ts) so the
 * research schemas and offline scripts can validate material ids against it.
 */
export const PLANNER_MATERIAL_IDS: readonly string[] = [
  ...new Set([...ALL_MATERIALS.map((m) => m.id), ...CATALYSTS.map((c) => c.mat.id), ...CRAFTED_WRITE_OUTCOMES.map((r) => r.essenceId)]),
];
