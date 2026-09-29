/* Number-range fragments: poe2.re-style fixtures, refusal of decimals/negatives, and an exhaustive
 * check that a boundary-wrapped fragment matches exactly the values in range.
 * Run: npm run test:tools:regex (chained) or tsx src/scripts/tools/testRegexNumbers.ts */
import assert from "node:assert/strict";
import { numberRangeRegex } from "../../core/tools/regex/numberRange";
import { compileSafeRegex } from "../../core/tools/regex/safeRegex";

function testFixtures(): void {
  assert.equal(numberRangeRegex(15, 42), "(1[5-9]|[2-3].|4[0-2])");
  assert.equal(numberRangeRegex(10, 99), "[1-9].");
  assert.equal(numberRangeRegex(100, null), "[1-9]..");
  assert.equal(numberRangeRegex(7, 7), "7");
  assert.equal(numberRangeRegex(0, 9), ".");
  assert.equal(numberRangeRegex(5, null), "([5-9]|[1-9].|[1-9]..)");
  assert.equal(numberRangeRegex(15, 42, { round10: true }), "[1-4].", "round10 widens to 10–49");
  assert.equal(numberRangeRegex(15, null, { round10: true }), "([1-9].|[1-9]..)");
  assert.equal(numberRangeRegex(1000, null), "[1-9]...", "open ranges above 999 keep the minimum's digit count");
}

function testRefusals(): void {
  for (const [min, max] of [[1.5, 3], [1, 2.5], [-1, 5], [5, 4], [Number.NaN, 3]] as const) {
    assert.throws(() => numberRangeRegex(min, max), RangeError, `(${min}, ${max}) must throw RangeError`);
  }
}

/** " v%" is how a number sits in a tooltip line: a non-digit on each side. */
function matchesExactly(min: number, max: number | null): void {
  const re = compileSafeRegex(` ${numberRangeRegex(min, max)}%`);
  const top = max ?? 999;
  for (let v = 0; v <= 1200; v++) {
    const want = v >= min && v <= top;
    assert.equal(re.test(`x ${v}% y`), want, `range ${min}..${max ?? "∞"} vs ${v}`);
  }
}

function testExhaustive(): void {
  const bounds = [0, 1, 5, 9, 10, 11, 15, 19, 20, 42, 55, 89, 99, 100, 101, 150, 199, 250, 999];
  for (const min of bounds) {
    matchesExactly(min, null);
    for (const max of bounds) if (max >= min) matchesExactly(min, max);
  }
  // round10 only ever widens: every value in the original range still matches
  for (const [min, max] of [[15, 42], [3, 8], [95, 104]] as const) {
    const re = compileSafeRegex(` ${numberRangeRegex(min, max, { round10: true })}%`);
    for (let v = min; v <= max; v++) assert.ok(re.test(` ${v}%`), `round10 ${min}..${max} keeps ${v}`);
  }
}

testFixtures();
testRefusals();
testExhaustive();
console.log("ALL PASS — number ranges: fixtures, refusals, exhaustive boundary-wrapped matching 0..1200");
