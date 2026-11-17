/**
 * Typed results from `page.evaluate(string)`, which puppeteer types as `any`.
 * Each checker validates the shape, so a probe that returns the wrong thing
 * fails with a message instead of a confusing assertion further down.
 */
function fail(expected: string, value: unknown): never {
  throw new Error(`page probe should return ${expected}, got ${JSON.stringify(value)}`);
}

const isString = (x: unknown): x is string => typeof x === "string";
const isNumber = (x: unknown): x is number => typeof x === "number";

export function pageString(value: unknown): string {
  return isString(value) ? value : fail("a string", value);
}

export function pageNumber(value: unknown): number {
  return isNumber(value) ? value : fail("a number", value);
}

export function pageStrings(value: unknown): string[] {
  return Array.isArray(value) && value.every(isString) ? value : fail("string[]", value);
}

export function pageNumbers(value: unknown): number[] {
  return Array.isArray(value) && value.every(isNumber) ? value : fail("number[]", value);
}

export function pageNumberRows(value: unknown): number[][] {
  return Array.isArray(value) && value.every((row) => Array.isArray(row) && row.every(isNumber))
    ? value
    : fail("number[][]", value);
}

export function pageMixed(value: unknown): (number | string)[] {
  return Array.isArray(value) && value.every((x) => isNumber(x) || isString(x))
    ? value
    : fail("(number | string)[]", value);
}
