/**
 * `compute`, run once per `key` object and remembered for as long as the key
 * lives. Sections derive arrays and sets from `data` on every render; caching
 * them per `data` keeps their identity, which `h.lazy` and props comparison go
 * by, and skips the work.
 */
export const cachedBy = <K extends object, A>(
  compute: (key: K) => A,
): ((key: K) => A) => {
  // Boxed, so a computed `undefined` is a hit too.
  const cache = new WeakMap<K, { value: A }>();
  return (key) => {
    const hit = cache.get(key);
    if (hit) {
      return hit.value;
    }
    const value = compute(key);
    cache.set(key, { value });
    return value;
  };
};
