/**
 * `compute`, remembered per `key` object for as long as the key lives: run
 * again only when the further arguments differ (by `===`) from the last call
 * with that key. Sections derive arrays and sets from `data` on every render,
 * and charts derive their rows and scales from their prop arrays; caching them
 * keeps their identity, which `h.lazy` and props comparison go by, and skips
 * the work. Keyed by an object of one section or chart (its `data`, its
 * `points`), each keeps a slot of its own — what React Compiler's memo scopes
 * give the React dashboard.
 */
export const cachedBy = <K extends object, Args extends readonly unknown[], A>(
  compute: (key: K, ...args: Args) => A,
): ((key: K, ...args: Args) => A) => {
  // Boxed, so a computed `undefined` is a hit too.
  const cache = new WeakMap<K, { args: Args; value: A }>();
  return (key, ...args) => {
    const hit = cache.get(key);
    if (
      hit?.args.length === args.length &&
      hit.args.every((arg, index) => arg === args[index])
    ) {
      return hit.value;
    }
    const value = compute(key, ...args);
    cache.set(key, { args, value });
    return value;
  };
};
