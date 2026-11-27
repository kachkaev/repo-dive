import { expect, test, vi } from "vitest";

import { cachedBy } from "./cached-by.ts";

const counted = <A>(compute: (key: object, ...args: unknown[]) => A) => {
  const spy = vi.fn(compute);
  return { spy, cached: cachedBy(spy) };
};

test("hits on the same key and arguments", () => {
  const { spy, cached } = counted((key, factor) => ({ key, factor }));
  const key = {};
  const first = cached(key, 2);
  expect(cached(key, 2)).toBe(first);
  expect(spy).toHaveBeenCalledTimes(1);
});

test("recomputes when an argument changes by ===", () => {
  const { spy, cached } = counted((key, list) => ({ key, list }));
  const key = {};
  const first = cached(key, [1]);
  // An equal array is still another argument.
  expect(cached(key, [1])).not.toBe(first);
  expect(spy).toHaveBeenCalledTimes(2);
});

test("recomputes when the number of arguments changes", () => {
  const { spy, cached } = counted((_key, ...args) => args.length);
  const key = {};
  expect(cached(key, 1)).toBe(1);
  expect(cached(key, 1, 1)).toBe(2);
  expect(cached(key)).toBe(0);
  expect(spy).toHaveBeenCalledTimes(3);
});

test("counts a computed undefined as a hit", () => {
  // A lookup that finds nothing, as a derivation may.
  const nothing = new Map<object, number>();
  const { spy, cached } = counted((key) => nothing.get(key));
  const key = {};
  expect(cached(key)).toBeUndefined();
  expect(cached(key)).toBeUndefined();
  expect(spy).toHaveBeenCalledTimes(1);
});

test("keeps one slot per key, independent of other keys", () => {
  const { spy, cached } = counted((key, factor) => ({ key, factor }));
  const left = {};
  const right = {};
  const leftValue = cached(left, 1);
  const rightValue = cached(right, 2);
  expect(cached(left, 1)).toBe(leftValue);
  expect(cached(right, 2)).toBe(rightValue);
  expect(spy).toHaveBeenCalledTimes(2);
  // A new argument replaces that key's slot only.
  cached(left, 3);
  expect(cached(right, 2)).toBe(rightValue);
  expect(spy).toHaveBeenCalledTimes(3);
});
