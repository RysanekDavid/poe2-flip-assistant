import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import ts from "typescript";

interface Metrics {
  emptyCatches: number;
  explicitAny: number;
  lines: number;
  longFunctions: number;
  silentPromiseCatches: number;
}

const root = process.cwd();
const sourceRoot = join(root, "src");
const failures: string[] = [];
const baseline = resolveBaseline();

for (const path of sourceFiles(sourceRoot)) {
  const current = readFileSync(path, "utf8");
  const display = relative(root, path).split(sep).join("/");
  const metrics = inspect(display, current);
  const previous = baselineSource(display);
  validate(display, metrics, previous ? inspect(display, previous) : null);
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(
  `ALL PASS — TypeScript policy lint vs ${baseline.label} (no new size debt, explicit any, or silent catches)`,
);

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === "data" ? [] : sourceFiles(path);
    return /\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

interface Baseline {
  commit: string;
  label: string;
}

/**
 * The ratchet compares against the code this change started from. Baselining on HEAD only works
 * for uncommitted edits: in CI HEAD *is* the commit under test, so new debt would always pass.
 *   1. LINT_BASE_REF (CI sets the pre-push SHA) — must resolve, else fail loudly
 *   2. merge-base with origin/master (feature branches, local or CI)
 *   3. HEAD (no origin/master, e.g. a fresh clone without remotes)
 */
function resolveBaseline(): Baseline {
  const override = process.env.LINT_BASE_REF?.trim();
  if (override) {
    const commit = git(["rev-parse", "--verify", "--quiet", `${override}^{commit}`]);
    if (commit === null) {
      console.error(`LINT_BASE_REF=${override} does not resolve to a commit (shallow clone? force push?)`);
      process.exit(1);
    }
    return { commit: commit.trim(), label: `LINT_BASE_REF ${override.slice(0, 12)}` };
  }
  const mergeBase = git(["merge-base", "origin/master", "HEAD"]);
  if (mergeBase !== null) return { commit: mergeBase.trim(), label: `merge-base ${mergeBase.slice(0, 12)}` };
  return { commit: "HEAD", label: "HEAD" };
}

function baselineSource(path: string): string | null {
  return git(["show", `${baseline.commit}:${path}`]);
}

/** stdout of a git command, or null when it exits non-zero (missing ref/path). */
function git(args: string[]): string | null {
  const result = spawnSync("git", args, {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_CONFIG_COUNT: "1",
      GIT_CONFIG_KEY_0: "safe.directory",
      GIT_CONFIG_VALUE_0: root.split(sep).join("/"),
    },
    stdio: ["ignore", "pipe", "ignore"],
  });
  if (result.error) throw new Error(`git could not start: ${result.error.message}`, { cause: result.error });
  return result.status === 0 ? result.stdout : null;
}

function inspect(path: string, source: string): Metrics {
  const kind = path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, kind);
  const functionLines: number[] = [];
  let emptyCatches = 0;
  let explicitAny = 0;
  let silentPromiseCatches = 0;
  const visit = (node: ts.Node): void => {
    if (node.kind === ts.SyntaxKind.AnyKeyword) explicitAny += 1;
    if (ts.isCatchClause(node) && node.block.statements.length === 0) emptyCatches += 1;
    if (isSilentPromiseCatch(node)) silentPromiseCatches += 1;
    if (ts.isFunctionLike(node)) functionLines.push(nodeLines(file, node));
    ts.forEachChild(node, visit);
  };
  visit(file);
  return {
    emptyCatches,
    explicitAny,
    lines: source.split(/\r?\n/).length,
    longFunctions: functionLines.filter((lines) => lines > 60).length,
    silentPromiseCatches,
  };
}

/** `.catch(() => {})` / `.catch(() => undefined)` / `.catch(() => void 0)`: the promise-chain
 *  twin of an empty catch block. Handlers that map to a value (`() => null`) stay allowed. */
function isSilentPromiseCatch(node: ts.Node): boolean {
  if (!ts.isCallExpression(node)) return false;
  const callee = node.expression;
  if (!ts.isPropertyAccessExpression(callee) || callee.name.text !== "catch") return false;
  const handler = node.arguments[0];
  if (!handler || !(ts.isArrowFunction(handler) || ts.isFunctionExpression(handler))) return false;
  if (ts.isBlock(handler.body)) return handler.body.statements.length === 0;
  let body: ts.Expression = handler.body;
  while (ts.isParenthesizedExpression(body)) body = body.expression;
  return (ts.isIdentifier(body) && body.text === "undefined") || ts.isVoidExpression(body);
}

function nodeLines(file: ts.SourceFile, node: ts.Node): number {
  const first = file.getLineAndCharacterOfPosition(node.getStart(file)).line;
  const last = file.getLineAndCharacterOfPosition(node.getEnd()).line;
  return last - first + 1;
}

function validate(path: string, current: Metrics, previous: Metrics | null): void {
  compareDebt(path, "explicit TypeScript any", current.explicitAny, previous?.explicitAny ?? 0, 0);
  compareDebt(path, "empty catch blocks", current.emptyCatches, previous?.emptyCatches ?? 0, 0);
  compareDebt(
    path,
    "silent .catch(() => {}) handlers",
    current.silentPromiseCatches,
    previous?.silentPromiseCatches ?? 0,
    0,
  );
  compareDebt(path, "file lines", current.lines, previous?.lines ?? 0, 500);
  compareDebt(path, "long functions", current.longFunctions, previous?.longFunctions ?? 0, 0);
}

function compareDebt(
  path: string,
  label: string,
  current: number,
  baselineCount: number,
  allowed: number,
): void {
  if (current <= allowed) return;
  if (baselineCount > allowed && current <= baselineCount) return;
  failures.push(`${path}: ${label} ${current} exceeds ${allowed} (baseline ${baselineCount})`);
}
