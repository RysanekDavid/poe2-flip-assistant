import { kbManifestProblems, readKbManifest } from "./kbManifest";

/**
 * CI staleness gate for the Coach knowledge base: a KB file edited after its manifest stamp, a
 * listed file that disappeared, or a new docs/kb page nobody classified all fail the build.
 */
const root = process.cwd();
const manifest = readKbManifest(root);
const problems = kbManifestProblems(root, manifest);
if (problems.length > 0) {
  console.error(`KB manifest check failed (${problems.length}):`);
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}
console.log(`ALL PASS — ${manifest.corpus.length} KB files match their patch stamps`);
