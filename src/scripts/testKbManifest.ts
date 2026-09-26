import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { kbContentHash, kbManifestProblems, type KbManifest } from "./kbManifest";

const root = mkdtempSync(join(tmpdir(), "poe2-kb-manifest-"));
try {
  mkdirSync(join(root, "docs", "kb"), { recursive: true });
  const content = "# Omens\n\nPatch stamp: 0.5.4\n";
  writeFileSync(join(root, "docs/kb/omens.md"), content.replace(/\n/g, "\r\n"));
  writeFileSync(join(root, "docs/kb/README.md"), "# KB\n");
  const manifest: KbManifest = {
    schema_version: 1,
    corpus: [{
      path: "docs/kb/omens.md",
      patch: "0.5.4",
      league: "Runes of Aldur",
      stamped_at: "2026-08-02",
      sha256: kbContentHash(content),
    }],
    excluded: [{ path: "docs/kb/README.md", reason: "maintenance guide" }],
  };

  // A CRLF checkout of an unchanged file is still fresh.
  assert.deepEqual(kbManifestProblems(root, manifest), []);

  writeFileSync(join(root, "docs/kb/omens.md"), `${content}New unverified claim.\n`);
  assert.match(kbManifestProblems(root, manifest).join("\n"), /edited after its 2026-08-02 stamp/);

  writeFileSync(join(root, "docs/kb/omens.md"), content);
  writeFileSync(join(root, "docs/kb/new-mechanic.md"), "# New\n");
  assert.match(kbManifestProblems(root, manifest).join("\n"), /new-mechanic\.md: not in the manifest/);
  rmSync(join(root, "docs/kb/new-mechanic.md"));

  rmSync(join(root, "docs/kb/omens.md"));
  assert.match(kbManifestProblems(root, manifest).join("\n"), /listed in the manifest but missing/);
} finally {
  rmSync(root, { force: true, recursive: true });
}

console.log("ALL PASS — KB manifest staleness gate");
