/** Shared shape helpers for the lockfile parsers. */

import { Predicate } from "effect";

export const countKeys = (value: unknown): number =>
  Predicate.isObject(value) ? Object.keys(value).length : 0;
