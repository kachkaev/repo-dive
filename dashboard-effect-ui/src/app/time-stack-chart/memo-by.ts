/**
 * `compute`, remembered per `key` object for the last arguments it saw, which
 * are compared with `===` — what the React chart gets from React Compiler's
 * memo scopes. The key is a prop array of one chart (its `points`, its
 * `seriesKeys`), so every chart keeps a slot of its own: a hover that renders
 * one chart again finds its geometry, and the arrays `h.lazy` compares, as it
 * left them.
 */
export const memoBy = <K extends object, Args extends readonly unknown[], A>(
  compute: (key: K, ...args: Args) => A,
): ((key: K, ...args: Args) => A) => {
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
