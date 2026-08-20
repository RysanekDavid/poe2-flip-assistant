import { reviewOfficialPatch } from "../db/sourceQueries";
import { reviewDispositionSchema } from "../sources/patchNotes/contracts";
import { loadVerifiedPatchCoverage } from "../sources/patchNotes/store";

interface ReviewArgs {
  threadId: number;
  disposition: "no_gameplay_impact" | "data_refreshed";
  reviewer: string;
  note: string;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const coverage = await loadVerifiedPatchCoverage();
  reviewOfficialPatch(
    args.threadId,
    args.disposition,
    args.reviewer,
    args.note,
    args.disposition === "data_refreshed" ? coverage.catalog_sha256 : null,
    new Date().toISOString(),
  );
  console.log(`reviewed patch thread ${args.threadId}: ${args.disposition}`);
}

function parseArgs(values: string[]): ReviewArgs {
  const options = new Map<string, string>();
  for (let index = 0; index < values.length; index += 2) {
    const key = values[index];
    const value = values[index + 1];
    if (!key?.startsWith("--") || !value) throw usage();
    options.set(key.slice(2), value);
  }
  const threadId = Number(options.get("thread"));
  const disposition = reviewDispositionSchema.safeParse(options.get("disposition"));
  const reviewer = options.get("reviewer")?.trim() ?? "";
  const note = options.get("note")?.trim() ?? "";
  if (!Number.isSafeInteger(threadId) || threadId <= 0 || !disposition.success || !reviewer || !note) {
    throw usage();
  }
  return { threadId, disposition: disposition.data, reviewer, note };
}

function usage(): Error {
  return new Error(
    "usage: npm run patch:review -- --thread <id> --disposition <no_gameplay_impact|data_refreshed> --reviewer <name> --note <text>",
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
