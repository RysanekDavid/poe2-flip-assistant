import { syncPatchNotes } from "../sources/patchNotes/store";

async function main(): Promise<void> {
  const result = await syncPatchNotes();
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
